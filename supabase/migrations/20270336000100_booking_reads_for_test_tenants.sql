-- Booking pages for test tenants (the App Store and Play review shops).
--
-- A test tenant (accepts_test_payments, 20270228000300) is shown only to
-- staff and payment_reviewer accounts: merchant_public hides it from
-- everyone else. The website's public booking bridge checks merchant_public
-- with the anon key (apps/web/lib/booking/public-access.ts), so it answered
-- "not found" for every test tenant, reviewers included, and no booking
-- could be made at a review shop.
--
-- The app reads a shop's booking catalogue and free times without a sign-in,
-- and sends the customer's own token only when it books. So the bridge now:
--   * lets anyone READ the booking catalogue and free times of a live,
--     Explore-visible test tenant: this function says whether the id is one
--     (true or false, nothing else). Nobody reaches such an id except
--     through a review account, and reading moves no money;
--   * lets a booking be CREATED or changed there only when the caller's own
--     token can see the shop in merchant_public: staff and reviewers.
-- Paying stays as before: a test tenant takes Paystack test payments only.
--
-- Rollback: drop function public.rpc_booking_test_tenant_open(uuid).

create or replace function public.rpc_booking_test_tenant_open(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant m
    where m.id = p_merchant_id
      and m.accepts_test_payments
      and m.status = 'live'
      and m.explore_visible
      and m.deleted_at is null
  )
$$;

comment on function public.rpc_booking_test_tenant_open(uuid) is
  'True when the id is a live, Explore-visible test tenant (a review shop). Lets the public booking bridge serve its catalogue and free times; booking there still needs a staff or reviewer sign-in.';

revoke execute on function public.rpc_booking_test_tenant_open(uuid) from public;
grant execute on function public.rpc_booking_test_tenant_open(uuid) to anon, authenticated;
