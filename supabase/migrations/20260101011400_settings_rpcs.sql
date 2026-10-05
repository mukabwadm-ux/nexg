-- Changing a setting.
--
-- The whole module is one sentence: nothing in this platform changes
-- a live number silently. A change is drafted, costed, submitted,
-- approved by somebody else, scheduled for the next midnight, and
-- then activated by a cron that writes an audit event — and every
-- step of that is here, because a rule enforced in a React form is
-- not a rule.
--
-- Two roles arrive with it. `legal` and `tech` are named throughout
-- the approval pairs and exist nowhere in the role table, so a legal
-- publication would have been unapprovable.

insert into public.role (key, label, description)
values
  ('legal', 'Legal', 'Publishes terms and agreements. Second approver on every legal document.'),
  ('tech', 'Tech', 'Provider integrations, secrets and key rotation. Never sees a secret value — only its reference.')
on conflict (key) do nothing;

insert into public.role_module_access (role_key, module_key, level, note)
values
  ('legal', 'settings', 'limited', 'Legal documents only.'),
  ('tech', 'settings', 'limited', 'Integrations, keys and webhooks only.'),
  ('legal', 'audit', 'own_actions', 'What they did.'),
  ('tech', 'audit', 'own_actions', 'What they did.')
on conflict (role_key, module_key) do nothing;

do $$ begin
  alter type public.approval_kind add value if not exists 'settings_change';
exception when duplicate_object then null; end $$;

-- ═══════════════════════════════ who is allowed to ask

/*
 * A pair is written as `a+b` or `single:role`. Resolving it to "may
 * this person request" and "may this person approve" happens here
 * and nowhere else, so the console's lock icons and the database's
 * refusals cannot disagree.
 */
create or replace function settings.fn_pair_roles(p_pair text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_pair like 'single:%' then array[split_part(p_pair, ':', 2)]
    else string_to_array(p_pair, '+')
  end
$$;

create or replace function settings.fn_may_edit(p_group text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or exists (
        select 1
        from settings.approval_policy p,
             lateral unnest(settings.fn_pair_roles(p.pair)) r
        where p."group" = p_group and authz.has_role(r, null))
$$;

comment on function settings.fn_may_edit is
  'Whether this person may draft a change in this group. The console reads it for the lock icons and the RPCs enforce it, so the two cannot disagree about who is allowed to do what.';

/*
 * The pair a change set actually needs: the strictest key in it
 * wins. A set mixing a tone line with a commission is a commission
 * change, because approving it approves both.
 */
create or replace function settings.fn_required_pair(p_change_set uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pair text := 'single:ops_manager';
  v_rank integer := 0;
  r record;
  v_this_rank integer;
begin
  for r in
    select distinct coalesce(ap_key.pair, ap_grp.pair, 'single:ops_manager') as pair,
           d.sensitive
    from settings.version v
    join settings.definition d on d.key = v.key
    left join settings.approval_policy ap_key on ap_key.key = d.key
    left join settings.approval_policy ap_grp on ap_grp."group" = d."group"
    where v.change_set_id = p_change_set
  loop
    v_this_rank := case
      when r.pair like 'super_admin+%' then 4
      when r.pair = 'legal+super_admin' then 4
      when r.pair like '%+super_admin' then 4
      when r.pair not like 'single:%' then 3
      when r.sensitive then 2
      else 1
    end;
    if v_this_rank > v_rank then
      v_rank := v_this_rank;
      v_pair := r.pair;
    end if;
  end loop;

  return v_pair;
end;
$$;

comment on function settings.fn_required_pair is
  'The strictest key in the set wins. A set mixing a tone line with a commission is a commission change, because approving it approves both.';

-- ═══════════════════════════════════════ what it will cost

/*
 * The impact preview, computed at submit so the approver reads
 * exactly the numbers the requester saw rather than recomputing them
 * against a board that has since moved.
 *
 * It reports only what this database can actually count. There is no
 * orders domain, so "orders a day at this fee" is absent rather than
 * zero — an approver shown a confident 0 would conclude the change
 * affects nobody.
 */
create or replace function settings.fn_impact(
  p_key text, p_city_id uuid, p_category text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  d settings.definition;
  v jsonb := '{}'::jsonb;
begin
  select * into d from settings.definition where key = p_key;
  if not found then return jsonb_build_object('unknown_key', true); end if;

  if d."group" = 'fees' then
    v := v || jsonb_build_object(
      'merchants', (
        select count(*) from public.merchant m
        where m.status = 'live'
          and (p_city_id is null or m.city_id = p_city_id)),
      /* Orders need an orders domain. Absent, not zero: an approver
         shown a confident 0 concludes the change affects nobody. */
      'orders_30d', null,
      'guest_fee_delta', null);
  end if;

  if d."group" in ('dispatch', 'settlement') then
    v := v || jsonb_build_object(
      'riders', (
        select count(*) from public.rider r
        where r.status = 'active'
          and (p_city_id is null or r.city_id = p_city_id)));
  end if;

  if d."group" = 'cities' then
    v := v || jsonb_build_object(
      'zones', (select count(*) from public.zone z
                where p_city_id is null or z.city_id = p_city_id));
  end if;

  v := v || jsonb_build_object(
    'reader_modules', to_jsonb(d.reader_modules),
    'sensitive', d.sensitive,
    'scope', coalesce(p_category, '') );

  return v;
end;
$$;

-- ════════════════════════════════════ drafting a change

create or replace function settings.rpc_change_set_open(
  p_group text, p_city_id uuid default null
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
  if not settings.fn_may_edit(p_group) then
    raise exception 'You cannot edit % settings.', p_group using errcode = '42501';
  end if;

  /* One open draft per person per group and city. Two drafts of the
     same screen is how half a change gets submitted. */
  select id into v_id from settings.change_set
   where status = 'draft' and requested_by = v_me
     and "group" = p_group
     and city_id is not distinct from p_city_id;

  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'resumed', true);
  end if;

  insert into settings.change_set ("group", city_id, title, requested_by)
  values (p_group, p_city_id,
          initcap(p_group) || coalesce(' · ' || (select name from public.city where id = p_city_id), ''),
          v_me)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/*
 * Stage one value. Validates against the registry's constraints,
 * records the before and after, and refuses a key the registry does
 * not know — which is what keeps a typo from becoming a setting.
 */
create or replace function settings.rpc_change_set_put(
  p_change_set uuid,
  p_key text,
  p_value jsonb,
  p_city_id uuid default null,
  p_zone_id uuid default null,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  cs settings.change_set;
  d settings.definition;
  v_scope settings.scope_kind;
  v_before jsonb;
  v_label text;
  v_num numeric;
  v_count integer;
begin
  select * into cs from settings.change_set where id = p_change_set;
  if not found or cs.status <> 'draft' then
    raise exception 'That change set is not open for editing.';
  end if;
  if cs.requested_by <> v_me then
    raise exception 'That is somebody else''s draft.' using errcode = '42501';
  end if;

  select * into d from settings.definition where key = p_key;
  if not found then
    raise exception 'There is no setting called %. A key has to be in the registry before it can be written — that is what stops a typo becoming a setting.', p_key;
  end if;
  if d."group" <> cs."group" then
    raise exception 'Setting % belongs to the % group, not %.', p_key, d."group", cs."group";
  end if;

  v_scope := d.scope_kind;

  /* Type and range, from the registry rather than from the form. */
  if p_value is not null and jsonb_typeof(p_value) <> 'null' then
    if d.value_type in ('int', 'money', 'pct') then
      begin
        v_num := (p_value #>> '{}')::numeric;
      exception when others then
        raise exception '% expects a number.', d.label;
      end;
      if d.value_type = 'pct' and (v_num < 0 or v_num > 100) then
        raise exception '% is a percentage — it has to be between 0 and 100.', d.label;
      end if;
      if d.value_type = 'money' and v_num < 0 then
        raise exception '% cannot be negative.', d.label;
      end if;
      if d.constraints ? 'min' and v_num < (d.constraints ->> 'min')::numeric then
        raise exception '% has a minimum of %.', d.label, d.constraints ->> 'min';
      end if;
      if d.constraints ? 'max' and v_num > (d.constraints ->> 'max')::numeric then
        raise exception '% has a maximum of %.', d.label, d.constraints ->> 'max';
      end if;
    elsif d.value_type = 'bool' and jsonb_typeof(p_value) <> 'boolean' then
      raise exception '% is a yes or no.', d.label;
    elsif d.value_type = 'enum' and d.constraints ? 'enum'
          and not (d.constraints -> 'enum' @> jsonb_build_array(p_value #>> '{}')) then
      raise exception '% must be one of %.', d.label, d.constraints ->> 'enum';
    end if;
  end if;

  v_before := settings.fn_get(p_key, v_scope, p_city_id, p_zone_id, p_category) -> 'value';

  /* Staging a value identical to the live one is not a change, and
     counting it would make the Unsaved badge lie. */
  if v_before is not distinct from p_value then
    delete from settings.version
     where change_set_id = p_change_set and key = p_key
       and scope_city_id is not distinct from p_city_id
       and scope_zone_id is not distinct from p_zone_id
       and scope_category is not distinct from p_category;

    update settings.change_set
       set diff = diff - (p_key || coalesce(':' || p_category, '')),
           impact = impact - (p_key || coalesce(':' || p_category, ''))
     where id = p_change_set;

    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  /* Replace any earlier staging of the same key and scope. */
  delete from settings.version
   where change_set_id = p_change_set and key = p_key
     and scope_city_id is not distinct from p_city_id
     and scope_zone_id is not distinct from p_zone_id
     and scope_category is not distinct from p_category;

  insert into settings.version (
    key, scope_kind, scope_city_id, scope_zone_id, scope_category,
    value, status, change_set_id, created_by)
  values (p_key, v_scope, p_city_id, p_zone_id, p_category,
          p_value, 'draft', p_change_set, v_me);

  v_label := p_key || coalesce(':' || p_category, '');
  select count(*) + 1 into v_count
    from jsonb_object_keys(cs.diff) k where k <> v_label;

  update settings.change_set
     set diff = diff || jsonb_build_object(v_label, jsonb_build_object(
           'label', d.label,
           'from', v_before,
           'to', p_value,
           'unit', d.unit,
           'scope', v_scope::text,
           'sensitive', d.sensitive)),
         impact = impact || jsonb_build_object(
           v_label, settings.fn_impact(p_key, p_city_id, p_category)),
         title = initcap(cs."group")
                 || coalesce(' · ' || (select name from public.city where id = cs.city_id), '')
                 || ' · ' || v_count
                 || case when v_count = 1 then ' change' else ' changes' end
   where id = p_change_set;

  return jsonb_build_object('ok', true, 'from', v_before, 'to', p_value);
end;
$$;

create or replace function settings.rpc_change_set_discard(p_change_set uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare cs settings.change_set;
begin
  select * into cs from settings.change_set where id = p_change_set;
  if not found then raise exception 'No such change set.'; end if;
  if cs.status not in ('draft', 'awaiting_approval') then
    raise exception 'That change has already been decided. Roll it back rather than discarding it.';
  end if;
  if cs.requested_by <> authz.staff_id() and not authz.is_super_admin() then
    raise exception 'That is somebody else''s draft.' using errcode = '42501';
  end if;

  delete from settings.version where change_set_id = p_change_set and status = 'draft';
  update settings.change_set set status = 'cancelled', cancelled_at = now()
   where id = p_change_set;

  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════════ submitting

create or replace function settings.rpc_change_set_submit(
  p_change_set uuid,
  p_effective_from timestamptz default null,
  p_immediate boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  cs settings.change_set;
  v_pair text;
  v_blockers text;
  v_effective timestamptz;
  v_tz text;
  v_approval uuid;
  v_n integer;
begin
  select * into cs from settings.change_set where id = p_change_set;
  if not found or cs.status <> 'draft' then
    raise exception 'That change set is not a draft.';
  end if;
  if cs.requested_by <> v_me then
    raise exception 'That is somebody else''s draft.' using errcode = '42501';
  end if;

  select count(*) into v_n from settings.version where change_set_id = p_change_set;
  if v_n = 0 then
    raise exception 'Nothing has changed. There is nothing to approve.';
  end if;

  /* Immediate is a privilege per key, not per person. */
  if p_immediate then
    select string_agg(d.label, ', ') into v_blockers
      from settings.version v
      join settings.definition d on d.key = v.key
     where v.change_set_id = p_change_set and not d.can_be_immediate;

    if v_blockers is not null then
      raise exception 'These cannot take effect immediately: %. A price that changes mid-afternoon means two guests paid different amounts for the same thing on the same day.', v_blockers;
    end if;
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'An immediate change needs a reason. It is read by whoever asks why the number moved today.';
    end if;
  end if;

  /*
   * The next midnight in the city's own timezone — so merchants,
   * riders and guests all see one fee for one day. A global change
   * uses Nairobi, which is where the company is.
   */
  if p_immediate then
    v_effective := now();
  elsif p_effective_from is not null then
    v_effective := p_effective_from;
  else
    select coalesce(c.timezone, 'Africa/Nairobi') into v_tz
      from public.city c where c.id = cs.city_id;
    v_tz := coalesce(v_tz, 'Africa/Nairobi');
    v_effective := (date_trunc('day', now() at time zone v_tz) + interval '1 day') at time zone v_tz;
  end if;

  v_pair := settings.fn_required_pair(p_change_set);

  update settings.change_set
     set status = 'awaiting_approval',
         effective_from = v_effective,
         immediate = p_immediate,
         reason = p_reason,
         requested_at = now()
   where id = p_change_set;

  update settings.version
     set status = 'awaiting_approval', effective_from = v_effective, immediate = p_immediate
   where change_set_id = p_change_set;

  /*
   * Through the existing approvals queue rather than a second one.
   * Approvers already have a place they look; a settings-only inbox
   * would be a place they learn not to.
   */
  if v_pair not like 'single:%' then
    insert into public.approval_request (kind, target_type, target_id, city_id, requested_by, reason, payload)
    values ('settings_change', 'settings_change_set', p_change_set, cs.city_id, v_me,
            coalesce(p_reason, cs.title),
            jsonb_build_object('pair', v_pair, 'diff', cs.diff, 'impact', cs.impact,
                               'effective_from', v_effective, 'immediate', p_immediate))
    returning id into v_approval;

    update settings.change_set set approval_request_id = v_approval where id = p_change_set;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'settings.change_requested', p_actor_id => v_me,
    p_target_type => 'change_set', p_target_id => p_change_set,
    p_target_label => cs.title, p_reason => p_reason,
    p_city_id => cs.city_id,
    p_severity => case when v_pair like 'single:%' then 'notice' else 'high' end::public.audit_severity,
    p_after => jsonb_build_object('diff', cs.diff, 'pair', v_pair,
                                  'effective_from', v_effective, 'immediate', p_immediate));

  return jsonb_build_object('ok', true, 'pair', v_pair, 'effective_from', v_effective,
    'changes', v_n,
    'single_person', v_pair like 'single:%');
end;
$$;

-- ═══════════════════════════════════════════ approving

create or replace function settings.rpc_change_set_approve(p_change_set uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  cs settings.change_set;
  v_pair text;
  v_roles text[];
  v_ok boolean := false;
  r text;
begin
  select * into cs from settings.change_set where id = p_change_set;
  if not found or cs.status <> 'awaiting_approval' then
    raise exception 'That change is not waiting for approval.';
  end if;

  v_pair := settings.fn_required_pair(p_change_set);
  v_roles := settings.fn_pair_roles(v_pair);

  /*
   * The second person must be a different person. Checked by id,
   * never by role: somebody holding both Finance and Ops would
   * otherwise approve their own work and the pair would mean
   * nothing.
   */
  if v_pair not like 'single:%' and cs.requested_by = v_me then
    raise exception 'Somebody else has to approve this. Holding both roles is not two people.';
  end if;

  if authz.is_super_admin() then
    v_ok := true;
  else
    foreach r in array v_roles loop
      if authz.has_role(r, cs.city_id) or authz.has_role(r, null) then v_ok := true; end if;
    end loop;
  end if;

  if not v_ok then
    raise exception 'This needs % to approve it.', v_pair using errcode = '42501';
  end if;

  update settings.change_set
     /* The cast wraps the whole CASE: a CASE yields text and will
        not bind to an enum column, which is a runtime error in a
        function body rather than a compile-time one. */
     set status = (case when cs.immediate then 'approved' else 'scheduled' end)::settings.change_status,
         approved_by = v_me, approved_at = now()
   where id = p_change_set;

  update settings.version
     set status = 'scheduled', approved_by = v_me, approved_at = now()
   where change_set_id = p_change_set;

  if cs.approval_request_id is not null then
    update public.approval_request
       set status = 'approved', decided_by = v_me, decided_at = now()
     where id = cs.approval_request_id;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'settings.change_approved', p_actor_id => v_me,
    p_target_type => 'change_set', p_target_id => p_change_set,
    p_target_label => cs.title, p_approved_by => cs.requested_by,
    p_city_id => cs.city_id, p_severity => 'high',
    p_before => (select jsonb_object_agg(k, cs.diff -> k -> 'from') from jsonb_object_keys(cs.diff) k),
    p_after => (select jsonb_object_agg(k, cs.diff -> k -> 'to') from jsonb_object_keys(cs.diff) k));

  /* Immediate changes do not wait for the cron. */
  if cs.immediate then
    perform settings.cron_activate();
  end if;

  return jsonb_build_object('ok', true, 'effective_from', cs.effective_from,
    'immediate', cs.immediate);
end;
$$;

create or replace function settings.rpc_change_set_reject(p_change_set uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  cs settings.change_set;
begin
  select * into cs from settings.change_set where id = p_change_set;
  if not found or cs.status <> 'awaiting_approval' then
    raise exception 'That change is not waiting for approval.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. The person who asked has to know what to change.';
  end if;

  update settings.change_set
     set status = 'rejected', rejected_reason = p_reason,
         approved_by = null, approved_at = null
   where id = p_change_set;

  update settings.version set status = 'rejected' where change_set_id = p_change_set;

  if cs.approval_request_id is not null then
    update public.approval_request
       set status = 'rejected', decided_by = v_me, decided_at = now(), decision_note = p_reason
     where id = cs.approval_request_id;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'settings.change_rejected', p_actor_id => v_me,
    p_target_type => 'change_set', p_target_id => p_change_set,
    p_target_label => cs.title, p_reason => p_reason, p_city_id => cs.city_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- ════════════════════════════════════════════ activation

/*
 * The minute hand. Scheduled versions whose time has come become
 * active; whatever they replace becomes superseded rather than
 * deleted, so a past moment still resolves.
 */
create or replace function settings.cron_activate()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_activated integer := 0;
  v_sets uuid[] := '{}';
begin
  for v in
    select * from settings.version
     where status = 'scheduled' and effective_from <= now()
     order by effective_from, created_at
  loop
    update settings.version
       set status = 'superseded', superseded_at = now(), superseded_by = v.id
     where status = 'active'
       and key = v.key
       and scope_kind = v.scope_kind
       and scope_city_id is not distinct from v.scope_city_id
       and scope_zone_id is not distinct from v.scope_zone_id
       and scope_category is not distinct from v.scope_category;

    update settings.version
       set status = 'active', activated_at = now()
     where id = v.id;

    v_activated := v_activated + 1;
    if v.change_set_id is not null and not (v.change_set_id = any (v_sets)) then
      v_sets := v_sets || v.change_set_id;
    end if;
  end loop;

  update settings.change_set
     set status = 'applied', applied_at = now()
   where id = any (v_sets) and status in ('approved', 'scheduled');

  if v_activated > 0 then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'settings',
      p_action => 'settings.activated',
      p_actor_label => '[System] · settings',
      p_severity => 'high',
      p_after => jsonb_build_object('versions', v_activated, 'change_sets', to_jsonb(v_sets)));
  end if;

  return jsonb_build_object('ok', true, 'activated', v_activated,
    'change_sets', to_jsonb(v_sets));
end;
$$;

/* The daily photograph, at midnight, per city. */
create or replace function settings.cron_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  insert into settings.snapshot_daily (city_id, day, resolved)
  select c.id, (now() at time zone coalesce(c.timezone, 'Africa/Nairobi'))::date,
         settings.fn_resolve_all(c.id)
  from public.city c
  on conflict (city_id, day) do update set resolved = excluded.resolved, written_at = now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'cities', v_n);
end;
$$;

-- ════════════════════════════════════════════ rollback

create or replace function settings.rpc_rollback(p_version_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v settings.version;
  d settings.definition;
  v_previous settings.version;
  v_new uuid;
begin
  select * into v from settings.version where id = p_version_id;
  if not found then raise exception 'No such version.'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A rollback needs a reason.';
  end if;

  select * into d from settings.definition where key = v.key;
  if not settings.fn_may_edit(d."group") then
    raise exception 'You cannot edit % settings.', d."group" using errcode = '42501';
  end if;

  /* What was in force before this version took over. */
  select * into v_previous from settings.version
   where key = v.key and scope_kind = v.scope_kind
     and scope_city_id is not distinct from v.scope_city_id
     and scope_zone_id is not distinct from v.scope_zone_id
     and scope_category is not distinct from v.scope_category
     and superseded_by = v.id
   order by effective_from desc limit 1;

  /*
   * No previous version means this was the first value the setting
   * ever had — and before that it was unset. Refusing here would
   * mean a fee typed in by mistake could be changed but never
   * removed, so rolling back a first version returns it to unset,
   * which is exactly what was true before.
   */
  if not found then
    v_previous.value := null;
  end if;

  /*
   * A rollback is a new version with the old value, never an
   * erasure. The history has to show that somebody went back, and
   * when, and why.
   */
  insert into settings.version (
    key, scope_kind, scope_city_id, scope_zone_id, scope_category,
    value, status, effective_from, immediate, reason,
    created_by, approved_by, approved_at, rolled_back_from)
  values (
    v.key, v.scope_kind, v.scope_city_id, v.scope_zone_id, v.scope_category,
    v_previous.value, 'scheduled', now(), true,
    case when v_previous.id is null
         then p_reason || ' (returned to unset — there was no earlier value)'
         else p_reason end,
    v_me, v_me, now(), v.id)
  returning id into v_new;

  perform settings.cron_activate();

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'settings.rolled_back', p_actor_id => v_me,
    p_target_type => 'setting', p_target_label => v.key,
    p_reason => p_reason, p_city_id => v.scope_city_id, p_severity => 'high',
    p_before => v.value, p_after => v_previous.value);

  return jsonb_build_object('ok', true, 'version_id', v_new, 'value', v_previous.value);
end;
$$;

-- ══════════════════════════════════════════ comparing

create or replace function settings.rpc_compare(
  p_city_a uuid, p_city_b uuid, p_group text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', d.key,
    'label', d.label,
    'group', d."group",
    'unit', d.unit,
    'a', settings.fn_get(d.key, 'city', p_city_a) -> 'value',
    'b', settings.fn_get(d.key, 'city', p_city_b) -> 'value',
    'differs', (settings.fn_get(d.key, 'city', p_city_a) -> 'value')
               is distinct from (settings.fn_get(d.key, 'city', p_city_b) -> 'value')
  ) order by d.sort), '[]'::jsonb)
  from settings.definition d
  where d.scope_kind = 'city'
    and d.deprecated_at is null
    and (p_group is null or d."group" = p_group)
$$;

grant execute on function settings.fn_may_edit(text) to authenticated;
grant execute on function settings.fn_required_pair(uuid) to authenticated;
grant execute on function settings.fn_impact(text, uuid, text) to authenticated;
grant execute on function settings.fn_pair_roles(text) to authenticated;
grant execute on function settings.rpc_change_set_open(text, uuid) to authenticated;
grant execute on function settings.rpc_change_set_put(uuid, text, jsonb, uuid, uuid, text) to authenticated;
grant execute on function settings.rpc_change_set_discard(uuid) to authenticated;
grant execute on function settings.rpc_change_set_submit(uuid, timestamptz, boolean, text) to authenticated;
grant execute on function settings.rpc_change_set_approve(uuid) to authenticated;
grant execute on function settings.rpc_change_set_reject(uuid, text) to authenticated;
grant execute on function settings.rpc_rollback(uuid, text) to authenticated;
grant execute on function settings.rpc_compare(uuid, uuid, text) to authenticated;
grant execute on function settings.cron_activate() to authenticated, service_role;
grant execute on function settings.cron_snapshot() to service_role;
