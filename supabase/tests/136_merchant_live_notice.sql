-- Going live: the bell is true and the congratulations email is the only
-- email (20270131000650); coming back after a pause is still emailed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.emails(p_template text) returns integer language sql as $f$
  select count(*)::int from public.notification_outbox
  where template = p_template and recipient in ('owner136@test.local', 'manager136@test.local')
$f$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('a1360000-0000-4000-8000-0000000000a1'::uuid, 'owner136@test.local'),
  ('a1360000-0000-4000-8000-0000000000a2'::uuid, 'manager136@test.local')
) as u (id, email);

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status)
values ('a1360000-0000-4000-8000-0000000000c1', 'Notice Test Limited', 'Notice Test', 'beauty',
  'Zawadi Owner', '+254712136001', 'notice136@shop.example',
  (select id from public.city where slug = 'nairobi'), 'under_review');
insert into public.merchant_user (merchant_id, user_id, role) values
  ('a1360000-0000-4000-8000-0000000000c1', 'a1360000-0000-4000-8000-0000000000a1', 'owner'),
  ('a1360000-0000-4000-8000-0000000000c1', 'a1360000-0000-4000-8000-0000000000a2', 'manager');

/* The two members' status bell (staff get their own "New merchant" bells). */
create temp view t_bells as
  select n.user_id, n.kind, n.title, n.body from public.user_notification n
  where n.tag = 'merchant-status:a1360000-0000-4000-8000-0000000000c1'
    and n.user_id in ('a1360000-0000-4000-8000-0000000000a1', 'a1360000-0000-4000-8000-0000000000a2');

/*
 * Each status change is its own transaction in real life, so the bell's
 * updated_at moves and the refreshed bell is emailed. In this one test
 * transaction now() stands still, so age the bell by hand between steps,
 * with triggers off so the ageing itself sends nothing.
 */
create function pg_temp.age_bells() returns void language plpgsql as $f$
begin
  set local session_replication_role = replica;
  update public.user_notification set updated_at = updated_at - interval '1 minute'
  where tag = 'merchant-status:a1360000-0000-4000-8000-0000000000c1';
  set local session_replication_role = origin;
end
$f$;

select results_eq(
  $$select kind collate "C", enabled from public.notification_email_kind
    where kind in ('merchant.live', 'merchant.resumed', 'merchant.paused') order by 1$$,
  $$values ('merchant.live' collate "C", false), ('merchant.paused', true), ('merchant.resumed', true)$$,
  'going live is not emailed as a bell; coming back and pausing are');

-- ------------------------------------------------------------------ going live

update public.merchant set status = 'live', went_live_at = now()
where id = 'a1360000-0000-4000-8000-0000000000c1';

select results_eq(
  $$select kind, title, body from t_bells order by user_id$$,
  $$values
    ('merchant.live', 'You are live on NexG', 'Start taking orders from your dashboard Home when you are ready.'),
    ('merchant.live', 'You are live on NexG', 'Start taking orders from your dashboard Home when you are ready.')$$,
  'going live rings every member''s bell, saying how to start taking orders (they are off)');

select is(pg_temp.emails('bell_merchant.live'), 0,
  'and sends no plain "You are live" email: the congratulations email is the one');

-- ------------------------------------------------------------- pause and back

select pg_temp.age_bells();
update public.merchant set status = 'paused' where id = 'a1360000-0000-4000-8000-0000000000c1';

select is(pg_temp.emails('bell_merchant.paused'), 2,
  'pausing is still emailed to every member');

select pg_temp.age_bells();
update public.merchant set status = 'live' where id = 'a1360000-0000-4000-8000-0000000000c1';

select results_eq(
  $$select kind, title from t_bells order by user_id$$,
  $$values ('merchant.resumed', 'You are live on NexG again'), ('merchant.resumed', 'You are live on NexG again')$$,
  'coming back after a pause rings the bell as live again');

select is(pg_temp.emails('bell_merchant.resumed'), 2,
  'and is still emailed to every member');

select ok(
  (select bool_and(body like 'Start taking orders from your dashboard Home when you are ready.%')
   from public.notification_outbox
   where template = 'bell_merchant.resumed' and recipient in ('owner136@test.local', 'manager136@test.local')),
  'saying how to start taking orders, since pausing switched them off');

-- ------------------------------------------------- back with orders switched on

select pg_temp.age_bells();
update public.merchant set status = 'paused' where id = 'a1360000-0000-4000-8000-0000000000c1';
select pg_temp.age_bells();
update public.merchant set status = 'live', accepting_orders = true
where id = 'a1360000-0000-4000-8000-0000000000c1';

select is(
  (select string_agg(distinct body, ' | ') from t_bells),
  'Guests can order from you now.',
  'when orders are on, the bell says guests can order');

select is(
  (select count(*)::int from pg_trigger where tgname = 'merchant_status_rings_the_bell'),
  1,
  'the bell still rings from the same trigger');

select * from finish();
rollback;
