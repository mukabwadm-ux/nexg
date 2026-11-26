-- Stay reviews by category (20270331000400): only the guest who booked can
-- rate, only after the stay, for 14 days; low ratings wait for staff; the
-- console reader averages the categories; the daily ask emails once and
-- reminds once.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2510000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'guest251@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2510000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other251@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2510000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'ops251@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2510000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'approver251@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2510000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', null, null, false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2510000-0000-4000-8000-0000000000b1', 'c2510000-0000-4000-8000-000000000003', 'ops251@test.local', 'Ops 251'),
  ('c2510000-0000-4000-8000-0000000000b2', 'c2510000-0000-4000-8000-000000000004', 'approver251@test.local', 'Approver 251');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2510000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2510000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

insert into public.host (id, phone, kind, status, contact_name, display_name, email, city_id, submitted_at)
values ('c2510000-0000-4000-8000-0000000000a1', '+254700025101', 'single_unit', 'verifying', 'Host 251',
        '[Host 251]', 'host251@example.test', (select id from public.city where slug = 'nairobi'), now());
insert into public.unit (id, host_id, name, status, nightly_rate_kes, city_id)
values ('c2510000-0000-4000-8000-0000000000c1', 'c2510000-0000-4000-8000-0000000000a1', '[Unit 251]', 'setting_up', 8000,
        (select id from public.city where slug = 'nairobi'));

-- s1 left yesterday; s2 is ahead; s3 was cancelled; s4 was rated 20 days ago;
-- s5 is a guest with no email; s6 was entered by the host, not booked on NexG.
insert into public.stay (id, host_id, unit_id, guest_user_id, guest_first_name, check_in, check_out, status, source)
values
  ('c2510000-0000-4000-8000-0000000000d1', 'c2510000-0000-4000-8000-0000000000a1', 'c2510000-0000-4000-8000-0000000000c1',
   'c2510000-0000-4000-8000-000000000001', 'Wanjiru', now() - interval '3 days', now() - interval '1 day', 'departed', 'nexg'),
  ('c2510000-0000-4000-8000-0000000000d2', 'c2510000-0000-4000-8000-0000000000a1', 'c2510000-0000-4000-8000-0000000000c1',
   'c2510000-0000-4000-8000-000000000001', 'Wanjiru', now() + interval '5 days', now() + interval '7 days', 'booked', 'nexg'),
  ('c2510000-0000-4000-8000-0000000000d3', 'c2510000-0000-4000-8000-0000000000a1', 'c2510000-0000-4000-8000-0000000000c1',
   'c2510000-0000-4000-8000-000000000001', 'Wanjiru', now() - interval '3 days', now() - interval '1 day', 'cancelled', 'nexg'),
  ('c2510000-0000-4000-8000-0000000000d4', 'c2510000-0000-4000-8000-0000000000a1', 'c2510000-0000-4000-8000-0000000000c1',
   'c2510000-0000-4000-8000-000000000001', 'Wanjiru', now() - interval '25 days', now() - interval '22 days', 'departed', 'nexg'),
  ('c2510000-0000-4000-8000-0000000000d5', 'c2510000-0000-4000-8000-0000000000a1', 'c2510000-0000-4000-8000-0000000000c1',
   'c2510000-0000-4000-8000-000000000005', 'Otieno', now() - interval '6 days', now() - interval '1 day', 'departed', 'nexg'),
  ('c2510000-0000-4000-8000-0000000000d6', 'c2510000-0000-4000-8000-0000000000a1', 'c2510000-0000-4000-8000-0000000000c1',
   'c2510000-0000-4000-8000-000000000001', 'Wanjiru', now() - interval '10 days', now() - interval '8 days', 'departed', 'entered');
insert into public.stay_review (stay_id, rating, rating_cleanliness, answered_at)
values ('c2510000-0000-4000-8000-0000000000d4', 4, 2, now() - interval '20 days');

-- ─────────────────────────────────────────── the daily ask: once, then one reminder

select is((public.cron_stay_review_requests()) ->> 'asked', '1', 'the ask goes to the one guest who left yesterday');
select ok((select asked_at is not null from public.stay_review where stay_id = 'c2510000-0000-4000-8000-0000000000d1'),
  'and records asked_at');
select is((select count(*)::integer from public.notification_log
            where template = 'stay_review_request' and recipient = 'guest251@example.test'
              and payload ->> 'stay_id' = 'c2510000-0000-4000-8000-0000000000d1'), 1,
  'one email to the guest, with the stay');
select ok((select body like '%https://nexgapp.com/account/stays/c2510000-0000-4000-8000-0000000000d1/review%'
             from public.notification_outbox o join public.notification_log l on l.id = o.notification_log_id
            where l.template = 'stay_review_request' and l.recipient = 'guest251@example.test'),
  'linking to the review page');
select ok(not exists (select 1 from public.stay_review
                       where stay_id in ('c2510000-0000-4000-8000-0000000000d3', 'c2510000-0000-4000-8000-0000000000d5')),
  'never a cancelled stay or a guest without an email');
select is((public.cron_stay_review_requests()) ->> 'asked', '0', 'a second run asks nobody again');
update public.stay_review set asked_at = now() - interval '5 days'
 where stay_id = 'c2510000-0000-4000-8000-0000000000d1';
select is((public.cron_stay_review_requests()) ->> 'reminded', '1', 'four days on, one reminder');
select is((public.cron_stay_review_requests()) ->> 'reminded', '0', 'and never a second');
select is((select count(*)::integer from public.notification_log
            where template in ('stay_review_request', 'stay_review_reminder') and recipient = 'guest251@example.test'), 2,
  'two emails in all');

-- ─────────────────────────────────────────── only the guest, only after the stay

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2510000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d1', '{"rating":5}') $$,
  '42501', null, 'another customer cannot rate the stay');
select is(jsonb_array_length(public.rpc_stay_review_mine()), 0, 'nor see it');

select set_config('request.jwt.claims', '{"sub":"c2510000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d2', '{"rating":5}') $$,
  '23514', null, 'a stay still ahead cannot be rated');
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d3', '{"rating":5}') $$,
  '23514', null, 'nor a cancelled one');
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d6', '{"rating":5}') $$,
  '23514', null, 'nor one the host entered');
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d1', '{"cleanliness":4}') $$,
  '23514', null, 'the overall rating is required');
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d1', '{"rating":5,"value":6}') $$,
  '23514', null, 'categories are 1 to 5');
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d1',
                     jsonb_build_object('rating', 5, 'text', repeat('a', 2001))) $$,
  '23514', null, 'text is at most 2000 characters');

-- ─────────────────────────────────────────── moderation and the edit window

select is((public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d1',
            '{"rating":2,"cleanliness":4,"location":5,"value":3,"text":"Noisy at night."}')) ->> 'moderation',
  'under_review', 'two stars waits for staff');
select is((public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d1',
            '{"rating":5,"cleanliness":4,"location":5,"value":3}')) ->> 'moderation',
  'published', 'changed to five stars, it is published');
select is((public.rpc_stay_review_mine('c2510000-0000-4000-8000-0000000000d1') -> 0 -> 'review' ->> 'location'), '5',
  'the guest reads back their category ratings');
select throws_ok($$ select public.rpc_stay_review_submit('c2510000-0000-4000-8000-0000000000d4', '{"rating":5}') $$,
  '23514', null, 'a review older than 14 days cannot be changed');
select is((public.rpc_stay_review_mine('c2510000-0000-4000-8000-0000000000d4') -> 0 ->> 'can_rate'), 'false',
  'and the account page says so');

reset role;
select ok((select answered_at > now() - interval '1 minute' and edited_at is not null and asked_at is not null
             from public.stay_review where stay_id = 'c2510000-0000-4000-8000-0000000000d1'),
  'answered_at is the first answer, edited_at the change, asked_at kept');
select ok(exists (select 1 from audit.audit_event where action = 'stay_review.submitted'
                   and target_id = 'c2510000-0000-4000-8000-0000000000d1'),
  'the guest''s rating is audited');

-- ─────────────────────────────────────────── the console reader

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2510000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((public.rpc_console_stays_reviews(current_date - 30, current_date, null, 'all')
             -> 'categories' -> 'cleanliness' ->> 'avg')::numeric, 3.00::numeric,
  'cleanliness averages the two reviews that rated it');
select is((public.rpc_console_stays_reviews(current_date - 30, current_date, null, 'all', 'Wanjiru')
             -> 'rows' -> 0 ->> 'rating_location'), '5',
  'and each row carries its category ratings');
select set_config('request.jwt.claims', '{"sub":"c2510000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_console_stays_reviews(current_date - 30, current_date) $$,
  '42501', null, 'a guest cannot read the console reader');

select * from finish();
rollback;
