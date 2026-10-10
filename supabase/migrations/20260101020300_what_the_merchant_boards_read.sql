-- What the merchant boards read.
--
-- Five routes were a "designed, not built" card: Hours,
-- Disputes, Reviews, Settings, Support. Most of the plumbing
-- under them already worked — `rpc_dispute_merchant_reply`,
-- `rpc_merchant_hours_override` and `fn_merchant_effective_hours`
-- have been there all along — so what was missing was not the
-- machinery, it was everything between the machinery and the
-- person.
--
-- This adds the few pieces that genuinely were not there, and
-- the views each board reads, so no page computes anything.

-- ════════════════════════════════════════ hours by service

/*
 * A day has services, not one window.
 *
 * `merchant_hours` was unique on (merchant, day), so a kitchen
 * doing breakfast, lunch and dinner had to describe itself as
 * one long opening that included the hours it was shut. The
 * board draws three rows per day because that is what the
 * business actually does.
 *
 * `branch_id` null means the hours apply to every branch, which
 * is how the carried-over rows already behave.
 */
alter table public.merchant_hours
  add column if not exists service text not null default 'All day',
  add column if not exists branch_id uuid references public.merchant_branch (id) on delete cascade,
  add column if not exists sort smallint not null default 0;

alter table public.merchant_hours
  drop constraint if exists merchant_hours_merchant_id_day_of_week_key;

create unique index if not exists merchant_hours_one_per_slot
  on public.merchant_hours (merchant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day_of_week, service);

/**
 * Set one slot.
 *
 * Closing a service is `p_closed`, not blank times — the check
 * constraint already refuses an open row with no hours, and a
 * caller that cleared the times to mean "shut" would hit it
 * and read the error as a bug.
 */
create or replace function public.rpc_hours_set(
  p_merchant_id uuid,
  p_day smallint,
  p_service text,
  p_opens time default null,
  p_closes time default null,
  p_closed boolean default false,
  p_branch_id uuid default null
)
returns public.merchant_hours
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.merchant_hours;
begin
  if not authz.is_merchant_member(p_merchant_id) and not authz.can_manage_merchants(null) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if p_day < 0 or p_day > 6 then
    raise exception 'Day must be 0 (Monday) to 6 (Sunday).' using errcode = '22023';
  end if;
  if not p_closed and (p_opens is null or p_closes is null) then
    raise exception 'An open service needs both an opening and a closing time.'
      using errcode = '22023';
  end if;
  if not p_closed and p_closes <= p_opens then
    raise exception 'Closing time has to be after opening time. For a service that runs past midnight, split it into two.'
      using errcode = '22023';
  end if;

  insert into public.merchant_hours (
    merchant_id, branch_id, day_of_week, service, opens, closes, closed)
  values (
    p_merchant_id, p_branch_id, p_day, coalesce(nullif(trim(p_service), ''), 'All day'),
    p_opens, p_closes, p_closed)
  on conflict (merchant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day_of_week, service)
  do update set
    opens = excluded.opens,
    closes = excluded.closes,
    closed = excluded.closed,
    updated_at = now()
  returning * into v_row;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.hours_set',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('day', p_day, 'service', p_service, 'closed', p_closed));

  return v_row;
end;
$$;

/** Copy one branch's week onto another. */
create or replace function public.rpc_hours_copy(
  p_merchant_id uuid,
  p_to_branch uuid,
  /* Null means the shared, all-branch week — which is where a
     merchant with one set of hours actually keeps them. */
  p_from_branch uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  delete from public.merchant_hours
   where merchant_id = p_merchant_id and branch_id is not distinct from p_to_branch;

  insert into public.merchant_hours (
    merchant_id, branch_id, day_of_week, service, opens, closes, closed, sort)
  select merchant_id, p_to_branch, day_of_week, service, opens, closes, closed, sort
    from public.merchant_hours
   where merchant_id = p_merchant_id and branch_id is not distinct from p_from_branch;

  get diagnostics v_count = row_count;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.hours_copied',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('rows', v_count, 'to_branch', p_to_branch));

  return jsonb_build_object('ok', true, 'note', v_count || ' service(s) copied.');
end;
$$;

-- ═══════════════════════════════════════════════ reviews

/**
 * Reply to a rating.
 *
 * Moderated, because it appears on the public Explore page.
 * The reply is stored immediately and shown to the merchant as
 * pending, so they can see what they wrote; the guest sees
 * nothing until it is approved.
 */
create or replace function public.rpc_review_reply(p_rating_id uuid, p_body text)
returns public.order_rating
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.order_rating; v_merchant uuid;
begin
  select merchant_id into v_merchant from public.order_rating where id = p_rating_id;
  if v_merchant is null then
    raise exception 'No such rating.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_merchant) then
    raise exception 'Not your rating to answer.' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write something. An empty reply is published too.' using errcode = '22023';
  end if;
  if length(p_body) > 600 then
    raise exception 'Keep it under 600 characters — a reply longer than the review reads as an argument.'
      using errcode = '22023';
  end if;

  update public.order_rating set
    reply_body = trim(p_body),
    reply_at = now(),
    reply_by = (select auth.uid()),
    reply_status = 'pending',
    updated_at = now()
  where id = p_rating_id
  returning * into v_row;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'review.replied',
    p_target_type => 'order_rating', p_target_id => p_rating_id,
    p_after => jsonb_build_object('stars', v_row.stars));

  perform public.fn_approval_raise(
    p_kind => 'merchant_delist', p_module => 'merchants',
    p_target_type => 'order_rating', p_target_id => p_rating_id,
    p_title => 'Review reply to moderate',
    p_body => 'A merchant replied to a ' || v_row.stars || '-star rating. It is public on Explore once approved.',
    p_href => '/merchants', p_payload => jsonb_build_object('rating_id', p_rating_id));

  return v_row;
end;
$$;

-- ══════════════════════════════════════════════ disputes

/** Accept the charge rather than contest it. */
create or replace function public.rpc_dispute_accept(p_dispute_id uuid)
returns public.dispute
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.dispute;
begin
  select * into v_row from public.dispute where id = p_dispute_id;
  if v_row.id is null then
    raise exception 'No such dispute.' using errcode = '22023';
  end if;
  if not authz.is_merchant_member(v_row.merchant_id) then
    raise exception 'Not your dispute.' using errcode = '42501';
  end if;
  if v_row.resolved_at is not null then
    raise exception 'That one is already decided.' using errcode = '22023';
  end if;

  update public.dispute set
    merchant_reply = coalesce(merchant_reply || E'\n\n', '')
      || to_char(now(), 'DD Mon HH24:MI') || ' · Merchant accepted the charge.',
    status = 'resolved',
    fault = 'merchant',
    charged_to = 'merchant',
    resolved_at = now()
  where id = p_dispute_id
  returning * into v_row;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'dispute.accepted',
    p_target_type => 'dispute', p_target_id => p_dispute_id,
    p_after => jsonb_build_object('amount_kes', v_row.amount_claimed_kes));

  return v_row;
end;
$$;

-- ══════════════════════════════════════════════ settings

create or replace function public.rpc_merchant_settings_update(
  p_merchant_id uuid,
  p_patch jsonb
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.merchant;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  update public.merchant set
    trading_name = coalesce(nullif(trim(p_patch ->> 'trading_name'), ''), trading_name),
    /* Merged, not replaced: the Features tab and the
       Notifications tab post different halves of the same
       object, and a replace would wipe whichever was not open. */
    notification_rules = notification_rules || coalesce(p_patch -> 'notification_rules', '{}'::jsonb),
    quiet_hours = case when p_patch ? 'quiet_hours' then p_patch -> 'quiet_hours' else quiet_hours end,
    updated_at = now()
  where id = p_merchant_id
  returning * into v_row;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.settings_changed',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));

  return v_row;
end;
$$;

-- ═════════════════════════════════════════════════ views

create or replace view merchant_hours_v
with (security_invoker = true) as
select
  h.id,
  h.merchant_id,
  h.branch_id,
  b.name as branch_name,
  h.day_of_week,
  h.service,
  h.opens,
  h.closes,
  h.closed,
  h.sort
from public.merchant_hours h
left join public.merchant_branch b on b.id = h.branch_id;

create or replace view merchant_override_v
with (security_invoker = true) as
select
  o.id,
  o.merchant_id,
  o.branch_id,
  b.name as branch_name,
  o.date,
  o.opens,
  o.closes,
  o.closed,
  o.reason,
  o.source::text as source,
  o.created_at,
  o.date = (now() at time zone 'Africa/Nairobi')::date as active_today,
  o.date < (now() at time zone 'Africa/Nairobi')::date as past
from public.merchant_hours_override o
left join public.merchant_branch b on b.id = o.branch_id;

/**
 * Disputes as the board reads them.
 *
 * The countdown is computed, never stored: the whole point of
 * a 48-hour window is that it is true at the moment somebody
 * looks at it.
 */
create or replace view merchant_dispute_v
with (security_invoker = true) as
select
  d.id,
  d.merchant_id,
  d.branch_id,
  b.name as branch_name,
  d.order_reference,
  d.reason,
  d.fault::text as fault,
  d.status::text as status,
  d.amount_claimed_kes,
  d.amount_refunded_kes,
  d.charged_to::text as charged_to,
  d.resolution::text as resolution,
  d.guest_note,
  d.merchant_reply,
  d.merchant_reply_due_at,
  d.evidence,
  d.opened_at,
  d.resolved_at,
  d.resolved_at is null as open,
  case
    when d.resolved_at is not null or d.merchant_reply_due_at is null then null
    else round(extract(epoch from (d.merchant_reply_due_at - now())) / 3600)
  end as hours_left,
  d.merchant_reply_due_at is not null
    and d.resolved_at is null
    and d.merchant_reply_due_at < now() as overdue
from public.dispute d
left join public.merchant_branch b on b.id = d.branch_id;

create or replace view merchant_review_stats_v
with (security_invoker = true) as
select
  m.id as merchant_id,
  coalesce(r.ratings, 0) as ratings,
  r.average,
  coalesce(r.five, 0) as five_star,
  coalesce(r.low, 0) as low_ratings,
  coalesce(r.replied, 0) as replied,
  coalesce(r.unanswered, 0) as unanswered,
  r.one, r.two, r.three, r.four, r.five as five
from public.merchant m
left join lateral (
  select
    count(*) as ratings,
    round(avg(stars), 1) as average,
    count(*) filter (where stars = 1) as one,
    count(*) filter (where stars = 2) as two,
    count(*) filter (where stars = 3) as three,
    count(*) filter (where stars = 4) as four,
    count(*) filter (where stars = 5) as five,
    count(*) filter (where stars <= 3) as low,
    count(*) filter (where reply_at is not null) as replied,
    count(*) filter (where reply_at is null and stars <= 3) as unanswered
  from public.order_rating where merchant_id = m.id
) r on true;

create or replace view merchant_settings_v
with (security_invoker = true) as
select
  m.id as merchant_id,
  m.trading_name,
  m.legal_name,
  m.category,
  m.status::text as status,
  m.city_id,
  c.name as city_name,
  m.contact_name,
  m.contact_phone,
  m.contact_email,
  m.phone_verified_at,
  m.notification_rules,
  m.quiet_hours,
  m.accepting_orders,
  m.payout_rail,
  m.health_band::text as health_band
from public.merchant m
left join public.city c on c.id = m.city_id;

create or replace view merchant_ticket_v
with (security_invoker = true) as
select
  t.id,
  t.reference,
  t.topic::text as topic,
  t.body,
  t.status::text as status,
  t.first_reply_at,
  t.resolved_at,
  t.created_at,
  t.source_form
from public.support_ticket t
where t.from_role::text = 'merchant';

grant select on
  merchant_hours_v, merchant_override_v, merchant_dispute_v,
  merchant_review_stats_v, merchant_settings_v, merchant_ticket_v
to authenticated;
revoke all on
  merchant_hours_v, merchant_override_v, merchant_dispute_v,
  merchant_review_stats_v, merchant_settings_v, merchant_ticket_v
from anon;

revoke execute on function
  public.rpc_hours_set(uuid, smallint, text, time, time, boolean, uuid),
  public.rpc_hours_copy(uuid, uuid, uuid),
  public.rpc_review_reply(uuid, text),
  public.rpc_dispute_accept(uuid),
  public.rpc_merchant_settings_update(uuid, jsonb)
from public, anon;

grant execute on function
  public.rpc_hours_set(uuid, smallint, text, time, time, boolean, uuid),
  public.rpc_hours_copy(uuid, uuid, uuid),
  public.rpc_review_reply(uuid, text),
  public.rpc_dispute_accept(uuid),
  public.rpc_merchant_settings_update(uuid, jsonb)
to authenticated;
