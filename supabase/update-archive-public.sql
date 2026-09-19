-- Existing comments predate author capture; do not invent an attribution.
alter table public.ua_comments add column author text;
update public.ua_comments set author = 'Ohne Autorenangabe (Altbestand)' where author is null;
alter table public.ua_comments alter column author set not null;
alter table public.ua_comments add constraint ua_comments_author_length check (length(btrim(author)) between 1 and 100);
alter table public.ua_comments add column author_is_admin boolean not null default false;
-- Table/RPC grants and RLS remain service-role-only. Public read/comment access
-- is provided by the Edge Function's explicit action allowlist.
