-- Test tenants pay in Paystack test mode (owner, 27 Nov 2026).
--
-- A test tenant (accepts_test_payments: the App Store and Play review shops,
-- the test cinema, a test property) is shown only to staff and
-- payment_reviewer accounts. The website runs every payment in live mode once
-- NexG is live, and only a payment_reviewer account was switched to the test
-- keys, so anyone else paying at a test tenant (staff, the Play review
-- account) was charged real money. Now:
--
--  1. rpc_payment_at_test_tenant tells the website whether the caller's own
--     payment is at a test tenant. The website then pays it with the test
--     keys, whoever the payer is.
--  2. No live try is recorded on a payment at a test tenant. Without the
--     test key the payment is refused, and nobody is charged real money at a
--     review shop.
--
-- Rollback:
--   drop trigger paystack_attempt_test_tenant on public.paystack_attempt;
--   drop function public.tg_paystack_attempt_test_tenant();
--   drop function public.rpc_payment_at_test_tenant(text);
--   drop function public.fn_payment_at_test_tenant(uuid);

-- Whether a payment is at a test tenant: its stay's property, or otherwise its
-- merchant (orders, bookings and cinema carry merchant_id).
create or replace function public.fn_payment_at_test_tenant(p_payment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when p.intent::text = 'stay' then (
               select pr.accepts_test_payments
                 from public.stay s
                 join public.property pr on pr.id = s.property_id
                where s.id = p.stay_id)
             else (
               select m.accepts_test_payments
                 from public.merchant m
                where m.id = p.merchant_id)
           end
      from public.payment p
     where p.id = p_payment_id), false)
$$;

revoke execute on function public.fn_payment_at_test_tenant(uuid) from public, anon, authenticated;

-- The same, for the signed-in customer's own payment; false for anyone else's.
create or replace function public.rpc_payment_at_test_tenant(p_reference text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.fn_payment_at_test_tenant(p.id)
      from public.payment p
     where p.reference = p_reference
       and p.created_by = (select auth.uid())), false)
$$;

revoke execute on function public.rpc_payment_at_test_tenant(text) from public, anon;
grant execute on function public.rpc_payment_at_test_tenant(text) to authenticated;

create or replace function public.tg_paystack_attempt_test_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_test and public.fn_payment_at_test_tenant(new.payment_id) then
    raise exception 'This place takes test payments only. Nothing was charged.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_paystack_attempt_test_tenant() from public, anon, authenticated;

drop trigger if exists paystack_attempt_test_tenant on public.paystack_attempt;
create trigger paystack_attempt_test_tenant
  before insert on public.paystack_attempt
  for each row execute function public.tg_paystack_attempt_test_tenant();
