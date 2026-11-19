-- Bookings made from the Consumer app through the booking engine.
--
-- The booking engine (apps/booking-engine) keeps the booking itself. It hands
-- the customer a private token for each booking; only that token lets them read,
-- cancel or reschedule it later. The website keeps it in the browser. The app
-- signs in with its Supabase session instead, so the website's bridge
-- (apps/web/app/api/public/booking) saves each app booking here: which
-- business, the engine's booking id, its private token, and a short summary for
-- Activity. A customer sees only their own rows, on any of their devices.
--
-- Deleting the account deletes these rows with the sign-in (on delete cascade).

create table public.customer_engine_booking (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  merchant_id        uuid not null references public.merchant(id) on delete cascade,
  engine_booking_id  text not null check (engine_booking_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  customer_token     text not null check (char_length(customer_token) between 16 and 512),
  catalogue_item_id  uuid references public.catalogue_item(id) on delete set null,
  offering_id        text check (offering_id is null or offering_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  title              text check (title is null or char_length(title) <= 200),
  status             text check (status is null or status ~ '^[a-z_]{1,40}$'),
  starts_at          timestamptz,
  ends_at            timestamptz,
  total_cents        bigint check (total_cents is null or total_cents >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, engine_booking_id)
);

comment on table public.customer_engine_booking is
  'Bookings a customer made from the app in the booking engine: the engine id, its private token and a summary for Activity. Owner-only.';

create index customer_engine_booking_user_idx
  on public.customer_engine_booking (user_id, starts_at desc nulls last);

alter table public.customer_engine_booking enable row level security;

create policy customer_engine_booking_own_read on public.customer_engine_booking
  for select to authenticated using (user_id = auth.uid());
create policy customer_engine_booking_own_insert on public.customer_engine_booking
  for insert to authenticated with check (user_id = auth.uid());
create policy customer_engine_booking_own_update on public.customer_engine_booking
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customer_engine_booking_own_delete on public.customer_engine_booking
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.customer_engine_booking from public, anon;
grant select, insert, update, delete on public.customer_engine_booking to authenticated;
-- The owner can't move a row to someone else or rewrite its identity.
revoke update on public.customer_engine_booking from authenticated;
grant update (status, title, starts_at, ends_at, total_cents, updated_at)
  on public.customer_engine_booking to authenticated;
