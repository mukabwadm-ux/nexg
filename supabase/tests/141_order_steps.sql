-- Order steps (20270221000100): one table of who moves an order, a guard that
-- refuses any other move, and rpc_order_next_steps for every app's buttons.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1410000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'customer141@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1410000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'owner141@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1410000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'stranger141@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1410000-0000-4000-8000-00000000000a', '[Legal 141] Ltd', '[Shop 141]', 'restaurant',
        '[Contact]', '+254700014100', 'shop141@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1410000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1410000-0000-4000-8000-00000000000a', 'c1410000-0000-4000-8000-000000000002', 'owner');
insert into public.catalogue_section (id, merchant_id, name)
values ('c1410000-0000-4000-8000-0000000000b1', 'c1410000-0000-4000-8000-00000000000a', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values ('c1410000-0000-4000-8000-0000000000c1', 'c1410000-0000-4000-8000-0000000000b1',
        'c1410000-0000-4000-8000-00000000000a', 'Pilau', 500, true);

-- ══════════════════════════════════════════════ the table

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok((select count(*) from public.order_step_rule) >= 15,
  'Anyone can read the step table.');
select throws_ok($$select public.rpc_order_next_steps(gen_random_uuid())$$, '42501', null,
  'The anonymous key cannot ask for an order''s steps.');
reset role;

select is(
  (select count(*)::int from public.order_step_rule r
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname || '.' || p.proname = case when r.call like '%.%' then r.call
                                                                   else 'public.' || r.call end)
      and r.call not in ('rpc_merchant_order_send_codes')),
  0, 'Every step names a function that exists.');

-- ══════════════════════════════════════════════ a customer's pickup order

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1410000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.order', public.rpc_order_place_web(jsonb_build_object(
    'merchant_id', 'c1410000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk',
    'fulfilment', 'pickup',
    'guest_phone', '+254700141001',
    'items', '[{"catalogue_item_id": "c1410000-0000-4000-8000-0000000000c1", "quantity": 1}]'::jsonb))
  ->> 'order_id', true);

select set_config('t.steps', public.rpc_order_next_steps(current_setting('t.order')::uuid)::text, true);
select is(current_setting('t.steps')::jsonb -> 'you', '["customer"]'::jsonb,
  'The customer is recognised as the customer.');
select is(
  (select jsonb_agg(s ->> 'step') from jsonb_array_elements(current_setting('t.steps')::jsonb -> 'steps') s),
  '["cancel"]'::jsonb, 'An unpaid placed order: the customer can cancel.');
select is(current_setting('t.steps')::jsonb #>> '{steps,0,args,p_order_id}', current_setting('t.order'),
  'Each step carries the arguments to call it with.');

-- The shop's team.
select set_config('request.jwt.claims',
  '{"sub":"c1410000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('t.steps', public.rpc_order_next_steps(current_setting('t.order')::uuid)::text, true);
select is(current_setting('t.steps')::jsonb -> 'you', '["merchant"]'::jsonb,
  'The shop owner is recognised as the shop.');
select is(current_setting('t.steps')::jsonb #>> '{steps,0,step}', 'start',
  'The shop''s next step is to start the order.');
select is(current_setting('t.steps')::jsonb #>> '{steps,0,waiting_for}', 'payment',
  'An M-Pesa order waits for payment before it can be started.');

-- Somebody else.
select set_config('request.jwt.claims',
  '{"sub":"c1410000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(format($$select public.rpc_order_next_steps(%L)$$, current_setting('t.order')),
  'P0002', 'Order not found.', 'Somebody else is told there is no such order.');
reset role;

-- ══════════════════════════════════════════════ paid, then through the steps

update public.order set payment_status = 'paid' where id = current_setting('t.order')::uuid;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1410000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_order_next_steps(current_setting('t.order')::uuid) -> 'steps', '[]'::jsonb,
  'Once paid, the customer has no step: they report a problem instead.');

select set_config('request.jwt.claims',
  '{"sub":"c1410000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_order_next_steps(current_setting('t.order')::uuid) #>> '{steps,0,waiting_for}', null,
  'Once paid, the shop can start it.');
select public.rpc_merchant_order_step(current_setting('t.order')::uuid, 'start');
select public.rpc_merchant_order_step(current_setting('t.order')::uuid, 'ready');
select is(
  (select jsonb_agg(s ->> 'step') from jsonb_array_elements(
     public.rpc_order_next_steps(current_setting('t.order')::uuid) -> 'steps') s),
  '["customer_code"]'::jsonb,
  'A ready pickup order: the shop enters the customer''s collection code.');
reset role;

-- ══════════════════════════════════════════════ the guard

select throws_ok(
  format($$update public.order set stage = 'preparing' where id = %L$$, current_setting('t.order')),
  '22023', 'An order cannot go from ready to preparing.',
  'An order cannot go back a step.');
select throws_ok(
  format($$update public.order set stage = 'placed' where id = %L$$, current_setting('t.order')),
  '22023', 'An order cannot go from ready to placed.',
  'Nor back to the start.');
select lives_ok(
  format($$update public.order set stage = 'delivered', delivered_at = now(), handed_to = 'guest' where id = %L$$,
         current_setting('t.order')),
  'A move a rule allows goes through.');
select throws_ok(
  format($$update public.order set stage = 'cancelled' where id = %L$$, current_setting('t.order')),
  '22023', 'An order cannot go from delivered to cancelled.',
  'A delivered order cannot be cancelled.');
select lives_ok(
  format($$update public.order set stage = 'delivered', updated_at = now() where id = %L$$, current_setting('t.order')),
  'Updating an order without changing its stage is untouched.');

select set_config('nexg.order_stage_any', 'on', true);
select lives_ok(
  format($$update public.order set stage = 'disputed' where id = %L$$, current_setting('t.order')),
  'A repair by hand can switch the guard off for its own transaction.');

select * from finish();
rollback;
