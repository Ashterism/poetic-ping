alter table public.poems
  add column if not exists access_type text not null default 'private';

update public.poems set access_type = case when user_id is null then 'public' else 'private' end;

alter table public.poems
  add constraint poems_access_type_valid check (access_type in ('public', 'private'));
