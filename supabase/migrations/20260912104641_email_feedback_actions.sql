alter table public.delivery_history
  add column if not exists feedback_token uuid not null default gen_random_uuid(),
  add column if not exists feedback_action text,
  add column if not exists feedback_at timestamptz,
  add constraint delivery_history_feedback_action_valid
    check (feedback_action is null or feedback_action in ('liked', 'not_for_me', 'pause_emails'));

create unique index if not exists delivery_history_feedback_token_idx
  on public.delivery_history (feedback_token);
