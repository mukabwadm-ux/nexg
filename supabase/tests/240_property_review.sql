-- Property review (20270323000100): a property shows to guests only after NexG
-- staff approve it; reject and suspend need a reason; every decision is audited.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e2400000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host240@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2400000-0000-4000-8000-000000000002',
   'authenticated','authenticated','manager240@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2400000-0000-4000-8000-000000000003',
   'authenticated','authenticated','ops240@nexgapp.com',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2400000-0000-4000-8000-000000000004',
   'authenticated','authenticated','finance240@nexgapp.com',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('e24000aa-0000-4000-8000-00000000000a','e2400000-0000-4000-8000-000000000003',
   'ops240@nexgapp.com','Ops 240'),
  ('e24000aa-0000-4000-8000-00000000000b','e2400000-0000-4000-8000-000000000004',
   'finance240@nexgapp.com','Finance 240');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select 'e24000aa-0000-4000-8000-00000000000a', (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), 'e24000aa-0000-4000-8000-00000000000a';

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('e2410000-0000-4000-8000-00000000000a','multi_unit','[Host 240]','+254700240000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role) values
  ('e2410000-0000-4000-8000-00000000000a','e2400000-0000-4000-8000-000000000001','owner'),
  ('e2410000-0000-4000-8000-00000000000a','e2400000-0000-4000-8000-000000000002','manager');

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('e2420000-0000-4000-8000-00000000000a','e2410000-0000-4000-8000-00000000000a',
        'block-240','Block 240','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());

/* A live, published, listed unit: everything but the review is in place. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes,
                         host_published, listed)
values ('e2430000-0000-4000-8000-00000000000a','e2410000-0000-4000-8000-00000000000a',
        'e2420000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, true, true);

create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.public_rows() returns integer language sql as $$
  select (select count(*)::int from public.property_public where id = 'e2420000-0000-4000-8000-00000000000a')
       + (select count(*)::int from public.property_unit_public where property_id = 'e2420000-0000-4000-8000-00000000000a');
$$;

-- ══════════════════════════════════════════ 1. new properties wait

select is((select review_status from public.property where id = 'e2420000-0000-4000-8000-00000000000a'),
  'pending', 'A new property starts waiting for review.');
select is((select listed from public.unit where id = 'e2430000-0000-4000-8000-00000000000a'),
  true, 'Its unit is listed (the review is the only thing missing).');
select is(pg_temp.public_rows(), 0, 'Guests see neither the property nor its unit.');
select throws_ok($$
  update public.property set review_status = 'rejected' where id = 'e2420000-0000-4000-8000-00000000000a'
$$, '23514', null, 'Rejected needs a reason, even written directly.');
select throws_ok($$
  update public.property set review_status = 'approved!' where id = 'e2420000-0000-4000-8000-00000000000a'
$$, '23514', null, 'Only the four review states are allowed.');

-- ══════════════════════════════════════════ 2. who may decide

set local role anon;
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'approve')
$$, '42501', null, 'Signed-out visitors cannot review.');
reset role;

set local role authenticated;
select pg_temp.as_user('e2400000-0000-4000-8000-000000000001');
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'approve')
$$, '42501', null, 'The host cannot approve their own property.');
select is((select count(*)::int from public.property_unit_public
            where property_id = 'e2420000-0000-4000-8000-00000000000a'), 0,
  'Nor do they see it as a guest would.');
select throws_ok($$ select * from public.rpc_property_team('e2420000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'The host cannot read the staff team list.');

select pg_temp.as_user('e2400000-0000-4000-8000-000000000004');
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'approve')
$$, '42501', null, 'Staff outside hospitality cannot approve.');

select pg_temp.as_user('e2400000-0000-4000-8000-000000000003');
select is((select blocked_reason from public.console_property_v
            where id = 'e2420000-0000-4000-8000-00000000000a'),
  'Waiting for NexG review', 'The console says why it is not showing.');

-- ══════════════════════════════════════════ 3. the decisions

select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'reject', '  ')
$$, '22023', null, 'Rejecting needs a reason.');
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'publish')
$$, '22023', null, 'An unknown decision is refused.');
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'suspend', 'Fake photos')
$$, '22023', null, 'A pending property cannot be suspended.');

select lives_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'reject',
    'The authority letter names a different building.')
$$, 'Staff reject with a reason.');
select results_eq($$
  select review_status, review_reason, reviewed_by from public.property
   where id = 'e2420000-0000-4000-8000-00000000000a'
$$, $$ values ('rejected'::text, 'The authority letter names a different building.'::text,
               'e24000aa-0000-4000-8000-00000000000a'::uuid) $$,
  'The reason and the reviewer are kept.');
select is((select blocked_reason from public.console_property_v
            where id = 'e2420000-0000-4000-8000-00000000000a'),
  'Rejected by NexG', 'The console shows the rejection.');
select is(pg_temp.public_rows(), 0, 'Still hidden from guests.');

select lives_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'approve')
$$, 'A rejected property can be approved once the host fixes it.');
select results_eq($$
  select review_status, review_reason from public.property
   where id = 'e2420000-0000-4000-8000-00000000000a'
$$, $$ values ('approved'::text, null::text) $$, 'Approved, and the old reason is cleared.');
select is(pg_temp.public_rows(), 2, 'Guests now see the property and its unit.');
select is((select review_status from public.console_property_v
            where id = 'e2420000-0000-4000-8000-00000000000a'),
  'approved', 'The console reads the status.');
select is((select reviewed_by_name from public.console_property_v
            where id = 'e2420000-0000-4000-8000-00000000000a'),
  'Ops 240', 'And who decided.');
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'approve')
$$, '22023', null, 'An approved property cannot be approved twice.');

select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'suspend')
$$, '22023', null, 'Suspending needs a reason.');
select lives_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'suspend',
    'Guest reported the flat is not the one in the photos.')
$$, 'Staff suspend an approved property with a reason.');
select is(pg_temp.public_rows(), 0, 'A suspended property leaves the site at once.');
select throws_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'approve')
$$, '22023', null, 'A suspended property is reinstated, not approved.');
select lives_ok($$
  select public.rpc_property_review('e2420000-0000-4000-8000-00000000000a', 'reinstate')
$$, 'Staff reinstate it.');
select is(pg_temp.public_rows(), 2, 'It is back on the site.');

-- ══════════════════════════════════════════ 4. the audit trail

reset role;
select results_eq($$
  select action, after->>'review_status', reason from audit.audit_event
   where target_type = 'property' and target_id = 'e2420000-0000-4000-8000-00000000000a'
     and action like 'property.%ed' and action <> 'property.listed'
   order by at, id
$$, $$ values
  ('property.rejected'::text, 'rejected'::text, 'The authority letter names a different building.'::text),
  ('property.approved', 'approved', null),
  ('property.suspended', 'suspended', 'Guest reported the flat is not the one in the photos.'),
  ('property.reinstated', 'approved', null) $$,
  'Every decision is in audit.log, with its reason.');
select is((select count(*)::int from audit.action_registry
            where action in ('property.approved', 'property.rejected',
                             'property.suspended', 'property.reinstated')),
  4, 'The four actions are registered.');

-- ══════════════════════════════════════════ 5. what staff read

insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, check_in, check_out,
                         source, status)
values ('e2440000-0000-4000-8000-00000000000a','e2410000-0000-4000-8000-00000000000a',
        'e2420000-0000-4000-8000-00000000000a','e2430000-0000-4000-8000-00000000000a','Amina',
        now() - interval '3 days', now() - interval '1 day', 'entered', 'departed');
insert into public.stay_review (stay_id, rating, text)
values ('e2440000-0000-4000-8000-00000000000a', 5, 'Exactly as described.');

set local role authenticated;
select pg_temp.as_user('e2400000-0000-4000-8000-000000000003');
select is((select rating from public.stay_review where stay_id = 'e2440000-0000-4000-8000-00000000000a'),
  5, 'Hospitality staff read the guests'' reviews.');
select results_eq($$
  select role, email from public.rpc_property_team('e2420000-0000-4000-8000-00000000000a')
$$, $$ values ('owner'::text, 'host240@example.test'::text),
              ('manager', 'manager240@example.test') $$,
  'Staff see the owner first, then the managers, with their emails.');

select pg_temp.as_user('e2400000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.stay_review
            where stay_id = 'e2440000-0000-4000-8000-00000000000a'),
  0, 'Staff outside hospitality do not.');
reset role;

select * from finish();
rollback;
