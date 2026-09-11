alter table public.profiles
  add column if not exists birthday_reminders_enabled boolean not null default true;
