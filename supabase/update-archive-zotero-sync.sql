create extension http with schema zotero_archive;
-- Only GET requests to the fixed Zotero origin. The key never leaves the database in an RPC response.
create function zotero_archive.get_json(request_kind text, user_id bigint default null, since_version bigint default null, item_keys text[] default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  path text;
  secret text;
  response zotero_archive.http_response;
  delay_seconds int;
  version_header bigint;
  blocked_until timestamptz;
begin
  -- Build every path locally. Callers can only select one of these three read operations.
  case
    when request_kind='account' then path := 'keys/current';
    when request_kind='versions' and user_id>0 and since_version>=0 then
      path := format('users/%s/items/top?format=versions&itemType=-attachment%%20%%7C%%7C%%20note%%20%%7C%%7C%%20annotation&since=%s',user_id,since_version);
    when request_kind='items' and user_id>0 and cardinality(item_keys) between 1 and 25
        and not exists(select from unnest(item_keys) k where k is null or k !~ '^[A-Z0-9]{8}$') then
      path := format('users/%s/items/top?format=json&limit=25&itemType=-attachment%%20%%7C%%7C%%20note%%20%%7C%%7C%%20annotation&itemKey=%s',user_id,array_to_string(item_keys,','));
    else raise exception 'Unbekannte Zotero-Anfrage.';
  end case;
  select retry_at into blocked_until from zotero_archive.sync_state;
  if blocked_until > clock_timestamp() then
    return jsonb_build_object('status',429,'retry_at',blocked_until);
  end if;
  if request_kind <> 'account' and user_id is distinct from (select s.user_id from zotero_archive.sync_state s) then
    raise exception 'Unbekannte Bibliothek.';
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='zotero_read_key';
  if nullif(trim(secret),'') is null then
    return jsonb_build_object('status',0,'message','Zotero-Leseschlüssel fehlt im Vault.');
  end if;
  select * into response from zotero_archive.http((
    'GET','https://api.zotero.org/' || path,
    array[zotero_archive.http_header('Zotero-API-Key',trim(secret)),
          zotero_archive.http_header('Zotero-API-Version','3')],
    null,null)::zotero_archive.http_request);
  select max(h.value::int) into delay_seconds from unnest(response.headers) h
    where lower(h.field) in ('backoff','retry-after') and h.value ~ '^[0-9]{1,8}$';
  if response.status in (429,503) then delay_seconds := coalesce(delay_seconds,60); end if;
  if delay_seconds > 0 then
    blocked_until := clock_timestamp() + make_interval(secs=>delay_seconds);
    update zotero_archive.sync_state set retry_at=blocked_until where singleton;
  end if;
  if response.status <> 200 then
    return jsonb_build_object('status',response.status,'retry_at',blocked_until);
  end if;
  select h.value::bigint into version_header from unnest(response.headers) h
    where lower(h.field)='last-modified-version' limit 1;
  if path='keys/current' then
    return jsonb_build_object('status',200,'user_id',response.content::jsonb->'userID',
      'library_access',response.content::jsonb#>'{access,user,library}');
  end if;
  return jsonb_build_object('status',200,'version',version_header,'data',response.content::jsonb);
end $$;

-- Advance the version only in the same transaction as staging all matching keys.
create function zotero_archive.discover() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  state_row zotero_archive.sync_state%rowtype;
  result jsonb;
  added integer;
begin
  select * into strict state_row from zotero_archive.sync_state where singleton for update;
  if state_row.user_id is null then
    result := zotero_archive.get_json('account');
    if result->>'status' <> '200' then return result; end if;
    if (result->>'library_access')::boolean is not true or result->>'user_id' is null then
      return jsonb_build_object('status',403,'message','Leserecht für die persönliche Bibliothek fehlt.');
    end if;
    state_row.user_id := (result->>'user_id')::bigint;
    update zotero_archive.sync_state set user_id=state_row.user_id where singleton;
  end if;
  result := zotero_archive.get_json('versions',state_row.user_id,state_row.library_version);
  if result->>'status' <> '200' then return result; end if;
  if jsonb_typeof(result->'data') is distinct from 'object' or result->>'version' is null then
    raise exception 'Unerwartete Zotero-Antwort. Importstand unverändert.';
  end if;
  insert into zotero_archive.items(item_key) select jsonb_object_keys(result->'data') on conflict do nothing;
  get diagnostics added = row_count;
  update zotero_archive.sync_state set library_version=(result->>'version')::bigint where singleton;
  return jsonb_build_object('status',200,'added',added,'library_version',result->'version');
end $$;

-- Keep only bibliographic fields; never retain notes, tags, collections, files, or the free-form Extra field.
create function zotero_archive.load_batch() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  keys text[];
  owner_id bigint;
  result jsonb;
  item jsonb;
  data jsonb;
  pmid text;
  loaded int := 0;
begin
  select user_id into owner_id from zotero_archive.sync_state where singleton for update;
  select array_agg(item_key order by item_key) into keys from
    (select item_key from zotero_archive.items where state='new' order by item_key limit 25) pending;
  if keys is null then return jsonb_build_object('status',200,'loaded',0); end if;
  result := zotero_archive.get_json('items',owner_id,null,keys);
  if result->>'status' <> '200' then return result; end if;
  if jsonb_typeof(result->'data') is distinct from 'array' then raise exception 'Ungültige Zotero-Metadaten.'; end if;
  for item in select value from jsonb_array_elements(result->'data') loop
    data := item->'data';
    if data is null or data->>'itemType' is null then raise exception 'Unvollständige Zotero-Metadaten.'; end if;
    if data->>'itemType' in ('note','attachment','annotation') then continue; end if;
    pmid := coalesce(substring(data->>'extra' from '(?im)^PMID:[[:blank:]]*([0-9]+)[[:blank:]]*$'),
      substring(data->>'url' from '(?i)^https?://pubmed\.ncbi\.nlm\.nih\.gov/([0-9]+)'));
    update zotero_archive.items set state='ready', metadata=jsonb_strip_nulls(jsonb_build_object(
      'title',data->>'title','authors',item#>>'{meta,creatorSummary}','date',data->>'date',
      'added',data->>'dateAdded','doi',coalesce(nullif(data->>'DOI',''), substring(data->>'extra' from '(?im)^DOI:[[:blank:]]*(10\.[^[:space:]]+)')),
      'pmid',pmid,'type',data->>'itemType','journal',coalesce(nullif(data->>'publicationTitle',''),nullif(data->>'proceedingsTitle',''),data->>'bookTitle'),
      'abstract',data->>'abstractNote','url',data->>'url'))
    where item_key=item->>'key' and item_key=any(keys) and state='new';
    if found then loaded := loaded+1; end if;
  end loop;
  update zotero_archive.items set state='skipped',reason='Vor dem Abruf entfernt oder kein bibliografischer Eintrag.'
    where item_key=any(keys) and state='new';
  return jsonb_build_object('status',200,'loaded',loaded,'requested',cardinality(keys));
end $$;

revoke all on all functions in schema zotero_archive from public,anon,authenticated,service_role;
