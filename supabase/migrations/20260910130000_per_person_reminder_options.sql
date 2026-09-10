alter table public.birthdays
  alter column reminder_days_before set default array[0]::smallint[],
  add column if not exists reminder_working_days_before smallint[] not null default array[]::smallint[];

update public.birthdays
set reminder_days_before = array[0]::smallint[]
where reminder_days_before = array[7, 0]::smallint[];

alter table public.birthdays
  add constraint birthdays_working_reminders_valid check (
    cardinality(reminder_working_days_before) <= 10
    and (cardinality(reminder_working_days_before) = 0 or (1 <= all(reminder_working_days_before) and 365 >= all(reminder_working_days_before)))
  );
