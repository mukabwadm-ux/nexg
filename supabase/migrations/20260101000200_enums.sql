-- Enumerated types — spec section 3.1, verbatim.
--
-- Riders and merchants share a shape but not a type: a merchant goes `live`,
-- a rider becomes `active`, and the two lifecycles diverge after that
-- (paused/delisted vs suspended/offboarded).

create type public.partner_status as enum (
  'applied',
  'documents_pending',
  'under_review',
  'live',
  'paused',
  'delisted'
);

create type public.rider_status as enum (
  'applied',
  'documents_pending',
  'under_review',
  'active',
  'suspended',
  'offboarded'
);

create type public.document_status as enum (
  'uploaded',
  'verified',
  'rejected',
  'expired'
);

create type public.vehicle_type as enum (
  'motorbike',
  'bicycle',
  'car',
  'tuktuk'
);

create type public.merchant_category as enum (
  'restaurant',
  'bar_liquor',
  'laundry',
  'florist',
  'beauty_fashion',
  'pharmacy',
  'supermarket',
  'gift_shop',
  'other'
);

create type public.actor_type as enum (
  'staff',
  'merchant_user',
  'rider',
  'guest',
  'host_user',
  'system'
);

-- Supporting enums the section 3.2 column list implies.

create type public.city_status as enum ('live', 'soft_launch', 'waitlist');

create type public.document_owner_type as enum ('rider', 'merchant');

create type public.audit_severity as enum ('info', 'notice', 'high');

create type public.setting_scope as enum ('global', 'city');

create type public.staff_status as enum ('active', 'suspended', 'offboarded');

create type public.merchant_user_role as enum ('owner', 'manager');
