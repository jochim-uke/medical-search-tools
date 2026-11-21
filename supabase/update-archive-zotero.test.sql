-- Isolated fixtures in the current database session; no Zotero requests or production writes.
begin;
create temp table ua_entries (like public.ua_entries including all) on commit drop;
create temp table items (like zotero_archive.items including all) on commit drop;
create temp table sync_state (like zotero_archive.sync_state including all) on commit drop;
insert into pg_temp.sync_state default values;

do $$
declare routine regprocedure; definition text;
begin
  foreach routine in array array[
    'zotero_archive.discover()'::regprocedure,
    'zotero_archive.load_batch()'::regprocedure,
    'zotero_archive.publish(text,text,text,text,text[])'::regprocedure
  ] loop
    definition := replace(pg_get_functiondef(routine),'zotero_archive.','pg_temp.');
    execute replace(definition,'public.ua_entries','pg_temp.ua_entries');
  end loop;
end $$;
create or replace function pg_temp.get_json(request_kind text, user_id bigint default null, since_version bigint default null, item_keys text[] default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if request_kind='account' then return '{"status":200,"user_id":42,"library_access":true}'; end if;
  if request_kind='versions' then
    if since_version=0 then return '{"status":200,"version":17,"data":{"TESTAAA1":16,"TESTAAA2":17}}'; end if;
    return '{"status":200,"version":18,"data":{"TESTAAA3":18}}';
  end if;
  return jsonb_build_object('status',200,'data',(
    select jsonb_agg(jsonb_build_object('key',k,'meta',jsonb_build_object('creatorSummary','Test et al.'),
      'data',jsonb_build_object('itemType','journalArticle','title','Test article','DOI','https://doi.org/10.1000/TEST(1)',
       'dateAdded','2020-07-01T23:30:00Z','abstractNote','Test abstract','extra','PMID: 1234',
       'tags','PRIVATE TAG','note','PRIVATE NOTE'))) from unnest(array['TESTAAA1','TESTAAA2']) k));
end $$;
do $$
declare entry text; result jsonb;
begin
  if has_schema_privilege('anon','zotero_archive','USAGE') or has_schema_privilege('authenticated','zotero_archive','USAGE') then
    raise exception 'Staging schema exposed'; end if;
  if (pg_temp.discover()->>'added')::int <> 2 then raise exception 'Initial discovery'; end if;
  if (pg_temp.load_batch()->>'loaded')::int <> 2 then raise exception 'Metadata staging'; end if;
  if exists(select 1 from pg_temp.items where metadata::text like '%PRIVATE%' or metadata->>'pmid' <> '1234') then raise exception 'Metadata fields'; end if;
  entry := pg_temp.publish('TESTAAA1','Test');
  if pg_temp.publish('TESTAAA2','Other') <> entry or pg_temp.publish('TESTAAA1','Retry') <> entry then raise exception 'Deduplication'; end if;
  if not exists(select from pg_temp.ua_entries where id=entry and source_url='https://doi.org/10.1000/test(1)'
         and category='Zotero-Bibliothek' and report_date=date '2020-07-02' and body like '%KI-Zusammenfassung%') then raise exception 'Public archive row'; end if;
  delete from pg_temp.ua_entries where id=entry;
  perform pg_temp.publish('TESTAAA1','Retry after removal');
  if exists(select from pg_temp.ua_entries where id=entry) then raise exception 'Resurrected deleted entry'; end if;
  if (pg_temp.discover()->>'added')::int <> 1 then raise exception 'Incremental discovery'; end if;
  perform pg_temp.load_batch();
  if not exists(select from pg_temp.items where item_key='TESTAAA3' and state='skipped') then raise exception 'Item removed during import'; end if;
end $$;
rollback;
