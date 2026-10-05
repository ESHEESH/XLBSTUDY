-- Hardening: deny-by-default grants, server-authoritative XP/hearts/streak, ownership checks.

-- 1. Deny by default. RLS filters rows; grants limit which columns/operations exist at all.
revoke all on profiles, decks, cards, review_logs from anon, authenticated;
grant select on profiles, review_logs to authenticated;
-- Clients may NOT write xp / hearts / streak / last_study_date; only record_review() does.
grant update (display_name, daily_goal, onboarded, updated_at) on profiles to authenticated;
-- No hard DELETE for clients: soft delete only (deleted_at), which is what sync needs.
grant select, insert, update on decks, cards to authenticated;

-- 2. A card must live in a deck the same user owns (blocks writing into someone else's deck).
drop policy own on cards;
create policy own on cards for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from decks d where d.id = deck_id and d.user_id = auth.uid())
  );

-- 3. Size limits so one account can't fill the database.
alter table profiles add constraint display_name_len check (char_length(display_name) <= 40);
alter table decks add constraint title_len check (char_length(title) between 1 and 200);
alter table cards add constraint card_len check (char_length(front) <= 4000 and char_length(back) <= 4000);

-- 4. The only way to earn XP / lose hearts / advance the streak. Idempotent per log id,
--    so the offline outbox can safely retry.
create function record_review(
  p_log_id uuid, p_card_id uuid, p_rating int, p_reviewed_at timestamptz, p_day date
) returns profiles
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p profiles;
  v_xp int;
  v_hearts int;
  v_since numeric;
  v_day date := least(greatest(p_day, current_date - 1), current_date + 1);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_rating not between 1 and 4 then raise exception 'bad rating'; end if;
  if not exists (select 1 from cards where id = p_card_id and user_id = uid) then
    raise exception 'unknown card';
  end if;

  v_xp := case p_rating when 1 then 1 when 2 then 3 else 5 end;
  -- daily cap on XP-bearing reviews: stops scripted farming
  if (select count(*) from review_logs where user_id = uid and reviewed_at >= current_date) >= 1000 then
    v_xp := 0;
  end if;

  insert into review_logs (id, card_id, user_id, rating, reviewed_at, xp)
  values (p_log_id, p_card_id, uid, p_rating, least(p_reviewed_at, now()), v_xp)
  on conflict (id) do nothing;
  -- already applied (outbox retry): return the profile untouched
  if not found then
    select * into p from profiles where id = uid;
    return p;
  end if;

  select * into p from profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;

  v_since := extract(epoch from now() - p.hearts_updated_at);
  v_hearts := least(5, p.hearts + floor(v_since / 600)::int);

  update profiles set
    xp = xp + v_xp,
    hearts = case when p_rating = 1 then greatest(0, v_hearts - 1) else hearts end,
    hearts_updated_at = case
      when p_rating <> 1 then hearts_updated_at
      when v_hearts >= 5 then now()
      else now() - make_interval(secs => mod(v_since, 600)) end,
    streak = case
      when last_study_date is not null and v_day <= last_study_date then streak
      when last_study_date = v_day - 1 then streak + 1
      else 1 end,
    last_study_date = case
      when last_study_date is null or v_day > last_study_date then v_day
      else last_study_date end,
    updated_at = now()
  where id = uid
  returning * into p;
  return p;
end $$;

revoke execute on function record_review(uuid, uuid, int, timestamptz, date) from public, anon;
revoke execute on function weekly_leaderboard() from public, anon;
revoke execute on function handle_new_user() from public, anon, authenticated;
grant execute on function record_review(uuid, uuid, int, timestamptz, date) to authenticated;
grant execute on function weekly_leaderboard() to authenticated;
