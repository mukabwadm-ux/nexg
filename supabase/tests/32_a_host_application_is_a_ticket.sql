-- A host application is a ticket.
--
-- The "List your Airbnb" form wrote a host record and stopped there.
-- The record was correct and it was work nobody was doing: it sat in
-- `public.host` for the Hotels console, with no status anybody moved,
-- no owner, no clock and no reference the person who applied could
-- quote on the phone.
--
-- These tests are about the wiring, and about the one thing that
-- matters most in it: the host record and the desk ticket are written
-- in the same transaction, so an application cannot land where nobody
-- is working on it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

/* Carries the reference between statements. */
create temp table t (k text primary key, v text);

do $grant$
begin
  execute format('grant usage on schema %I to anon',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to anon;

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

-- fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','c1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','ht.desk@nexgapp.com','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name)
values ('cccccccc-0000-0000-0000-00000000000a','c1111111-1111-1111-1111-111111111111',
        'ht.desk@nexgapp.com','Host desk');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key='ops_manager'),
       (select id from public.city where slug='nairobi'), s.id
from public.staff_user s where s.email = 'ht.desk@nexgapp.com';

-- the form

select lives_ok(
  $$ select public.rpc_host_apply(jsonb_build_object(
       'phone', '+254700009001', 'contact_name', '[Host]',
       'email', 'host@example.test', 'kind', 'multi_unit',
       'units_band', '2_5', 'handoff', 'lockbox',
       'listing_link', 'airbnb.com/rooms/abc',
       'address', '[Address], Kilimani', 'city', 'nairobi')) $$,
  'a host can apply from the public page'
);

-- and the desk has it

select is(
  (select count(*)::int from public.support_ticket
    where phone = '+254700009001' and from_role = 'hotel' and topic = 'hotel_partnership'),
  1,
  'the application raised exactly one support ticket'
);

select is(
  (select source_form from public.support_ticket where phone = '+254700009001'),
  'host_landing',
  'and it says which form it came from'
);

select is(
  (select status::text from public.support_ticket where phone = '+254700009001'),
  'open',
  'and it starts open, so it is somebody''s to work'
);

select is(
  (select details ->> 'units_band' from public.support_ticket where phone = '+254700009001'),
  '2_5',
  'the answers are carried as fields, not prose to parse'
);

select is(
  (select details ->> 'handoff' from public.support_ticket where phone = '+254700009001'),
  'lockbox',
  'including how they want riders to hand over'
);

select is(
  (select details ->> 'host_id' from public.support_ticket where phone = '+254700009001'),
  (select id::text from public.host where phone = '+254700009001'),
  'and the ticket points at the host record, so the desk can verify'
);

-- the reference goes back

/*
 * Split across two statements on purpose. A statement sees one
 * snapshot, so a row written by the first half of a comparison is
 * invisible to the second half of it.
 */
insert into t (k, v)
select 'reference', public.rpc_host_apply(jsonb_build_object(
         'phone', '+254700009002', 'contact_name', '[Host Two]',
         'address', '[Address], Westlands', 'city', 'nairobi')) ->> 'ticket_reference';

select is(
  (select v from t where k = 'reference'),
  (select reference from public.support_ticket where phone = '+254700009002'),
  'the caller is handed the reference, so they can quote it'
);

-- the form is the public one

/*
 * The form on the page runs on the anonymous key, so that is the path
 * that has to work. It is also the path where a mistake would leak:
 * the ticket holds a name, a phone number and an address.
 */
set local role anon;

insert into t (k, v)
select 'anon_reference', public.rpc_host_apply(jsonb_build_object(
         'phone', '+254700009003', 'contact_name', '[Host Three]',
         'email', 'three@example.test', 'kind', 'property_manager',
         'units_band', '20_plus', 'handoff', 'guest_meets_at_gate',
         'address', '[Address], Lavington', 'city', 'nairobi')) ->> 'ticket_reference';

/*
 * Still the anonymous role here, on purpose: this is the question
 * that matters, which is whether the ticket can be read back by the
 * person who wrote it. A reference is the only thing that leaves.
 */
select is_empty(
  $$ select reference from public.support_ticket $$,
  'and the visitor cannot read the ticket back, only the reference goes out'
);

reset role;

select is(
  (select v from t where k = 'anon_reference'),
  (select reference from public.support_ticket where phone = '+254700009003'),
  'a visitor with no account can apply, and the desk still gets it'
);

select is(
  (select count(*)::int from public.support_ticket where phone = '+254700009003'),
  1,
  'and it is one ticket, not two'
);

-- and it is accounted for

select is(
  (select count(*)::int from audit.audit_event e
    where e.action = 'support.ticket_created'
      and e.after ->> 'reference' =
        (select reference from public.support_ticket where phone = '+254700009001')),
  1,
  'the ticket carries its own audit event, like every other one'
);

select * from finish();
rollback;
