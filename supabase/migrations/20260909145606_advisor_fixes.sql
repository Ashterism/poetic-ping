create index delivery_history_birthday_idx on public.delivery_history(birthday_id) where birthday_id is not null;
create index delivery_history_poem_idx on public.delivery_history(poem_id) where poem_id is not null;
create index weekly_preference_tags_tag_idx on public.weekly_preference_tags(tag_id);

create policy "No direct client profile access" on public.profiles
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client birthday access" on public.birthdays
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client poem access" on public.poems
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client tag access" on public.tags
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client poem tag access" on public.poem_tags
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client weekly preference access" on public.weekly_preferences
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client weekly preference tag access" on public.weekly_preference_tags
as restrictive for all to anon, authenticated using (false) with check (false);
create policy "No direct client delivery history access" on public.delivery_history
as restrictive for all to anon, authenticated using (false) with check (false);
