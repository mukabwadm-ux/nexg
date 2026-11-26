-- Concierge orders with a pay link (20270331000500): only staff place them,
-- prices come from the catalogue as for a web order, the token is checked by
-- its hash, the guest begins paying from the link without an account, the
-- 30-minute M-Pesa close leaves link orders alone, and an expired link closes
-- the order.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2520000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'stranger252@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2520000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ops252@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2520000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'approver252@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2520000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2520000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2520000-0000-4000-8000-0000000000b1', 'c2520000-0000-4000-8000-000000000002', 'ops252@test.local', 'Ops 252'),
  ('c2520000-0000-4000-8000-0000000000b2', 'c2520000-0000-4000-8000-000000000003', 'approver252@test.local', 'Approver 252');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2520000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2520000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

-- A shop with two items, a zone, and a guest staying in a unit inside it.
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c2520000-0000-4000-8000-00000000000a', '[Legal 252] Ltd', '[Kitchen 252]', 'restaurant',
        '[Contact]', '+254700025200', 'kitchen252@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c2520000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c2520000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 252]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c2520000-0000-4000-8000-0000000000c1', 'c2520000-0000-4000-8000-00000000000a', '[Mains]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort) values
  ('c2520000-0000-4000-8000-0000000000d1', 'c2520000-0000-4000-8000-00000000000a',
   'c2520000-0000-4000-8000-0000000000c1', '[Pilau]', 850, true, 1),
  ('c2520000-0000-4000-8000-0000000000d2', 'c2520000-0000-4000-8000-00000000000a',
   'c2520000-0000-4000-8000-0000000000c1', '[Chapati]', 60, true, 2);

insert into public.host (id, phone, kind, status, contact_name, display_name, email, city_id, submitted_at)
values ('c2520000-0000-4000-8000-0000000000a1', '+254700025210', 'single_unit', 'verifying', 'Host 252',
        '[Host 252]', 'host252@example.test', (select id from public.city where slug = 'nairobi'), now());
insert into public.property (id, host_id, slug, name, city_id)
values ('c2520000-0000-4000-8000-0000000000f1', 'c2520000-0000-4000-8000-0000000000a1', 'prop-252',
        '[Prop 252]', (select id from public.city where slug = 'nairobi'));
insert into public.unit (id, host_id, property_id, name, status, nightly_rate_kes, city_id, point, address_line, unit_no)
values ('c2520000-0000-4000-8000-0000000000c9', 'c2520000-0000-4000-8000-0000000000a1',
        'c2520000-0000-4000-8000-0000000000f1', '[Unit 252]', 'setting_up', 8000,
        (select id from public.city where slug = 'nairobi'),
        'SRID=4326;POINT(36.6 -1.4)'::extensions.geography, '[12 Road]', '4B');
insert into public.property_qr (id, code, owner_type, owner_id, host_id, city_id, secret_hash)
values ('c2520000-0000-4000-8000-0000000000aa', 'NXG-252QRA', 'unit', 'c2520000-0000-4000-8000-0000000000c9',
        'c2520000-0000-4000-8000-0000000000a1', (select id from public.city where slug = 'nairobi'), 'x');
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, check_in, check_out, phone, status)
values
  ('c2520000-0000-4000-8000-000000000051', 'c2520000-0000-4000-8000-0000000000a1',
   'c2520000-0000-4000-8000-0000000000f1', 'c2520000-0000-4000-8000-0000000000c9', 'Amina',
   now() - interval '1 day', now() + interval '2 days', '0700025299', 'in_stay'),
  ('c2520000-0000-4000-8000-000000000052', 'c2520000-0000-4000-8000-0000000000a1',
   'c2520000-0000-4000-8000-0000000000f1', 'c2520000-0000-4000-8000-0000000000c9', 'Gone',
   now() - interval '9 days', now() - interval '6 days', '0700025298', 'departed');

create function pg_temp.basket(p_stay text) returns jsonb language sql as $f$
  select jsonb_build_object('stay_id', p_stay, 'merchant_id', 'c2520000-0000-4000-8000-00000000000a',
    'note', 'Ring twice',
    'items', jsonb_build_array(
      jsonb_build_object('catalogue_item_id', 'c2520000-0000-4000-8000-0000000000d1', 'quantity', 2,
                         'unit_price_cents', 1),
      jsonb_build_object('catalogue_item_id', 'c2520000-0000-4000-8000-0000000000d2', 'quantity', 3)))
$f$;

-- What a guest's web order of the same basket to the same spot would cost.
insert into t select 'web_quote', public.fn_web_order_quote(jsonb_build_object(
  'merchant_id', 'c2520000-0000-4000-8000-00000000000a', 'payment_method', 'mpesa_stk',
  'lat', -1.4, 'lng', 36.6,
  'items', jsonb_build_array(
    jsonb_build_object('catalogue_item_id', 'c2520000-0000-4000-8000-0000000000d1', 'quantity', 2),
    jsonb_build_object('catalogue_item_id', 'c2520000-0000-4000-8000-0000000000d2', 'quantity', 3))))::text;

-- ─────────────────────────────────────────── strangers are refused

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2520000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.rpc_console_concierge_order(pg_temp.basket('c2520000-0000-4000-8000-000000000051')) $$,
  '42501', null, 'a stranger cannot order for a guest');
select throws_ok($$ select public.rpc_console_concierge_catalogue('c2520000-0000-4000-8000-000000000051') $$,
  '42501', null, 'nor read the concierge catalogue');
select throws_ok($$ select public.rpc_console_concierge_resend('c2520000-0000-4000-8000-000000000051') $$,
  '42501', null, 'nor resend a link');
select throws_ok($$ select count(*) from public.order_pay_link $$, '42501', null,
  'order_pay_link is closed to direct reads');

-- ─────────────────────────────────────────── staff order for the guest

select set_config('request.jwt.claims', '{"sub":"c2520000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select ok(jsonb_array_length(public.rpc_console_concierge_catalogue('c2520000-0000-4000-8000-000000000051') -> 'merchants') >= 1,
  'staff see merchants in the stay''s city');
select is((public.rpc_console_concierge_quote(pg_temp.basket('c2520000-0000-4000-8000-000000000051')) ->> 'total_cents')::bigint,
  (select (v::jsonb ->> 'total_cents')::bigint from t where k = 'web_quote'),
  'the console quote is the web order''s price');
select throws_ok($$ select public.rpc_console_concierge_order(pg_temp.basket('c2520000-0000-4000-8000-000000000052')) $$,
  '22023', null, 'a stay that has ended takes no concierge order');

insert into t select 'made', public.rpc_console_concierge_order(pg_temp.basket('c2520000-0000-4000-8000-000000000051'))::text;
reset role;

create function pg_temp.made(p_key text) returns text language sql as $f$
  select v::jsonb ->> p_key from t where k = 'made'
$f$;
create function pg_temp.token() returns text language sql as $f$
  select substr(pg_temp.made('link'), length('https://nexgapp.com/pay/link/') + 1)
$f$;

select ok(pg_temp.made('link') ~ '^https://nexgapp\.com/pay/link/[A-Za-z0-9_-]{43}$', 'the link carries a 43-character token');
select is((select total_cents from public.order where id = pg_temp.made('order_id')::uuid),
  (select (v::jsonb ->> 'total_cents')::bigint from t where k = 'web_quote'),
  'the order is priced from the catalogue as a web order (a price sent in is ignored)');
select is((select unit_price_cents from public.order_item
            where order_id = pg_temp.made('order_id')::uuid and name = '[Pilau]'), 85000::bigint,
  'each line at the catalogue price');
select is((select channel::text || '/' || payment_status::text || '/' || stage::text from public.order
            where id = pg_temp.made('order_id')::uuid), 'concierge/pending/placed',
  'a concierge order, waiting for payment');
select is((select created_by_staff_id from public.order where id = pg_temp.made('order_id')::uuid),
  'c2520000-0000-4000-8000-0000000000b1'::uuid, 'recorded against the staff member');
select is((select property_qr_id from public.order where id = pg_temp.made('order_id')::uuid),
  'c2520000-0000-4000-8000-0000000000aa'::uuid, 'tied to the unit''s QR card');
select ok((select extensions.st_dwithin(dropoff_point, 'SRID=4326;POINT(36.6 -1.4)'::extensions.geography, 1)
             from public.order where id = pg_temp.made('order_id')::uuid), 'delivered to the unit''s pin');
select is((select token_hash from public.order_pay_link where order_id = pg_temp.made('order_id')::uuid),
  encode(extensions.digest(pg_temp.token(), 'sha256'), 'hex'), 'only the token''s sha256 is kept');
select ok((select expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
             from public.order_pay_link where order_id = pg_temp.made('order_id')::uuid), 'the link lasts 24 hours');
select ok(exists (select 1 from public.notification_outbox where channel = 'sms' and recipient = '+254700025299'
                   and template = 'concierge_pay_link' and body like '%' || pg_temp.made('link') || '%'),
  'the guest is sent the link by SMS');
select is((select count(*)::int from audit.audit_event where action = 'order.concierge_created'
            and target_id = pg_temp.made('order_id')::uuid), 1, 'and it is audited');

-- ─────────────────────────────────────────── the guest opens the link

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_pay_link_view(pg_temp.token(), 'ip-a') ->> 'state', 'open', 'the right token opens the order');
select is((public.rpc_pay_link_view(pg_temp.token(), 'ip-a') ->> 'total_cents')::bigint,
  (select (v::jsonb ->> 'total_cents')::bigint from t where k = 'web_quote'), 'with its total');
select is(public.rpc_pay_link_view(left(pg_temp.token(), 42) || 'x', 'ip-a') ->> 'state', 'not_found',
  'a wrong token finds nothing');
select throws_ok($$ select public.rpc_pay_link_begin('x') $$, '42501', null, 'paying needs a session');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c2520000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$ select public.rpc_pay_link_begin('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$, '22023', null,
  'a session with a wrong token cannot begin a payment');
insert into t select 'begun', public.rpc_pay_link_begin(pg_temp.token())::text;
reset role;
select is((select created_by from public.payment where reference = (select v::jsonb ->> 'reference' from t where k = 'begun')),
  'c2520000-0000-4000-8000-000000000004'::uuid, 'a temporary session begins the payment as its own');

-- Another phone takes over a payment nobody is paying on.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c2520000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_pay_link_begin(pg_temp.token()) ->> 'reference',
  (select v::jsonb ->> 'reference' from t where k = 'begun'), 'a second phone reuses the same payment');
reset role;
select is((select created_by from public.payment where reference = (select v::jsonb ->> 'reference' from t where k = 'begun')),
  'c2520000-0000-4000-8000-000000000005'::uuid, 'and it becomes theirs to pay');

-- ─────────────────────────────────────────── expiry

update public.order set placed_at = now() - interval '40 minutes' where id = pg_temp.made('order_id')::uuid;
select public.cron_expire_unpaid_mpesa_orders();
select is((select stage::text from public.order where id = pg_temp.made('order_id')::uuid), 'placed',
  'a pay-link order is not closed at 30 minutes');

-- Resend: a new link; the first one is replaced.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2520000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into t select 'resent', public.rpc_console_concierge_resend(pg_temp.made('order_id')::uuid)::text;
select is(public.rpc_pay_link_view(pg_temp.token(), 'ip-b') ->> 'state', 'replaced', 'the first link is replaced');
select is(public.rpc_pay_link_view(substr((select v::jsonb ->> 'link' from t where k = 'resent'), 30), 'ip-b') ->> 'state',
  'open', 'the new link opens');
select is(jsonb_array_length(public.rpc_console_concierge_orders('c2520000-0000-4000-8000-000000000051')), 1,
  'the stay lists its concierge order');
reset role;

update public.order_pay_link set expires_at = now() - interval '1 minute' where order_id = pg_temp.made('order_id')::uuid;
select public.cron_expire_unpaid_mpesa_orders();
select is((select stage::text || '/' || cancel_reason_code from public.order where id = pg_temp.made('order_id')::uuid),
  'cancelled/unpaid', 'once the link has run out the order closes');
select is((select count(*)::int from public.payment where order_id = pg_temp.made('order_id')::uuid and state = 'abandoned'),
  1, 'and its unpaid payment is abandoned');

-- ─────────────────────────────────────────── walking the keyspace

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_pay_link_view(repeat('z', 43), 'ip-walker') from generate_series(1, 20);
select throws_ok($$ select public.rpc_pay_link_view(repeat('y', 43), 'ip-walker') $$, '22023', null,
  'twenty misses and the caller is refused for a while');
reset role;

select * from finish();
rollback;
