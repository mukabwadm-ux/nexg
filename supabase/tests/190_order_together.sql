-- Order together, and pickup and scheduled web orders (20270130009000).

begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000100-0000-4000-8000-000000000020',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000100-0000-4000-8000-000000000021',
   'authenticated', 'authenticated', 'host100@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000100-0000-4000-8000-000000000022',
   'authenticated', 'authenticated', 'friend100@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000100-0000-4000-8000-000000000023',
   'authenticated', 'authenticated', 'outsider100@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000100-0000-4000-8000-000000000024',
   'authenticated', 'authenticated', 'leaver100@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000100-0000-4000-8000-000000000025',
   'authenticated', 'authenticated', 'solo100@example.test', now(), false, now(), now());

-- A shop with no hours on file (so open at any time), and another shop.
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values
  ('c1000100-0000-4000-8000-00000000000a', '[Legal 100] Ltd', '[Shop 100]', 'restaurant',
   '[Contact]', '+254700010000', 'shop100@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
  ('c1000100-0000-4000-8000-00000000000b', '[Legal 100b] Ltd', '[Other shop 100]', 'restaurant',
   '[Contact]', '+254700010001', 'othershop100@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values
  ('c1000100-0000-4000-8000-00000000000a', 'Main', '[Address]', true),
  ('c1000100-0000-4000-8000-00000000000b', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values
  ('c1000100-0000-4000-8000-0000000000b1', 'c1000100-0000-4000-8000-00000000000a', 'Menu'),
  ('c1000100-0000-4000-8000-0000000000b2', 'c1000100-0000-4000-8000-00000000000b', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values
  ('c1000100-0000-4000-8000-0000000000c1', 'c1000100-0000-4000-8000-0000000000b1',
   'c1000100-0000-4000-8000-00000000000a', 'Pilau', 500, true),
  ('c1000100-0000-4000-8000-0000000000c2', 'c1000100-0000-4000-8000-0000000000b1',
   'c1000100-0000-4000-8000-00000000000a', 'Chapati', 50, true),
  ('c1000100-0000-4000-8000-0000000000d1', 'c1000100-0000-4000-8000-0000000000b2',
   'c1000100-0000-4000-8000-00000000000b', 'Burger', 600, true);

-- Somewhere we deliver (the zone 83_checkout_no_phone_claim delivers to).
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1000100-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 100]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

create function pg_temp.basket(p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('merchant_id', 'c1000100-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk',
    'items', jsonb_build_array(jsonb_build_object(
      'catalogue_item_id', 'c1000100-0000-4000-8000-0000000000c1', 'quantity', 2))) || p_extra
$$;

-- ══════════════════════════════════════════════ 1. pickup and a time

select is(
  (public.fn_web_order_quote(pg_temp.basket('{"fulfilment":"pickup"}')) ->> 'delivery_fee_cents')::bigint,
  0::bigint, 'A pickup quote charges no delivery.');
select ok(
  (select (q ->> 'ok')::boolean and not (q ->> 'located')::boolean
          and (q ->> 'fulfilment') = 'pickup'
          and (q ->> 'total_cents')::bigint = (q ->> 'subtotal_cents')::bigint
            + (q ->> 'service_fee_cents')::bigint + (q ->> 'small_basket_fee_cents')::bigint
     from (select public.fn_web_order_quote(pg_temp.basket('{"fulfilment":"pickup"}')) as q) s),
  'It needs no location, says it is pickup, and its total leaves delivery out.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  public.rpc_order_quote_web(pg_temp.basket('{"fulfilment":"pickup"}')) ->> 'fulfilment',
  'pickup', 'The basket page''s quote passes fulfilment through.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000025","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_order_place_web(%L::jsonb)$$,
    pg_temp.basket('{"guest_phone":"+254700100025"}')::text),
  'P0001', 'Where should we bring it? Set your delivery address first.',
  'A delivery still needs an address.');
select set_config('t.pickup',
  public.rpc_order_place_web(pg_temp.basket('{"fulfilment":"pickup","guest_phone":"+254700100025"}'))
    ->> 'order_id', true);
reset role;

select is(
  (select o.fulfilment::text || ' ' || coalesce(o.dropoff_label, 'no label') || ' '
          || (o.dropoff_point is null)::text
     from public.order o where o.id = current_setting('t.pickup')::uuid),
  'pickup no label true', 'A pickup order is placed with no address, and keeps no dropoff.');

select is(
  public.fn_web_order_quote(pg_temp.basket(
    jsonb_build_object('scheduled_for', now() + interval '10 minutes'))) ->> 'message',
  'Schedule it at least 30 minutes from now.',
  'An order scheduled less than 30 minutes ahead is refused.');
select is(
  public.fn_web_order_quote(pg_temp.basket(
    jsonb_build_object('scheduled_for', now() + interval '8 days'))) ->> 'message',
  'You can schedule an order up to 7 days ahead.',
  'So is one more than 7 days ahead.');
select is(
  (public.fn_web_order_quote(pg_temp.basket(
    jsonb_build_object('scheduled_for', now() + interval '2 hours'))) ->> 'scheduled_for')::timestamptz,
  now() + interval '2 hours',
  'Two hours ahead, while the shop is open, is quoted for that time.');

-- The service role's claim, as a server job would carry it.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  format($$select dispatch.rpc_job_start(%L::uuid)$$, current_setting('t.pickup')),
  '22023', 'This order is collected by the customer; no rider is needed.',
  'Dispatch refuses a pickup order, even for the service role.');
select is(
  (select count(*)::int from dispatch.job where order_id = current_setting('t.pickup')::uuid),
  0, 'And opens no rider search for it.');

-- ═══════════════════════════════════════════════ 2. starting a group

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000020","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select public.rpc_group_order_create('{"merchant_id":"c1000100-0000-4000-8000-00000000000a","name":"[Lunch]","emoji":"pizza","display_name":"[Temp]"}'::jsonb)$$,
  '42501', 'Sign in with your account to order together.',
  'A temporary session cannot start a group order.');

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.created', public.rpc_group_order_create(jsonb_build_object(
  'merchant_id', 'c1000100-0000-4000-8000-00000000000a', 'name', '[Team lunch]', 'emoji', 'pizza',
  'fulfilment', 'delivery', 'payment_mode', 'split', 'display_name', '[Host 100]'))::text, true);
select set_config('t.group', current_setting('t.created')::jsonb ->> 'group_id', true);
select set_config('t.token', current_setting('t.created')::jsonb ->> 'invite_token', true);
reset role;

select ok(current_setting('t.token') ~ '^[0-9a-f]{36}$', 'Starting a group returns its invite token.');
select is(
  (select invite_token_hash from public.group_order where id = current_setting('t.group')::uuid),
  encode(extensions.digest(current_setting('t.token'), 'sha256'), 'hex'),
  'Only the token''s hash is kept.');
select is(
  (select display_name || ' ' || is_host::text from public.group_order_member
    where group_id = current_setting('t.group')::uuid
      and user_id = 'c1000100-0000-4000-8000-000000000021'),
  '[Host 100] true', 'The host is the group''s first member.');

-- ═══════════════════════════════════════ 3. the link, and joining by it

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000022","role":"authenticated"}', true);
select is(
  (select (p ->> 'host_name') || ' / ' || (p ->> 'members') || ' / ' || (p ->> 'merchant_name')
     from (select public.rpc_group_order_preview(current_setting('t.token')) as p) s),
  '[Host 100] / 1 / [Shop 100]', 'The link shows the host, how many are in, and the shop.');
select is(
  (public.rpc_group_order_preview(repeat('ab', 18)) ->> 'ok')::boolean,
  false, 'An unknown link is refused.');
select is(
  public.rpc_group_order_join(current_setting('t.token'), '[Friend 100]') ->> 'group_id',
  current_setting('t.group'), 'A friend joins by the link.');
select is(
  public.rpc_group_order_join(current_setting('t.token'), '[Friend 100]') ->> 'group_id',
  current_setting('t.group'), 'Joining again is harmless.');
select is(
  (select count(*)::int from public.group_order_member
    where group_id = current_setting('t.group')::uuid),
  2, 'A member reads who is in the group: the host and the friend, once each.');

-- ═══════════════════════════════════════════════ 4. everybody's items

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000021","role":"authenticated"}', true);
select public.rpc_group_order_set_items(current_setting('t.group')::uuid,
  '[{"catalogue_item_id":"c1000100-0000-4000-8000-0000000000c1","quantity":2}]'::jsonb);

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000022","role":"authenticated"}', true);
select public.rpc_group_order_set_items(current_setting('t.group')::uuid,
  '[{"catalogue_item_id":"c1000100-0000-4000-8000-0000000000c1","quantity":1},
    {"catalogue_item_id":"c1000100-0000-4000-8000-0000000000c2","quantity":3}]'::jsonb);
select public.rpc_group_order_set_items(current_setting('t.group')::uuid,
  '[{"catalogue_item_id":"c1000100-0000-4000-8000-0000000000c2","quantity":2,"note":"No onions"}]'::jsonb);
reset role;

select is(
  (select string_agg(gm.display_name || ' x' || gi.quantity, ', ' order by gm.is_host desc)
     from public.group_order_item gi
     join public.group_order_member gm on gm.id = gi.member_id
    where gi.group_id = current_setting('t.group')::uuid),
  '[Host 100] x2, [Friend 100] x2', 'Each member''s items replace only their own lines.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000022","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_group_order_set_items(%L::uuid, %L::jsonb)$$,
    current_setting('t.group'),
    '[{"catalogue_item_id":"c1000100-0000-4000-8000-0000000000d1","quantity":1}]'),
  'P0001', 'Something you chose is not available from [Shop 100] right now. Choose again.',
  'Another shop''s item cannot go in.');
select throws_ok(
  format($$select public.rpc_group_order_set_items(%L::uuid, %L::jsonb)$$,
    current_setting('t.group'),
    (select jsonb_agg(jsonb_build_object(
              'catalogue_item_id', 'c1000100-0000-4000-8000-0000000000c2', 'quantity', 1))
       from generate_series(1, 60))::text),
  'P0001', 'A group order holds up to 60 lines, and this would make 61. Take something out first.',
  'The whole group holds at most 60 lines.');

-- ═══════════════════════════════════════════ 5. who can read what

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000023","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_group_order_get(%L::uuid)$$, current_setting('t.group')),
  '42501', 'You are not in this group order.', 'Somebody outside the group cannot read it.');
select is(
  (select count(*)::int from public.group_order where id = current_setting('t.group')::uuid)
  + (select count(*)::int from public.group_order_member where group_id = current_setting('t.group')::uuid)
  + (select count(*)::int from public.group_order_item where group_id = current_setting('t.group')::uuid),
  0, 'Nor see any of its rows directly.');

-- ═══════════════════════════════════════════════ 6. leaving

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000024","role":"authenticated"}', true);
select public.rpc_group_order_join(current_setting('t.token'), '[Leaver 100]');
select public.rpc_group_order_set_items(current_setting('t.group')::uuid,
  '[{"catalogue_item_id":"c1000100-0000-4000-8000-0000000000c1","quantity":1}]'::jsonb);
select public.rpc_group_order_leave(current_setting('t.group')::uuid);
reset role;

select is(
  (select (gm.left_at is not null)::text || ' '
          || (select count(*) from public.group_order_item gi where gi.member_id = gm.id)::text
     from public.group_order_member gm
    where gm.group_id = current_setting('t.group')::uuid
      and gm.user_id = 'c1000100-0000-4000-8000-000000000024'),
  'true 0', 'Leaving takes the member''s lines out, and marks them gone.');

-- Leaving lets you back in by the link; being removed by the host does not.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000024","role":"authenticated"}', true);
select is((public.rpc_group_order_join(current_setting('t.token'), '[Leaver 100]') ->> 'ok')::boolean, true,
  'Somebody who left can rejoin with the link.');
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000021","role":"authenticated"}', true);
select public.rpc_group_order_remove(current_setting('t.group')::uuid,
  (select id from public.group_order_member where group_id = current_setting('t.group')::uuid
      and user_id = 'c1000100-0000-4000-8000-000000000024'));
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000024","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_group_order_join(%L, '[Leaver 100]')$$, current_setting('t.token')),
  'P0001', 'The host removed you from this group order.', 'Somebody the host removed cannot rejoin with the old link.');
reset role;

-- ═══════════════════════════════════════ 7. the host's settings and link

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000022","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_group_order_update(%L::uuid, '{"name":"[Mine now]"}'::jsonb)$$,
    current_setting('t.group')),
  'P0001', 'Only the host can change the group order.', 'Only the host changes the group.');

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.token2',
  public.rpc_group_order_invite(current_setting('t.group')::uuid) ->> 'invite_token', true);
select is(
  (public.rpc_group_order_preview(current_setting('t.token')) ->> 'ok') || ' '
    || (public.rpc_group_order_preview(current_setting('t.token2')) ->> 'ok'),
  'false true', 'A new invite link stops the old one working.');

-- ═══════════════════════════════════════════════ 8. the basket and its quote

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000022","role":"authenticated"}', true);
select set_config('t.get', public.rpc_group_order_get(current_setting('t.group')::uuid)::text, true);
select is(
  (current_setting('t.get')::jsonb ->> 'subtotal_cents')::bigint, 110000::bigint,
  'The basket is priced from the menu: the host''s two Pilau and the friend''s two Chapati.');
select is(
  (select mb ->> 'display_name'
     from jsonb_array_elements(current_setting('t.get')::jsonb -> 'members') mb
    where (mb ->> 'is_me')::boolean),
  '[Friend 100]', 'Each member is told which one is them.');

select set_config('t.quote', public.rpc_group_order_quote(current_setting('t.group')::uuid,
  '{"payment_method":"mpesa_stk","lat":-1.4000,"lng":36.6000}'::jsonb)::text, true);
select is(
  (select sum((s ->> 'total_cents')::bigint)::bigint
     from jsonb_array_elements(current_setting('t.quote')::jsonb -> 'shares') s),
  (current_setting('t.quote')::jsonb ->> 'total_cents')::bigint,
  'Any member can see the quote, and the shares add up to its total.');
select is(
  (select string_agg(x.s ->> 'items_cents', ',' order by x.n)
     from jsonb_array_elements(current_setting('t.quote')::jsonb -> 'shares') with ordinality as x(s, n)),
  '100000,10000', 'The host comes first, and each share starts from that person''s own items.');
select ok(
  ((current_setting('t.quote')::jsonb -> 'shares' -> 0 ->> 'fees_cents')::bigint
   - (current_setting('t.quote')::jsonb -> 'shares' -> 1 ->> 'fees_cents')::bigint) in (0, 1),
  'The fees are split evenly, any odd cent on the host.');

-- ═══════════════════════════════════════════════ 9. placing it

select throws_ok(
  format($$select public.rpc_group_order_place(%L::uuid, %L::jsonb)$$,
    current_setting('t.group'),
    '{"payment_method":"mpesa_stk","guest_phone":"+254700100022","dropoff_label":"[Office]","lat":-1.4000,"lng":36.6000}'),
  'P0001', 'Only the host can place the group order.', 'Only the host places it.');

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.placed', public.rpc_group_order_place(current_setting('t.group')::uuid,
  '{"payment_method":"mpesa_stk","guest_phone":"+254700100021","guest_name":"[Host 100]",
    "dropoff_label":"[Office]","dropoff_note":"[Gate B]","lat":-1.4000,"lng":36.6000}'::jsonb)::text, true);
reset role;

select is(
  (select count(*)::int from public.order o
    where o.id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid
      and o.total_cents = (current_setting('t.placed')::jsonb ->> 'total_cents')::bigint
      and o.total_cents = (current_setting('t.quote')::jsonb ->> 'total_cents')::bigint
      and o.fulfilment = 'delivery' and o.dropoff_label = '[Office]'),
  1, 'Placing makes one web order, at the quoted total, to the host''s address.');
select is(
  (select string_agg(oi.note || ' x' || oi.quantity, ' | ' order by oi.note)
     from public.order_item oi
    where oi.order_id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid),
  'For [Friend 100]: No onions x2 | For [Host 100] x2',
  'One order line per member line, each saying who it is for.');
select is(
  (select g.status || ' ' || (g.order_id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid)::text
     from public.group_order g where g.id = current_setting('t.group')::uuid),
  'placed true', 'The group is placed, and points at its order.');
select is(
  (select sum(share_cents)::bigint from public.group_order_member
    where group_id = current_setting('t.group')::uuid and left_at is null),
  (current_setting('t.placed')::jsonb ->> 'total_cents')::bigint,
  'Each member''s share is kept, and the shares add up to the order.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000022","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_group_order_set_items(%L::uuid, '[]'::jsonb)$$, current_setting('t.group')),
  'P0001', 'This group order has already been placed.', 'Nobody changes their items once it is placed.');
select is(
  public.rpc_group_order_get(current_setting('t.group')::uuid) -> 'order' ->> 'reference',
  current_setting('t.placed')::jsonb ->> 'reference', 'Members see the placed order''s reference.');

-- ═══════════════════════════════════════════════ 10. cancelling

select set_config('request.jwt.claims',
  '{"sub":"c1000100-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.second', public.rpc_group_order_create(jsonb_build_object(
  'merchant_id', 'c1000100-0000-4000-8000-00000000000a', 'name', '[Dinner]', 'emoji', 'cake',
  'fulfilment', 'pickup', 'display_name', '[Host 100]'))::text, true);
select public.rpc_group_order_cancel((current_setting('t.second')::jsonb ->> 'group_id')::uuid);
select is(
  public.rpc_group_order_preview(current_setting('t.second')::jsonb ->> 'invite_token') ->> 'message',
  'The host cancelled this group order.', 'A cancelled group''s link says so.');
reset role;

-- ═══════════════════════════════════════════════ 11. the wiring

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'rpc\_group\_order\_%'
      and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
      and not has_function_privilege('anon', p.oid, 'execute')
      and has_function_privilege('authenticated', p.oid, 'execute')),
  13, 'All thirteen group order functions run as definer with a fixed search_path, for accounts and not anon.');
select is_empty(
  $$select distinct a[1]
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral regexp_matches(p.prosrc, 'audit\.log\s*\(([^;]*)', 'g') c
      cross join lateral regexp_matches(c[1], '''(group_order\.[a-z_]+)''', 'g') a
     where n.nspname = 'public'
       and not exists (select 1 from audit.action_registry r where r.action = a[1])$$,
  'Every group order action a function logs is registered.');
select is(
  (select count(*)::int from audit.audit_event e
    where e.action = 'group_order.placed' and e.target_id = current_setting('t.group')::uuid),
  1, 'Placing is on the audit trail.');
select is(
  (select count(*)::int from public.fn_wiring_check()
    where finding ~ '(group_order|fn_order_schedule_refusal|fn_web_order_quote|rpc_order_place_web)'),
  0, 'The wiring check has nothing to say about any of it.');

select * from finish();
rollback;
