-- App emails (20270127000100, 20270127000200).
--
--   1. All 43 designs are stored and every one fills from its sample with nothing left over.
--   2. The six app groups exist in Email routing and are off.
--   3. Off: nothing is queued or logged.
--   4. On: the email goes through fn_notify_enqueue with the route's sender, the
--      text in body and the HTML in the outbox's html column, and once per event.
--   5. A customer who turned an optional email off is skipped; a required one is not.
--   6. A guest without an email is logged as skipped, never queued.
--   7. Values are HTML-escaped. The preview queues nothing. The sender reads the HTML.
--   8. With Orders on, the order bell emails stand aside.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_user_meta_data, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'amani.app-email@example.com', '', now(), now(), now(), '{"first_name":"Amani"}', false),
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', null, '', null, now(), now(), '{}', true);

select is((select count(*)::int from app_email.template), 43, 'all 43 designs are stored');

select is_empty($$
  select t.key from app_email.template t, lateral app_email.preview(t.key) p
   where p.html ~ '\{\{' or p.text ~ '\{\{' or p.subject ~ '\{\{'
$$, 'every email fills from its sample with no placeholder left');

select is((select count(*)::int from public.email_route
            where key in ('app_account', 'app_orders', 'app_bookings', 'app_stays', 'app_support', 'app_privacy')
              and not enabled), 6, 'the six app groups are in Email routing, all off');

select is(public.fn_email_route_for('app_orders.11-order-placed'), 'app_orders', 'app templates use their group''s route');
select is(public.fn_email_route_for('bell_order.cancelled'), 'guest_updates', 'existing routes are unchanged');

-- 3. Off.
select is(app_email.send('41-support-received', 'ticket', 'ae000000-0000-4000-8000-0000000000a1',
                         '{"ticket_reference":"HLP-T-1"}', 'ae000000-0000-4000-8000-000000000001'),
          null, 'while a group is off nothing is queued');
select is((select count(*)::int from app_email.sent), 0, 'and nothing is logged, so switching on later still sends');

-- 4. On.
update public.email_route set enabled = true where key in ('app_support', 'app_bookings', 'app_orders');

select isnt(app_email.send('41-support-received', 'ticket', 'ae000000-0000-4000-8000-0000000000a1',
                           '{"ticket_reference":"HLP-T-1","summary":"<b>Juice</b> & chips"}',
                           'ae000000-0000-4000-8000-000000000001'),
             null, 'switched on, the email is queued');

select results_eq($$
  select o.recipient, o.template, o.payload ->> 'from', o.sensitive
    from public.notification_outbox o where o.template = 'app_support.41-support-received'
$$, $$ values ('amani.app-email@example.com'::text, 'app_support.41-support-received'::text,
               'NexG Support <info@nexgapp.com>'::text, false) $$,
  'through fn_notify_enqueue, to the account''s email, with the route''s sender');

select ok((select o.html like '%&lt;b&gt;Juice&lt;/b&gt; &amp; chips%' and o.body like '%<b>Juice</b> & chips%'
             and o.html like '%Amani%'
             from public.notification_outbox o where o.template = 'app_support.41-support-received'),
  'the HTML part escapes values; the text part keeps them as written');

select is(app_email.send('41-support-received', 'ticket', 'ae000000-0000-4000-8000-0000000000a1',
                         '{"ticket_reference":"HLP-T-1"}', 'ae000000-0000-4000-8000-000000000001'),
          null, 'the same event is never sent twice');

select ok(exists (select 1 from public.rpc_outbox_due(200) d
                   where d.template = 'app_support.41-support-received' and d.html is not null),
  'the sender is handed the HTML part');

-- 5. Choices.
insert into public.customer_notification_pref (user_id, choices)
values ('ae000000-0000-4000-8000-000000000001', '{"booking_confirmations":{"email":false}}');

select is(app_email.send('26-request-sent', 'booking', 'ae000000-0000-4000-8000-0000000000b1',
                         '{"business_name":"Mfano Movers","request_title":"Move"}',
                         'ae000000-0000-4000-8000-000000000001'),
          null, 'an optional email the customer turned off is not sent');
select is((select reason from app_email.sent where template_key = '26-request-sent'),
          'The customer turned these emails off', 'and the log says why');
select isnt(app_email.send('27-quote-received', 'booking', 'ae000000-0000-4000-8000-0000000000b1',
                           '{"business_name":"Mfano Movers","request_title":"Move","quote_amount":"KES 1"}',
                           'ae000000-0000-4000-8000-000000000001'),
            null, 'a required email in the same category still goes');

-- 6. A guest with no email.
select is(app_email.send('12-order-cancelled', 'order', 'ae000000-0000-4000-8000-0000000000c1',
                         '{"business_name":"Mfano Kitchen"}', 'ae000000-0000-4000-8000-000000000002'),
          null, 'a guest without an email gets nothing queued');
select is((select reason from app_email.sent where template_key = '12-order-cancelled'),
          'A guest without an email', 'and the log records it');

-- 8. One email, not two.
select is((select count(*)::int from (
    select public.fn_notify_user('ae000000-0000-4000-8000-000000000001', 'order.cancelled', 'Order cancelled')
  ) x join public.notification_outbox o on o.template = 'bell_order.cancelled'), 0,
  'with Orders on, the order bell email stands aside for the app email');

select * from finish();
rollback;
