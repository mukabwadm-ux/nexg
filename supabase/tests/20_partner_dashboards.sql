-- The partner dashboards, tested against the ways they could show
-- somebody the wrong business.
--
-- Everything these two screens display is scoped by a row policy
-- rather than by a `where` clause in a page, which is the right
-- way round — but it means the whole module's safety rests on
-- policies being correct, and a policy that is too narrow fails
-- silently (an empty page that looks like a quiet day) while one
-- that is too wide leaks a competitor's trade.
--
-- So these are the questions:
--
--   * can a merchant see their own orders — the bug that shipped
--     with live operations, where only staff could
--   * can a merchant see anybody else's
--   * can a rider see the merchant on a job that is theirs, and on
--     one that is not
--   * does the dashboard open at the right point in onboarding
--   * do the write RPCs refuse what they say they refuse

begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

create temp table t (k text primary key, v text);
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
                        email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000007a',
   'authenticated','authenticated','m1@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000007b',
   'authenticated','authenticated','m2@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000007c',
   'authenticated','authenticated','r1@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-4000-8000-00000000007d',
   'authenticated','authenticated','r2@test.local','',now(),now(),now(),'','','','','','','','')
on conflict (id) do nothing;

insert into t (k, v) values
  ('city', (select id::text from public.city where name = 'Nairobi')),
  ('admin', (select id::text from public.staff_user where email = 'dev.admin@nexgapp.com'));

insert into t (k, v) select 'zone',
  (select id::text from public.zone where city_id = (select v::uuid from t where k='city')
    and polygon is not null limit 1);

/* Two merchants that have nothing to do with each other, and two
   riders likewise. */
insert into public.merchant
  (id, legal_name, trading_name, category, contact_name, contact_phone, city_id, status,
   hours_pattern, prep_minutes, payout_rail, payout_account, submitted_at, went_live_at)
values
  ('a2000000-0000-4000-8000-000000000001','[One Ltd]','[One]','restaurant','[Owner]','+254700000911',
   (select v::uuid from t where k='city'),'live','same_daily',20,'mpesa_till','{"till":"1"}'::jsonb,
   now() - interval '10 days', now() - interval '9 days'),
  ('a2000000-0000-4000-8000-000000000002','[Two Ltd]','[Two]','laundry','[Owner]','+254700000912',
   (select v::uuid from t where k='city'),'live','same_daily',40,'mpesa_till','{"till":"2"}'::jsonb,
   now() - interval '10 days', now() - interval '9 days')
on conflict (id) do nothing;

insert into public.merchant_user (merchant_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-00000000007a','owner'),
  ('a2000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-00000000007b','owner')
on conflict do nothing;

insert into public.merchant_branch
  (id, merchant_id, name, address_text, latitude, longitude, zone_id, is_primary, sort, source)
values
  ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
   '[One main]','[Street]', -1.2650, 36.8030, (select v::uuid from t where k='zone'), true, 1, 'manual'),
  ('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',
   '[Two main]','[Street]', -1.2890, 36.7830, (select v::uuid from t where k='zone'), true, 1, 'manual')
on conflict (id) do nothing;

insert into public.rider
  (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no, status, presence,
   activated_at, activated_by, submitted_at, phone_verified_at, ownership, insurance,
   payout_msisdn, areas, shifts, bike_max_km, cash_on_hand, cash_cap, source)
values
  ('a4000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-00000000007c',
   '[Rider]','[One]','+254700000913',(select v::uuid from t where k='city'),
   'motorbike','TPD-1','active','online', now(), (select v::uuid from t where k='admin'),
   now(), now(), 'own','comprehensive','+254700000913',
   array['Westlands'], array['evenings'], 12, 1400, 20000, 'nexg_pool'),
  ('a4000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-00000000007d',
   '[Rider]','[Two]','+254700000914',(select v::uuid from t where k='city'),
   'motorbike','TPD-2','active','online', now(), (select v::uuid from t where k='admin'),
   now(), now(), 'own','comprehensive','+254700000914',
   array['Kilimani'], array['weekends'], 12, 0, 20000, 'nexg_pool')
on conflict (id) do nothing;

insert into public.guest (id, phone, name)
values ('a5000000-0000-4000-8000-000000000001','+254700000915','[Guest]')
on conflict (id) do nothing;

/* One order each, the first carried by rider one. */
insert into public.order
  (id, reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
   dropoff_label, stage, payment_method, payment_status,
   subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents,
   commission_cents, currency, rider_id, picked_up_at)
values
  ('a6000000-0000-4000-8000-000000000001','TPD-ORDER-1','a5000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',
   (select v::uuid from t where k='city'), (select v::uuid from t where k='zone'), 'web',
   '[Somewhere]','picked_up','card','paid', 100000, 25000, 5000, 130000, 18000, 'KES',
   'a4000000-0000-4000-8000-000000000001', now()),
  ('a6000000-0000-4000-8000-000000000002','TPD-ORDER-2','a5000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002',
   (select v::uuid from t where k='city'), (select v::uuid from t where k='zone'), 'web',
   '[Elsewhere]','confirmed','card','paid', 60000, 25000, 3000, 88000, 10800, 'KES',
   null, null)
on conflict (id) do nothing;

-- ══════════════════ 1. a merchant sees their own orders

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000007a","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.order where merchant_id = 'a2000000-0000-4000-8000-000000000001'),
  1,
  'A merchant can read their own orders — the thing the live-ops policy forgot.');

select is(
  (select count(*)::int from public.order where merchant_id = 'a2000000-0000-4000-8000-000000000002'),
  0,
  'And not another merchant''s.');

select is(
  (select count(*)::int from public.merchant_orders_v),
  1,
  'The dashboard view carries the same scope, rather than widening it.');

select is(
  (select merchant_keeps_cents from public.merchant_orders_v limit 1),
  (130000 - 18000 - 25000 - 5000)::bigint,
  'What a merchant keeps is the total less commission and the fees that are not theirs.');

select is(
  (select count(*)::int from public.merchant_home_v),
  1,
  'The home view shows exactly one business — their own.');

select is(
  (select name from public.merchant_home_v),
  '[One]',
  'And it is the right one.');

select is(
  (select count(*)::int from public.merchant_branch
    where merchant_id = 'a2000000-0000-4000-8000-000000000002'),
  0,
  'A merchant cannot see another merchant''s stores.');

-- ════════════════════════ 2. where this account belongs

select is(public.fn_partner_home() ->> 'kind', 'merchant', 'The account knows it is a merchant.');
select is(public.fn_partner_home() ->> 'home', '/merchant', 'And where it belongs.');
select is((public.fn_partner_home() ->> 'ready')::boolean, true,
  'A submitted merchant is let in regardless of percentage.');

-- ════════════════════════ 3. a rider sees their own job

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000007c","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.rider_jobs_v),
  1,
  'A rider sees the job that is theirs.');

select is(
  (select merchant from public.rider_jobs_v),
  '[One]',
  'Including which merchant to collect from — without it the trip reads "[—] → somewhere".');

select is(
  (select pickup from public.rider_jobs_v),
  '[Street]',
  'And the address of the door.');

select is(
  (select count(*)::int from public.merchant),
  1,
  'But only that merchant — the directory is not a rider''s to browse.');

select is(
  (select count(*)::int from public.order where rider_id is null),
  0,
  'An order with no rider on it is not theirs to read, even in their own city.');

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000007d","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.rider_jobs_v),
  0,
  'A rider carrying nothing sees nothing.');

select is(
  (select count(*)::int from public.merchant),
  0,
  'And no merchants at all.');

select is(public.fn_partner_home() ->> 'kind', 'rider', 'A rider account knows what it is.');
select is(public.fn_partner_home() ->> 'home', '/rider', 'And where it belongs.');

-- ═══════════════ 4. the dashboard opens at the right point

reset role;
/* `areas` and `shifts` are not-null with an empty-array default,
   so "nothing picked" is `{}` rather than null. */
update public.rider set submitted_at = null, status = 'applied',
       areas = '{}', shifts = '{}', payout_msisdn = null,
       phone_verified_at = null, ownership = null, insurance = null
 where id = 'a4000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000007d","role":"authenticated"}', true);

select cmp_ok(
  (public.fn_partner_home() ->> 'pct')::int, '<', 80,
  'A barely-started rider is under the line.');

select is(
  (public.fn_partner_home() ->> 'ready')::boolean, false,
  'So the dashboard does not open — there is nothing to run yet.');

select is(
  public.fn_partner_home() ->> 'home', '/riders/apply',
  'And they are sent back to finish the application.');

-- ════════════════════ 5. what the write RPCs refuse

select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000007a","role":"authenticated"}', true);

select throws_matching(
  $$select public.rpc_merchant_add_store(
      'a2000000-0000-4000-8000-000000000002', '[Sneaky]', '[Street]', -1.265, 36.803)$$,
  'not yours',
  'A merchant cannot open a store on somebody else''s business.');

select throws_matching(
  $$select public.rpc_merchant_add_store(
      'a2000000-0000-4000-8000-000000000001', '[Nowhere]', '[Street]', -4.0435, 39.6682)$$,
  'outside every area',
  'A store outside every delivery area is refused, with what to do about it.');

select throws_matching(
  $$select public.rpc_merchant_add_store(
      'a2000000-0000-4000-8000-000000000001', '[One main]', '[Street]', -1.265, 36.803)$$,
  'already have a store called',
  'And a name they are already using.');

select is(
  (public.rpc_merchant_add_store(
     'a2000000-0000-4000-8000-000000000001', '[One second]', '[Road]', -1.289, 36.783) ->> 'ok')::boolean,
  true,
  'A real address inside a zone is accepted.');

select is(
  (select count(*)::int from public.merchant_branch
    where merchant_id = 'a2000000-0000-4000-8000-000000000001' and closed_at is null),
  2,
  'And the store is actually there.');

select throws_matching(
  $$select public.rpc_merchant_set_prep('a2000000-0000-4000-8000-000000000001', 240)$$,
  'between 5 and 120',
  'A prep time the kitchen cannot keep is refused — the guest is quoted it.');

select throws_matching(
  $$select public.rpc_merchant_close_store('a3000000-0000-4000-8000-000000000001', '')$$,
  'Tell us why',
  'Closing a store without a reason is refused.');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-8000-00000000007c","role":"authenticated"}', true);

select throws_matching(
  $$select public.rpc_rider_update_profile('a4000000-0000-4000-8000-000000000002',
     null, null, 10)$$,
  'not yours',
  'A rider cannot edit another rider''s profile.');

select throws_matching(
  $$select public.rpc_rider_update_profile('a4000000-0000-4000-8000-000000000001',
     null, null, 80)$$,
  'cap this at',
  'Nor widen the distance they are offered past the cap — and the refusal says why.');

select is(
  (public.rpc_rider_update_profile('a4000000-0000-4000-8000-000000000001',
     array['Westlands','CBD'], array['evenings','weekends'], 20) ->> 'ok')::boolean,
  true,
  'A change inside the cap is accepted.');

select is(
  (select bike_max_km from public.rider where id = 'a4000000-0000-4000-8000-000000000001'),
  20,
  'And it is saved.');

-- ════════════ 6. cash is compared in one unit, not two

/* Rider positions need the live-ops grant, so this half is asked
   as somebody who has it. As `postgres` the function correctly
   returns nothing, which would have passed for a different
   reason. */
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select cash_on_hand_cents from dispatch.fn_riders_live(
     (select v::uuid from t where k='city')) where rider_id = 'a4000000-0000-4000-8000-000000000001'),
  140000::bigint,
  'A rider holding KES 1,400 reads as 140,000 cents to the dispatch side.');

/*
 * The bug this replaced: shillings added to cents put every rider
 * over every cap, so no cash job could ever be dispatched — and the
 * exclusion reason read plausibly each time.
 */
select ok(
  (select cash_on_hand_cents + 130000 <= cash_cap_cents
     from dispatch.fn_riders_live((select v::uuid from t where k='city'))
    where rider_id = 'a4000000-0000-4000-8000-000000000001'),
  'So a KES 1,300 cash order is within a KES 20,000 cap, rather than a hundred times over it.');

select * from finish();
rollback;
