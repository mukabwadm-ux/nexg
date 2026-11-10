-- A stay request becomes a support ticket, and a complete unit lists itself.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','d5100000-0000-4000-8000-0000000000aa',
        'authenticated','authenticated','ops51@nexgapp.com',now(),now(),now());
insert into public.staff_user (id, user_id, email, display_name)
values ('d51000aa-0000-4000-8000-00000000000a','d5100000-0000-4000-8000-0000000000aa',
        'ops51@nexgapp.com','Ops 51');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), s.id
from public.staff_user s where s.email = 'ops51@nexgapp.com';

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;

-- ══════════════════════════════════════════ 1. a stay request is a ticket

set local role anon;
insert into t (k, v) select 'req', public.rpc_stay_request_create(jsonb_build_object(
  'name', 'Amina', 'email', 'amina51@example.test', 'city', 'nairobi',
  'areas', jsonb_build_array('Kilimani'), 'check_in', '2026-12-01', 'check_out', '2026-12-05',
  'guests', 2, 'budget', 8000))::text;
reset role;

select ok((select v::jsonb ->> 'ticket_reference' from t where k = 'req') like 'NX-T-%',
  'The guest gets a support ticket reference back with their stay request.');

select is(
  (select topic::text || '/' || from_role::text || '/' || source_form from public.support_ticket
    where reference = (select v::jsonb ->> 'ticket_reference' from t where k = 'req')),
  'concierge_request/guest/stays_request',
  'It lands in Support as a concierge request from a guest.');

select is(
  (select details ->> 'stay_request' || ' ' || (details ->> 'guests') from public.support_ticket
    where reference = (select v::jsonb ->> 'ticket_reference' from t where k = 'req')),
  (select v::jsonb ->> 'reference' from t where k = 'req') || ' 2',
  'The ticket carries the stay request and its details as fields.');

select is(
  (select r.ticket_id = s.id from public.stay_request r
     join public.support_ticket s on s.reference = (select v::jsonb ->> 'ticket_reference' from t where k = 'req')
    where r.reference = (select v::jsonb ->> 'reference' from t where k = 'req')),
  true,
  'And the stay request points at its ticket.');

-- ══════════════════════════════════════════ 2. a complete unit lists itself

insert into public.host (id, kind, display_name, phone, city_id, status)
values ('d5110000-0000-4000-8000-00000000000a','single_unit','[Host 51]','+254700051000',
        (select id from public.city where slug = 'nairobi'),'verifying');
insert into public.property (id, host_id, slug, name, kind, area, city_id)
values ('d5120000-0000-4000-8000-00000000000a','d5110000-0000-4000-8000-00000000000a',
        'block-51','Block 51','apartment_block','Kilimani',(select id from public.city where slug = 'nairobi'));
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes, photos)
values ('d5130000-0000-4000-8000-00000000000a','d5110000-0000-4000-8000-00000000000a',
        'd5120000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000,
        '[{"path":"d5110000-0000-4000-8000-00000000000a/d5130000-0000-4000-8000-00000000000a/a.jpg"}]'::jsonb);

select is(
  (select listed from public.unit where id = 'd5130000-0000-4000-8000-00000000000a'),
  false,
  'A complete unit is not listed while its host is still waiting for approval.');

update public.host set status = 'live', verified_at = now(), went_live_at = now()
 where id = 'd5110000-0000-4000-8000-00000000000a';

select is(
  (select u.listed and p.listed from public.unit u join public.property p on p.id = u.property_id
    where u.id = 'd5130000-0000-4000-8000-00000000000a'),
  true,
  'Once NexG approves the host, the unit and its property list themselves.');

select is(
  (select count(*)::int from public.property_unit_public where id = 'd5130000-0000-4000-8000-00000000000a'),
  1,
  'So the unit shows on /stays and the hosts page.');

update public.unit set nightly_rate_kes = null where id = 'd5130000-0000-4000-8000-00000000000a';
select is(
  (select listed from public.unit where id = 'd5130000-0000-4000-8000-00000000000a'),
  true,
  'Listing is only ever added automatically: a later edit never takes a unit off the site.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d5100000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select public.rpc_property_set_listed('d5120000-0000-4000-8000-00000000000a', false);
reset role;

update public.unit set max_guests = 3 where id = 'd5130000-0000-4000-8000-00000000000a';
select is(
  (select listed from public.property where id = 'd5120000-0000-4000-8000-00000000000a'),
  false,
  'A property staff unlisted stays unlisted when its unit is edited.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d5100000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select public.rpc_property_set_listed('d5120000-0000-4000-8000-00000000000a', true);
reset role;
select is(
  (select listed and unlisted_by_staff_at is null from public.property where id = 'd5120000-0000-4000-8000-00000000000a'),
  true,
  'Until staff list it again.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and (finding ilike '%stay_request%' or finding ilike '%listing%' or finding ilike '%property_set%')),
  0,
  'The wiring check is clean.');

select * from finish();
rollback;
