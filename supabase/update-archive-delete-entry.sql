create function public.ua_delete_entry(p_id text, p_version integer)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  current_version integer;
begin
  -- The row lock also serializes new foreign-key references with this deletion.
  select version into current_version from public.ua_entries where id = p_id for update;
  if not found then return 'missing'; end if;
  if current_version is distinct from p_version then return 'conflict'; end if;

  delete from public.ua_comments where entry_id = p_id;
  delete from public.ua_visits where entry_id = p_id;
  delete from public.ua_report_entries where entry_id = p_id;
  delete from public.ua_entries where id = p_id;
  return 'deleted';
end;
$$;

revoke all on function public.ua_delete_entry(text, integer) from public, anon, authenticated;
grant execute on function public.ua_delete_entry(text, integer) to service_role;
