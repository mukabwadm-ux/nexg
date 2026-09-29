-- The rules Experiences cannot be allowed to lose.
--
-- Not a tour of the schema: each of these is a rule that, if it quietly
-- stopped holding, would cost a guest money, publish words they did not
-- agree to, or let the wrong person read a stranger's phone number.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

delete from public.review_request;
delete from public.review;
delete from public.plan;
delete from public.role_grant;
delete from public.staff_user;

-- ------------------------------------------------------------------- people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','xp.guest@example.test','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','xp.other.guest@example.test','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','xp.concierge@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e4444444-4444-4444-4444-444444444444',
   'authenticated','authenticated','xp.growth@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e5555555-5555-5555-5555-555555555555',
   'authenticated','authenticated','xp.mombasa@nexgapp.com','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('eeeeeeee-0000-0000-0000-000000000001','e3333333-3333-3333-3333-333333333333',
   'xp.concierge@nexgapp.com','XP concierge'),
  ('eeeeeeee-0000-0000-0000-000000000002','e4444444-4444-4444-4444-444444444444',
   'xp.growth@nexgapp.com','XP growth'),
  ('eeeeeeee-0000-0000-0000-000000000003','e5555555-5555-5555-5555-555555555555',
   'xp.mombasa@nexgapp.com','XP Mombasa lead');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by) values
  ('eeeeeeee-0000-0000-0000-000000000001',
   (select id from public.role where key='concierge_agent'),
   (select id from public.city where slug='nairobi'), 'eeeeeeee-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000002',
   (select id from public.role where key='growth'), null,
   'eeeeeeee-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000003',
   (select id from public.role where key='city_lead'),
   (select id from public.city where slug='mombasa'), 'eeeeeeee-0000-0000-0000-000000000001');

-- ------------------------------------------------------------------ a day

insert into public.plan (id, user_id, city_id, guest_name, guest_phone, duration,
                         party_type, party_size, date, budget_kes, moods, status,
                         concierge_id, quote_total_kes)
values ('aaaa0000-0000-4000-8000-00000000000a','e1111111-1111-1111-1111-111111111111',
        (select id from public.city where slug='nairobi'), 'Otieno Abisai','+254722909090',
        'day','couple',2, current_date + 10, 40000, array['taste']::public.mood[],
        'draft','eeeeeeee-0000-0000-0000-000000000001', 30000);

insert into public.plan_block (id, plan_id, slot, kind, title_snapshot, price_estimate_kes, status)
values ('bbbb0000-0000-4000-8000-00000000000b','aaaa0000-0000-4000-8000-00000000000a',
        'midday','meal','A table somewhere', 8000, 'proposed');

-- ═════════════════════════════════════════════ the state machine

select throws_ok(
  $$update public.plan set status = 'paid', paid_at = now(), payment_reference = 'x'
    where id = 'aaaa0000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'a draft cannot jump straight to paid'
);

update public.plan set status = 'sent', sent_at = now()
where id = 'aaaa0000-0000-4000-8000-00000000000a';

select throws_ok(
  $$update public.plan set status = 'approved', approved_at = now()
    where id = 'aaaa0000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'nothing is approved that was never quoted'
);

update public.plan set status = 'quoted', quoted_at = now(), expires_at = now() + interval '1 day'
where id = 'aaaa0000-0000-4000-8000-00000000000a';
update public.plan set status = 'approved', approved_at = now()
where id = 'aaaa0000-0000-4000-8000-00000000000a';

select throws_ok(
  $$update public.plan set status = 'paid', paid_at = now()
    where id = 'aaaa0000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'paid without a payment reference is refused by the table'
);

select lives_ok(
  $$update public.plan set status = 'paid', paid_at = now(), payment_reference = 'MPESA-TEST-1'
    where id = 'aaaa0000-0000-4000-8000-00000000000a'$$,
  'paid with a reference is allowed'
);

-- ═══════════════════════════════════════════ blocks keep their promises

select throws_ok(
  $$update public.plan_block set status = 'confirmed'
    where id = 'bbbb0000-0000-4000-8000-00000000000b'$$,
  '23514', null,
  'a block cannot be confirmed without a price'
);

select throws_ok(
  $$update public.plan_block set status = 'changed', price_quoted_kes = 9000
    where id = 'bbbb0000-0000-4000-8000-00000000000b'$$,
  '23514', null,
  'a change cannot be saved without the note the guest reads'
);

-- ══════════════════════════════════════════════════ who sees a plan

set local role authenticated;
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.plan), 0,
  'one guest cannot see another guest''s day'
);
reset role; reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::int from public.plan), 1,
  'the guest who built it can'
);
reset role; reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e5555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is(
  (select count(*)::int from public.plan), 0,
  'a Mombasa city lead cannot read a Nairobi guest''s day'
);
select ok(
  not authz.works_plan('aaaa0000-0000-4000-8000-00000000000a'),
  'nor work it'
);
reset role; reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e4444444-4444-4444-4444-444444444444","role":"authenticated"}';
select ok(
  not authz.works_plan('aaaa0000-0000-4000-8000-00000000000a'),
  'growth reads the module but does not work a block'
);
select throws_ok(
  $$select public.rpc_confirm_block('bbbb0000-0000-4000-8000-00000000000b', 8000)$$,
  '42501', null,
  'and the RPC refuses them by name'
);
reset role; reset request.jwt.claims;

-- ═══════════════════════════════════════════════════════ reviews

update public.plan set status = 'in_progress' where id = 'aaaa0000-0000-4000-8000-00000000000a';
update public.plan_block set status = 'removed', change_note = 'test'
where plan_id = 'aaaa0000-0000-4000-8000-00000000000a';
update public.plan set status = 'completed', completed_at = now()
where id = 'aaaa0000-0000-4000-8000-00000000000a';

insert into public.review_request (plan_id, token_hash, expires_at)
values ('aaaa0000-0000-4000-8000-00000000000a', 'hash-1', now() + interval '14 days');

select throws_ok(
  $$insert into public.review_request (plan_id, token_hash, expires_at)
    values ('aaaa0000-0000-4000-8000-00000000000a', 'hash-2', now() + interval '14 days')$$,
  '23505', null,
  'a guest is asked for a review once, and the constraint is the rule'
);

insert into public.review (id, plan_id, user_id, rating, body, consent_publish, consent_display, checks)
values ('cccc0000-0000-4000-8000-00000000000c','aaaa0000-0000-4000-8000-00000000000a',
        'e1111111-1111-1111-1111-111111111111', 5,
        'Aisha moved our pickup to sunrise. Call me on 0722909090.',
        true, 'initial',
        public.fn_review_checks('aaaa0000-0000-4000-8000-00000000000a',
                                'Aisha moved our pickup to sunrise. Call me on 0722909090.'));

select is(
  (select (checks ->> 'pii_found')::boolean from public.review
   where id = 'cccc0000-0000-4000-8000-00000000000c'),
  true,
  'a phone number in the text is flagged before anyone publishes it'
);

select throws_ok(
  $$update public.review set body = 'Tidied up.'
    where id = 'cccc0000-0000-4000-8000-00000000000c'$$,
  '42501', null,
  'nobody edits a review, the service role included'
);

select throws_ok(
  $$update public.review set rating = 4
    where id = 'cccc0000-0000-4000-8000-00000000000c'$$,
  '42501', null,
  'nor the rating'
);

select throws_ok(
  $$update public.review set consent_display = 'full_name'
    where id = 'cccc0000-0000-4000-8000-00000000000c'$$,
  '42501', null,
  'consent cannot be widened to a full name that was never given'
);

-- ══════════════════════════════════════════ what the world can read

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.review_public), 0,
  'an undecided review is not public'
);

reset role; reset request.jwt.claims;

update public.review set status = 'approved', decided_by = 'eeeeeeee-0000-0000-0000-000000000002',
       decided_at = now(), published_at = now(), display_name_snapshot = 'O. A.'
where id = 'cccc0000-0000-4000-8000-00000000000c';

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select display_name_snapshot from public.review_public), 'O. A.',
  'an approved one is, in the form they agreed to'
);

select is(
  (select count(*)::int from public.review), 0,
  'and the review table itself stays shut to anon'
);

reset role; reset request.jwt.claims;

select * from finish();
rollback;
