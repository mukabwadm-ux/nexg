-- The append-only, hash-chained audit log — spec section 3.2.
--
-- Every row carries the hash of the row before it, so removing or editing an
-- event breaks the chain from that point on and audit.verify_chain() says
-- where. UPDATE and DELETE are refused for every role, service_role included.

create table audit.audit_event (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_type public.actor_type not null,
  actor_id uuid,
  actor_role text,
  session_id text,
  ip inet,
  user_agent text,
  module text not null,
  action text not null,
  target_type text,
  target_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  approved_by uuid,
  severity public.audit_severity not null default 'info',
  city_id uuid,
  prev_hash bytea,
  hash bytea not null
);

create index audit_event_at_idx on audit.audit_event (at desc);
create index audit_event_target_idx on audit.audit_event (target_type, target_id);
create index audit_event_action_idx on audit.audit_event (action, at desc);

comment on table audit.audit_event is
  'Append-only event log. Hash-chained; UPDATE and DELETE always raise.';

-- ------------------------------------------------------- canonical rendering
--
-- What gets hashed. jsonb orders its keys internally, so the same content
-- always renders the same text. Timestamps are pinned to UTC because the
-- default rendering of timestamptz follows the session TimeZone, and a
-- verification run in another timezone would otherwise disagree with the
-- writer about what was hashed.

create or replace function audit.canonical(e audit.audit_event)
returns text
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'at', to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor_type', e.actor_type,
    'actor_id', e.actor_id,
    'actor_role', e.actor_role,
    'session_id', e.session_id,
    'ip', host(e.ip),
    'user_agent', e.user_agent,
    'module', e.module,
    'action', e.action,
    'target_type', e.target_type,
    'target_id', e.target_id,
    'before', e.before,
    'after', e.after,
    'reason', e.reason,
    'approved_by', e.approved_by,
    'severity', e.severity,
    'city_id', e.city_id
  )::text
$$;

-- --------------------------------------------------------------- the chaining

create or replace function audit.tg_chain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prev bytea;
begin
  /*
   * Serialise appends. Without this, two concurrent inserts can both read the
   * same tail row as their predecessor and produce a fork that verify_chain()
   * would later report as tampering. The lock is transaction-scoped and only
   * contends with other audit writes.
   */
  perform pg_advisory_xact_lock(hashtext('audit.audit_event'));

  select e.hash into v_prev
  from audit.audit_event e
  order by e.id desc
  limit 1;

  new.prev_hash := v_prev;
  new.hash := extensions.digest(
    coalesce(v_prev, ''::bytea) || convert_to(audit.canonical(new), 'utf8'),
    'sha256'
  );

  return new;
end;
$$;

create trigger audit_event_chain
  before insert on audit.audit_event
  for each row execute function audit.tg_chain();

-- ---------------------------------------------------------------- immutability

create or replace function audit.tg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'audit.audit_event is append-only: % is not permitted (attempted by %).',
    tg_op, current_user
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_event_append_only
  before update or delete on audit.audit_event
  for each row execute function audit.tg_append_only();

-- Grants say the same thing the trigger does. Both, deliberately: the trigger
-- also stops the table owner and anyone who is later granted rights by mistake.
revoke all on audit.audit_event from public, anon, authenticated, service_role;
grant insert, select on audit.audit_event to service_role;
grant insert on audit.audit_event to authenticated;

-- ------------------------------------------------------------------ verifying

create table audit.chain_check (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  events_checked bigint not null,
  first_bad_id bigint,
  detail text
);

comment on table audit.chain_check is
  'Result of each nightly audit.verify_chain() run. A row with ok = false needs a human the same day.';

create or replace function audit.verify_chain()
returns table (ok boolean, events_checked bigint, first_bad_id bigint, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r audit.audit_event;
  v_expected_prev bytea := null;
  v_expected_hash bytea;
  v_count bigint := 0;
begin
  for r in select * from audit.audit_event order by id asc loop
    v_count := v_count + 1;

    if r.prev_hash is distinct from v_expected_prev then
      return query select
        false,
        v_count,
        r.id,
        format('Event %s points at the wrong predecessor: the chain was cut or a row was removed.', r.id);
      return;
    end if;

    v_expected_hash := extensions.digest(
      coalesce(v_expected_prev, ''::bytea) || convert_to(audit.canonical(r), 'utf8'),
      'sha256'
    );

    if r.hash is distinct from v_expected_hash then
      return query select
        false,
        v_count,
        r.id,
        format('Event %s does not match its own hash: its contents were altered.', r.id);
      return;
    end if;

    v_expected_prev := r.hash;
  end loop;

  return query select true, v_count, null::bigint, format('%s events verified.', v_count);
end;
$$;

comment on function audit.verify_chain is
  'Walks the log from the beginning recomputing hashes. Returns the first event that does not fit.';

-- ------------------------------------------------------------- the write path

create or replace function audit.log(
  p_actor_type public.actor_type,
  p_module text,
  p_action text,
  p_actor_id uuid default null,
  p_actor_role text default null,
  p_target_type text default null,
  p_target_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_approved_by uuid default null,
  p_severity public.audit_severity default 'info',
  p_city_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into audit.audit_event (
    actor_type, actor_id, actor_role, module, action,
    target_type, target_id, before, after, reason, approved_by, severity, city_id
  ) values (
    p_actor_type, p_actor_id, p_actor_role, p_module, p_action,
    p_target_type, p_target_id, p_before, p_after, p_reason, p_approved_by, p_severity, p_city_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function audit.log is
  'The one way to write an event. Called inside the same transaction as the change it records (ground rule 4).';

grant execute on function audit.log(
  public.actor_type, text, text, uuid, text, text, uuid, jsonb, jsonb, text, uuid,
  public.audit_severity, uuid
) to authenticated, service_role;

grant execute on function audit.verify_chain() to service_role;
