-- The Riders console's rules.
--
-- The cash ledger gets most of these, because it is the only place in
-- this system where a person is carrying money that is not theirs and
-- a wrong number gets them suspended. The rest are the rules that, if
-- they stopped holding, would let one person suspend a rider, let a
-- payout run take money off somebody, or hand a stranger a rider's
-- location.

begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

delete from public.approval_request;
delete from public.role_grant;
delete from public.staff_user;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','rc.a@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','d2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','rc.b@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','d3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','rc.rider@example.test','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('dddddddd-0000-0000-0000-00000000000a','d1111111-1111-1111-1111-111111111111','rc.a@nexgapp.com','RC A'),
  ('dddddddd-0000-0000-0000-00000000000b','d2222222-2222-2222-2222-222222222222','rc.b@nexgapp.com','RC B');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key='rider_ops'),
       (select id from public.city where slug='nairobi'), s.id
from public.staff_user s where s.email in ('rc.a@nexgapp.com','rc.b@nexgapp.com');

insert into public.rider (id, user_id, first_name, last_name, phone, city_id,
                          vehicle, plate_no, status, activated_at,
                          payout_msisdn, pay_on_delivery_eligible, cash_cap)
values ('cccc1111-0000-4000-8000-00000000000a','d3333333-3333-3333-3333-333333333333',
        '[First]','[Last]','+254700000017',
        (select id from public.city where slug='nairobi'),
        'motorbike','[Plate]','active', now(), '+254700000017', true, 5000);

-- ═════════════════════════════════════════ the ledger

/*
 * The balance is not a column somebody sets. It is the sum of the
 * events, and if these two ever disagree the console is lying about
 * how much of NexG's money a named person is carrying.
 */
insert into public.cash_event (rider_id, kind, amount_kes, order_reference)
values ('cccc1111-0000-4000-8000-00000000000a', 'collected', 1200, 'NX-1'),
       ('cccc1111-0000-4000-8000-00000000000a', 'collected', 800, 'NX-2');

select is(
  (select cash_on_hand from public.rider where id = 'cccc1111-0000-4000-8000-00000000000a'),
  2000::bigint,
  'the balance follows the ledger'
);

select throws_ok(
  $$ update public.cash_event set amount_kes = 1 where amount_kes = 1200 $$,
  'A cash event cannot be changed — write a correcting row instead.',
  'a cash event cannot be edited'
);

select throws_ok(
  $$ delete from public.cash_event where amount_kes = 1200 $$,
  'A cash event cannot be deleted — write a correcting row instead.',
  'a cash event cannot be deleted'
);

insert into public.cash_event (rider_id, kind, amount_kes)
values ('cccc1111-0000-4000-8000-00000000000a', 'deposit', -2000);

select is(
  (select cash_on_hand from public.rider where id = 'cccc1111-0000-4000-8000-00000000000a'),
  0::bigint,
  'a deposit brings the balance back down'
);

-- ═════════════════════════════════════════ the cap

/*
 * Over the cap, cash orders stop. The rider keeps taking prepaid work,
 * because the problem is the money they are holding, not the rider.
 */
insert into public.cash_event (rider_id, kind, amount_kes)
values ('cccc1111-0000-4000-8000-00000000000a', 'collected', 5000);

select is(
  (select pay_on_delivery_eligible from public.rider
   where id = 'cccc1111-0000-4000-8000-00000000000a'),
  false,
  'at the cap the guard stops cash orders'
);

select is(
  (select can_receive_offers from public.rider
   where id = 'cccc1111-0000-4000-8000-00000000000a'),
  true,
  'and leaves prepaid work alone — over-cap is not a suspension'
);

select is(
  (select offers_paused_reason from public.rider
   where id = 'cccc1111-0000-4000-8000-00000000000a'),
  'over_cap',
  'the reason is recorded, so the rider app can say what to do about it'
);

insert into public.cash_event (rider_id, kind, amount_kes)
values ('cccc1111-0000-4000-8000-00000000000a', 'deposit', -5000);

select is(
  (select pay_on_delivery_eligible from public.rider
   where id = 'cccc1111-0000-4000-8000-00000000000a'),
  true,
  'depositing restores cash orders automatically'
);

/*
 * An unset cap is not an unlimited one. Nobody has decided how much
 * this rider may carry, and the safe reading of that is none.
 */
update public.rider set cash_cap = null where id = 'cccc1111-0000-4000-8000-00000000000a';
update public.cash_rule set cap_default_kes = null, cap_new_rider_kes = null
where city_id = (select id from public.city where slug = 'nairobi');

select is(
  (select cash_ok from public.dispatch_rider_v
   where rider_id = 'cccc1111-0000-4000-8000-00000000000a'),
  false,
  'with no cap set, dispatch is told no cash — an unset cap is not permission'
);

update public.rider set cash_cap = 5000 where id = 'cccc1111-0000-4000-8000-00000000000a';

-- ═════════════════════════════════════════ dispatch eligibility

update public.rider set presence = 'online'
where id = 'cccc1111-0000-4000-8000-00000000000a';

select is(
  (select offerable from public.dispatch_rider_v
   where rider_id = 'cccc1111-0000-4000-8000-00000000000a'),
  true,
  'an active, online rider is offerable'
);

update public.rider set cooldown_until = now() + interval '2 hours'
where id = 'cccc1111-0000-4000-8000-00000000000a';

select is(
  (select offerable from public.dispatch_rider_v
   where rider_id = 'cccc1111-0000-4000-8000-00000000000a'),
  false,
  'a cooldown stops offers without anybody telling dispatch separately'
);

update public.rider set cooldown_until = null
where id = 'cccc1111-0000-4000-8000-00000000000a';

-- ═════════════════════════════════════════ two people

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select public.rpc_rider_cooldown('cccc1111-0000-4000-8000-00000000000a', 4, '  ') $$,
  'A cooldown without a reason is just a rider losing money. Write one.',
  'a cooldown needs a reason'
);

select throws_ok(
  $$ select public.rpc_rider_cooldown('cccc1111-0000-4000-8000-00000000000a', 48, 'Too long') $$,
  'Over 24 hours is a suspension. Use the suspension flow, which needs two people.',
  'a long cooldown is refused rather than quietly allowed'
);

select lives_ok(
  $$ select public.rpc_rider_two_person_request(
       'cccc1111-0000-4000-8000-00000000000a', 'rider_suspension', 'Fake deliveries') $$,
  'a suspension can be requested'
);

select throws_ok(
  $$ select public.rpc_rider_two_person_approve(
       (select id from public.approval_request where kind = 'rider_suspension' limit 1)) $$,
  'You asked for this. Somebody else has to approve it.',
  'the person who asked cannot approve it'
);

set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_rider_two_person_approve(
       (select id from public.approval_request where kind = 'rider_suspension' limit 1)) $$,
  'a second person can approve it'
);

select is(
  (select status::text from public.rider where id = 'cccc1111-0000-4000-8000-00000000000a'),
  'suspended',
  'and the rider is suspended'
);

-- ═════════════════════════════════════════ location

/*
 * Off-trip, a stated reason is required — and the reason is logged
 * against the person who looked.
 */
select throws_ok(
  $$ select public.rpc_rider_live_location('cccc1111-0000-4000-8000-00000000000a') $$,
  'They are not on a trip. Say why you need their location.',
  'looking up an off-trip rider''s location needs a stated reason'
);

select lives_ok(
  $$ select public.rpc_rider_live_location(
       'cccc1111-0000-4000-8000-00000000000a', 'Rider unreachable after an SOS') $$,
  'with a reason it is allowed'
);

reset role;

select is(
  (select count(*)::int from audit.audit_event
   where action = 'pii.location_viewed'),
  1,
  'and every look is written to the audit log'
);

-- ═════════════════════════════════════════ settlement

update public.rider set status = 'active', cash_cap = 5000
where id = 'cccc1111-0000-4000-8000-00000000000a';

/*
 * A payout run cannot take money off somebody. When the cash a rider
 * holds exceeds what they earned, the line is held and they go into
 * recovery — it never goes negative.
 */
insert into public.rider_earning (rider_id, base_kes, total_kes, earned_at)
values ('cccc1111-0000-4000-8000-00000000000a', 500, 500, now());

insert into public.cash_event (rider_id, kind, amount_kes)
values ('cccc1111-0000-4000-8000-00000000000a', 'collected', 3000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_settlement_build(
       (select id from public.city where slug = 'nairobi'),
       current_date - 7, current_date) $$,
  'a settlement run can be built'
);

select is(
  (select net_pay_kes from public.rider_settlement_line
   where rider_id = 'cccc1111-0000-4000-8000-00000000000a'),
  0::bigint,
  'net pay never goes negative, however much cash the rider is holding'
);

select is(
  (select status::text from public.rider_settlement_line
   where rider_id = 'cccc1111-0000-4000-8000-00000000000a'),
  'held',
  'the line is held instead, and the rider goes into recovery'
);

select * from finish();
rollback;
