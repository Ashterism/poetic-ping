alter table public.poems
  add column if not exists source_type text,
  add column if not exists source_title text,
  add column if not exists source_section text,
  add column if not exists source_page text,
  add column if not exists source_url text,
  add column if not exists rights_note text;

alter table public.poems
  add constraint poems_source_url_https check (source_url is null or source_url ~ '^https://[^[:space:]]+$');
