-- The public careers API, enumerated.
--
-- `anon` has no USAGE on `hr`, which is the point of putting
-- candidate data in its own schema — and it means PostgREST cannot
-- resolve an `hr` function for an anonymous caller even when that
-- function is SECURITY DEFINER.
--
-- The fix is not to open the schema. It is to name, in `public`,
-- exactly the eight things an unauthenticated visitor may do:
-- apply, read their own status by token, pick a slot, answer an
-- offer, withdraw, change their talent-pool choice, ask for deletion,
-- and read the retention notice they are consenting to.
--
-- Anything not in this file is unreachable from the internet. That is
-- a much easier property to check than a pile of grants.

create or replace function public.rpc_careers_apply(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_apply(p_payload) $$;

create or replace function public.rpc_careers_notice()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select hr.rpc_apply_notice() $$;

create or replace function public.rpc_careers_status(p_token text)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_candidate_status(p_token) $$;

create or replace function public.rpc_careers_confirm_slot(
  p_token text, p_interview_id uuid, p_slot timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_candidate_confirm_slot(p_token, p_interview_id, p_slot) $$;

create or replace function public.rpc_careers_withdraw(p_token text, p_reason text default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_candidate_withdraw(p_token, p_reason) $$;

create or replace function public.rpc_careers_talent_pool(p_token text, p_opt_in boolean)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_candidate_talent_pool(p_token, p_opt_in) $$;

create or replace function public.rpc_careers_respond_offer(
  p_token text, p_accept boolean, p_reason text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_candidate_respond_offer(p_token, p_accept, p_reason) $$;

create or replace function public.rpc_careers_request_deletion(p_token text)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select hr.rpc_candidate_request_deletion(p_token) $$;

grant execute on function public.rpc_careers_apply(jsonb) to anon, authenticated;
grant execute on function public.rpc_careers_notice() to anon, authenticated;
grant execute on function public.rpc_careers_status(text) to anon, authenticated;
grant execute on function public.rpc_careers_confirm_slot(text, uuid, timestamptz) to anon, authenticated;
grant execute on function public.rpc_careers_withdraw(text, text) to anon, authenticated;
grant execute on function public.rpc_careers_talent_pool(text, boolean) to anon, authenticated;
grant execute on function public.rpc_careers_respond_offer(text, boolean, text) to anon, authenticated;
grant execute on function public.rpc_careers_request_deletion(text) to anon, authenticated;

/*
 * And nothing else. The hr-schema originals keep their own grants for
 * signed-in callers; these wrappers are the whole anonymous surface.
 */
comment on function public.rpc_careers_apply(jsonb) is
  'The public apply endpoint. One of eight functions that make up the entire anonymous careers API — hr itself stays closed to anon.';
