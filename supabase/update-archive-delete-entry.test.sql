begin;
set local role service_role;
do $$
declare
  target_id text := 'test-delete:' || gen_random_uuid();
  other_id text := 'test-keep:' || gen_random_uuid();
  report_a text := 'test-report:' || gen_random_uuid();
  report_b text := 'test-report:' || gen_random_uuid();
begin
  if has_function_privilege('anon','public.ua_delete_entry(text,integer)','execute')
     or has_function_privilege('authenticated','public.ua_delete_entry(text,integer)','execute') then
    raise exception 'The delete RPC must be restricted to the server';
  end if;

  insert into public.ua_reports(id,title,report_date,body) values
    (report_a,'Report A',current_date,'Original A'), (report_b,'Report B',current_date,'Original B');
  insert into public.ua_entries(id,title,category,body,report_date,notes,version) values
    (target_id,'Delete','Sonstige','Target',current_date,'A note',2),
    (other_id,'Keep','Sonstige','Neighbor',current_date,'Other note',0);
  insert into public.ua_report_entries(report_id,entry_id) values
    (report_a,target_id),(report_b,target_id),(report_a,other_id);
  insert into public.ua_visits(entry_id,day) values (target_id,current_date),(other_id,current_date);
  insert into public.ua_comments(entry_id,author,body) values
    (target_id,'Test','Target comment'),(other_id,'Test','Other comment');

  if public.ua_delete_entry(target_id,1) <> 'conflict' then raise exception 'Expected conflict'; end if;
  if (select count(*) from public.ua_report_entries where entry_id = target_id) <> 2
     or not exists(select from public.ua_visits where entry_id = target_id)
     or not exists(select from public.ua_comments where entry_id = target_id) then
    raise exception 'Conflict changed related records';
  end if;
  if public.ua_delete_entry(target_id,2) <> 'deleted' then raise exception 'Expected deletion'; end if;
  if exists(select from public.ua_entries where id = target_id)
     or exists(select from public.ua_comments where entry_id = target_id)
     or exists(select from public.ua_visits where entry_id = target_id)
     or exists(select from public.ua_report_entries where entry_id = target_id) then
    raise exception 'Target records still present';
  end if;
  if public.ua_delete_entry(target_id,2) <> 'missing' then raise exception 'Unexpected retry result'; end if;
  if not exists(select from public.ua_entries where id = other_id and notes = 'Other note')
     or not exists(select from public.ua_comments where entry_id = other_id)
     or not exists(select from public.ua_visits where entry_id = other_id)
     or not exists(select from public.ua_report_entries where entry_id = other_id and report_id = report_a)
     or not exists(select from public.ua_reports where id = report_a and body = 'Original A')
     or not exists(select from public.ua_reports where id = report_b and body = 'Original B') then
    raise exception 'Another entry or its reports changed';
  end if;
end;
$$;
rollback;
