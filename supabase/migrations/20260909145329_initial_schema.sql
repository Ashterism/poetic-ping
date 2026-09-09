create schema if not exists private;

create type public.delivery_type as enum ('birthday', 'weekly_poem');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.profiles (
  id text primary key,
  email text not null,
  display_name text,
  timezone text not null default 'Europe/London',
  birthday_delivery_time time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(trim(email)) > 3),
  constraint profiles_timezone_not_blank check (length(trim(timezone)) > 0)
);

create table public.birthdays (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  person_name text not null,
  birth_date date not null,
  relationship text,
  notes text,
  reminder_days_before smallint[] not null default array[7, 0]::smallint[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthdays_person_name_not_blank check (length(trim(person_name)) > 0),
  constraint birthdays_reminder_days_valid check (
    cardinality(reminder_days_before) between 1 and 10
    and 0 <= all(reminder_days_before)
    and 365 >= all(reminder_days_before)
  )
);

create table public.poems (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.profiles(id) on delete cascade,
  title text not null,
  author text,
  body text not null,
  language text not null default 'en',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint poems_title_not_blank check (length(trim(title)) > 0),
  constraint poems_body_not_blank check (length(trim(body)) > 0)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  constraint tags_name_not_blank check (length(trim(name)) > 0),
  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index tags_global_slug_unique on public.tags(slug) where user_id is null;
create unique index tags_user_slug_unique on public.tags(user_id, slug) where user_id is not null;

create table public.poem_tags (
  poem_id uuid not null references public.poems(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (poem_id, tag_id)
);

create table public.weekly_preferences (
  user_id text primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  weekday smallint not null default 1,
  local_time time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_preferences_weekday_valid check (weekday between 0 and 6)
);

create table public.weekly_preference_tags (
  user_id text not null references public.weekly_preferences(user_id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (user_id, tag_id)
);

create table public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  birthday_id uuid references public.birthdays(id) on delete set null,
  poem_id uuid references public.poems(id) on delete set null,
  delivery_type public.delivery_type not null,
  status public.delivery_status not null default 'pending',
  recipient_email text not null,
  scheduled_for timestamptz not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  error_message text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index birthdays_user_active_idx on public.birthdays(user_id) where active;
create index poems_user_active_idx on public.poems(user_id) where active;
create index poem_tags_tag_poem_idx on public.poem_tags(tag_id, poem_id);
create index delivery_history_user_recent_idx on public.delivery_history(user_id, sent_at desc) where status = 'sent';
create index delivery_history_pending_idx on public.delivery_history(status, claimed_at) where status in ('pending', 'failed');

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger birthdays_set_updated_at before update on public.birthdays
for each row execute function private.set_updated_at();
create trigger poems_set_updated_at before update on public.poems
for each row execute function private.set_updated_at();
create trigger weekly_preferences_set_updated_at before update on public.weekly_preferences
for each row execute function private.set_updated_at();

create function public.claim_delivery(
  p_user_id text,
  p_birthday_id uuid,
  p_poem_id uuid,
  p_delivery_type public.delivery_type,
  p_recipient_email text,
  p_scheduled_for timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_id uuid;
begin
  insert into public.delivery_history (
    user_id, birthday_id, poem_id, delivery_type, recipient_email,
    scheduled_for, idempotency_key
  ) values (
    p_user_id, p_birthday_id, p_poem_id, p_delivery_type, p_recipient_email,
    p_scheduled_for, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into claimed_id;

  if claimed_id is not null then
    return claimed_id;
  end if;

  update public.delivery_history
  set status = 'pending', claimed_at = now(), error_message = null
  where idempotency_key = p_idempotency_key
    and (status = 'failed' or (status = 'pending' and claimed_at < now() - interval '30 minutes'))
  returning id into claimed_id;

  return claimed_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.birthdays enable row level security;
alter table public.poems enable row level security;
alter table public.tags enable row level security;
alter table public.poem_tags enable row level security;
alter table public.weekly_preferences enable row level security;
alter table public.weekly_preference_tags enable row level security;
alter table public.delivery_history enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.claim_delivery(text, uuid, uuid, public.delivery_type, text, timestamptz, text) from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.claim_delivery(text, uuid, uuid, public.delivery_type, text, timestamptz, text) to service_role;

alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

comment on table public.profiles is 'ZITADEL users keyed by the immutable OIDC subject claim.';
comment on column public.profiles.timezone is 'IANA timezone validated by the Worker with Intl.DateTimeFormat.';
comment on function public.claim_delivery is 'Atomically claims an idempotent scheduled delivery; callable only by service_role.';
