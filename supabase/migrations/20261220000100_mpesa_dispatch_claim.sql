-- Claim the send window before crossing the provider boundary. Both the
-- website and Expo use this RPC so overlapping requests share one window.
alter table public.payment
  add column if not exists mpesa_dispatch_claimed_at timestamptz;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values (
  'rpc_payment_mpesa_prompt_claim',
  'The claim is an operational send lock. Payment opening and settlement are audited by the existing payment RPCs, and the sent prompt is recorded separately.',
  'public.payment.mpesa_dispatch_claimed_at; public.payment_prompt'
)
on conflict (function_name) do nothing;

create function public.rpc_payment_mpesa_prompt_claim(p_reference text, p_callback_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_gate jsonb;
  v_wait integer;
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);
  select * into p from public.payment where reference = p_reference for update;
  v_gate := public.rpc_payment_mpesa_prompt_wait(p_reference);
  if not coalesce((v_gate ->> 'ok')::boolean, false) then
    return v_gate;
  end if;
  if p.state not in ('pending', 'authorised')
     or (p.intent = 'stay' and p.expires_at <= clock_timestamp()) then
    return jsonb_build_object('ok', false, 'wait_seconds', 0,
      'message', 'This payment attempt is closed. Check your order status.');
  end if;
  v_wait := greatest(0, ceil(extract(epoch from
    (p.mpesa_dispatch_claimed_at + interval '60 seconds' - clock_timestamp())))::integer);
  if v_wait > 0 then
    return jsonb_build_object('ok', false, 'wait_seconds', v_wait,
      'message', 'A payment request is already being processed. Check your phone.');
  end if;

  update public.payment set mpesa_dispatch_claimed_at = clock_timestamp() where id = p.id;
  return jsonb_build_object('ok', true, 'wait_seconds', 0);
end;
$$;

revoke execute on function public.rpc_payment_mpesa_prompt_claim(text, text) from public, anon;
grant execute on function public.rpc_payment_mpesa_prompt_claim(text, text) to authenticated;
