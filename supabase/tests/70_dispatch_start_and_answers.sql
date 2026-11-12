-- Dispatch: only live operations start it, and one job is won once, cleanly.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temp table t (k text primary key, v text);
/* Every role the test switches to needs reach into the fixture ids,
   including the temp schema itself, as in 19_live_operations. */
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0700000-0000-4000-8000-0000000000a1', 'authenticated',
   'authenticated', 'nbo.ops70@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0700000-0000-4000-8000-0000000000a2', 'authenticated',
   'authenticated', 'approver70@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0700000-0000-4000-8000-0000000000a3', 'authenticated',
   'authenticated', 'customer70@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0700000-0000-4000-8000-0000000000a4', 'authenticated',
   'authenticated', 'rider.one70@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0700000-0000-4000-8000-0000000000a5', 'authenticated',
   'authenticated', 'rider.two70@example.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c0700000-0000-4000-8000-0000000000b1', 'c0700000-0000-4000-8000-0000000000a1', 'nbo.ops70@test.local', 'Nairobi Ops 70'),
  ('c0700000-0000-4000-8000-0000000000b2', 'c0700000-0000-4000-8000-0000000000a2', 'approver70@test.local', 'Approver 70');

insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c0700000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c0700000-0000-4000-8000-0000000000b2'
from public.role r where r.key = 'ops_manager';

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at)
values
  ('c0700000-0000-4000-8000-0000000000c1', 'c0700000-0000-4000-8000-0000000000a4', '[Rider]', '[One]',
   '+254700007001', (select v::uuid from t where k = 'nbo'), 'motorbike', '[PLATE-1]', 'active', 'offline', now()),
  ('c0700000-0000-4000-8000-0000000000c2', 'c0700000-0000-4000-8000-0000000000a5', '[Rider]', '[Two]',
   '+254700007002', (select v::uuid from t where k = 'nbo'), 'motorbike', '[PLATE-2]', 'active', 'offline', now());

insert into public.guest (id, phone, name)
values ('c0700000-0000-4000-8000-0000000000d1', '+254700007010', '[Guest 70]');

insert into t (k, v) select 'branch', (select mb.id::text from public.merchant_branch mb
  join public.merchant m on m.id = mb.merchant_id
  where m.city_id = (select v::uuid from t where k = 'nbo') order by mb.id limit 1);

insert into public.order (
  id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values (
  'c0700000-0000-4000-8000-0000000000e1', 'TEST-DISPATCH-70', 'c0700000-0000-4000-8000-0000000000d1',
  (select merchant_id from public.merchant_branch where id = (select v::uuid from t where k = 'branch')),
  (select v::uuid from t where k = 'branch'), (select v::uuid from t where k = 'nbo'), 'web',
  '[Fixture address]', 'confirmed', 'mpesa_stk', 'paid', 120000, 25000, 6000, 151000, 'KES');

-- A bar's order, which never said it carries alcohol.
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c0700000-0000-4000-8000-0000000000aa', '[Legal 70] Ltd', '[Bar 70]', 'bar_liquor',
        '[Contact]', '+254700007099', 'bar70@example.test', (select v::uuid from t where k = 'nbo'),
        'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary)
values ('c0700000-0000-4000-8000-0000000000ab', 'c0700000-0000-4000-8000-0000000000aa', 'Main', '[Address]', true);
insert into public.order (
  id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values (
  'c0700000-0000-4000-8000-0000000000e2', 'TEST-BAR-70', 'c0700000-0000-4000-8000-0000000000d1',
  'c0700000-0000-4000-8000-0000000000aa', 'c0700000-0000-4000-8000-0000000000ab',
  (select v::uuid from t where k = 'nbo'), 'web',
  '[Fixture address]', 'confirmed', 'mpesa_stk', 'paid', 80000, 25000, 6000, 111000, 'KES');

-- ── starting dispatch

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0700000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select throws_ok($$select dispatch.rpc_job_start('c0700000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'A customer cannot start a rider search.');
select throws_ok($$select public.rpc_dispatch_job_start('c0700000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'Nor through the public wrapper.');

select set_config('request.jwt.claims',
  '{"sub":"c0700000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t (k, v)
select 'job', dispatch.rpc_job_start('c0700000-0000-4000-8000-0000000000e1') ->> 'job_id';
select ok((dispatch.rpc_job_start('c0700000-0000-4000-8000-0000000000e2') -> 'needs') ? 'alcohol',
  'A bar''s order starts dispatch and is carried as alcohol, though the order never said so.');
reset role;

select isnt((select v from t where k = 'job'), null, 'Live operations in the city start it.');

-- Two live offers on the job, as a round leaves them.
insert into dispatch.offer (id, job_id, round, rank, rider_id, expires_at, outcome)
values
  ('c0700000-0000-4000-8000-0000000000f1', (select v::uuid from t where k = 'job'), 50, 1,
   'c0700000-0000-4000-8000-0000000000c1', now() + interval '5 minutes', 'pending'),
  ('c0700000-0000-4000-8000-0000000000f2', (select v::uuid from t where k = 'job'), 50, 2,
   'c0700000-0000-4000-8000-0000000000c2', now() + interval '5 minutes', 'pending');

-- ── answering

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0700000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select throws_ok($$select dispatch.rpc_offer_respond('c0700000-0000-4000-8000-0000000000f2', true)$$,
  '42501', null, 'Somebody else''s offer cannot be answered.');

select set_config('request.jwt.claims',
  '{"sub":"c0700000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select is((dispatch.rpc_offer_respond('c0700000-0000-4000-8000-0000000000f1', true) ->> 'accepted')::boolean,
  true, 'The first rider to accept gets the job.');
select is((dispatch.rpc_offer_respond('c0700000-0000-4000-8000-0000000000f1', true) ->> 'duplicate')::boolean,
  true, 'Accepting again after it went through gives the same answer, not an error.');

select set_config('request.jwt.claims',
  '{"sub":"c0700000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select is(dispatch.rpc_offer_respond('c0700000-0000-4000-8000-0000000000f2', true) ->> 'reason',
  'already_taken', 'The second rider is told somebody else took it, not shown an error.');
reset role;

select is(
  (select j.assigned_rider_id::text || ' ' || o.rider_id::text
     from dispatch.job j join public.order o on o.id = j.order_id
    where j.id = (select v::uuid from t where k = 'job')),
  'c0700000-0000-4000-8000-0000000000c1 c0700000-0000-4000-8000-0000000000c1',
  'The job and the order both name the first rider.');

-- Answers to one job queue on the job row; a new round takes the same lock first.
select ok(
  pg_get_functiondef('dispatch.rpc_offer_respond(uuid, boolean, dispatch.decline_reason)'::regprocedure)
    ~* 'from dispatch\.job where id = o\.job_id for update',
  'rpc_offer_respond locks the job before reading the offer it answers.');
select ok(
  pg_get_functiondef('dispatch.fn_offer_round(uuid)'::regprocedure)
    ~* 'from dispatch\.job where id = p_job_id for update',
  'fn_offer_round takes the same lock first.');

select * from finish();
rollback;
