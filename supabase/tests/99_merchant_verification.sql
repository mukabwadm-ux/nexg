-- Merchant Verification: the queue, its tabs and figures, search, and one
-- merchant's file.
--
-- Each merchant lands in exactly one tab from what is on record; deleted
-- rejected and live ones leave the queue; a phone number matches in any format;
-- a merchant ops person in Nairobi sees Nairobi only; people outside
-- Merchants are refused.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into t (k, v) values
  ('nbo', (select id::text from public.city where slug = 'nairobi')),
  ('msa', (select id::text from public.city where slug = 'mombasa'));

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.mer(p_id text) returns text language sql immutable as $f$
  select 'MER-' || upper(right(replace(p_id, '-', ''), 6))
$f$;

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('0e600000-0000-4000-8000-0000000000a1'::uuid, 'ops.verify@test.local'),
  ('0e600000-0000-4000-8000-0000000000a2'::uuid, 'guest.verify@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('0e600000-0000-4000-8000-0000000000b1', '0e600000-0000-4000-8000-0000000000a1', 'ops.verify@test.local', 'Verify Ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '0e600000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

-- --------------------------------------------------------------- baseline

set local role authenticated;
select pg_temp.as_user('0e600000-0000-4000-8000-0000000000a1');
insert into t (k, v) select 'before', public.rpc_merchant_verification_overview()::text;
reset role;

-- --------------------------------------------------------------- fixtures

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id, status, went_live_at, deleted_at, deleted_until, explore_visible)
select m.id, m.name || ' Ltd', m.name, m.category::public.merchant_category, 'Owner', m.phone,
       m.email, (select v::uuid from t where k = m.city), m.status::public.partner_status, m.live, m.deleted,
       m.deleted + interval '30 days', m.status = 'live'
from (values
  ('0e600000-0000-4000-8000-0000000000c1'::uuid, 'VerifyT Bistro', 'restaurants_food', '+254712000601',
   'bistro.verify@shop.example', 'nbo', 'under_review', null::timestamptz, null::timestamptz),
  ('0e600000-0000-4000-8000-0000000000c2', 'VerifyT Grocer', 'groceries_essentials', '+254712000602',
   'grocer.verify@shop.example', 'nbo', 'applied', null, null),
  ('0e600000-0000-4000-8000-0000000000c3', 'VerifyT Laundry', 'laundry_cleaning', '+254712000603',
   'laundry.verify@shop.example', 'nbo', 'documents_pending', null, null),
  ('0e600000-0000-4000-8000-0000000000c4', 'VerifyT Spa', 'wellness', '+254712000604',
   'spa.verify@shop.example', 'nbo', 'applied', null, null),
  ('0e600000-0000-4000-8000-0000000000c5', 'VerifyT Florist', 'flowers_gifts', '+254712000605',
   'florist.verify@shop.example', 'nbo', 'applied', null, null),
  ('0e600000-0000-4000-8000-0000000000c6', 'VerifyT Turned Down', 'flowers_gifts', '+254712000606',
   'down.verify@shop.example', 'nbo', 'applied', null, null),
  ('0e600000-0000-4000-8000-0000000000c8', 'VerifyT Live', 'restaurants_food', '+254712000608',
   'live.verify@shop.example', 'nbo', 'live', now(), null),
  -- Same phone as the grocer.
  ('0e600000-0000-4000-8000-0000000000c9', 'VerifyT Twin', 'groceries_essentials', '+254712000602',
   'twin.verify@shop.example', 'nbo', 'applied', null, null),
  -- In Mombasa: not this person's to work.
  ('0e600000-0000-4000-8000-0000000000ca', 'VerifyT Coast', 'groceries_essentials', '+254712000610',
   'coast.verify@shop.example', 'msa', 'applied', null, null)
) as m (id, name, category, phone, email, city, status, live, deleted);

-- A permit sent back to the laundry.
insert into public.document (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes, status,
                             rejection_reason, reviewed_by, reviewed_at)
values ('merchant', '0e600000-0000-4000-8000-0000000000c3',
        (select id from public.document_requirement where owner_type = 'merchant' and kind = 'business_permit'),
        'merchant/0e600000-0000-4000-8000-0000000000c3/permit.jpg', 'image/jpeg', 1000, 'rejected',
        'The photo cuts off the bottom.', '0e600000-0000-4000-8000-0000000000b1', now());

-- Applications on the form: one waiting, one sent back, one rejected.
set local session_replication_role = replica;
insert into public.merchant_application (merchant_id, revision, payload, review_state, submitted_revision,
                                         submitted_at, review_reason, reviewed_at)
values
  ('0e600000-0000-4000-8000-0000000000c4', 2, '{}', 'pending', 2, now() - interval '2 days', null, null),
  ('0e600000-0000-4000-8000-0000000000c5', 1, '{}', 'changes_requested', 1, now() - interval '3 days',
   'Add a clearer photo of the shop front.', now() - interval '1 day'),
  ('0e600000-0000-4000-8000-0000000000c6', 1, '{}', 'rejected', 1, now() - interval '4 days',
   'Not a business we can list.', now() - interval '2 days');
set local session_replication_role = origin;

-- ------------------------------------------------------------- as ops (Nairobi)

set local role authenticated;
select pg_temp.as_user('0e600000-0000-4000-8000-0000000000a1');
insert into t (k, v) select 'after', public.rpc_merchant_verification_overview()::text;

create function pg_temp.added(p_path text[]) returns integer language sql as $f$
  select ((select v::jsonb from t where k = 'after') #>> p_path)::integer
       - ((select v::jsonb from t where k = 'before') #>> p_path)::integer
$f$;
create function pg_temp.list(p_tab text, p_q text, p_category text default null) returns jsonb language sql as $f$
  select public.rpc_merchant_verification_list(p_tab, p_q, p_category, 50, 0)
$f$;

select is(pg_temp.added('{tabs,all}'), 6, 'six new merchants wait (not the rejected, live or Mombasa ones)');
select is(pg_temp.added('{tabs,under_review}'), 1, 'all documents in: under review');
select is(pg_temp.added('{tabs,pending}'), 3, 'waiting for the merchant: pending');
select is(pg_temp.added('{tabs,resubmission}'), 2, 'a document or the application sent back: resubmission');
select is(pg_temp.added('{kpis,queue}'), 6, 'pending verification counts the whole queue');
select is(pg_temp.added('{kpis,rejected}'), 1, 'the rejected application is counted');
select is(pg_temp.added('{kpis,verified_month}'), 1, 'the merchant that went live this month is counted');

select is((pg_temp.list('all', 'VerifyT') ->> 'total')::integer, 6, 'search by name finds the queue');
select is(
  (select jsonb_agg(r ->> 'name' order by r ->> 'name') from jsonb_array_elements(pg_temp.list('resubmission', 'VerifyT') -> 'rows') r),
  '["VerifyT Florist", "VerifyT Laundry"]'::jsonb,
  'resubmission holds the sent-back application and the rejected permit');
select is((pg_temp.list('all', '0712 000 601') ->> 'total')::integer, 1, 'a phone number matches written the local way');
select ok((pg_temp.list('all', pg_temp.mer('0e600000-0000-4000-8000-0000000000c4')) -> 'rows')
  @> '[{"name": "VerifyT Spa"}]'::jsonb, 'the application ID finds its merchant');
select is((pg_temp.list('all', 'VerifyT', 'restaurants_food') ->> 'total')::integer, 1, 'the category filter narrows the queue');
select is((pg_temp.list('pending', 'VerifyT Spa') -> 'rows' -> 0 ->> 'state'), 'pending',
  'a submitted application still missing documents is pending');
select throws_ok($$ select public.rpc_merchant_verification_list('rejected', null, null, 5, 0) $$,
  '22023', null, 'an unknown tab is refused');

select is(
  public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000c2') -> 'duplicates' -> 0 ->> 'match',
  'phone', 'the grocer and its twin share a phone number');
select is(
  public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000c4') -> 'application' ->> 'can_review',
  'true', 'a submitted, unchanged application can be decided');
select is(
  public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000c5') ->> 'state',
  'resubmission', 'changes requested reads as resubmission');
select is(
  public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000c6') ->> 'state',
  'rejected', 'a rejected application reads as rejected');
select is(
  public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000c1') ->> 'reference',
  pg_temp.mer('0e600000-0000-4000-8000-0000000000c1'), 'the application ID is the short form of the merchant id');
select throws_ok($$ select public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000ca') $$,
  'P0002', null, 'a Mombasa merchant is not this Nairobi reviewer''s');

-- ------------------------------------------------------------- outside Merchants

select pg_temp.as_user('0e600000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_merchant_verification_overview() $$, '42501', null,
  'someone outside Merchants cannot read the figures');
select throws_ok($$ select public.rpc_merchant_verification_list('all', null, null, 5, 0) $$, '42501', null,
  'or the queue');
select throws_ok($$ select public.rpc_merchant_verification_detail('0e600000-0000-4000-8000-0000000000c1') $$,
  '42501', null, 'or a merchant''s file');
reset role;

select ok(not has_function_privilege('anon', 'public.rpc_merchant_verification_overview()', 'execute'),
  'signed-out visitors cannot call it at all');

select * from finish();
rollback;
