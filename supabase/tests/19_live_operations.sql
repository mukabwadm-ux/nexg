-- Live operations, tested against the ways the screen could lie.
--
-- The module's claim is that the cascade is the truth: every offer
-- is a row with who was asked, how far away, what they said and why
-- anybody eligible was skipped, and the console renders those rows
-- rather than inferring anything. So the tests are not "can I make
-- an offer" — they are the ways that claim could be false:
--
--   · an exclusion with no reason, so the screen cannot explain it
--   · an offer edited after it was answered
--   · a rider holding two live offers for one job
--   · a boost or a compensation figure invented because none was set
--   · an adjustment repriced against today's fees instead of the
--     order's own
--   · a dispatcher in one city acting on another city's job
--   · a cancellation or a refund above the threshold going through
--     without a second person

begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

create temp table t (k text primary key, v text);
/* The suite switches roles to test who may do what, and the
   fixture ids live in here, so every role needs reach into it —
   including the temp schema itself, which is not on their path by
   default. */
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

-- ─────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000006a',
   'authenticated','authenticated','nbo.ops@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000006b',
   'authenticated','authenticated','msa.ops@test.local','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000006c',
   'authenticated','authenticated','support@test.local','',now(),now(),now())
on conflict (id) do nothing;

insert into public.staff_user (id, user_id, email, display_name)
values
  ('f0000000-0000-4000-8000-00000000006a','e0000000-0000-4000-8000-00000000006a','nbo.ops@test.local','Nairobi Ops'),
  ('f0000000-0000-4000-8000-00000000006b','e0000000-0000-4000-8000-00000000006b','msa.ops@test.local','Mombasa Ops'),
  ('f0000000-0000-4000-8000-00000000006c','e0000000-0000-4000-8000-00000000006c','support@test.local','Support Three')
on conflict (id) do nothing;

insert into t (k, v) values
  ('nbo', (select id::text from public.city where name = 'Nairobi')),
  ('msa', (select id::text from public.city where name = 'Mombasa'));

/* City-scoped grants, which is the whole point of the RLS tests. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'f0000000-0000-4000-8000-00000000006a', r.id, (select v::uuid from t where k = 'nbo'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'f0000000-0000-4000-8000-00000000006b'
from public.role r where r.key = 'ops_manager' on conflict do nothing;

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'f0000000-0000-4000-8000-00000000006b', r.id, (select v::uuid from t where k = 'msa'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'f0000000-0000-4000-8000-00000000006a'
from public.role r where r.key = 'ops_manager' on conflict do nothing;

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'f0000000-0000-4000-8000-00000000006c', r.id, (select v::uuid from t where k = 'nbo'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'f0000000-0000-4000-8000-00000000006a'
from public.role r where r.key = 'support' on conflict do nothing;

/* A merchant with a located branch, so distances mean something. */
insert into t (k, v) select 'branch', (select mb.id::text from public.merchant_branch mb
  join public.merchant m on m.id = mb.merchant_id
  where m.city_id = (select v::uuid from t where k = 'nbo') limit 1);

update public.merchant_branch set latitude = -1.2650, longitude = 36.8030
 where id = (select v::uuid from t where k = 'branch');

insert into t (k, v) select 'merchant',
  (select merchant_id::text from public.merchant_branch where id = (select v::uuid from t where k = 'branch'));

insert into public.guest (id, phone, name)
values ('a0000000-0000-4000-8000-0000000000f1', '+254700000701', 'Test Guest')
on conflict (id) do nothing;

/* Two riders: one near and clean, one on a bicycle. */
insert into public.rider
  (id, first_name, last_name, phone, city_id, vehicle, plate_no, status, presence,
   last_location, last_location_at, can_receive_offers, cash_on_hand, cash_cap,
   alcohol_eligible, large_items_eligible, activated_at, activated_by)
values
  ('b0000000-0000-4000-8000-0000000000f1','Test','Near','+254700000701',
   (select v::uuid from t where k = 'nbo'),'motorbike','TEST-N1','active','online',
   extensions.st_setsrid(extensions.st_makepoint(36.8075, -1.2650),4326)::extensions.geography,
   now(), true, 0, 2000000, true, true, now(),
   (select id from public.staff_user where email = 'dev.admin@nexgapp.com')),
  ('b0000000-0000-4000-8000-0000000000f2','Test','Pedal','+254700000702',
   (select v::uuid from t where k = 'nbo'),'bicycle','TEST-N2','active','online',
   extensions.st_setsrid(extensions.st_makepoint(36.8075, -1.2650),4326)::extensions.geography,
   now(), true, 0, 2000000, true, true, now(),
   (select id from public.staff_user where email = 'dev.admin@nexgapp.com')),
  ('b0000000-0000-4000-8000-0000000000f3','Test','Second','+254700000703',
   (select v::uuid from t where k = 'nbo'),'motorbike','TEST-N3','active','online',
   extensions.st_setsrid(extensions.st_makepoint(36.8090, -1.2650),4326)::extensions.geography,
   now(), true, 0, 2000000, true, true, now(),
   (select id from public.staff_user where email = 'dev.admin@nexgapp.com'))
on conflict (id) do nothing;

insert into public.order (
  id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, dropoff_point, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency,
  carry_requirements)
values (
  'c0000000-0000-4000-8000-0000000000f1', 'TEST-LIVE-1',
  'a0000000-0000-4000-8000-0000000000f1',
  (select v::uuid from t where k = 'merchant'),
  (select v::uuid from t where k = 'branch'),
  (select v::uuid from t where k = 'nbo'), 'web',
  'Somewhere in Westlands',
  extensions.st_setsrid(extensions.st_makepoint(36.8000, -1.2730),4326)::extensions.geography,
  'confirmed', 'card', 'paid', 120000, 25000, 6000, 151000, 'KES',
  array['motorbike'])
on conflict (id) do nothing;

-- ════════════════════════ 1. the cascade writes its reasons

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

insert into t (k, v) select 'job',
  (dispatch.rpc_job_start('c0000000-0000-4000-8000-0000000000f1'::uuid) ->> 'job_id');

select isnt((select v from t where k = 'job'), null, 'A job starts.');

select is(
  (select vehicle_requirements from dispatch.job where id = (select v::uuid from t where k = 'job')),
  array['motorbike'],
  'The job carries what the order said it needs carrying.');

select is(
  (select skip_reason::text from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job')
      and rider_id = 'b0000000-0000-4000-8000-0000000000f2'),
  'wrong_vehicle',
  'A bicycle is not offered a motorbike job.');

select alike(
  (select note from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job')
      and rider_id = 'b0000000-0000-4000-8000-0000000000f2'),
  '%rides bicycle%',
  'And the exclusion says why, in words a dispatcher can read.');

select is(
  (select count(*)::int from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job')
      and outcome = 'skipped' and skip_reason is null),
  0,
  'No exclusion is recorded without a reason.');

select is(
  (select outcome::text from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job')
      and rider_id = 'b0000000-0000-4000-8000-0000000000f1'),
  'pending',
  'The eligible rider is actually asked.');

-- ══════════════════════════ 2. an answered offer is final

reset role;
insert into t (k, v) select 'offer',
  (select id::text from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job') and outcome = 'pending' limit 1);

update dispatch.offer set outcome = 'declined', responded_at = now(),
       decline_reason = 'too_far'
 where id = (select v::uuid from t where k = 'offer');

select throws_matching(
  format('update dispatch.offer set outcome = %L where id = %L', 'accepted',
         (select v from t where k = 'offer')),
  'already been answered',
  'An offer cannot be edited after it has been answered.');

select throws_matching(
  format('update dispatch.offer set note = %L where id = %L', 'rewriting history',
         (select v from t where k = 'offer')),
  'does not get edited afterwards',
  'Not even its note — the cascade is what an intervention is judged against.');

select is(
  (select reads_as from public.console_cascade_v where id = (select v::uuid from t where k = 'offer')),
  'Declined · too_far',
  'And the console renders the answer rather than inferring one.');

-- ════════════════════ 3. one live offer per rider per job

reset role;
select dispatch.fn_offer_round((select v::uuid from t where k = 'job'));

select is(
  (select coalesce(max(c), 0)::int from (
     select count(*) as c from dispatch.offer
      where job_id = (select v::uuid from t where k = 'job') and outcome = 'pending'
      group by rider_id) x),
  1,
  'Starting a round leaves nobody holding two live offers for the same job.');

select is(
  (select count(*)::int from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job')
      and outcome = 'pending' and round < (select round from dispatch.job
                                            where id = (select v::uuid from t where k = 'job'))),
  0,
  'Offers from an earlier round do not stay pending behind the new one.');

/* Counted as a proportion rather than a number: this database may
   carry riders from other fixtures, and the invariant is that every
   superseded offer explains itself, not that there was exactly
   one. */
select is(
  (select count(*)::int from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job')
      and outcome = 'withdrawn' and note not like '%withdrawn when round%'),
  0,
  'Every offer superseded by a new round says so, so the cascade reads as what happened.');

select ok(
  (select count(*) from dispatch.offer
    where job_id = (select v::uuid from t where k = 'job') and outcome = 'withdrawn') > 0,
  'And at least one actually was superseded, so that is not vacuous.');

-- ═══════════════════════════ 4. numbers nobody published

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

select is(
  (select value from settings.version
    where key = 'dispatch.boost_fee'
      and scope_city_id = (select v::uuid from t where k = 'nbo')
      and status = 'active'),
  null,
  'This city has no boost fee published.');

select throws_matching(
  format('select dispatch.rpc_boost_retry(%L)', (select v from t where k = 'job')),
  'No boost amount is set',
  'So boosting refuses rather than inventing one.');

select is(
  (dispatch.fn_cancel_preview('c0000000-0000-4000-8000-0000000000f1'::uuid)
     ->> 'rider_compensation_cents'),
  null,
  'Cancel compensation for an uncollected order is null, not zero.');

select is(
  (dispatch.fn_cancel_preview('c0000000-0000-4000-8000-0000000000f1'::uuid)
     ->> 'guest_refund_cents')::bigint,
  151000::bigint,
  'But a guest who paid is owed the whole thing, and the preview says the figure.');

select is(
  (dispatch.fn_cancel_preview('c0000000-0000-4000-8000-0000000000f1'::uuid)
     ->> 'needs_second_person')::boolean,
  false,
  'With no threshold published, nothing is held back — and that is stated, not implied.');

-- ═══════════════════════════ 5. widening only in steps

select throws_matching(
  format('select dispatch.rpc_widen_radius(%L, 4)', (select v from t where k = 'job')),
  'The steps are',
  'A radius nobody agreed on is refused.');

select is(
  (dispatch.fn_widen_preview((select v::uuid from t where k = 'job'), 8) ->> 'ok')::boolean,
  true,
  'Widening is previewed before it is done.');

select ok(
  (dispatch.fn_widen_preview((select v::uuid from t where k = 'job'), 8)
     ->> 'newly_eligible') is not null,
  'And the preview says how many more riders it actually reaches.');

-- ══════════════ 6. a dispatcher cannot cross a city border

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006b","role":"authenticated"}', true);

select throws_matching(
  format('select dispatch.rpc_widen_radius(%L, 5)', (select v from t where k = 'job')),
  'cannot',
  'Mombasa ops cannot widen a Nairobi job.');

select throws_matching(
  format('select dispatch.rpc_cancel(%L, %L, %L)',
         'c0000000-0000-4000-8000-0000000000f1', 'safety', 'wrong city'),
  'cannot',
  'Nor cancel a Nairobi order.');

select is(
  (select count(*)::int from dispatch.job where id = (select v::uuid from t where k = 'job')),
  0,
  'Nor even see that the job exists.');

-- ════════════════════════════ 7. support cannot intervene

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006c","role":"authenticated"}', true);

select throws_matching(
  format('select dispatch.rpc_boost_retry(%L)', (select v from t where k = 'job')),
  'cannot',
  'Support can read the city but not boost an offer.');

select throws_matching(
  format('select dispatch.rpc_zone_pause(%L, %L)',
         (select id from public.zone
           where city_id = (select v::uuid from t where k = 'nbo') limit 1),
         'because I can'),
  'ops manager',
  'And pausing a zone is narrower still.');

-- ═════════════ 8. a partner is nowhere near any of this

reset role;
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'dispatch' and grantee = 'anon'),
  0,
  'Anonymous holds nothing in the dispatch schema.');

select is(
  (select count(*)::int from pg_tables
    where schemaname = 'dispatch' and rowsecurity = false),
  0,
  'Every dispatch table has row security on.');

-- ══════════════════ 9. repricing uses the order's versions

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

select is(
  (public.fn_order_reprice('c0000000-0000-4000-8000-0000000000f1'::uuid, '[]'::jsonb)
     ->> 'ok')::boolean,
  false,
  'An order with no recorded fee versions cannot be repriced.');

select alike(
  (public.fn_order_reprice('c0000000-0000-4000-8000-0000000000f1'::uuid, '[]'::jsonb)
     ->> 'message'),
  '%cannot be repriced%',
  'And says so, rather than quietly using today''s card.');

reset role;
/* Clear our own ground: only one version of a key can be active per
   scope, and this database may already carry one. */
update settings.version set status = 'superseded', superseded_at = now()
 where status = 'active'
   and scope_city_id = (select v::uuid from t where k = 'nbo')
   and key in ('fees.delivery.band_1', 'fees.service_pct', 'fees.commission',
               'finance.refund_two_person_threshold');

insert into settings.version (id, key, scope_kind, scope_city_id, scope_category, value,
                              effective_from, status, created_by)
values
  ('d0000000-0000-4000-8000-0000000000f1', 'fees.delivery.band_1', 'city',
   (select v::uuid from t where k = 'nbo'), null, '25000'::jsonb,
   now() - interval '1 day', 'active',
   (select id from public.staff_user where email = 'dev.admin@nexgapp.com')),
  ('d0000000-0000-4000-8000-0000000000f2', 'fees.service_pct', 'city',
   (select v::uuid from t where k = 'nbo'), null, '5'::jsonb,
   now() - interval '1 day', 'active',
   (select id from public.staff_user where email = 'dev.admin@nexgapp.com')),
  ('d0000000-0000-4000-8000-0000000000f3', 'fees.commission', 'city_category',
   (select v::uuid from t where k = 'nbo'),
   (select m.category::text from public.merchant m where m.id = (select v::uuid from t where k = 'merchant')),
   '18'::jsonb, now() - interval '1 day', 'active',
   (select id from public.staff_user where email = 'dev.admin@nexgapp.com'))
on conflict (id) do nothing;

update public.order set pricing_version_ids = jsonb_build_object(
  'delivery', 'd0000000-0000-4000-8000-0000000000f1',
  'service',  'd0000000-0000-4000-8000-0000000000f2',
  'commission','d0000000-0000-4000-8000-0000000000f3')
 where id = 'c0000000-0000-4000-8000-0000000000f1';

insert into public.order_item (id, order_id, name, quantity, unit_price_cents, line_total_cents)
values ('e0000000-0000-4000-8000-0000000000f1','c0000000-0000-4000-8000-0000000000f1',
        'Test item', 1, 120000, 120000)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

select is(
  (public.fn_order_reprice('c0000000-0000-4000-8000-0000000000f1'::uuid, '[]'::jsonb)
     ->> 'service_fee_cents')::bigint,
  6000::bigint,
  'With versions recorded, the service fee is 5% of the subtotal.');

/* Now move the fee. The reprice must not notice. */
reset role;
update settings.version set status = 'superseded', superseded_at = now()
 where id = 'd0000000-0000-4000-8000-0000000000f2';
insert into settings.version (key, scope_kind, scope_city_id, value, effective_from, status, created_by)
values ('fees.service_pct', 'city', (select v::uuid from t where k = 'nbo'), '40'::jsonb,
        now() - interval '1 hour', 'active',
        (select id from public.staff_user where email = 'dev.admin@nexgapp.com'));

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

select is(
  (public.fn_order_reprice('c0000000-0000-4000-8000-0000000000f1'::uuid, '[]'::jsonb)
     ->> 'service_fee_cents')::bigint,
  6000::bigint,
  'The fee moved to 40% and backdated an hour; this order still reprices at 5%.');

select is(
  (select (settings.fn_num('fees.service_pct', (select v::uuid from t where k = 'nbo')))::int),
  40,
  'The city really is on 40% now — the order is pinned, not the setting.');

-- ══════════════════════════════════ 10. refund routes

select is(
  (public.fn_refund_routes('c0000000-0000-4000-8000-0000000000f1'::uuid) ->> 'suggested'),
  'original',
  'A card order is refunded back the way it was paid.');

select throws_matching(
  format('select public.rpc_order_refund(%L, 1000000000, %L, %L, %L)',
         'c0000000-0000-4000-8000-0000000000f1', 'original', 'goodwill', 'too much'),
  'would refund',
  'A refund larger than the order is refused, with both figures.');

select throws_matching(
  format('select public.rpc_order_refund(%L, 10000, %L, %L, null)',
         'c0000000-0000-4000-8000-0000000000f1', 'original', 'goodwill'),
  'Say what happened',
  'A refund without a sentence of explanation is refused.');

select is(
  (public.rpc_order_refund('c0000000-0000-4000-8000-0000000000f1'::uuid, 10000,
     'original', 'late', 'arrived cold') ->> 'needs_second_person')::boolean,
  false,
  'With no threshold published, a refund is approved on the spot.');

reset role;
update settings.version set status = 'superseded', superseded_at = now()
 where status = 'active' and key = 'finance.refund_two_person_threshold'
   and scope_city_id = (select v::uuid from t where k = 'nbo');
insert into settings.version (key, scope_kind, scope_city_id, value, effective_from, status, created_by)
values ('finance.refund_two_person_threshold', 'city', (select v::uuid from t where k = 'nbo'),
        '5000'::jsonb, now() - interval '1 day', 'active',
        (select id from public.staff_user where email = 'dev.admin@nexgapp.com'));

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

select is(
  (public.rpc_order_refund('c0000000-0000-4000-8000-0000000000f1'::uuid, 20000,
     'original', 'quality', 'cold again') ->> 'needs_second_person')::boolean,
  true,
  'Publish a threshold and the next one waits for a second person.');

reset role;
select is(
  (select count(*)::int from public.approval_request a
    join public.refund r on r.id = a.target_id
   where a.target_type = 'order_refund'
     and r.order_id = 'c0000000-0000-4000-8000-0000000000f1'),
  1,
  'And it is actually in the approvals queue, not just labelled.');

-- ═══════════════════════ 11. needs-action truth table

reset role;
update public.order
   set promised_delivery_at = now() - interval '5 minutes',
       guest_unreachable = true
 where id = 'c0000000-0000-4000-8000-0000000000f1';

select ok(
  'past_promise' = any (public.fn_order_needs_action('c0000000-0000-4000-8000-0000000000f1')),
  'An order past its promise needs action.');

select ok(
  'guest_unreachable' = any (public.fn_order_needs_action('c0000000-0000-4000-8000-0000000000f1')),
  'So does one whose guest is not answering.');

select alike(
  public.fn_needs_action_reads_as(
    public.fn_order_needs_action('c0000000-0000-4000-8000-0000000000f1')),
  '%past the promised delivery%',
  'And the reason is rendered in words rather than a code.');

update public.order
   set promised_delivery_at = now() + interval '1 hour',
       guest_unreachable = false, rider_id = 'b0000000-0000-4000-8000-0000000000f1',
       stage = 'picked_up', picked_up_at = now()
 where id = 'c0000000-0000-4000-8000-0000000000f1';
update dispatch.job set state = 'assigned', assigned_rider_id = 'b0000000-0000-4000-8000-0000000000f1',
       assigned_at = now()
 where id = (select v::uuid from t where k = 'job');

select is(
  array_length(public.fn_order_needs_action('c0000000-0000-4000-8000-0000000000f1'), 1),
  null,
  'Fix all of it and the order clears — the flag is computed, not sticky.');

-- ════════════════════════ 12. items after pickup

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

select throws_matching(
  format('select public.rpc_order_adjust_items(%L, %L::jsonb, %L)',
         'c0000000-0000-4000-8000-0000000000f1',
         '[{"item_id":"e0000000-0000-4000-8000-0000000000f1","quantity":0}]',
         'changed my mind'),
  'has been collected',
  'Once the rider has the bag, the items stop changing.');

-- ═══════════════════════════ 13. a zone pause stops money

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);

insert into t (k, v) select 'zone',
  (select id::text from public.zone
    where city_id = (select v::uuid from t where k = 'nbo') and polygon is not null limit 1);

select throws_matching(
  format('select dispatch.rpc_zone_pause(%L, %L)', (select v from t where k = 'zone'), ''),
  'Say why',
  'A pause without a reason is refused — guests see that deliveries stopped.');

select is(
  (dispatch.rpc_zone_pause((select v::uuid from t where k = 'zone'),
     'flooding', now() + interval '1 hour') ->> 'ok')::boolean,
  true,
  'An ops manager can pause their own city''s zone.');

select is(
  (public.fn_zone_serviceable(
     (select extensions.st_centroid(polygon::extensions.geometry)::extensions.geography
        from public.zone where id = (select v::uuid from t where k = 'zone'))) ->> 'ok')::boolean,
  false,
  'And checkout stops taking orders there in the same query everything else asks.');

select alike(
  (public.fn_zone_serviceable(
     (select extensions.st_centroid(polygon::extensions.geometry)::extensions.geography
        from public.zone where id = (select v::uuid from t where k = 'zone'))) ->> 'reason'),
  '%flooding%',
  'The guest is told the reason staff gave, not a generic apology.');

reset role;
update dispatch.zone_health set paused_until = now() - interval '1 minute'
 where zone_id = (select v::uuid from t where k = 'zone');
select dispatch.cron_zone_unpause();

select is(
  (select paused from dispatch.zone_health where zone_id = (select v::uuid from t where k = 'zone')),
  false,
  'A timed pause ends itself, rather than outliving the reason for it.');

-- ═════════════════════════════════ 14. everything audited

select is(
  (select count(*)::int from audit.action_registry where module = 'live_ops'),
  11,
  'Every live-ops action is in the registry the audit console reads.');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'dispatch.zone_paused' and target_id = (select v::uuid from t where k = 'zone')),
  1,
  'Pausing a zone wrote an event.');

select is(
  (select severity::text from audit.audit_event
    where action = 'dispatch.zone_paused' and target_id = (select v::uuid from t where k = 'zone')),
  'high',
  'At the severity stopping part of a city deserves.');

select * from finish();
rollback;
