-- The rider fixes: messages read, tickets that come back, the phone and test
-- trip steps, who may open an incident, one door for going online, the trip
-- presence, going offline after a delivery, the agreement, and shift dates.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider111@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'rider111b@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1110000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger111@example.test', now(), false, now(), now());

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at)
values
  ('c1110000-0000-4000-8000-000000000031', 'c1110000-0000-4000-8000-000000000003',
   '[Rider]', '[111]', '+254700011102', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE111]', 'active', 'offline', now()),
  ('c1110000-0000-4000-8000-000000000032', 'c1110000-0000-4000-8000-000000000005',
   '[Rider]', '[111B]', '+254700011103', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE111B]', 'active', 'offline', now());

insert into public.rider_message (id, rider_id, direction, channel, subject, body)
values ('c1110000-0000-4000-8000-0000000000e1', 'c1110000-0000-4000-8000-000000000031',
        'out', 'in_app', '[Subject]', '[Hello from ops]');

create function pg_temp.as_user(p_uid text, p_anonymous boolean default false) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true)
$$;

create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlerrm);
end
$$;

-- ── 1. messages read

set local role authenticated;
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select is((select unread_messages::int from public.rider_home_v), 1, 'One unread message.');
select is((public.rpc_rider_messages_read() ->> 'marked')::int, 1, 'The rider marks it read.');
select is((select unread_messages::int from public.rider_home_v), 0, 'And the unread count falls.');

-- ── 2. a ticket comes back

select set_config('t.ticket', public.rpc_support_ticket_create(
  '[My bag strap broke]', 'rider', p_email => 'rider111@example.test') ->> 'reference', true);
select is((select count(*)::int from public.rider_ticket_v where reference = current_setting('t.ticket')),
  1, 'The rider sees the ticket they raised.');
reset role;

insert into public.support_message (ticket_id, from_staff_id, body, internal)
select t.id, (select id from public.staff_user order by created_at limit 1), b, i
  from public.support_ticket t,
       (values ('[We will replace it]', false), ('[internal note]', true)) v (b, i)
 where t.reference = current_setting('t.ticket');

set local role authenticated;
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select is((select array_agg(body order by created_at) from public.my_ticket_message_v
            where ticket_reference = current_setting('t.ticket')),
  array['[We will replace it]'], 'They read support''s answer, not the desk''s internal note.');
select is((public.rpc_my_ticket_reply(
             (select id from public.rider_ticket_v where reference = current_setting('t.ticket')),
             '[Thank you]') ->> 'ok')::boolean,
  true, 'And reply.');

select pg_temp.as_user('c1110000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.my_ticket_message_v
            where ticket_reference = current_setting('t.ticket')),
  0, 'Somebody else sees none of it.');
reset role;
select throws_ok(format($$select set_config('request.jwt.claims', %L, true);
  set local role authenticated;
  select public.rpc_my_ticket_reply(%L, 'x')$$,
  jsonb_build_object('sub', 'c1110000-0000-4000-8000-000000000004', 'role', 'authenticated')::text,
  (select id from public.support_ticket where reference = current_setting('t.ticket'))),
  'P0002', 'Ticket not found.', 'Nor answer it.');
reset role;

-- ── 3. the phone step

set local role authenticated;
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select ok((public.rpc_rider_device_register('android', '[Phone A]', '[token-a]', true, true) ->> 'ok')::boolean,
  'The app records the phone.');
select is((select step_app from public.rider_setup_progress_v), true, 'And the phone step is done.');
select public.rpc_rider_device_register('ios', '[Phone B]', '[token-b]', true, true);
select is((select array_agg(label order by label) from public.rider_device where is_job_device),
  array['[Phone B]'], 'A second phone takes over as the job phone.');

-- ── 4. who may open an incident

select pg_temp.as_user('c1110000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_incident_open('other', 'c1110000-0000-4000-8000-000000000031', '[x]')$$,
  '42501', null, 'Somebody who is not a rider or staff cannot open an incident.');
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select throws_ok($$select public.rpc_incident_open('other', 'c1110000-0000-4000-8000-000000000032', '[x]')$$,
  '42501', null, 'A rider cannot open one against another rider.');
select is((public.rpc_incident_open('breakdown', null, '[Puncture]', 'minor', null, 'staff')).reported_by_type,
  'rider', 'A rider reports about themselves, as a rider, whatever they claim.');

-- ── 5. one door for going online

select is(public.rpc_rider_set_presence('on_trip') ->> 'ok', 'false', 'A rider cannot set themselves on a trip.');
reset role;
insert into public.rider_agreement_version (id, version, effective_from, status)
values ('c1110000-0000-4000-8000-0000000000a1', '[v111]', current_date, 'current')
on conflict do nothing;
update public.rider_agreement_version set status = 'archived'
 where status = 'current' and id <> 'c1110000-0000-4000-8000-0000000000a1';
update public.rider_agreement_version set status = 'current'
 where id = 'c1110000-0000-4000-8000-0000000000a1';

set local role authenticated;
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select is(pg_temp.hint_of($$select public.rpc_rider_go_online(true)$$), 'agreement',
  'Going online waits for the current agreement.');
select is(public.rpc_rider_set_presence('online') ->> 'ok', 'false', 'Through either door.');
select is((public.rpc_rider_agreement_current() ->> 'accepted')::boolean, false, 'The rider sees it is not accepted.');
select is(public.rpc_rider_agreement_accept('c1110000-0000-4000-8000-0000000000a1') ->> 'version',
  '[v111]', 'And accepts it.');
select is(public.rpc_rider_go_online(true) ->> 'presence', 'online', 'Now they go online.');
reset role;

-- ── 6 & 7. on a trip, and offline after it

insert into public.order (id, reference, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'c1110000-0000-4000-8000-0000000000f1', 'FIXES-111-A', m.id, b.id, m.city_id, 'web',
       '[Drop]', 'ready', 'mpesa_stk', 'paid', 1000, 100, 0, 1100, 'KES'
  from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
 where m.city_id = (select id from public.city where slug = 'nairobi')
 order by m.id limit 1;
insert into dispatch.job (id, order_id, city_id, pickup_label, dropoff_label, state)
values ('c1110000-0000-4000-8000-0000000000d1', 'c1110000-0000-4000-8000-0000000000f1',
        (select id from public.city where slug = 'nairobi'), '[Shop]', '[Drop]', 'offering');
update dispatch.job set state = 'assigned', assigned_rider_id = 'c1110000-0000-4000-8000-000000000031',
       assigned_at = now()
 where id = 'c1110000-0000-4000-8000-0000000000d1';

select is((select presence::text || ' ' || current_order_reference from public.rider
            where id = 'c1110000-0000-4000-8000-000000000031'),
  'on_trip FIXES-111-A', 'Assigned a job, the rider is on a trip with that order.');

set local role authenticated;
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select is((public.rpc_rider_go_online(false) ->> 'afterTrip')::boolean, true,
  'Going offline mid-trip waits for the trip to end.');
reset role;

update dispatch.job set state = 'completed', ended_at = now(), end_reason = 'delivered'
 where id = 'c1110000-0000-4000-8000-0000000000d1';
select is((select presence::text from public.rider where id = 'c1110000-0000-4000-8000-000000000031'),
  'offline', 'When it ends, they go offline as they asked.');
select is((select current_order_reference from public.rider where id = 'c1110000-0000-4000-8000-000000000031'),
  null, 'And no order is shown as theirs any more.');

-- ── 8. the test trip step reads for the rider

set local role authenticated;
select pg_temp.as_user('c1110000-0000-4000-8000-000000000003');
select lives_ok($$select step_training from public.rider_setup_progress_v$$,
  'The rider can read their training step.');

-- ── 9. shifts

select throws_ok(format($$select public.rpc_shift_commit(%L, current_date - 1, '18:00-22:00')$$,
  (select id from public.zone where city_id = (select id from public.city where slug = 'nairobi') limit 1)),
  'Pick a day from today to two weeks ahead.', 'A shift cannot be committed for yesterday.');
reset role;

select * from finish();
rollback;
