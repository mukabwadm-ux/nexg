-- Stays · what a guest may see, and what a request must carry.
--
-- The listing is the one place in this system where the database
-- decides what a stranger sees. Every assertion below is a way that
-- could go wrong: a paused unit still bookable, a property whose host
-- was suspended still on the website, an address or a gate code
-- leaking into a page anybody can load.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

set local app.secret_key = 'test-key-not-the-real-one';

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','e1111111-1111-1111-1111-111111111111',
        'authenticated','authenticated','st.host@example.test','',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('e2000000-0000-4000-8000-00000000000a','multi_unit','[Host]','+254700000700',
        (select id from public.city where slug='nairobi'),'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('e3000000-0000-4000-8000-00000000000a','e2000000-0000-4000-8000-00000000000a',
        'test-block','[Test Block]','apartment_block','Kilimani',
        (select id from public.city where slug='nairobi'), true, now());

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests,
                         nightly_rate_kes)
values
  ('e4000000-0000-4000-8000-00000000000a','e2000000-0000-4000-8000-00000000000a',
   'e3000000-0000-4000-8000-00000000000a','A1','A1','[Address]','Kilimani',
   (select id from public.city where slug='nairobi'),'lockbox','live', true, 1, 2, 7000),
  ('e4000000-0000-4000-8000-00000000000b','e2000000-0000-4000-8000-00000000000a',
   'e3000000-0000-4000-8000-00000000000a','A2','A2','[Address]','Kilimani',
   (select id from public.city where slug='nairobi'),'lockbox','live', true, 2, 4, 11000);

update public.unit set gate_code_encrypted = public.fn_encrypt_secret('9981')
where property_id = 'e3000000-0000-4000-8000-00000000000a';

-- ═════════════════════════════════════ what is public

select is(
  (select count(*)::int from public.property_public where slug = 'test-block'),
  1,
  'a listed property with a live listed unit is public'
);

select is(
  (select from_rate_kes from public.property_public where slug = 'test-block'),
  7000::bigint,
  '"from" is the cheapest unit, not the first one'
);

select is(
  (select units_available from public.property_public where slug = 'test-block'),
  2,
  'and it counts only the units a guest could actually take'
);

/*
 * The three conditions, each proved on its own, because each has a
 * different way of being forgotten.
 */
update public.unit set listed = false
where property_id = 'e3000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.property_public where slug = 'test-block'),
  0,
  'a property with no listed unit disappears — it is not a place anybody can stay'
);

update public.unit set listed = true
where property_id = 'e3000000-0000-4000-8000-00000000000a';
update public.unit set status = 'paused'
where id = 'e4000000-0000-4000-8000-00000000000a';

select is(
  (select units_available from public.property_public where slug = 'test-block'),
  1,
  'a paused unit drops out of the count'
);

select is(
  (select from_rate_kes from public.property_public where slug = 'test-block'),
  11000::bigint,
  'and out of the "from" price, so the cheapest shown is one you can book'
);

select is(
  (select count(*)::int from public.property_unit_public
   where id = 'e4000000-0000-4000-8000-00000000000a'),
  0,
  'and off the property page entirely'
);

update public.unit set status = 'live' where id = 'e4000000-0000-4000-8000-00000000000a';

/* A host who is no longer live takes their listings with them. */
update public.host set status = 'paused' where id = 'e2000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.property_public where slug = 'test-block'),
  0,
  'pausing the host removes the listing from the website in the same query'
);

update public.host set status = 'live' where id = 'e2000000-0000-4000-8000-00000000000a';

update public.property set listed = false where slug = 'test-block';

select is(
  (select count(*)::int from public.property_public where slug = 'test-block'),
  0,
  'and unlisting it does too'
);

update public.property set listed = true where slug = 'test-block';

-- ═══════════════════════════ what the public views do not carry

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public'
     and table_name in ('property_public', 'property_unit_public')
     and (column_name like '%gate_code%'
       or column_name like '%phone%'
       or column_name like '%askari%'
       or column_name like '%caretaker%'
       or column_name = 'address_line')),
  0,
  'no address, no gate code and no contact of any kind on a page anybody can load'
);

-- ═══════════════════════════════════════ stay requests

select throws_ok(
  $$ select public.rpc_stay_request_create('{"guests":2}'::jsonb) $$,
  'We need a phone number or an email, or we cannot come back to you.',
  'a request nobody can answer is refused'
);

select lives_ok(
  $$ select public.rpc_stay_request_create(
       '{"phone":"+254700000701","guests":3,"purpose":"family","must_haves":["Garden"]}'::jsonb) $$,
  'a reachable request is taken'
);

select is(
  (select count(*)::int from public.stay_request where requester_phone = '+254700000701'),
  1,
  'and lands in the queue'
);

/*
 * Won and lost are the two outcomes worth learning from, so neither
 * can be recorded without saying what happened.
 */
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select public.rpc_stay_request_update(
       (select id from public.stay_request where requester_phone = '+254700000701'),
       'lost', '  ') $$,
  'Not yours.',
  'and only hospitality staff can decide it'
);

select * from finish();
rollback;
