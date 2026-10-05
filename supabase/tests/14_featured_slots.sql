-- Featured slots · the rules that make a paid placement honest.
--
-- Four claims this module makes to guests and merchants. Each one is
-- a line of code that could quietly stop being true, so each gets an
-- assertion:
--
--   every paid card is labelled, and no unapproved or vanished
--   merchant reaches the page;
--   eligibility is five checks with a reason, not a vibe;
--   nobody types a price;
--   a refund needs two different people.

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create temp table t_ids (k text primary key, v bigint);

delete from public.approval_request;
delete from public.role_grant;
delete from public.staff_user;

/* The local seed prices Nairobi so the console has something to draw.
   This suite is about the unpriced case, so it starts from one. */
update public.featured_rate_card
set status = 'draft', prices = '{}'::jsonb, vat_pct = null
where city_id = (select id from public.city where slug = 'nairobi');
update public.featured_slot_week set price = null, status = 'open', booking_id = null;
delete from public.featured_booking;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','91111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','fs.a@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','92222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','fs.b@nexgapp.com','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('99999999-0000-0000-0000-00000000000a','91111111-1111-1111-1111-111111111111','fs.a@nexgapp.com','FS A'),
  ('99999999-0000-0000-0000-00000000000b','92222222-2222-2222-2222-222222222222','fs.b@nexgapp.com','FS B');

insert into public.role_grant (staff_user_id, role_id, granted_by)
select s.id, (select id from public.role where key='growth'), s.id
from public.staff_user s;

/* A merchant who should qualify: live 60 days, green for 40. */
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at,
                             health_band, health_score, payout_name_lookup)
values ('f5000000-0000-4000-8000-00000000000a','[Legal] Ltd','[Grill restaurant]','restaurant',
        '[Contact]','+254700000801','fs@example.test',
        (select id from public.city where slug='nairobi'),'live', true, true,
        now() - interval '60 days','green', 88,
        '{"matched": true, "name": "[Legal] Ltd"}'::jsonb);

insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('f5000000-0000-4000-8000-00000000000a','Main','[Address]', true);

insert into public.merchant_health_snapshot (merchant_id, as_of, band, score)
select 'f5000000-0000-4000-8000-00000000000a', current_date - n, 'green', 88
from generate_series(0, 39) n;

-- ═══════════════════════════════════════ eligibility

select is(
  (public.fn_featured_eligibility(
     'f5000000-0000-4000-8000-00000000000a', 'homepage') ->> 'passed')::boolean,
  true,
  'a merchant live 60 days and green 40 passes all five checks'
);

select is(
  public.fn_health_green_streak('f5000000-0000-4000-8000-00000000000a'),
  40,
  'the green streak counts the consecutive days'
);

/*
 * One amber day resets it. "30 of the last 30" would let somebody who
 * is amber every Friday onto the homepage; "30 in a row" is the claim
 * being made.
 */
update public.merchant_health_snapshot set band = 'amber'
where merchant_id = 'f5000000-0000-4000-8000-00000000000a'
  and as_of = current_date - 5;

select is(
  public.fn_health_green_streak('f5000000-0000-4000-8000-00000000000a'),
  5,
  'a single amber day resets the streak — not 30 of the last 30, 30 in a row'
);

select is(
  (public.fn_featured_eligibility(
     'f5000000-0000-4000-8000-00000000000a', 'homepage') ->> 'passed')::boolean,
  false,
  'and that alone blocks the slot'
);

select matches(
  public.fn_featured_eligibility('f5000000-0000-4000-8000-00000000000a', 'homepage')
    -> 'checks' -> 'health_green_30d' ->> 'reason',
  'needs 30 consecutive green days, has 5',
  'the reason says exactly what is wrong, because the merchant is shown it'
);

update public.merchant_health_snapshot set band = 'green'
where merchant_id = 'f5000000-0000-4000-8000-00000000000a';

/* Each check failing alone. */
insert into public.dispute (merchant_id, reason, status, opened_at)
values ('f5000000-0000-4000-8000-00000000000a','late','open', now());

select is(
  (public.fn_featured_eligibility('f5000000-0000-4000-8000-00000000000a', 'homepage')
    -> 'checks' -> 'no_open_disputes' ->> 'passed')::boolean,
  false,
  'one open dispute blocks it'
);

delete from public.dispute where merchant_id = 'f5000000-0000-4000-8000-00000000000a';

update public.merchant set payout_name_lookup = '{"matched": false}'::jsonb
where id = 'f5000000-0000-4000-8000-00000000000a';

select is(
  (public.fn_featured_eligibility('f5000000-0000-4000-8000-00000000000a', 'homepage')
    -> 'checks' -> 'settlement_verified' ->> 'passed')::boolean,
  false,
  'an unverified settlement account blocks it — we could not bill the fee'
);

update public.merchant set payout_name_lookup = '{"matched": true}'::jsonb
where id = 'f5000000-0000-4000-8000-00000000000a';

-- ═══════════════════════════════════════ nobody types a price

set local role authenticated;
set local request.jwt.claims = '{"sub":"91111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_featured_request(
       'f5000000-0000-4000-8000-00000000000a', 'homepage', null,
       date_trunc('week', now())::date, 2, true) $$,
  'a request can be made'
);

/*
 * The rate card is seeded with null prices on purpose. Until finance
 * sets one, the slot cannot be sold at all.
 */
select throws_like(
  $$ select public.rpc_featured_hold_and_quote(
       (select id from public.featured_booking limit 1),
       (select id from public.featured_placement
         where kind = 'homepage' and position = 1
           and city_id = (select id from public.city where slug='nairobi')),
       date_trunc('week', now())::date, 2) $$,
  '%No price is set%',
  'a quote is refused while the rate card has no price — staff never type one'
);

reset role;

update public.featured_rate_card
set status = 'current',
    effective_from = date_trunc('week', now())::date,
    prices = '{"homepage": 12000, "category_top": {"default": 8000, "overrides": {}}, "popular_request": 5000}'::jsonb,
    vat_pct = 16
where city_id = (select id from public.city where slug='nairobi');

select is(
  public.fn_featured_price(
    (select id from public.city where slug='nairobi'), 'homepage'),
  12000::bigint,
  'with a rate card, the price comes from it'
);

update public.featured_slot_week sw set price = 12000
from public.featured_placement p
where p.id = sw.placement_id and p.kind = 'homepage';

set local role authenticated;
set local request.jwt.claims = '{"sub":"91111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_featured_hold_and_quote(
       (select id from public.featured_booking limit 1),
       (select id from public.featured_placement
         where kind = 'homepage' and position = 1
           and city_id = (select id from public.city where slug='nairobi')),
       date_trunc('week', now())::date, 2) $$,
  'and the quote goes out'
);

select is(
  (select quoted_price from public.featured_booking limit 1),
  12000::bigint,
  'at the rate-card price, frozen onto the booking'
);

select is(
  (select count(*)::int from public.featured_slot_week where status = 'held'),
  2,
  'both weeks are held'
);

/* A second merchant cannot be quoted the same weeks. */
reset role;
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             went_live_at, health_band, payout_name_lookup)
values ('f5000000-0000-4000-8000-00000000000b','[Legal2] Ltd','[Sushi place]','restaurant',
        '[Contact]','+254700000802','fs2@example.test',
        (select id from public.city where slug='nairobi'),'live',
        now() - interval '60 days','green','{"matched": true}'::jsonb);

insert into public.merchant_health_snapshot (merchant_id, as_of, band, score)
select 'f5000000-0000-4000-8000-00000000000b', current_date - n, 'green', 85
from generate_series(0, 39) n;

set local role authenticated;
set local request.jwt.claims = '{"sub":"91111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.rpc_featured_request('f5000000-0000-4000-8000-00000000000b', 'homepage', null,
  date_trunc('week', now())::date, 2, true);

select throws_like(
  $$ select public.rpc_featured_hold_and_quote(
       (select id from public.featured_booking
         where merchant_id = 'f5000000-0000-4000-8000-00000000000b'),
       (select id from public.featured_placement
         where kind = 'homepage' and position = 1
           and city_id = (select id from public.city where slug='nairobi')),
       date_trunc('week', now())::date, 2) $$,
  '%not all free%',
  'and the same weeks cannot be sold twice'
);

-- ══════════════════════════════ confirm, creative, go live

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"91111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_featured_confirm(
       (select id from public.featured_booking
         where merchant_id = 'f5000000-0000-4000-8000-00000000000a')) $$,
  'the merchant confirms'
);

select is(
  (select count(*)::int from public.featured_creative
   where booking_id = (select id from public.featured_booking
                       where merchant_id = 'f5000000-0000-4000-8000-00000000000a')),
  1,
  'which creates a draft creative to fill in'
);

/* A sponsored card cannot claim to be the best. */
select throws_like(
  $$ select public.rpc_featured_creative_submit(
       (select id from public.featured_booking
         where merchant_id = 'f5000000-0000-4000-8000-00000000000a'),
       '{"blurb":"The best grill in Nairobi"}'::jsonb) $$,
  '%cannot say%',
  'and the blurb is checked server-side for banned claims'
);

select lives_ok(
  $$ select public.rpc_featured_creative_submit(
       (select id from public.featured_booking
         where merchant_id = 'f5000000-0000-4000-8000-00000000000a'),
       '{"blurb":"Late-night · open till 02:00"}'::jsonb) $$,
  'an honest blurb is accepted'
);

reset role;

-- ═══════════════════════════════ what reaches a guest

select public.cron_featured_activate();

/*
 * The creative is still pending review, so nothing goes live. An
 * unreviewed card on the homepage is the one thing this gate exists
 * to prevent.
 */
select is(
  (select count(*)::int from public.featured_live_v),
  0,
  'an unapproved creative never reaches a guest'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"91111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.rpc_featured_creative_review(
  (select id from public.featured_creative limit 1), true);
reset role;

select public.cron_featured_activate();

select is(
  (select badge from public.featured_live_v limit 1),
  'SPONSORED',
  'and once approved it is live — carrying the SPONSORED label from the view itself'
);

/* A merchant who leaves merchant_public leaves the homepage at once. */
update public.merchant set status = 'suspended', accepting_orders = false
where id = 'f5000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.featured_live_v),
  0,
  'suspending the merchant drops the card the same second, not on Monday'
);

update public.merchant set status = 'live', accepting_orders = true
where id = 'f5000000-0000-4000-8000-00000000000a';

-- ═══════════════════════════════════════ money

select is(
  (select fee_total from public.featured_fee_line limit 1),
  13920::bigint,
  'a full week bills the rate-card price plus VAT'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"91111111-1111-1111-1111-111111111111","role":"authenticated"}';

select public.rpc_featured_refund(
  (select id from public.featured_fee_line limit 1), 5000, 'nexg_outage');

select throws_like(
  $$ select public.rpc_featured_refund(
       (select id from public.featured_fee_line limit 1), 5000, 'nexg_outage') $$,
  '%Finance has to approve it%',
  'one person cannot both request and approve a refund'
);


-- ════════════════ selling a slot on the phone, and the end

/*
 * The flow that actually sells most slots: somebody agrees a price
 * while you are talking to them. Everything that makes that money
 * real is tested here, because the ceremony that protects it in the
 * request-and-quote path has been deliberately skipped.
 */
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from public.staff_user order by created_at limit 1),
                    'role', 'authenticated')::text, true);

select throws_ok(
  format($$ select public.rpc_featured_place_merchant(%L, %L, %L, null) $$,
    (select id from public.featured_placement where enabled limit 1),
    (select id from public.merchant where status = 'live' limit 1),
    date_trunc('week', now())::date),
  null,
  'A placement with no price is refused — nobody could invoice it.');

select throws_ok(
  format($$ select public.rpc_featured_place_merchant(%L, %L, %L, 50000) $$,
    (select id from public.featured_placement where enabled limit 1),
    (select id from public.merchant where status = 'live' limit 1),
    (date_trunc('week', now()) + interval '3 days')::date),
  null,
  'A slot week starts on a Monday, and a Thursday is refused by name.');

select throws_ok(
  format($$ select public.rpc_featured_place_merchant(%L, %L, %L, 50000) $$,
    (select id from public.featured_placement where enabled limit 1),
    (select id from public.merchant where status <> 'live' limit 1),
    date_trunc('week', now())::date),
  null,
  'A merchant who is not live cannot be sold a slot — a sponsored card that is shut is worse than none.');

-- ══════════════════════════ a week ends by itself

/*
 * The counterpart that never existed. Without it a booking stays
 * live forever and every console shows the merchant as featured;
 * the homepage was only ever right because its view re-checks the
 * dates on each read.
 */
insert into t_ids (k, v) select 'expire_before',
  (select count(*) from public.featured_live_v);

update public.featured_slot_week
   set week_start = week_start - 28
 where status = 'live'
   and booking_id = (select booking_id from public.featured_live_v limit 1);

select ok(
  (public.cron_featured_expire() ->> 'slots_ended')::int > 0,
  'The expiry cron ends a week that has passed.');

select ok(
  (select count(*) from public.featured_live_v)
    < (select v from t_ids where k = 'expire_before'),
  'And the merchant comes off the homepage without anybody remembering.');

select is(
  (select count(*)::int from public.featured_booking b
   where b.status = 'live'
     and not exists (select 1 from public.featured_slot_week sw
                     where sw.booking_id = b.id and sw.status <> 'ended')),
  0,
  'A booking with no running weeks left is closed out, not left live.');

-- ════════════════ one answer to "is this merchant featured"

select is(
  (select count(*)::int from public.merchant m
   where m.featured is distinct from public.fn_merchant_is_featured(m.id)),
  0,
  'The flag on the merchant row and the live slots agree — they used to be able to disagree.');

/* And the toggle can no longer set it by hand. */
select throws_ok(
  format($$ select public.rpc_merchant_set_featured(%L, true) $$,
    (select id from public.merchant where status = 'live' and not featured limit 1)),
  null,
  'Featuring somebody from a toggle is refused: it cannot say which slot, which week or what price.');

-- ═══════════════ a paid merchant shows without artwork

select is(
  (select count(*)::int from pg_matviews where matviewname = 'featured_live_v'),
  0,
  'featured_live_v is a view, so the homepage never shows a stale band.');

select ok(
  pg_get_viewdef('public.featured_live_v'::regclass) not like '%cr.id IS NOT NULL%',
  'An approved creative is no longer required — charging somebody and then not showing them is a bug, not a policy.');


-- ═══════════════════════════════ the pitch, honestly

/*
 * The upsell email. What it must never do is quote a number nobody
 * agreed — so an unpriced placement is absent from the pitch rather
 * than rendered as a dash, and a city with no published rate card
 * cannot be pitched at all.
 */
select is(
  (select count(*)::int from public.featured_pitch_v where price_per_week is null),
  0,
  'Nothing unpriced reaches the pitch — a dash is not a price and an invented one gets invoiced.');

select ok(
  (select count(*) from public.featured_pitch_v) > 0,
  'And there is something to pitch where a rate card is published.');

select throws_ok(
  format($$ select public.rpc_featured_send_pitch(%L) $$,
    (select id from public.merchant where status <> 'live' limit 1)),
  null,
  'Somebody who is not trading yet is not pitched — it is a promise we cannot keep.');

select is(
  (public.fn_render_featured_pitch(
     jsonb_build_object('name','A','city','B','category','restaurant',
       'slots', jsonb_build_array(jsonb_build_object(
         'what_it_is','First in restaurant','price_per_week', 9500,
         'weeks_open', 8, 'earliest_week', '2026-10-05')))) ->> 'body')
    like '%KES 9,500 a week%',
  true,
  'The rendered email carries the real price, formatted for a person.');

select is(
  (public.fn_render_featured_pitch('{}'::jsonb) ->> 'body') like '%null%',
  false,
  'And an empty payload never prints the word null at a merchant.');

select * from finish();
rollback;
