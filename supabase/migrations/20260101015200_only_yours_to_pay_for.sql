-- Opening a payment is only for the person who owes it.
--
-- Two mistakes, found by a test asking whether `anon` could do
-- something it had never been granted.
--
-- The first: these functions were executable by `anon`, and
-- revoking from PUBLIC does not fix it. Supabase sets
-- `alter default privileges in schema public grant all on
-- functions to anon, authenticated, service_role`, so every new
-- function gets a *direct* grant to `anon` the moment it is
-- created. Listing `to authenticated` afterwards adds a second
-- grant and removes nothing. It has to be revoked from `anon` by
-- name.
--
-- The second is why that mattered. `rpc_payment_begin_order` is
-- security definer — it reads the order as the owner, past row
-- security — and it checked the *order*, never the *caller*. An
-- anonymous request with a guessed order id would have been told
-- the reference and the exact amount owed, and left a payment row
-- behind. Not money moved, but an order lookup oracle and a table
-- anybody could fill.
--
-- The definer flag is what made it reachable. A function that
-- reads past RLS has to do by hand the check RLS would have done,
-- and this one did not.

revoke execute on function public.rpc_payment_begin_order(uuid) from public, anon;
revoke execute on function public.rpc_payment_begin_featured(uuid) from public, anon;
revoke execute on function public.rpc_refund_issued(uuid, text, jsonb) from public, anon;

grant execute on function public.rpc_payment_begin_order(uuid) to authenticated;
grant execute on function public.rpc_payment_begin_featured(uuid) to authenticated;
grant execute on function public.rpc_refund_issued(uuid, text, jsonb) to authenticated;
grant execute on function public.fn_capability(text) to authenticated, anon;

/*
 * These two keep `anon`, and only these two.
 *
 * The provider arrives with no session. `rpc_payment_webhook` can
 * only move a payment we created, named by a reference we
 * generated, out of pending — and the route verifies Paystack's
 * HMAC before calling it. `rpc_payment_authorised` can only
 * attach an authorization URL to a payment that is already
 * pending.
 */
grant execute on function public.rpc_payment_authorised(text, text, text) to authenticated, anon;
grant execute on function public.rpc_payment_webhook(
  text, text, text, boolean, jsonb, boolean, text, bigint, text) to authenticated, anon;

-- ═══════════════════════ and the caller is checked, not just the order

create or replace function public.rpc_payment_begin_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_existing public.payment;
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_ref text;
  v_owed bigint;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;

  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  /*
   * Definer, so row security did not run. This is that check,
   * done by hand: the guest who placed it, somebody who works for
   * the merchant, or staff. Without it the function answers "what
   * is owed on this order" to anybody who guesses an id.
   */
  if not (
    exists (select 1 from public.guest g
             where g.id = o.guest_id and g.user_id = v_uid)
    or authz.is_merchant_member(o.merchant_id)
    or authz.works_merchant(o.merchant_id)
    or authz.reaches_module('orders')
  ) then
    raise exception 'That order is not yours to pay for.' using errcode = '42501';
  end if;

  if o.payment_method not in ('mpesa_stk', 'card') then
    raise exception 'That order is %, which is not paid online.',
      replace(o.payment_method::text, '_', ' ');
  end if;
  if o.payment_status in ('paid', 'collected') then
    raise exception 'That order is already paid.';
  end if;
  if o.stage in ('cancelled', 'refunded') then
    raise exception 'That order is %.', o.stage;
  end if;

  select * into v_existing from public.payment
   where order_id = p_order_id and state in ('pending', 'authorised')
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'authorization_url', v_existing.authorization_url, 'reused', true);
  end if;

  v_owed := o.total_cents
    - coalesce((select sum(p.amount_cents) from public.payment p
                 where p.order_id = p_order_id and p.state = 'paid'), 0);
  if v_owed <= 0 then
    raise exception 'Nothing is owed on that order.';
  end if;

  v_ref := public.fn_payment_reference();

  insert into public.payment (
    reference, intent, order_id, merchant_id, guest_id, city_id,
    amount_cents, currency, created_by, created_via, expires_at)
  values (
    v_ref, 'order', p_order_id, o.merchant_id, o.guest_id, o.city_id,
    v_owed, o.currency, v_uid,
    case when o.channel = 'manual' then 'desk' else 'guest_checkout' end,
    now() + interval '1 hour')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_owed, 'currency', o.currency,
    'order_reference', o.reference, 'reused', false);
end;
$$;

/* Again after the replace: `create or replace` keeps the ACL it
   had, but a replace that ever becomes a drop-and-create would
   silently get the default grant back. */
revoke execute on function public.rpc_payment_begin_order(uuid) from public, anon;
grant execute on function public.rpc_payment_begin_order(uuid) to authenticated;

/*
 * A guest can read their own order.
 *
 * The read policy covered merchants, riders and staff and not the
 * person who placed it — which was invisible while there was no
 * guest-facing order page, and would have been the first thing
 * broken by building one. The payment page needs it too: it
 * reports what the database believes, and a guest who could not
 * read their own order would always be told "we cannot find that
 * payment".
 */
drop policy if exists order_read on public.order;

create policy order_read on public.order
  for select to authenticated
  using (
    (guest_id is not null and exists (
      select 1 from public.guest g
       where g.id = "order".guest_id and g.user_id = (select auth.uid())))
    or authz.is_merchant_member(merchant_id)
    or (rider_id is not null and authz.is_rider_self(rider_id))
    or authz.works_merchant(merchant_id)
    or authz.can_manage_merchants(city_id)
    or authz.can_manage_riders(city_id)
    or authz.reaches_module('orders')
    or authz.reaches_module('live_ops')
  );

/* The same for the payment itself, so the return page can report. */
drop policy if exists payment_read on public.payment;

create policy payment_read on public.payment
  for select to authenticated
  using (
    (guest_id is not null and exists (
      select 1 from public.guest g
       where g.id = payment.guest_id and g.user_id = (select auth.uid())))
    or (order_id is not null and exists (
      select 1 from public.order o where o.id = payment.order_id
        and (authz.is_merchant_member(o.merchant_id) or authz.works_merchant(o.merchant_id))))
    or (merchant_id is not null and authz.is_merchant_member(merchant_id))
    or authz.reaches_module('orders')
    or authz.reaches_module('finance')
  );
