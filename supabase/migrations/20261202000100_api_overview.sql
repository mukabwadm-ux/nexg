-- Settings → API & Webhooks: the status of the webhooks NexG receives, and of API keys.
--
-- One read-only function for the console. For each webhook (Paystack, M-Pesa,
-- banks): whether its Vault secret is set (checked by name; the value is never
-- read), when the last event arrived, how many arrived in the last 30 days, and
-- how many of those were stored but not handled (refused or unmatched). For
-- M-Pesa it also counts the payment prompts sent and answered, so prompts that
-- go out with no answer coming back are visible. And how many API keys are active.
--
-- Rollback: drop function public.rpc_api_overview();

create function public.rpc_api_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not (authz.is_super_admin() or authz.reaches_module('settings')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'webhooks', jsonb_build_array(
      (select jsonb_build_object('key', 'paystack',
         'secret_set', exists (select 1 from vault.secrets where name = 'paystack_secret_key'),
         'last_event_at', max(e.received_at),
         'events_30d', count(*) filter (where e.received_at > v_since),
         'unhandled_30d', count(*) filter (where e.received_at > v_since and not e.handled))
       from public.payment_event e
      where e.event in ('charge.success', 'charge.failed')),
      (select jsonb_build_object('key', 'mpesa',
         'secret_set', exists (select 1 from vault.secrets where name = 'daraja_callback_secret'),
         'last_event_at', max(e.received_at),
         'events_30d', count(*) filter (where e.received_at > v_since),
         'unhandled_30d', count(*) filter (where e.received_at > v_since and not e.handled),
         'prompts_30d', (select count(*) from public.payment_prompt pr where pr.sent_at > v_since),
         'answered_30d', (select count(*) from public.payment_prompt pr
                           where pr.sent_at > v_since and pr.resolved_at is not null))
       from public.payment_event e
      where e.event like 'mpesa.stk.%'),
      (select jsonb_build_object('key', 'bank',
         'secret_set', exists (select 1 from vault.secrets where name = 'bank_webhook_secret'),
         'last_event_at', max(e.received_at),
         'events_30d', count(*) filter (where e.received_at > v_since),
         'unhandled_30d', count(*) filter (where e.received_at > v_since and not e.handled))
       from public.payment_event e
      where e.event like 'bank.collection.%')),
    'api_keys', (select jsonb_build_object(
         'active', count(*) filter (where k.state = 'active'),
         'merchant', count(*) filter (where k.state = 'active' and k.merchant_id is not null),
         'platform', count(*) filter (where k.state = 'active' and k.merchant_id is null))
       from public.api_key k));
end;
$$;

revoke execute on function public.rpc_api_overview() from public, anon;
grant execute on function public.rpc_api_overview() to authenticated;
