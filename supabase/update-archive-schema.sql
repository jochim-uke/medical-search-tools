-- Shared personal archive. Access is exclusively through the authenticated Edge API.
create table public.ua_settings (id boolean primary key default true check(id), salt text not null, password_hash text not null);
create table public.ua_sessions (token_hash text primary key, expires_at timestamptz not null);
create table public.ua_login_limits (bucket text primary key, attempts integer not null, expires_at timestamptz not null);
create table public.ua_reports (id text primary key, title text not null, report_date date not null, body text not null, created_at timestamptz not null default now());
create table public.ua_entries (id text primary key, title text not null, category text not null check(category in ('Publikationen','Kongressbeiträge','Zulassungsrelevante News','Pressemitteilungen','Sonstige')), body text not null, source_url text not null default '', tags text[] not null default '{}', report_date date not null, notes text not null default '', priority integer not null default 0 check(priority between 0 and 3), clicks integer not null default 0, version integer not null default 0, created_at timestamptz not null default now());
create table public.ua_report_entries (report_id text references public.ua_reports(id), entry_id text references public.ua_entries(id), primary key(report_id,entry_id));
create index ua_report_entries_entry on public.ua_report_entries(entry_id);
create table public.ua_comments (id uuid primary key default gen_random_uuid(), entry_id text not null references public.ua_entries(id), body text not null check(length(body) between 1 and 20000), created_at timestamptz not null default now(), version integer not null default 0);
create index ua_comments_entry on public.ua_comments(entry_id);
create table public.ua_visits (entry_id text references public.ua_entries(id), day date not null, primary key(entry_id,day));

do $$ declare t text; begin
  foreach t in array array['ua_settings','ua_sessions','ua_login_limits','ua_reports','ua_entries','ua_report_entries','ua_comments','ua_visits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy service_access on public.%I to service_role using (true) with check (true)',t);
  end loop;
end $$;

create function public.ua_rate_limit(p_bucket text) returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  delete from public.ua_login_limits where expires_at < now();
  delete from public.ua_sessions where expires_at < now();
  insert into public.ua_login_limits values(p_bucket,1,now()+interval '10 minutes')
  on conflict(bucket) do update set attempts=public.ua_login_limits.attempts+1 returning attempts into n;
  return n;
end $$;

create function public.ua_visit(p_entry text) returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.ua_visits values(p_entry,(now() at time zone 'Europe/Berlin')::date) on conflict do nothing;
  if found then update public.ua_entries set clicks=clicks+1 where id=p_entry; end if;
  select clicks into n from public.ua_entries where id=p_entry;
  return n;
end $$;

-- Atomic, repeatable imports never overwrite notes, priorities or existing content.
create function public.ua_import(p_report jsonb, p_entries jsonb) returns integer language plpgsql security invoker set search_path = '' as $$
declare e jsonb; n integer := 0;
begin
  insert into public.ua_reports(id,title,report_date,body) values(p_report->>'id',p_report->>'title',(p_report->>'report_date')::date,p_report->>'body') on conflict do nothing;
  for e in select * from jsonb_array_elements(p_entries) loop
    insert into public.ua_entries(id,title,category,body,source_url,tags,report_date)
    values(e->>'id',e->>'title',e->>'category',e->>'body',e->>'source_url',array(select jsonb_array_elements_text(e->'tags')),(p_report->>'report_date')::date) on conflict do nothing;
    if found then n:=n+1; end if;
    insert into public.ua_report_entries values(p_report->>'id',e->>'id') on conflict do nothing;
  end loop;
  return n;
end $$;
revoke all on function public.ua_rate_limit(text), public.ua_visit(text), public.ua_import(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.ua_rate_limit(text), public.ua_visit(text), public.ua_import(jsonb,jsonb) to service_role;
