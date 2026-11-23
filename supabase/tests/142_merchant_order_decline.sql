-- A shop declines an order it cannot take (20270223000100): before starting
-- it, with a reason; a paid order is refunded in full at once.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1420000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'customer142@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1420000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'owner142@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1420000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'stranger142@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1420000-0000-4000-8000-00000000000a', '[Legal 142] Ltd', '[Shop 142]', 'restaurant',
        '[Contact]', '+254700014200', 'shop142@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1420000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1420000-0000-4000-8000-00000000000a', 'c1420000-0000-4000-8000-000000000002', 'owner');
insert into public.catalogue_section (id, merchant_id, name)
values ('c1420000-0000-4000-8000-0000000000b1', 'c1420000-0000-4000-8000-00000000000a', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values ('c1420000-0000-4000-8000-0000000000c1', 'c1420000-0000-4000-8000-0000000000b1',
        'c1420000-0000-4000-8000-00000000000a', 'Pilau', 500, true);

-- Two pickup orders from the customer: one stays unpaid, one is paid.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1420000-0000-4000-8000-000000000001","role":"authenticated"}', true);
create temp table t on commit drop as
select k, (public.rpc_order_place_web(jsonb_build_object(
    'merchant_id', 'c1420000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'fulfilment', 'pickup',
    'guest_phone', '+254700142001',
    'items', '[{"catalogue_item_id": "c1420000-0000-4000-8000-0000000000c1", "quantity": 1}]'::jsonb))
  ->> 'order_id')::uuid as id
  from unnest(array['unpaid', 'paid', 'started']) k;
reset role;
grant select on t to authenticated;

update public.order set payment_status = 'paid'
 where id in (select id from t where k in ('paid', 'started'));

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1420000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ══════════════════════════════════════════════ the shop's step

select ok(
  (select bool_or(s ->> 'step' = 'decline')
     from jsonb_array_elements(public.rpc_order_next_steps((select id from t where k = 'paid')) -> 'steps') s),
  'The shop is offered "decline" on an order it has not started.');

select throws_ok(
  format($$select public.rpc_merchant_order_decline(%L, 'because')$$, (select id from t where k = 'unpaid')),
  '22023', 'Choose why: out of stock, closing, too busy, cannot deliver there, or other.',
  'A reason from the list is needed.');
select throws_ok(
  format($$select public.rpc_merchant_order_decline(%L, 'other', ' ')$$, (select id from t where k = 'unpaid')),
  '22023', 'Say why, so the customer knows.', '"Other" needs a note.');

-- ══════════════════════════════════════════════ unpaid

select is(
  (public.rpc_merchant_order_decline((select id from t where k = 'unpaid'), 'closing') ->> 'refund_cents')::int,
  0, 'An unpaid order is declined with nothing to refund.');
select is(
  public.rpc_merchant_order_decline((select id from t where k = 'unpaid'), 'closing') ->> 'already',
  'true', 'A second tap is harmless.');

-- ══════════════════════════════════════════════ paid

select set_config('t.paid', public.rpc_merchant_order_decline(
  (select id from t where k = 'paid'), 'out_of_stock', 'No pilau left today')::text, true);
select is((current_setting('t.paid')::jsonb ->> 'refund_cents')::bigint,
  (select total_cents from public.order where id = (select id from t where k = 'paid')),
  'A paid order is refunded in full.');

-- A started order is the staff's to cancel.
select public.rpc_merchant_order_step((select id from t where k = 'started'), 'start');
select throws_ok(
  format($$select public.rpc_merchant_order_decline(%L, 'too_busy')$$, (select id from t where k = 'started')),
  '22023', 'This order is preparing and can no longer be declined. Ask NexG support to cancel it.',
  'Once started, the shop cannot decline it.');

-- Somebody else.
select set_config('request.jwt.claims',
  '{"sub":"c1420000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_merchant_order_decline(%L, 'closing')$$, (select id from t where k = 'started')),
  'P0002', 'Order not found.', 'Somebody outside the shop is told there is no such order.');
reset role;

select set_config('t.started', (select id from t where k = 'started')::text, true);
set local role anon;
select throws_ok(
  format($$select public.rpc_merchant_order_decline(%L, 'closing')$$, current_setting('t.started')),
  '42501', null, 'The anonymous key cannot decline.');
reset role;

-- ══════════════════════════════════════════════ what it recorded

select is(
  (select stage::text || ' ' || cancel_reason_code || ' ' || cancel_note
     from public.order where id = (select id from t where k = 'paid')),
  'cancelled merchant_declined Something in the order has run out: No pilau left today.',
  'The order is cancelled as declined by the shop, with the reason.');
select is(
  (select status || ' ' || method || ' ' || reason_code || ' ' || (requested_by is null)::text
     from public.refund where order_id = (select id from t where k = 'paid')),
  'approved original merchant_declined true',
  'The refund is approved at once, back the way it was paid.');
select ok(
  (select count(*) = 1 from public.refunds_to_issue_v where order_id = (select id from t where k = 'paid')),
  'Finance sees it in the refunds to issue.');
select is(
  (select array_agg(kind order by at, kind) from public.order_event
    where order_id = (select id from t where k = 'paid') and kind in ('merchant_declined', 'refund_approved')),
  array['merchant_declined', 'refund_approved'],
  'The order''s history says the shop declined it and the refund was approved.');
select is(
  (select title || ' | ' || body from public.user_notification
    where user_id = 'c1420000-0000-4000-8000-000000000001'
      and object_id = (select id from t where k = 'paid')
    order by created_at desc limit 1),
  '[Shop 142] could not take your order | Something in the order has run out: No pilau left today. Your full refund of KES '
    || ((select total_cents from public.order where id = (select id from t where k = 'paid')) / 100)
    || ' is on its way.',
  'The customer is told who declined, why, and that the refund is coming.');
select is(
  (select count(*)::int from public.user_notification
    where user_id = 'c1420000-0000-4000-8000-000000000001'
      and object_id = (select id from t where k = 'paid')),
  1, 'It replaces the generic "cancelled" notice rather than adding a second one.');
select is(
  (select body from public.user_notification
    where user_id = 'c1420000-0000-4000-8000-000000000001'
      and object_id = (select id from t where k = 'unpaid')),
  'The shop is closing. Nothing has been charged.',
  'An unpaid order''s customer is told nothing was charged.');
select ok(
  exists (select 1 from audit.audit_event where action = 'order.merchant_declined'
           and target_id = (select id from t where k = 'paid')),
  'The decline is audited.');

select * from finish();
rollback;
