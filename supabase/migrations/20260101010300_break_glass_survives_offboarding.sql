-- A break-glass record must outlive the person who opened it.
--
-- The first version used `on delete restrict`, reasoning that losing
-- who opened an emergency session would be worse than blocking a
-- delete. The reasoning was right and the mechanism was wrong: it
-- means a staff row can never be removed once that person has used
-- break-glass even once, and offboarding then fails with a foreign
-- key error from a table nobody in HR has heard of.
--
-- The audit event already solved this. It keeps `actor_label` — the
-- rendered identity — beside the id, precisely so that deleting the
-- staff row does not erase who did something. The break-glass record
-- does the same: the label stays, the key is released.

alter table audit.break_glass
  add column if not exists staff_label text;

/* Fill it for anything already recorded, before the key can go. */
update audit.break_glass b
   set staff_label = su.email
  from public.staff_user su
 where su.id = b.staff_user_id
   and b.staff_label is null;

alter table audit.break_glass
  alter column staff_user_id drop not null;

alter table audit.break_glass
  drop constraint if exists break_glass_staff_user_id_fkey;

alter table audit.break_glass
  add constraint break_glass_staff_user_id_fkey
  foreign key (staff_user_id) references public.staff_user (id) on delete set null;

/*
 * And the record is no longer anonymous when the key goes: one of the
 * two has to be there, and in practice both are.
 */
do $$ begin
  alter table audit.break_glass
    add constraint break_glass_names_somebody
    check (staff_user_id is not null or coalesce(trim(staff_label), '') <> '');
exception when duplicate_object then null; end $$;

comment on column audit.break_glass.staff_label is
  'Who opened it, rendered at the time. Survives the staff row being deleted, which is the whole point of recording it separately.';

/* The open RPC fills it, like `audit.log` does. */
create or replace function audit.rpc_break_glass_open(
  p_reason text, p_scope text, p_minutes integer default 60,
  p_module_key text default null, p_city_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_id uuid;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  if length(trim(coalesce(p_reason, ''))) < 20 then
    raise exception 'Write the emergency down — at least a sentence. This is read later by somebody who was not there.';
  end if;
  if coalesce(p_minutes, 0) < 5 or p_minutes > 480 then
    raise exception 'Between five minutes and eight hours. A longer emergency opens a new session with a fresh reason.';
  end if;

  if exists (select 1 from audit.break_glass b
             where b.staff_user_id = v_me and b.closed_at is null and b.expires_at > now()) then
    raise exception 'You already have one open. Close it first.';
  end if;

  insert into audit.break_glass
    (staff_user_id, staff_label, reason, scope, module_key, city_id, expires_at)
  values (v_me,
          (select email from public.staff_user where id = v_me),
          trim(p_reason), p_scope, p_module_key, p_city_id,
          now() + make_interval(mins => p_minutes))
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'staff',
    p_action => 'auth.break_glass_started', p_actor_id => v_me,
    p_target_type => 'break_glass', p_target_id => v_id,
    p_reason => trim(p_reason), p_severity => 'high',
    p_city_id => p_city_id,
    p_after => jsonb_build_object('scope', p_scope, 'module', p_module_key,
                                  'minutes', p_minutes));

  return jsonb_build_object('ok', true, 'id', v_id,
    'expires_at', now() + make_interval(mins => p_minutes));
end;
$$;

/* And the view reads the label when the staff row has gone. */
create or replace view audit.console_break_glass_v as
select
  b.id,
  b.staff_user_id,
  coalesce(su.display_name, b.staff_label, '[Removed]') as who,
  b.opened_at,
  audit.fn_ago(b.opened_at) as ago,
  b.reason,
  b.scope,
  b.module_key,
  b.city_id,
  c.name as city_name,
  b.expires_at,
  b.closed_at,
  b.closed_at is null and b.expires_at > now() as open_now,
  b.closed_at is null and b.expires_at <= now() as expired_unclosed,
  b.reviewed_by,
  rev.display_name as reviewed_by_name,
  b.reviewed_at,
  b.review_outcome,
  b.review_note,
  (select count(*) from audit.audit_event e
    where e.actor_id = b.staff_user_id
      and e.at between b.opened_at and coalesce(b.closed_at, b.expires_at)) as events_during
from audit.break_glass b
left join public.staff_user su on su.id = b.staff_user_id
left join public.staff_user rev on rev.id = b.reviewed_by
left join public.city c on c.id = b.city_id;

grant select on audit.console_break_glass_v to authenticated;
