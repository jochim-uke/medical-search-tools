-- Curated question summaries use the existing archive permissions and comments.
begin;
alter table public.ua_entries drop constraint ua_entries_category_check;
alter table public.ua_entries add constraint ua_entries_category_check check (
  category in ('Publikationen', 'Kongressbeiträge', 'Zulassungsrelevante News',
    'Pressemitteilungen', 'Sonstige', 'Zotero-Bibliothek', 'Klinische Fragen')
);
commit;
