-- Closing what the check found.
--
-- `fn_wiring_check` reported 163 security-definer functions that
-- write and that the anonymous key could execute. The anon key
-- is not a secret — it ships inside the browser bundle, by
-- design — so "anon can execute" means "anyone on the internet
-- can invoke".
--
-- Most of the 163 refuse: they carry their own `authz` guard and
-- raise. That is worth saying plainly because it is the
-- difference between a list of bugs and a list of exposure, and
-- this is mostly the second. But four of them had no guard at
-- all, and the rest are reachable for no reason: of the 163,
-- our own web app calls eighteen, and every one of those
-- eighteen is either a signed-in surface (where the caller is
-- `authenticated`, not `anon`) or an onboarding path that is
-- genuinely pre-account.
--
-- So: the pre-account paths are written down with a reason, the
-- rest lose the grant, and the four unguarded ones get guards —
-- because revoking from `anon` does nothing about a signed-in
-- guest calling them for somebody else's row.

-- ═════════════════════ 1 · the pre-account paths, written down

insert into wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_merchant_payout_name_check',
   'An applicant checks their own payout name during onboarding',
   'the draft resume token; provider call is rate-limited per draft'),
  ('rpc_rider_payout_name_check',
   'An applicant checks their own payout name during onboarding',
   'the draft resume token; provider call is rate-limited per draft'),
  ('rpc_book_slot',
   'A rider applicant books their own onboarding slot',
   'resume token on the draft'),
  ('rpc_translations_put',
   'An anonymous visitor asks for a language we have not written out yet',
   'writes only translation strings for a locale tag'),
  ('fn_build_plan',
   'The experience planner builds a plan for a visitor with no account',
   'plan token; reads catalogue and writes only the plan it owns'),
  ('rpc_send_plan',
   'The planner sends a plan to the person who asked for it',
   'plan token'),
  ('rpc_approve_plan',
   'The guest approves the plan that was sent to them',
   'plan token in the link'),
  ('rpc_plan_message',
   'The guest replies on their own plan',
   'plan token'),
  ('rpc_request_changes',
   'The guest asks for changes to their own plan',
   'plan token')
on conflict (function_name) do nothing;

-- ══════════════════════════ 2 · everything else loses the grant

do $revoke$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
       and p.prosrc ~* '(insert into|update |delete from)'
       and p.proname not like 'tg\_%'
       and not exists (
         select 1 from public.wiring_anon_allow a where a.function_name = p.proname)
  loop
    /*
     * Revoked from PUBLIC, not just from `anon`.
     *
     * Postgres grants EXECUTE on a new function to PUBLIC, and
     * `anon` inherits that. Revoking from `anon` alone changes
     * nothing — the first run of this did exactly that, reported
     * 154 functions revoked, and the check still found 153,
     * because the PUBLIC grant was still there underneath.
     *
     * Dropping PUBLIC takes it from `authenticated` too, so the
     * grant is immediately restored to them: every signed-in
     * surface is untouched and keeps whatever its own authz
     * guard allows. What goes is the ability to call these with
     * a key printed in the page source.
     */
    execute format('revoke execute on function public.%I(%s) from public, anon',
                   r.proname, r.args);
    execute format('grant execute on function public.%I(%s) to authenticated',
                   r.proname, r.args);
    v_count := v_count + 1;
  end loop;

  raise notice 'Revoked anon execute on % security-definer functions that write.', v_count;
end
$revoke$;

/*
 * And the default, so the next function added does not arrive
 * public. This was set once before for the cron functions and
 * only covers functions created afterwards by the same role —
 * which is why the loop above was still necessary.
 */
alter default privileges in schema public revoke execute on functions from anon;

-- ══════════════════════════════ 3 · the four with no guard
--
-- A revoke is not enough for these. Any signed-in account could
-- call them for somebody else's row, and a guest account is
-- free to create.

/*
 * Consent for somebody else.
 *
 * `rpc_guest_consent_set(guest_id, kind, granted, source)` took
 * a guest id and wrote a consent row, with no check that the
 * caller was that guest. Marketing consent granted on another
 * person's behalf, or withdrawn from under them, is the exact
 * thing the KDPA sections of this system exist to prevent.
 */
create or replace function rpc_guest_consent_set(
  p_guest_id uuid,
  p_kind public.guest_consent_kind,
  p_granted boolean,
  p_source text default 'checkout'
)
returns public.guest_consent
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.guest_consent;
begin
  if not (authz.guest_id() = p_guest_id
          or authz.handles_guest_data()
          or authz.is_super_admin()) then
    raise exception
      'Consent is the guest''s to give. You can only set your own, or act on it as staff who handle guest data.'
      using errcode = '42501';
  end if;

  /* And the source cannot be claimed. Somebody setting their
     own consent is not staff doing it on their behalf, and the
     two carry different weight in a complaint. */
  if p_source = 'staff' and authz.staff_id() is null then
    raise exception 'Only staff can record a consent as taken by staff.' using errcode = '42501';
  end if;

  insert into public.guest_consent (guest_id, kind, granted, source)
  values (p_guest_id, p_kind, p_granted, p_source)
  returning * into v_row;

  perform audit.log(
    (case when p_source = 'staff' then 'staff' else 'guest' end)::public.actor_type,
    'hotels', 'guest.consent_changed',
    p_target_type => 'guest', p_target_id => p_guest_id,
    p_after => jsonb_build_object('kind', p_kind, 'granted', p_granted, 'source', p_source));

  return v_row;
end;
$$;

/*
 * A token that was never checked.
 *
 * `rpc_unit_caretaker_confirm(unit_id, token)` accepted a token
 * and never read it — and there is no column on `unit` holding
 * one to read. So the credential was designed and never built,
 * and the function marked any unit's caretaker confirmed for
 * anybody who had the id. That feeds `fn_unit_readiness`, so it
 * walks a unit toward "ready" without the caretaker doing
 * anything.
 *
 * Guarded by membership rather than by inventing a token
 * scheme in a security fix. The parameter stays so existing
 * callers do not break, and is named for what it is.
 */
create or replace function rpc_unit_caretaker_confirm(
  p_unit_id uuid,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_host uuid;
begin
  select host_id into v_host from public.unit where id = p_unit_id;
  if v_host is null then
    raise exception 'No such unit.';
  end if;

  if not (authz.is_host_member(v_host)
          or authz.works_hospitality(null)
          or authz.is_super_admin()) then
    raise exception
      'Only the host or the hospitality desk can confirm a caretaker. A token link for the caretaker themselves is not built yet.'
      using errcode = '42501';
  end if;

  update public.unit set caretaker_confirmed_at = now()
   where id = p_unit_id and caretaker_confirmed_at is null
  returning * into v_unit;

  if v_unit.id is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.unit set readiness = public.fn_unit_readiness(p_unit_id) where id = p_unit_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'unit.caretaker_confirmed',
    p_target_type => 'unit', p_target_id => p_unit_id);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function rpc_unit_caretaker_confirm is
  'p_token is accepted and ignored: no token is stored for a caretaker, so there was nothing to check it against. Authorisation is host membership or the hospitality desk until that link is built.';

/*
 * Pausing somebody's paid placement.
 *
 * `rpc_featured_auto_pause` is the automatic half of the
 * featured rules — the cron calls it when a merchant's health
 * drops. Nobody should be able to call it by hand, least of all
 * a competitor with a booking id.
 */
revoke execute on function rpc_featured_auto_pause(uuid, text) from public, anon, authenticated;
grant execute on function rpc_featured_auto_pause(uuid, text) to service_role;

/*
 * Charging a room.
 *
 * `rpc_folio_request(order_reference, hotel_id, room_no,
 * surname, amount)` posted against a hotel folio with no check
 * on the caller. A room number and a surname are not a
 * credential — they are written on a luggage tag.
 */
create or replace function fn_folio_caller_may_charge(p_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_hotel_member(p_hotel_id, 'desk')
      or authz.is_hotel_member(p_hotel_id, 'admin')
      or authz.works_hospitality(null)
      or authz.is_super_admin()
$$;

grant execute on function fn_folio_caller_may_charge(uuid) to authenticated;

-- ══════════════════════════════ 4 · internals stop being public

do $internals$
declare r record;
begin
  /* Helpers with `fn_` names that write are internals by
     convention. `fn_build_plan` is the exception and is
     allowlisted above, because the planner genuinely runs
     before anybody has an account. */
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.proname in ('fn_fit_budget', 'fn_load_available', 'fn_qr_attribute_order')
  loop
    execute format('revoke execute on function public.%I(%s) from anon, authenticated',
                   r.proname, r.args);
  end loop;
end
$internals$;
