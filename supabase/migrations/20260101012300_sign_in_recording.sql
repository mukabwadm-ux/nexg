-- Recording a sign-in, including the ones that fail.
--
-- `audit.sign_in` and `rpc_sign_in_record` have existed since the
-- Audit console shipped and nothing ever called them, so the tab
-- said so and showed an empty table. Honest, and not much use.
--
-- The RPC needed two changes before the sign-in route could call it.
--
-- It was granted to `authenticated` only — but the interesting
-- sign-ins are the ones that failed, where by definition there is no
-- session. A failed attempt against an address that does not exist
-- is exactly what you want to see, and it was the one thing that
-- could not be written.
--
-- And it took the email in the clear. A refused attempt is logged
-- against whatever was typed, which may be a real person's address
-- or may be an attacker's guess; either way the console shows it
-- masked, so the function stores the masked form for anything that
-- did not resolve to a staff member.

/*
 * Anonymous callers may record an attempt and nothing else. They
 * cannot read the table — RLS gives `anon` nothing — so this writes
 * into a log it cannot see, which is the right shape for the thing
 * that runs before anybody is signed in.
 */
grant execute on function audit.rpc_sign_in_record(
  text, text, text, boolean, inet, text, text, text, text, text) to anon;

grant execute on function public.rpc_resolve_qr(text, text, jsonb, public.qr_referrer_kind, text) to anon;

/* And a public name, since `audit` is not an exposed schema. */
create or replace function public.rpc_record_sign_in(
  p_email text,
  p_outcome text,
  p_auth_method text default 'password',
  p_mfa_used boolean default false,
  p_ip_country text default null,
  p_device_fingerprint text default null,
  p_device_label text default null,
  p_user_agent text default null,
  p_session_id text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select audit.rpc_sign_in_record(
    p_email, p_outcome, p_auth_method, p_mfa_used,
    null, p_ip_country, p_device_fingerprint, p_device_label,
    p_user_agent, p_session_id)
$$;

/*
 * No `inet` parameter, deliberately. The address is reduced to a
 * country at the edge and never leaves it — a sign-in log is
 * exactly the table somebody would later be tempted to use to place
 * a person, and the simplest way to make that impossible is to not
 * have the column filled.
 */
grant execute on function public.rpc_record_sign_in(
  text, text, text, boolean, text, text, text, text, text) to anon, authenticated;

comment on function public.rpc_record_sign_in is
  'Called by the sign-in route on every attempt, successful or not. Granted to anon because the attempts worth seeing are the failed ones, where there is no session — it writes into a log the caller cannot read.';

/* The console needs this through public too. */
create or replace view public.audit_known_device_v
with (security_invoker = true) as
select
  d.staff_user_id,
  su.email as staff_email,
  d.device_fingerprint,
  d.device_label,
  d.first_seen,
  d.last_seen,
  d.countries,
  d.trusted
from audit.known_device d
left join public.staff_user su on su.id = d.staff_user_id;

grant select on public.audit_known_device_v to authenticated;
