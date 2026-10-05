-- Hotels & Airbnb · the rules.
--
-- Each of these is a rule that, if it stopped holding, would put a
-- charge on a stranger's hotel bill, hand a gate code to somebody who
-- is not at the door, let an unverified host go live, or destroy a
-- record somebody is legally required to keep.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

/* Carries the caretaker's one-time token between statements. */
create temp table t_hosp (k text primary key, v text);

set local app.secret_key = 'test-key-not-the-real-one';

/*
 * Foreign keys and triggers are suspended for the cleanup below,
 * and switched back on immediately after.
 *
 * These ordered deletes worked until orders, dispatch and the
 * ledger arrived. Now sixty-odd tables reference a merchant or a
 * rider, and one of them — `ledger.entry` — refuses deletion
 * outright, by design: the ledger is append-only, and an order it
 * has posted against cannot be removed. There is no ordering of
 * deletes that satisfies both that rule and this fixture.
 *
 * `session_replication_role = replica` is the standard way out.
 * It is scoped to this transaction, the transaction rolls back,
 * and it is restored before the first assertion so that nothing
 * being tested runs with enforcement off.
 */
set local session_replication_role = replica;

delete from public.approval_request;
delete from public.role_grant;
delete from public.staff_user;

set local session_replication_role = origin;


insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','a1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','hp.a@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','a2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','hp.b@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','a3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','hp.host@example.test','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','a4444444-4444-4444-4444-444444444444',
   'authenticated','authenticated','hp.desk@example.test','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('bbbbbbbb-0000-0000-0000-00000000000a','a1111111-1111-1111-1111-111111111111','hp.a@nexgapp.com','HP A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','a2222222-2222-2222-2222-222222222222','hp.b@nexgapp.com','HP B');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key='partnerships'),
       (select id from public.city where slug='nairobi'), s.id
from public.staff_user s where s.email in ('hp.a@nexgapp.com','hp.b@nexgapp.com');

/* HP A also handles data requests. */
insert into public.role_grant (staff_user_id, role_id, granted_by)
values ('bbbbbbbb-0000-0000-0000-00000000000a',
        (select id from public.role where key='dpo'),
        'bbbbbbbb-0000-0000-0000-00000000000a');

-- ═════════════════════════════════════ a host applies

select lives_ok(
  $$ select public.rpc_host_apply(jsonb_build_object(
       'phone', '+254700000900', 'contact_name', '[Host]', 'kind', 'single_unit',
       'address', '[Address], Kilimani', 'unit_name', 'Apartment 4B',
       'handoff', 'leave_with_askari', 'city', 'nairobi')) $$,
  'a host can apply from the public page'
);

select is(
  (select status::text from public.host where phone = '+254700000900'),
  'applied',
  'and lands as applied, not live'
);

/*
 * The whole point of verification. A host who is live is one somebody
 * checked, and the constraint makes the shortcut impossible rather
 * than merely discouraged.
 */
select throws_ok(
  $$ update public.host set status = 'live' where phone = '+254700000900' $$,
  23514,
  null,
  'a host cannot be set live by a plain update — verification is the only path'
);

-- ═══════════════════════════════════ units and their contacts

/* A unit that says "leave with the askari" needs a confirmed askari. */
select throws_ok(
  $$ update public.unit set status = 'live'
     where host_id = (select id from public.host where phone = '+254700000900') $$,
  23514,
  null,
  'a unit cannot go live promising an askari nobody has confirmed'
);

/*
 * The link is issued, then tapped.
 *
 * This used to pass the literal string 'token', which could
 * never have failed: the function ignored the parameter, so any
 * unit id confirmed any unit. A test that cannot fail on a
 * wrong credential is not testing the credential.
 */
/* The token is planted by the fixture rather than issued through
   rpc_unit_caretaker_invite, which requires host membership this
   suite deliberately does not hold. What is under test here is
   the confirm path: that the right token works and a wrong one
   does not. */
insert into t_hosp (k, v) values ('caretaker_token', 'fixture-caretaker-token');

update public.unit
   set caretaker_token_hash =
         encode(extensions.digest('fixture-caretaker-token', 'sha256'), 'hex')
 where host_id = (select id from public.host where phone = '+254700000900');

select throws_matching(
  format($$select public.rpc_unit_caretaker_confirm(
      (select id from public.unit
        where host_id = (select id from public.host where phone = '+254700000900')), %L)$$,
    'not-the-token'),
  'not valid',
  'a wrong token is refused'
);

select lives_ok(
  format($$ select public.rpc_unit_caretaker_confirm(
       (select id from public.unit
        where host_id = (select id from public.host where phone = '+254700000900')),
       %L) $$, (select v from t_hosp where k = 'caretaker_token')),
  'the caretaker confirms by tapping the link'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_host_verify(
       (select id from public.host where phone = '+254700000900'),
       'listing_ownership', '{"notes":"Code found in the listing"}'::jsonb) $$,
  'staff can verify a host'
);

reset role;

select is(
  (select status::text from public.host where phone = '+254700000900'),
  'live',
  'which makes them live'
);

select is(
  (select status::text from public.unit
   where host_id = (select id from public.host where phone = '+254700000900')),
  'live',
  'and flips the ready unit with it'
);

-- ═══════════════════════════════════════════ the QR

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';

/* A card is now generated for an owner of a given kind, at a named
   spot — a unit can hold a counter card and a fridge card at once. */
select lives_ok(
  $$ select public.rpc_qr_generate('unit',
       (select id from public.unit
        where host_id = (select id from public.host where phone = '+254700000900')),
       'counter') $$,
  'a QR is generated for the unit'
);

reset role;

select is(
  ((select public.rpc_resolve_qr((select q.code from public.property_qr q
          join public.unit u on u.id = q.owner_id and q.owner_type = 'unit'
         where u.host_id = (select id from public.host where phone = '+254700000900')
         limit 1))) ->> 'ok')::boolean,
  true,
  'and it resolves to an orderable context'
);

/*
 * A paused unit must not resolve into something orderable. The card is
 * still on the counter; the host has simply stopped.
 */
update public.unit set status = 'paused'
where host_id = (select id from public.host where phone = '+254700000900');

select is(
  ((select public.rpc_resolve_qr((select q.code from public.property_qr q
          join public.unit u on u.id = q.owner_id and q.owner_type = 'unit'
         where u.host_id = (select id from public.host where phone = '+254700000900')
         limit 1))) ->> 'reason'),
  'paused',
  'a paused unit resolves to a friendly redirect, not an order'
);

/* Replacing voids the old card, so a sticker left on a counter stops working. */
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
/*
 * Replacing, not generating.
 *
 * Generating a second card for a spot is refused on purpose and
 * the refusal says so: two live cards in one place and neither
 * number means anything. `rpc_qr_replace` is the way through —
 * it voids the old card, issues a new one, and links them, in
 * that order so a failure leaves the old card working rather
 * than the counter with none.
 */
select public.rpc_qr_replace(
  (select q.id from public.property_qr q
     join public.unit u on u.id = q.owner_id and q.owner_type = 'unit'
    where u.host_id = (select id from public.host where phone = '+254700000900')
      and q.voided_at is null
    limit 1),
  'reprinted — the counter card was damaged');
reset role;

select is(
  (select count(*)::int from public.property_qr where voided_at is not null),
  1,
  'reprinting a QR voids the one that was on the counter'
);

-- ═══════════════════════════════════ gate codes stay hidden

update public.unit set gate_code_encrypted = public.fn_encrypt_secret('4417')
where host_id = (select id from public.host where phone = '+254700000900');

select is(
  (select count(*)::int
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('unit_context_v', 'rider_handoff_v', 'host_view_v',
                        'console_host_directory_v')
     and (column_name like '%gate_code%' and column_name <> 'has_gate_code')),
  0,
  'no view anywhere carries a gate code'
);

select is(
  (select count(*)::int
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('unit_context_v', 'rider_handoff_v')
     and column_name like '%phone%'),
  0,
  'and the guest and rider contracts carry no phone number at all'
);

-- ═══════════════════════════════════════ charge to room

insert into public.hotel (id, name, city_id, rooms, status, prospect_stage)
values ('cccc0001-0000-4000-8000-00000000000a', '[Hotel A]',
        (select id from public.city where slug='nairobi'), 180, 'prospect', 'proposal');

/* A partner hotel needs a signed agreement. */
select throws_ok(
  $$ update public.hotel set status = 'partner'
     where id = 'cccc0001-0000-4000-8000-00000000000a' $$,
  23514,
  null,
  'a hotel cannot become a partner without a signed agreement'
);

update public.hotel set agreement_signed_at = now(), agreement_version = 'v1',
       status = 'partner', commission_pct = 12
where id = 'cccc0001-0000-4000-8000-00000000000a';

insert into public.hotel_program_setting (hotel_id, charge_to_room)
values ('cccc0001-0000-4000-8000-00000000000a', true);

/*
 * No agreed cap is not "any amount". Until finance sets one, nothing
 * goes on a guest's bill.
 */
select is(
  ((select public.rpc_folio_request('NX-1', 'cccc0001-0000-4000-8000-00000000000a',
                                    '412', '[Surname]', 3000)) ->> 'ok')::boolean,
  false,
  'with no agreed cap, charge-to-room is refused rather than guessed'
);

update public.hotel_program_setting set charge_cap_per_stay = 10000
where hotel_id = 'cccc0001-0000-4000-8000-00000000000a';

select is(
  ((select public.rpc_folio_request('NX-1', 'cccc0001-0000-4000-8000-00000000000a',
                                    '412', '[Surname]', 3000)) ->> 'ok')::boolean,
  true,
  'with a cap, the request reaches the desk'
);

select is(
  (select status::text from public.folio_posting where order_reference = 'NX-1'),
  'awaiting_desk',
  'and waits there — it is not on the bill yet'
);

/* Nothing but a desk action can post it. */
select throws_ok(
  $$ update public.folio_posting set status = 'posted' where order_reference = 'NX-1' $$,
  23514,
  null,
  'a line cannot become posted without somebody at the desk doing it'
);

insert into public.hotel_user (hotel_id, user_id, role)
values ('cccc0001-0000-4000-8000-00000000000a','a4444444-4444-4444-4444-444444444444','desk');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_folio_desk_action(
       (select id from public.folio_posting where order_reference = 'NX-1'),
       'confirm', 'F-0001') $$,
  'the desk confirms it'
);

reset role;

select is(
  (select used from public.folio_cap_usage
   where hotel_id = 'cccc0001-0000-4000-8000-00000000000a'),
  3000::bigint,
  'and the stay''s cap usage goes up by exactly that'
);

/* The cap actually bites. */
select is(
  ((select public.rpc_folio_request('NX-2', 'cccc0001-0000-4000-8000-00000000000a',
                                    '412', '[Surname]', 9000)) ->> 'ok')::boolean,
  false,
  'a second order that would breach the cap is refused'
);

-- ═══════════════════════════════════════ KDPA

insert into public.guest (id, phone, name)
values ('dddd0001-0000-4000-8000-00000000000a', '+254700000901', '[Guest]');

select is(
  (select phone_masked from public.console_guest_v
   where id = 'dddd0001-0000-4000-8000-00000000000a'),
  '+254 ••• ••• •01',
  'the console never holds an unmasked number — masking is in the view'
);

/*
 * And masking must not change the country. A visitor on a UK number
 * who is shown as +254 is a fact staff will act on and get wrong.
 */
select is(
  public.fn_mask_phone('+447700900025'),
  '+44 ••• ••• •25',
  'a foreign number keeps its country code through masking'
);

select lives_ok(
  $$ select public.rpc_data_request_create('erasure', '+254700000901') $$,
  'a guest can ask to be erased'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';

/* Identity first. Always. */
select throws_ok(
  $$ select public.rpc_data_request_anonymise(
       (select id from public.data_request limit 1)) $$,
  'Cannot anonymise yet: Identity has not been verified yet.',
  'nothing is erased before we know who is asking'
);

reset role;
update public.data_request set guest_id = 'dddd0001-0000-4000-8000-00000000000a',
       identity_verified_at = now(), identity_method = 'otp';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.rpc_data_request_anonymise((select id from public.data_request limit 1)) $$,
  'once identity is verified, the erasure goes through'
);

reset role;

select is(
  (select phone from public.guest where id = 'dddd0001-0000-4000-8000-00000000000a'),
  null,
  'the phone number is gone'
);

/*
 * And the money is not. Anonymise, never delete — the folio line still
 * exists with its amount, because finance records inside their
 * retention period may not be destroyed.
 */
select is(
  (select count(*)::int from public.folio_posting where order_reference = 'NX-1'),
  1,
  'the order and its amount survive, because the books have to balance'
);

select * from finish();
rollback;
