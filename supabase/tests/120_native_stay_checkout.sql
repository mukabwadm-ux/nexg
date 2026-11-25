-- Booking a stay from the apps (from PR #148): an exact 10-minute quote, one
-- hold per quote that a retry returns rather than repeats, a status read, and
-- no payment step until payments are switched on.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d1200000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest120@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d1200000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other120@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d1200000-0000-4000-8000-000000000003',
   'authenticated','authenticated',null,null,true,now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d1210000-0000-4000-8000-00000000000a','multi_unit','[Host 120]','+254700012000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d1220000-0000-4000-8000-00000000000a','d1210000-0000-4000-8000-00000000000a',
        'block-120','[Block 120]','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d1230000-0000-4000-8000-00000000000a','d1210000-0000-4000-8000-00000000000a',
        'd1220000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 3, 7000);

create temp table t (k text primary key, v text);
create temp table d as select (now() at time zone 'Africa/Nairobi')::date as today;
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 'd' and n.nspname like 'pg_temp%'));
end
$grant$;
grant select on d to authenticated;
grant all on t to authenticated;

-- ── signed out

set local role anon;
select throws_ok($$select public.rpc_native_stay_quote('d1220000-0000-4000-8000-00000000000a',
  'd1230000-0000-4000-8000-00000000000a', current_date + 10, current_date + 12, 1, 0)$$,
  '42501', null, 'Signed out, nothing is quoted.');
reset role;

-- ── an account quotes and holds

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t select 'quote', public.rpc_native_stay_quote('d1220000-0000-4000-8000-00000000000a',
  'd1230000-0000-4000-8000-00000000000a', (select today + 10 from d), (select today + 12 from d), 2, 1)::text;
select is((select (v::jsonb ->> 'totalMinor')::bigint from t where k = 'quote'), 1400000::bigint,
  'The quote is exact: 2 nights at 7,000, in cents.');
select is((select (v::jsonb ->> 'nights')::int from t where k = 'quote'), 2, 'For two nights.');
select ok((select (v::jsonb ->> 'expiresAt')::timestamptz between now() + interval '9 minutes' and now() + interval '11 minutes'
             from t where k = 'quote'), 'It holds for ten minutes.');
select throws_ok($$select public.rpc_native_stay_quote('d1220000-0000-4000-8000-00000000000a',
  'd1230000-0000-4000-8000-00000000000a', current_date + 10, current_date + 12, 9, 0)$$,
  'NX001', null, 'Too many guests for the home is refused.');

insert into t select 'hold', public.rpc_native_stay_hold((select (v::jsonb ->> 'quoteId')::uuid from t where k = 'quote'), 'Amina')::text;
select is((select v::jsonb ->> 'status' from t where k = 'hold'), 'held', 'The quote becomes a hold.');
select is((select v::jsonb ->> 'paymentStatus' from t where k = 'hold'), 'unpaid', 'Waiting for payment.');
select is(public.rpc_native_stay_hold((select (v::jsonb ->> 'quoteId')::uuid from t where k = 'quote'), 'Amina') ->> 'stayId',
  (select v::jsonb ->> 'stayId' from t where k = 'hold'), 'A retry returns the same hold, not a second one.');
select throws_ok(format('select public.rpc_native_stay_hold(%L, %L)',
  (select v::jsonb ->> 'quoteId' from t where k = 'quote'), 'Brian'), 'NX005', null,
  'The same quote with a different name is refused.');
select is(public.rpc_native_stay_status((select (v::jsonb ->> 'quoteId')::uuid from t where k = 'quote')) ->> 'stayId',
  (select v::jsonb ->> 'stayId' from t where k = 'hold'), 'Its status can be read back.');
reset role;
select is((select status::text || '/' || guest_first_name from public.stay
            where id = (select (v::jsonb ->> 'stayId')::uuid from t where k = 'hold')), 'held/Amina',
  'The stay itself is held under the guest''s name, through the usual hold.');
select ok(not exists (select 1 from pg_proc where proname = 'rpc_native_stay_payment_begin'),
  'There is no payment step yet.');

-- ── somebody else, and a guest

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(format('select public.rpc_native_stay_status(%L)', (select v::jsonb ->> 'quoteId' from t where k = 'quote')),
  'NX004', null, 'Another customer cannot read the hold.');
select set_config('request.jwt.claims',
  '{"sub":"d1200000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
select ok((public.rpc_native_stay_quote('d1220000-0000-4000-8000-00000000000a',
  'd1230000-0000-4000-8000-00000000000a', (select today + 20 from d), (select today + 21 from d), 1, 0) ->> 'quoteId') is not null,
  'A guest can get a quote too.');
reset role;

select * from finish();
rollback;
