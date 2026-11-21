-- Run once as the database owner. Only the reviewed publication enters the public archive.
create schema zotero_archive;
revoke all on schema zotero_archive from public, anon, authenticated, service_role;

create table zotero_archive.sync_state (
  singleton boolean primary key default true check (singleton),
  user_id bigint,
  library_version bigint not null default 0,
  retry_at timestamptz
);
insert into zotero_archive.sync_state default values;
create table zotero_archive.items (
  item_key text primary key check (item_key ~ '^[A-Z0-9]{8}$'),
  state text not null default 'new' check (state in ('new','ready','archived','skipped')),
  metadata jsonb,
  entry_id text,
  reason text
);
create index zotero_items_work on zotero_archive.items(state, item_key) where state in ('new','ready');
alter table zotero_archive.sync_state enable row level security;
alter table zotero_archive.items enable row level security;

alter table public.ua_entries drop constraint ua_entries_category_check,
  add constraint ua_entries_category_check check(category in (
    'Publikationen','Kongressbeiträge','Zulassungsrelevante News','Pressemitteilungen','Sonstige','Zotero-Bibliothek'
  ));

-- One public entry per normalized DOI (or PMID, or stable Zotero item key).
-- A processed key survives manual deletion from the archive.
create function zotero_archive.publish(p_key text,p_summary text,p_doi text default null,
  p_source text default null,p_tags text[] default '{}') returns text
language plpgsql security invoker set search_path = '' as $$
declare
  item zotero_archive.items%rowtype;
  doi text;
  url text;
  identifier text;
  citation text;
begin
  select * into strict item from zotero_archive.items where item_key=p_key for update;
  if item.state='archived' then return item.entry_id; end if;
  if item.state<>'ready' or nullif(btrim(item.metadata->>'title'),'') is null
     or coalesce(length(btrim(p_summary)),0) not between 1 and 40000 then
    raise exception 'Publikation oder Zusammenfassung unvollständig.';
  end if;
  doi := lower(regexp_replace(btrim(coalesce(p_doi,item.metadata->>'doi','')),
    '^(https?://(dx\.)?doi\.org/|doi:[[:space:]]*)','','i'));
  if doi<>'' and doi !~ '^10\.[0-9]{4,9}/[^[:space:][:cntrl:]]+$' then
    raise exception 'Ungültige DOI. DOI prüfen oder leeren Text übergeben.';
  end if;
  if doi<>'' then
    url := 'https://doi.org/' || replace(replace(replace(doi,'%','%25'),'#','%23'),'?','%3F');
  elsif coalesce(item.metadata->>'pmid','') ~ '^[0-9]+$' then
    url := 'https://pubmed.ncbi.nlm.nih.gov/' || (item.metadata->>'pmid') || '/';
  else
    url := coalesce(p_source,'');
    if url<>'' and url !~ '^https?://[^[:space:]@/?#]+(/[^[:space:]]*)?$' then raise exception 'Ungültige Quellen-URL.'; end if;
  end if;
  identifier := 'zotero:' || case when doi<>'' then 'doi:' || md5(doi)
    when coalesce(item.metadata->>'pmid','') ~ '^[0-9]+$' then 'pmid:' || (item.metadata->>'pmid')
    else 'item:' || p_key end;
  citation := concat_ws(' · ',nullif(item.metadata->>'authors',''),nullif(item.metadata->>'journal',''),nullif(item.metadata->>'date',''));
  insert into public.ua_entries(id,title,category,body,source_url,tags,report_date)
    values(identifier,item.metadata->>'title','Zotero-Bibliothek',
      concat_ws(E'\n\n',nullif(citation,''),'KI-Zusammenfassung' || E'\n' || btrim(p_summary)),
      url,coalesce(p_tags,'{}'),coalesce(((item.metadata->>'added')::timestamptz at time zone 'Europe/Berlin')::date,current_date))
    on conflict (id) do nothing;
  update zotero_archive.items set state='archived',entry_id=identifier,metadata=null where item_key=p_key;
  return identifier;
end $$;

revoke all on all tables in schema zotero_archive from public,anon,authenticated,service_role;
revoke all on function zotero_archive.publish(text,text,text,text,text[]) from public,anon,authenticated,service_role;
