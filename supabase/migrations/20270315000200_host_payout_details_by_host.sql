-- Hosts enter their own payout details.
--
-- Until now only hospitality staff could say where a host is paid
-- (rpc_host_payout_declare, 20270122000100). A host now declares it
-- themselves from their workspace, and can see what NexG holds, masked.
-- Finance still verifies every new set of details before a run pays them
-- (rpc_host_payout_verify, unchanged), so a host's own change is held
-- exactly as a staff one is.
--
-- What changes:
--   1. host_payout gains declared_by_user (the host's sign-in, null for a
--      staff declaration) and kra_pin (optional, checked for shape). A
--      staff declaration clears declared_by_user, so the row always names
--      one declarer.
--   2. rpc_host_payout_declare_mine(p_host_id, p_payout): the host's owner
--      declares. Same rails, keys and checks as the staff function, plus an
--      optional kraPin. Declaring again clears the verification.
--      In-flight rule: in a run that has not made its payment files yet
--      (draft, built, checked, approved_1, approved_2), this host's lines
--      waiting to be paid (ready, approved, queued) go to held_kyc and the
--      run is recomputed, so nothing is paid on details Finance has not
--      checked. cash_netted lines are never touched. In a run whose files
--      are already made (files_generated, sending, sent) no line is changed:
--      a high-severity host.payout_changed_during_run entry tells Finance.
--      If the host owner is also active staff, declared_by is set too, so
--      they cannot verify their own details.
--   3. rpc_host_payout_mine(p_host_id): what NexG holds for the host, masked.
--      It never returns the full account number, phone number or KRA PIN.
--
-- This file does not depend on 20270315000100 (host sub-accounts). It reads
-- host_paystack_subaccount only when that table exists, by name.
--
-- Not changed here: the staff declaration does not hold in-flight lines
-- (a follow-up for Finance to decide).
--
-- Rollback, in this order:
--   drop function public.rpc_host_payout_declare_mine(uuid, jsonb),
--     public.rpc_host_payout_mine(uuid);
--   drop trigger if exists host_payout_one_declarer on public.host_payout;
--   drop function public.tg_host_payout_one_declarer();
--   alter table public.host_payout drop column kra_pin, drop column declared_by_user;
--   delete from audit.action_registry
--    where action in ('host.payout_declared_by_host', 'host.payout_changed_during_run');

-- ═════════════════════════════════════════════════════════════ 1. columns

alter table public.host_payout
  add column if not exists declared_by_user uuid references auth.users (id) on delete set null,
  add column if not exists kra_pin text
    constraint host_payout_kra_pin_shape check (kra_pin is null or kra_pin ~ '^[AP][0-9]{9}[A-Z]$');

comment on column public.host_payout.declared_by_user is
  'The host''s sign-in that declared these details. Null when hospitality staff declared them (declared_by).';
comment on column public.host_payout.kra_pin is
  'The host''s KRA PIN, when they gave one. Never returned to the host or written to the audit log.';

/*
 * One declarer per row. rpc_host_payout_declare (staff) sets declared_by and
 * does not know about declared_by_user, so a staff declaration after a host's
 * would otherwise keep the host's name on it. Both columns stay set only when
 * they name the same person: a host owner who is also active staff, which
 * rpc_host_payout_declare_mine records in both so that the self-verify check
 * in rpc_host_payout_verify (declared_by) still applies to them.
 */
create or replace function public.tg_host_payout_one_declarer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.declared_by is not null
     and new.declared_by_user is not null
     and not exists (select 1 from public.staff_user su
                      where su.id = new.declared_by
                        and su.user_id = new.declared_by_user) then
    new.declared_by_user := null;
  end if;
  return new;
end;
$$;

drop trigger if exists host_payout_one_declarer on public.host_payout;
create trigger host_payout_one_declarer before insert or update on public.host_payout
  for each row execute function public.tg_host_payout_one_declarer();

-- ═══════════════════════════════════════════════════ 2. what the host sees

/*
 * What NexG holds for a host, masked as the staff read masks it
 * (fn_experience_partner_payout_masked). Any account-wide member of the host.
 * Never the full number, phone or KRA PIN.
 */
create or replace function public.rpc_host_payout_mine(p_host_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.host_payout;
  v_verified boolean;
  v_has_sub boolean := false;
  v_note text;
begin
  if p_host_id is null or not authz.is_host_member(p_host_id) then
    raise exception 'You can only see payout details for your own host account.' using errcode = '42501';
  end if;

  select * into v_row from public.host_payout where host_id = p_host_id;
  if v_row.host_id is null then
    return jsonb_build_object('ok', true, 'payout', null);
  end if;

  v_verified := v_row.verified_version is not distinct from v_row.version;

  v_note := case when v_verified
    then 'NexG has checked these details. Payouts go here.'
    else 'NexG is checking these details. Payouts wait until they are checked, usually within 2 working days.'
  end;

  /* Read by name: the sub-account table comes from another migration and
     this one must not need it. */
  if v_row.rail in ('mpesa_till', 'mpesa_paybill') then
    if to_regclass('public.host_paystack_subaccount') is not null then
      execute 'select exists (select 1 from public.host_paystack_subaccount s
                               where s.host_id = $1 and s.status = ''active''
                                 and not s.is_test)'
        into v_has_sub using p_host_id;
    end if;
    if not coalesce(v_has_sub, false) then
      v_note := v_note || ' Paystack can only pay a bank account or an M-Pesa number directly, '
                || 'so you are paid in NexG''s weekly payout run.';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'payout', jsonb_build_object(
      'rail', v_row.rail,
      'destination_masked', public.fn_experience_partner_payout_masked(v_row.rail, v_row.account),
      'account_name', v_row.account ->> 'accountName',
      'bank_name', v_row.account ->> 'bankName',
      'kra_pin_set', v_row.kra_pin is not null,
      'version', v_row.version,
      'verified', v_verified,
      'declared_at', v_row.declared_at,
      'status_note', v_note));
end;
$$;

comment on function public.rpc_host_payout_mine(uuid) is
  'Host members: where NexG pays this host, masked, and whether Finance has checked it. Never the full number or the KRA PIN.';

-- ═══════════════════════════════════════════════ 3. the host declares

/*
 * The host's owner declares, or changes, where the host is paid. The rails,
 * keys and checks are copied from rpc_host_payout_declare (20270122000100)
 * with the wording addressed to the host, plus an optional kraPin: a string
 * sets it, an explicit null clears it, leaving the key out keeps it.
 *
 * Declaring again clears the verification. In-flight rule, by run state:
 *   - No payment file yet (draft, built, checked, approved_1, approved_2):
 *     this host's lines waiting to be paid (ready, approved, queued) go to
 *     held_kyc and the run is recomputed, which changes its hash, so
 *     approvals given before the change no longer apply. cash_netted lines
 *     are never touched.
 *   - Payment file already made (files_generated, sending, sent): no line is
 *     changed, since the file may already be at the bank or M-PESA. A
 *     high-severity host.payout_changed_during_run entry tells Finance, who
 *     decide whether to stop that payment.
 * If the owner is also active staff, declared_by is set as well as
 * declared_by_user, so rpc_host_payout_verify's self-verify check applies.
 * The account and the PIN are not written to the audit log; the masked
 * destination is.
 */
create or replace function public.rpc_host_payout_declare_mine(
  p_host_id uuid,
  p_payout jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  v_host public.host;
  v_old public.host_payout;
  v_new public.host_payout;
  v_rail text;
  v_keys text[];
  v_key text;
  v_payout jsonb;
  v_phone text;
  v_set_pin boolean := false;
  v_pin text;
  v_held integer := 0;
  v_runs uuid[];
  v_run uuid;
  v_sent_runs jsonb;
  v_sent integer := 0;
  v_note text;
begin
  if v_uid is null or p_host_id is null or not exists (
       select 1 from public.host_user hu
        where hu.host_id = p_host_id
          and hu.user_id = v_uid
          and hu.units is null
          and hu.role = 'owner') then
    raise exception 'Only the owner of this host account can change where NexG pays you.'
      using errcode = '42501';
  end if;

  select * into v_host from public.host where id = p_host_id;
  if v_host.id is null then
    raise exception 'That host no longer exists.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_payout) is distinct from 'object' or octet_length(p_payout::text) > 4096 then
    raise exception 'Enter your payout details.' using errcode = '22023';
  end if;

  /* The KRA PIN is optional and separate from the rail's fields. */
  if p_payout ? 'kraPin' then
    v_set_pin := true;
    if jsonb_typeof(p_payout -> 'kraPin') = 'null' then
      v_pin := null;
    elsif jsonb_typeof(p_payout -> 'kraPin') = 'string' then
      v_pin := upper(regexp_replace(p_payout ->> 'kraPin', '\s', '', 'g'));
      if v_pin = '' then
        v_pin := null;
      elsif v_pin !~ '^[AP][0-9]{9}[A-Z]$' then
        raise exception 'Enter your KRA PIN as it is on your certificate, such as A123456789B.'
          using errcode = '22023';
      end if;
    else
      raise exception 'Enter your KRA PIN as it is on your certificate, such as A123456789B.'
        using errcode = '22023';
    end if;
  end if;
  v_payout := p_payout - 'kraPin';

  v_rail := v_payout ->> 'rail';
  v_keys := case v_rail
    when 'mpesa_phone' then array['rail', 'phoneNumber', 'accountName']
    when 'mpesa_till' then array['rail', 'tillNumber']
    when 'mpesa_paybill' then array['rail', 'paybillNumber', 'accountReference']
    when 'bank' then array['rail', 'bankName', 'accountName', 'accountNumber']
  end;
  if v_keys is null then
    raise exception 'Choose how you want to be paid: M-PESA number, till, paybill or bank.'
      using errcode = '22023';
  end if;
  if not (v_payout ?& v_keys)
     or exists (select 1 from jsonb_object_keys(v_payout) k where k <> all (v_keys)) then
    raise exception 'Fill in the fields for that payout method, and only those.' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if jsonb_typeof(v_payout -> v_key) is distinct from 'string'
       or length(btrim(v_payout ->> v_key)) not between 1 and
          (case v_key when 'accountName' then 200
                      when 'rail' then 20
                      when 'phoneNumber' then 20
                      when 'tillNumber' then 20
                      when 'paybillNumber' then 20
                      else 100 end) then
      raise exception 'Complete every payout field.' using errcode = '22023';
    end if;
    v_payout := jsonb_set(v_payout, array[v_key], to_jsonb(btrim(v_payout ->> v_key)));
  end loop;

  if v_rail = 'mpesa_phone' then
    v_phone := regexp_replace(v_payout ->> 'phoneNumber', '[\s()-]', '', 'g');
    v_phone := case
      when v_phone ~ '^0[17][0-9]{8}$' then '+254' || substr(v_phone, 2)
      when v_phone ~ '^254[17][0-9]{8}$' then '+' || v_phone
      else v_phone end;
    if v_phone !~ '^\+254[17][0-9]{8}$' then
      raise exception 'Enter a Kenyan M-PESA number, such as 0712 345 678.' using errcode = '22023';
    end if;
    v_payout := jsonb_set(v_payout, '{phoneNumber}', to_jsonb(v_phone));
  elsif (v_rail = 'mpesa_till' and v_payout ->> 'tillNumber' !~ '^[0-9]{1,20}$')
     or (v_rail = 'mpesa_paybill' and v_payout ->> 'paybillNumber' !~ '^[0-9]{1,20}$') then
    raise exception 'A till or paybill number is digits only.' using errcode = '22023';
  end if;

  select * into v_old from public.host_payout where host_id = p_host_id for update;

  insert into public.host_payout as x
    (host_id, rail, account, version, declared_by, declared_by_user, declared_at, kra_pin)
  values (p_host_id, v_rail, v_payout - 'rail', 1, v_staff, v_uid, now(), v_pin)
  on conflict (host_id) do update set
    rail = excluded.rail,
    account = excluded.account,
    version = x.version + 1,
    declared_by = excluded.declared_by,
    declared_by_user = excluded.declared_by_user,
    declared_at = excluded.declared_at,
    verified_by = null,
    verified_at = null,
    verified_version = null,
    kra_pin = case when v_set_pin then excluded.kra_pin else x.kra_pin end
  returning * into v_new;

  /* The in-flight rule (see the comment above the function). Runs before
     their payment files: hold this host's waiting lines, then recompute. */
  with held as (
    update public.fin_settlement_line l
       set state = 'held_kyc',
           hold_reason = 'payout details changed by the host · Finance checks them first'
      from public.fin_settlement_run r
     where r.id = l.run_id
       and r.state in ('draft', 'built', 'checked', 'approved_1', 'approved_2')
       and l.party_type = 'host'
       and l.party_id = p_host_id
       and l.state in ('ready', 'approved', 'queued')
    returning l.run_id
  )
  select count(*)::integer, array_agg(distinct held.run_id) into v_held, v_runs from held;

  if v_held > 0 then
    foreach v_run in array v_runs loop
      perform public.fn_settlement_recompute(v_run);
    end loop;
  end if;

  /* Runs whose payment files are made: change nothing, tell Finance. A line
     already paid, rolled forward or held is not paid on these files, so it
     does not count. */
  select count(*)::integer,
         jsonb_agg(jsonb_build_object('run_id', r.id, 'reference', r.reference, 'run_state', r.state)
                   order by r.reference)
    into v_sent, v_sent_runs
    from public.fin_settlement_run r
   where r.state in ('files_generated', 'sending', 'sent')
     and exists (select 1 from public.fin_settlement_line l
                  where l.run_id = r.id
                    and l.party_type = 'host'
                    and l.party_id = p_host_id
                    /* Only lines that go out in the payment file: not cash_netted
                       (nothing is sent), and not lines held out of it. */
                    and l.state in ('ready', 'approved', 'queued', 'sent'));

  perform audit.log(
    p_actor_type => 'host_user'::public.actor_type, p_module => 'hotels',
    p_action => 'host.payout_declared_by_host',
    p_actor_id => v_uid,
    p_target_type => 'host', p_target_id => p_host_id,
    p_target_label => v_host.display_name,
    p_city_id => v_host.city_id,
    p_severity => 'notice',
    p_before => case when v_old.host_id is null then null else jsonb_build_object(
      'rail', v_old.rail, 'version', v_old.version,
      'destination', public.fn_experience_partner_payout_masked(v_old.rail, v_old.account),
      'verified', v_old.verified_version is not distinct from v_old.version) end,
    p_after => jsonb_build_object(
      'rail', v_new.rail, 'version', v_new.version,
      'destination', public.fn_experience_partner_payout_masked(v_new.rail, v_new.account),
      'kra_pin_set', v_new.kra_pin is not null,
      'declared_by_staff', v_new.declared_by is not null,
      'lines_held', v_held,
      'runs_with_files', v_sent));

  if v_sent > 0 then
    perform audit.log(
      p_actor_type => 'host_user'::public.actor_type, p_module => 'finance',
      p_action => 'host.payout_changed_during_run',
      p_actor_id => v_uid,
      p_target_type => 'host', p_target_id => p_host_id,
      p_target_label => v_host.display_name,
      p_city_id => v_host.city_id,
      p_severity => 'high'::public.audit_severity,
      p_reason => 'The host changed their payout details after a payment file for them was already made. '
                  || 'Those lines were not changed and pay the old details unless Finance stops them.',
      p_after => jsonb_build_object(
        'version', v_new.version,
        'destination', public.fn_experience_partner_payout_masked(v_new.rail, v_new.account),
        'runs', v_sent_runs));
  end if;

  v_note := 'Saved. NexG checks new payout details before paying you.';
  if v_held > 0 then
    v_note := v_note || ' ' || v_held || case when v_held = 1 then ' payout' else ' payouts' end
              || ' not yet sent will wait until NexG has checked your new details.';
  end if;
  if v_sent > 0 then
    v_note := v_note || ' A payment to your old details was already being prepared, so it still goes there. '
              || 'NexG''s finance team has been told and will contact you if anything needs to change.';
  end if;

  return public.rpc_host_payout_mine(p_host_id) || jsonb_build_object('note', v_note);
end;
$$;

comment on function public.rpc_host_payout_declare_mine(uuid, jsonb) is
  'Host owner: declares or changes where the host is paid. Clears any verification; holds the host''s waiting lines in runs without payment files until Finance checks the new details; flags runs whose files are already made to Finance without changing them.';

-- ═════════════════════════════════════════════════ 4. registry and grants

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('host.payout_declared_by_host', 'hotels', 'notice', false, false, true, '{}',
   'A host declared or changed their own payout details; Finance verifies them before a run pays the host'),
  ('host.payout_changed_during_run', 'finance', 'high', true, false, true, '{}',
   'A host changed their payout details after a payment file for them was made; those lines still pay the old details unless Finance stops them')
on conflict (action) do nothing;

/* Each checks its caller itself. */
revoke execute on function
  public.rpc_host_payout_declare_mine(uuid, jsonb),
  public.rpc_host_payout_mine(uuid)
  from public, anon;
grant execute on function
  public.rpc_host_payout_declare_mine(uuid, jsonb),
  public.rpc_host_payout_mine(uuid)
  to authenticated, service_role;

revoke execute on function public.tg_host_payout_one_declarer() from public, anon, authenticated;

notify pgrst, 'reload schema';
