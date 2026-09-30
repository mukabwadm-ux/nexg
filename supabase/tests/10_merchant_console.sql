-- The Merchants console's rules.
--
-- Not a tour of twenty-nine tables: each of these is a rule that, if it
-- stopped holding, would take a merchant off the platform on one
-- person's say-so, show a struggling shop's score to a guest, or let a
-- merchant relist themselves after we hid them.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

delete from public.approval_request;
delete from public.role_grant;
delete from public.staff_user;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','mc.a@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','f2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','mc.b@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','f3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','mc.owner@example.test','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('ffffffff-0000-0000-0000-00000000000a','f1111111-1111-1111-1111-111111111111','mc.a@nexgapp.com','MC A'),
  ('ffffffff-0000-0000-0000-00000000000b','f2222222-2222-2222-2222-222222222222','mc.b@nexgapp.com','MC B');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key='merchant_ops'),
       (select id from public.city where slug='nairobi'), s.id
from public.staff_user s where s.email in ('mc.a@nexgapp.com','mc.b@nexgapp.com');

-- a live, listed merchant with an owner
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at, health_band, health_score)
values ('aaaa1111-0000-4000-8000-00000000000a','[Legal] Ltd','[Trading]','restaurant',
        '[Contact]','+254700000001','mc@example.test',
        (select id from public.city where slug='nairobi'),'live', true, true, now(), 'red', 41);
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('aaaa1111-0000-4000-8000-00000000000a','Main','[Address]', true);
insert into public.merchant_user (merchant_id, user_id, role)
values ('aaaa1111-0000-4000-8000-00000000000a','f3333333-3333-3333-3333-333333333333','owner');

-- ═════════════════════════════════════════ what a guest may see

select is(
  (select count(*)::int from public.merchant_public
   where id = 'aaaa1111-0000-4000-8000-00000000000a'),
  1,
  'a live, listed merchant is public'
);

select is(
  (select health_badge from public.merchant_public
   where id = 'aaaa1111-0000-4000-8000-00000000000a'),
  null,
  'a red merchant carries no health badge — a guest is never shown that a shop is struggling'
);

update public.merchant set health_band = 'green'
where id = 'aaaa1111-0000-4000-8000-00000000000a';

select is(
  (select health_badge from public.merchant_public
   where id = 'aaaa1111-0000-4000-8000-00000000000a'),
  'green',
  'a green one does'
);

update public.merchant set explore_visible = false
where id = 'aaaa1111-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.merchant_public
   where id = 'aaaa1111-0000-4000-8000-00000000000a'),
  0,
  'turning off Explore removes them, without changing their status'
);

update public.merchant set explore_visible = true
where id = 'aaaa1111-0000-4000-8000-00000000000a';

-- ══════════════════════════════════ who may set which control

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_control(
      'aaaa1111-0000-4000-8000-00000000000a', 'accepting_orders', 'false'::jsonb, 'merchant')$$,
  'a merchant may close their own shop'
);

select throws_ok(
  $$select public.rpc_merchant_control(
      'aaaa1111-0000-4000-8000-00000000000a', 'explore_visible', 'true'::jsonb, 'merchant')$$,
  '42501', null,
  'and may not decide whether they appear in Explore'
);

select throws_ok(
  $$select public.rpc_merchant_control(
      'aaaa1111-0000-4000-8000-00000000000a', 'concierge_pick', 'true'::jsonb, 'merchant')$$,
  '42501', null,
  'nor make themselves an editorial pick'
);

reset role; reset request.jwt.claims;

select is(
  (select accepting_orders_source::text from public.merchant
   where id = 'aaaa1111-0000-4000-8000-00000000000a'),
  'merchant',
  'and the source records that it was them, not us'
);

-- ═══════════════════════════════════════ suspension takes two

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_two_person_request(
      'aaaa1111-0000-4000-8000-00000000000a', 'merchant_suspension', 'Repeated missing items.')$$,
  'A asks for a suspension'
);

select throws_ok(
  format($$select public.rpc_merchant_two_person_approve(%L)$$,
    (select id from public.approval_request order by created_at desc limit 1)),
  '42501', null,
  'and cannot approve their own request'
);

reset role; reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  format($$select public.rpc_merchant_two_person_approve(%L)$$,
    (select id from public.approval_request order by created_at desc limit 1)),
  'but B can'
);

reset role; reset request.jwt.claims;

select ok(
  (select payout_hold and status = 'suspended'
   from public.merchant where id = 'aaaa1111-0000-4000-8000-00000000000a'),
  'and suspension holds the payout as well as the listing'
);

select * from finish();
rollback;
