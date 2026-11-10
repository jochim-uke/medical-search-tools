-- ASH priorities use the existing archive-admin session, like ash2026_add.
alter table public.ash2026_abstracts
  add column priority integer not null default 0 check (priority between 0 and 3),
  add column priority_version integer not null default 0 check (priority_version >= 0);

create function ash2026_private.set_priority(session_token text, abstract_number integer, new_priority integer, expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
begin
  if session_token is null or session_token !~ '^[a-f0-9]{64}$' or not exists (
    select 1 from public.ua_sessions
    where token_hash = encode(sha256(convert_to(session_token,'UTF8')),'hex') and expires_at > now()
  ) then
    raise insufficient_privilege using message = 'Bitte erneut als Archiv-Admin anmelden.';
  end if;
  if new_priority is null or new_priority not between 0 and 3 or expected_version is null or expected_version < 0 then
    raise invalid_parameter_value using message = 'Ungültige Priorität oder Versionsnummer.';
  end if;
  update public.ash2026_abstracts
  set priority = new_priority, priority_version = priority_version + 1
  where number = abstract_number and priority_version = expected_version
  returning jsonb_build_object('number',number,'priority',priority,'priority_version',priority_version) into saved;
  if saved is null then
    raise serialization_failure using message = 'Der Beitrag wurde zwischenzeitlich geändert. Bitte Ansicht aktualisieren.';
  end if;
  return saved;
end;
$$;

-- The exposed wrapper stays SECURITY INVOKER; the privileged function remains
-- in the existing non-exposed schema and checks the hashed admin token itself.
create function public.ash2026_set_priority(session_token text, abstract_number integer, new_priority integer, expected_version integer)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select ash2026_private.set_priority(session_token,abstract_number,new_priority,expected_version);
$$;

revoke all on function ash2026_private.set_priority(text,integer,integer,integer) from public;
revoke all on function public.ash2026_set_priority(text,integer,integer,integer) from public;
grant usage on schema ash2026_private to anon, authenticated;
grant execute on function ash2026_private.set_priority(text,integer,integer,integer) to anon, authenticated, service_role;
grant execute on function public.ash2026_set_priority(text,integer,integer,integer) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
