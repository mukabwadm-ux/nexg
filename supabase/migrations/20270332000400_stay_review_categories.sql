-- Stay reviews by category, written by the guest (26 Nov 2026).
--
-- Until now a stay review had one overall rating, and nothing let a guest
-- leave one: the rows came from seeds. What this adds:
--
-- 1. stay_review columns rating_cleanliness, rating_location, rating_service,
--    rating_facilities, rating_security, rating_value (1-5, optional) and
--    edited_at (the guest's last change; answered_at stays the first answer).
-- 2. rpc_stay_review_submit(stay, review): the signed-in guest who booked the
--    stay on NexG (stay.guest_user_id = auth.uid(), source 'nexg') rates it
--    once it has departed or its check-out has passed, never a cancelled one.
--    Overall rating 1-5 required, categories optional, text up to 2000
--    characters. They can change it for 14 days after their first answer.
--    Two stars or fewer goes to staff as 'under_review'; otherwise
--    'published' (a review staff hid stays hidden, and a staff decision on a
--    review above two stars is kept). Audited as stay_review.submitted.
-- 3. rpc_stay_review_mine(stay | null): the guest's own NexG stays with
--    whether they can rate them and what they said, for the account pages.
-- 4. cron_stay_review_requests, daily at 10:00 Africa/Nairobi (07:00 UTC):
--    emails the guest the day after check-out for a NexG stay not yet rated
--    (once, sets asked_at) and one reminder four days later (reminded_at).
--    Never a cancelled stay, never a guest without an email. Only stays that
--    checked out in the last three days are asked, so turning this on does
--    not email every past guest.
-- 5. rpc_console_stays_reviews (from 20270329000100) adds 'categories' (the
--    average and count per category) and each row's category ratings.
--
-- Rollback: select cron.unschedule('stay-review-requests'); drop functions
-- rpc_stay_review_submit(uuid, jsonb), rpc_stay_review_mine(uuid),
-- cron_stay_review_requests(); restore rpc_console_stays_reviews from
-- 20270329000100; delete the two action_registry rows; alter table
-- stay_review drop the seven columns and their checks.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stay_review.submitted', 'hotels', 'info', false, 'A guest rated their stay, or changed their rating'),
  ('stay_review.requested', 'hotels', 'info', false, 'NexG emailed guests to rate their stays')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ 1. columns

alter table public.stay_review
  add column if not exists rating_cleanliness smallint,
  add column if not exists rating_location smallint,
  add column if not exists rating_service smallint,
  add column if not exists rating_facilities smallint,
  add column if not exists rating_security smallint,
  add column if not exists rating_value smallint,
  add column if not exists edited_at timestamptz;

alter table public.stay_review drop constraint if exists stay_review_categories_check;
alter table public.stay_review add constraint stay_review_categories_check check (
      (rating_cleanliness is null or rating_cleanliness between 1 and 5)
  and (rating_location is null or rating_location between 1 and 5)
  and (rating_service is null or rating_service between 1 and 5)
  and (rating_facilities is null or rating_facilities between 1 and 5)
  and (rating_security is null or rating_security between 1 and 5)
  and (rating_value is null or rating_value between 1 and 5));

comment on column public.stay_review.answered_at is
  'When the guest first rated the stay. Their later changes set edited_at; they can change it for 14 days.';

-- The cron looks for stays to ask about by check-out.
create index if not exists stay_nexg_check_out on public.stay (check_out)
  where source = 'nexg' and guest_user_id is not null;

-- ═══════════════════════════════════════════════════════════════ 2. helpers

/* A star rating from a jsonb field: null when absent or null, else 1-5 or an error. */
create or replace function public.fn_stay_review_star(p jsonb, p_key text, p_label text)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := p -> p_key;
  v_n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) = 'number' then
    v_n := v::text::numeric;
  elsif jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^[1-5]$' then
    v_n := (v #>> '{}')::numeric;
  end if;
  if v_n is null or v_n <> trunc(v_n) or v_n not between 1 and 5 then
    raise exception '% must be 1 to 5 stars.', p_label using errcode = 'check_violation';
  end if;
  return v_n::smallint;
end;
$$;

/* Whether this stay can be rated now: a NexG booking that has departed or whose check-out has passed. */
create or replace function public.fn_stay_review_open(p_stay public.stay)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_stay.source = 'nexg'
     and p_stay.status in ('booked', 'in_stay', 'departed')
     and (p_stay.status = 'departed' or p_stay.check_out <= now())
$$;

-- ═══════════════════════════════════════════════════════════════ 3. the guest

create or replace function public.rpc_stay_review_submit(p_stay_id uuid, p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_stay public.stay;
  v_old public.stay_review;
  v_new public.stay_review;
  v_review jsonb := coalesce(p_review, '{}'::jsonb);
  v_rating smallint;
  v_text text;
  v_moderation text;
begin
  if v_uid is null then
    raise exception 'Sign in to rate your stay.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_review) <> 'object' then
    raise exception 'That is not a review.' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null or v_stay.guest_user_id is distinct from v_uid then
    raise exception 'Only the guest who booked this stay can rate it.' using errcode = '42501';
  end if;
  if v_stay.status = 'cancelled' or v_stay.source <> 'nexg' then
    raise exception 'This stay cannot be rated.' using errcode = 'check_violation';
  end if;
  if not public.fn_stay_review_open(v_stay) then
    raise exception 'You can rate your stay once you have checked out.' using errcode = 'check_violation';
  end if;

  v_rating := public.fn_stay_review_star(v_review, 'rating', 'The overall rating');
  if v_rating is null then
    raise exception 'Choose an overall rating from 1 to 5 stars.' using errcode = 'check_violation';
  end if;
  v_text := nullif(btrim(coalesce(v_review ->> 'text', '')), '');
  if char_length(v_text) > 2000 then
    raise exception 'Keep your review to 2,000 characters.' using errcode = 'check_violation';
  end if;

  select * into v_old from public.stay_review where stay_id = p_stay_id for update;
  if v_old.answered_at is not null and v_old.answered_at < now() - interval '14 days' then
    raise exception 'Reviews can be changed for 14 days after you leave them.' using errcode = 'check_violation';
  end if;

  v_moderation := case
    when v_old.moderation = 'hidden' then 'hidden'
    when v_rating <= 2 then 'under_review'
    when v_old.moderated_by is not null then v_old.moderation
    else 'published' end;

  insert into public.stay_review as sr (
    stay_id, rating, text, rating_cleanliness, rating_location, rating_service,
    rating_facilities, rating_security, rating_value, answered_at, moderation)
  values (
    p_stay_id, v_rating, v_text,
    public.fn_stay_review_star(v_review, 'cleanliness', 'Cleanliness'),
    public.fn_stay_review_star(v_review, 'location', 'Location'),
    public.fn_stay_review_star(v_review, 'service', 'Service'),
    public.fn_stay_review_star(v_review, 'facilities', 'Facilities'),
    public.fn_stay_review_star(v_review, 'security', 'Security'),
    public.fn_stay_review_star(v_review, 'value', 'Value'),
    now(), v_moderation)
  on conflict (stay_id) do update set
    rating = excluded.rating,
    text = excluded.text,
    rating_cleanliness = excluded.rating_cleanliness,
    rating_location = excluded.rating_location,
    rating_service = excluded.rating_service,
    rating_facilities = excluded.rating_facilities,
    rating_security = excluded.rating_security,
    rating_value = excluded.rating_value,
    answered_at = coalesce(sr.answered_at, excluded.answered_at),
    edited_at = case when sr.answered_at is not null then now() end,
    moderation = excluded.moderation
  returning * into v_new;

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay_review.submitted',
    p_actor_id => v_uid, p_target_type => 'stay', p_target_id => p_stay_id,
    p_before => case when v_old.rating is not null
                  then jsonb_build_object('rating', v_old.rating, 'moderation', v_old.moderation) end,
    p_after => jsonb_build_object('rating', v_new.rating, 'moderation', v_new.moderation,
                                  'categories', jsonb_strip_nulls(jsonb_build_object(
                                    'cleanliness', v_new.rating_cleanliness, 'location', v_new.rating_location,
                                    'service', v_new.rating_service, 'facilities', v_new.rating_facilities,
                                    'security', v_new.rating_security, 'value', v_new.rating_value)),
                                  'edited', v_new.edited_at is not null));

  return jsonb_build_object('stay_id', p_stay_id, 'rating', v_new.rating, 'moderation', v_new.moderation,
    'answered_at', v_new.answered_at, 'editable_until', v_new.answered_at + interval '14 days');
end;
$$;

/*
 * The signed-in guest's NexG stays and their reviews, newest check-out
 * first; one stay when p_stay_id is given. Staff moderation is not shown
 * beyond whether the review is public.
 */
create or replace function public.rpc_stay_review_mine(p_stay_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'stay_id', s.id,
      'check_in', s.check_in,
      'check_out', s.check_out,
      'status', s.status,
      'property_name', p.name,
      'unit_label', coalesce(u.label_public, u.name),
      'can_rate', public.fn_stay_review_open(s)
                  and (sr.answered_at is null or sr.answered_at >= now() - interval '14 days'),
      'review', case when sr.rating is not null then jsonb_build_object(
          'rating', sr.rating, 'text', sr.text,
          'cleanliness', sr.rating_cleanliness, 'location', sr.rating_location,
          'service', sr.rating_service, 'facilities', sr.rating_facilities,
          'security', sr.rating_security, 'value', sr.rating_value,
          'answered_at', sr.answered_at, 'edited_at', sr.edited_at,
          'editable_until', sr.answered_at + interval '14 days',
          'public', sr.moderation = 'published',
          'staff_reply', sr.staff_reply) end
    ) order by s.check_out desc), '[]'::jsonb)
  from public.stay s
  left join public.property p on p.id = s.property_id
  left join public.unit u on u.id = s.unit_id
  left join public.stay_review sr on sr.stay_id = s.id
  where s.guest_user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and s.source = 'nexg'
    and s.status in ('booked', 'in_stay', 'departed')
    and (p_stay_id is null or s.id = p_stay_id)
$$;

-- ═══════════════════════════════════════════════════════════════ 4. asking

/*
 * Whether a guest still wants stay emails (owner, 26 Nov 2026: respect their
 * email choice). No if they switched email, or every channel, off for booking
 * reminders, stay updates, reviews or feedback in their notification choices,
 * or if the address is on the communications suppression list.
 */
create or replace function public.fn_guest_review_emails_allowed(p_user_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select not exists (
      select 1 from public.customer_notification_pref p,
             lateral jsonb_each(p.choices) c(category, channels)
       where p.user_id = p_user_id
         and c.category in ('booking_reminders', 'stay_updates', 'reviews', 'feedback')
         and jsonb_typeof(c.channels) = 'object'
         and (c.channels ->> 'email' = 'false' or c.channels ->> 'all' = 'false'))
    and not exists (
      select 1 from public.comms_suppression x
       where x.removed_at is null
         and x.channel in ('email', 'all')
         and lower(x.address) = lower(btrim(coalesce(p_email, ''))))
$fn$;
revoke all on function public.fn_guest_review_emails_allowed(uuid, text) from public, anon, authenticated;

create or replace function public.cron_stay_review_requests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_asked integer := 0;
  v_reminded integer := 0;
  r record;
  v_outbox uuid;
  v_link text;
  v_place text;
begin
  for r in
    select s.id, s.check_out, s.guest_first_name, u.email, sr.asked_at, sr.reminded_at,
           p.name as property_name, coalesce(un.label_public, un.name) as unit_label,
           (sr.asked_at is not null) as is_reminder
    from public.stay s
    join auth.users u on u.id = s.guest_user_id
    left join public.stay_review sr on sr.stay_id = s.id
    left join public.property p on p.id = s.property_id
    left join public.unit un on un.id = s.unit_id
    where s.source = 'nexg'
      and s.status in ('booked', 'in_stay', 'departed')
      and s.check_out <= now()
      and s.check_out > now() - interval '30 days'
      and nullif(btrim(coalesce(u.email, '')), '') is not null
      and not coalesce(u.is_anonymous, false)
      and sr.rating is null
      and public.fn_guest_review_emails_allowed(u.id, u.email)
      and (
        -- first ask: the day after check-out (up to three days late if a run was missed)
        (sr.asked_at is null
          and (s.check_out at time zone 'Africa/Nairobi')::date between v_today - 3 and v_today - 1)
        -- one reminder, four days after the ask
        or (sr.asked_at is not null and sr.reminded_at is null
          and (sr.asked_at at time zone 'Africa/Nairobi')::date <= v_today - 4
          and sr.asked_at > now() - interval '14 days'))
    order by s.check_out
    limit 500
  loop
    v_link := 'https://nexgapp.com/account/stays/' || r.id || '/review';
    v_place := coalesce(nullif(concat_ws(', ', r.unit_label, r.property_name), ''), 'your stay');
    v_outbox := public.fn_notify_enqueue(
      p_channel => 'email', p_recipient => lower(btrim(r.email)),
      p_template => case when r.is_reminder then 'stay_review_reminder' else 'stay_review_request' end,
      p_subject => case when r.is_reminder then 'A reminder: how was your stay?' else 'How was your stay?' end,
      p_body => 'Hi ' || coalesce(nullif(btrim(r.guest_first_name), ''), 'there') || ',' || E'\n\n'
        || case when r.is_reminder
             then 'A few days ago we asked how your stay at ' || v_place || ' went. '
                  || 'If you have a minute, your rating helps the next guest choose.'
             else 'Thank you for staying at ' || v_place || '. How was it? '
                  || 'Rate the stay overall and, if you like, its cleanliness, location, service, '
                  || 'facilities, security and value. It takes a minute.' end
        || E'\n\n' || 'Rate your stay: ' || v_link || E'\n\n'
        || case when r.is_reminder then 'We will not ask again.' || E'\n\n' else '' end
        || '— NexG Concierge',
      p_payload => jsonb_build_object('stay_id', r.id, 'link', v_link));
    if v_outbox is null then
      continue; -- switched off in Email routing; try again tomorrow
    end if;
    if r.is_reminder then
      update public.stay_review set reminded_at = now() where stay_id = r.id;
      v_reminded := v_reminded + 1;
    else
      insert into public.stay_review (stay_id, asked_at) values (r.id, now())
      on conflict (stay_id) do update set asked_at = now();
      v_asked := v_asked + 1;
    end if;
  end loop;

  if v_asked + v_reminded > 0 then
    perform audit.log('system'::public.actor_type, 'hotels', 'stay_review.requested',
      p_after => jsonb_build_object('asked', v_asked, 'reminded', v_reminded));
  end if;
  return jsonb_build_object('asked', v_asked, 'reminded', v_reminded);
end;
$$;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; guests are not asked to rate their stays.';
    return;
  end if;
  perform cron.schedule('stay-review-requests', '0 7 * * *',
    $sched$select public.cron_stay_review_requests()$sched$);
end
$cron$;

-- ═══════════════════════════════════════════════════════════════ 5. the console reader

/* Reviews & Ratings, from 20270329000100, plus the six category ratings. */
create or replace function public.rpc_console_stays_reviews(
  p_from date, p_to date, p_city uuid default null, p_tab text default 'all',
  p_q text default null, p_rating integer default null, p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with rv as (
    select sr.stay_id, sr.rating, sr.text, sr.themes, sr.answered_at, sr.moderation, sr.staff_reply, sr.featured,
           sr.rating_cleanliness, sr.rating_location, sr.rating_service, sr.rating_facilities,
           sr.rating_security, sr.rating_value, sr.edited_at,
           x.ref, x.guest_name, x.unit_label, x.property_name, x.property_id, x.host_id, x.host_name,
           x.nights, x.check_in, x.unit_id
    from public.stay_review sr
    join public.console_stays_rows(p_city) x on x.stay_id = sr.stay_id
    where sr.rating is not null and sr.answered_at >= v_start and sr.answered_at < v_end
  ),
  f as (select * from rv where (p_tab = 'all' or moderation = p_tab)
          and (p_rating is null or rating = p_rating)
          and (v_q is null or guest_name ilike '%' || v_q || '%' or coalesce(property_name, '') ilike '%' || v_q || '%'
               or coalesce(unit_label, '') ilike '%' || v_q || '%' or coalesce(text, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object('all', (select count(*) from rv),
      'published', (select count(*) from rv where moderation = 'published'),
      'under_review', (select count(*) from rv where moderation = 'under_review'),
      'hidden', (select count(*) from rv where moderation = 'hidden')),
    'kpis', jsonb_build_object(
      'avg', (select round(avg(rating), 2) from rv),
      'reviews', (select count(*) from rv),
      'properties', (select count(distinct property_id) from rv),
      'units', (select count(distinct unit_id) from rv),
      'positive_pct', (select round(100.0 * count(*) filter (where rating >= 4) / nullif(count(*), 0), 1) from rv),
      'attention_pct', (select round(100.0 * count(*) filter (where rating <= 3) / nullif(count(*), 0), 1) from rv)),
    'stars', (select jsonb_agg(jsonb_build_object('stars', s, 'n', (select count(*) from rv where rating = s)) order by s desc)
              from generate_series(1, 5) s),
    'categories', (select jsonb_build_object(
        'cleanliness', jsonb_build_object('avg', round(avg(rating_cleanliness), 2), 'n', count(rating_cleanliness)),
        'location', jsonb_build_object('avg', round(avg(rating_location), 2), 'n', count(rating_location)),
        'service', jsonb_build_object('avg', round(avg(rating_service), 2), 'n', count(rating_service)),
        'facilities', jsonb_build_object('avg', round(avg(rating_facilities), 2), 'n', count(rating_facilities)),
        'security', jsonb_build_object('avg', round(avg(rating_security), 2), 'n', count(rating_security)),
        'value', jsonb_build_object('avg', round(avg(rating_value), 2), 'n', count(rating_value)))
      from rv),
    'themes', (select coalesce(jsonb_agg(jsonb_build_object('theme', t.theme, 'n', t.n) order by t.n desc), '[]'::jsonb)
               from (select unnest(themes) as theme, count(*) as n from rv group by 1 order by 2 desc limit 8) t),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.answered_at desc), '[]'::jsonb) from (
        select * from f order by answered_at desc offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 6. grants

revoke all on function
  public.fn_stay_review_star(jsonb, text, text),
  public.fn_stay_review_open(public.stay),
  public.cron_stay_review_requests()
from public, anon, authenticated;
grant execute on function public.cron_stay_review_requests() to service_role;

revoke all on function
  public.rpc_stay_review_submit(uuid, jsonb),
  public.rpc_stay_review_mine(uuid),
  public.rpc_console_stays_reviews(date, date, uuid, text, text, integer, integer, integer)
from public, anon;
grant execute on function
  public.rpc_stay_review_submit(uuid, jsonb),
  public.rpc_stay_review_mine(uuid),
  public.rpc_console_stays_reviews(date, date, uuid, text, text, integer, integer, integer)
to authenticated;
