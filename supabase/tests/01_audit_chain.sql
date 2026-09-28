-- The audit log must be append-only and tamper-evident — spec section 3.2,
-- acceptance test 8.
--
-- Note on ids: the test transaction rolls back, but an identity sequence does
-- not, so the ids here differ on every run. Nothing below may hardcode one.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ------------------------------------------------------------- the structure

select has_schema('audit', 'the audit schema exists');
select has_table('audit', 'audit_event', 'audit.audit_event exists');
select has_column('audit', 'audit_event', 'prev_hash', 'events carry the previous hash');
select has_column('audit', 'audit_event', 'hash', 'events carry their own hash');

-- ----------------------------------------------------------- chaining works

do $do$
begin
  perform audit.log('system'::public.actor_type, 'test', 'test.one');
  perform audit.log('system'::public.actor_type, 'test', 'test.two');
  perform audit.log('system'::public.actor_type, 'test', 'test.three');
end
$do$;

select is(
  (select count(*)::int from audit.audit_event where module = 'test'),
  3,
  'three events were appended'
);

select is(
  (select count(*)::int from audit.audit_event where hash is null),
  0,
  'every event got a hash'
);

select is(
  (select prev_hash from audit.audit_event order by id asc limit 1),
  null,
  'the first event has no predecessor'
);

select is(
  (select e2.prev_hash
   from audit.audit_event e1
   join audit.audit_event e2 on e2.id = e1.id + 1
   order by e1.id asc limit 1),
  (select e1.hash from audit.audit_event e1 order by e1.id asc limit 1),
  'each event points at the hash of the one before it'
);

select ok(
  (select ok from audit.verify_chain()),
  'an untouched chain verifies'
);

select is(
  (select events_checked from audit.verify_chain()),
  (select count(*) from audit.audit_event),
  'verify_chain walks every event'
);

-- --------------------------------------------------------------- immutability

select throws_ok(
  format(
    $$update audit.audit_event set action = 'tampered' where id = %s$$,
    (select min(id) from audit.audit_event)
  ),
  '42501',
  null,
  'UPDATE on an audit event is refused'
);

select throws_ok(
  format(
    $$delete from audit.audit_event where id = %s$$,
    (select min(id) from audit.audit_event)
  ),
  '42501',
  null,
  'DELETE on an audit event is refused'
);

-- Even for service_role, which bypasses RLS everywhere else (acceptance test 8).
select throws_ok(
  format(
    $$set local role service_role; update audit.audit_event set action = 'tampered' where id = %s$$,
    (select min(id) from audit.audit_event)
  ),
  '42501',
  null,
  'service_role cannot update an audit event either'
);

select throws_ok(
  format(
    $$set local role service_role; delete from audit.audit_event where id = %s$$,
    (select min(id) from audit.audit_event)
  ),
  '42501',
  null,
  'service_role cannot delete an audit event either'
);
reset role;

-- --------------------------------------------- tampering is actually detected
--
-- The triggers block the ordinary routes, so to prove verify_chain() earns its
-- keep we disable them and corrupt a row the way a compromised superuser would.

alter table audit.audit_event disable trigger audit_event_append_only;

do $do$
declare
  v_second bigint;
begin
  select id into v_second from audit.audit_event order by id asc offset 1 limit 1;
  update audit.audit_event set action = 'quietly-changed' where id = v_second;
end
$do$;

alter table audit.audit_event enable trigger audit_event_append_only;

select is(
  (select first_bad_id from audit.verify_chain()),
  (select id from audit.audit_event order by id asc offset 1 limit 1),
  'verify_chain names the row that was altered'
);

select * from finish();
rollback;
