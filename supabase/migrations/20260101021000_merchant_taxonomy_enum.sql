-- Migration: 20260101020800_merchant_taxonomy_expansion.sql
-- Expands public.merchant_category and public.category_config to support
-- all 21 NexG categories and 128 subcategories from the Nairobi Merchant Seed Catalog.

alter type public.merchant_category add value if not exists 'adults_only';
alter type public.merchant_category add value if not exists 'airport_transfers';
alter type public.merchant_category add value if not exists 'alcohol_beverages';
alter type public.merchant_category add value if not exists 'fashion_apparel';
alter type public.merchant_category add value if not exists 'beauty';
alter type public.merchant_category add value if not exists 'vehicle_rentals';
alter type public.merchant_category add value if not exists 'experiences';
alter type public.merchant_category add value if not exists 'financial_services';
alter type public.merchant_category add value if not exists 'flowers_gifts';
alter type public.merchant_category add value if not exists 'restaurants_food';
alter type public.merchant_category add value if not exists 'groceries_essentials';
alter type public.merchant_category add value if not exists 'laundry_cleaning';
alter type public.merchant_category add value if not exists 'marketplace';
alter type public.merchant_category add value if not exists 'health';
alter type public.merchant_category add value if not exists 'tech_electronics';
alter type public.merchant_category add value if not exists 'travel_tours';
alter type public.merchant_category add value if not exists 'vehicle_services';
alter type public.merchant_category add value if not exists 'wellness';
alter type public.merchant_category add value if not exists 'concierge_services';
alter type public.merchant_category add value if not exists 'logistics_shipping';

-- Schema extensions for category_config and merchant
alter table public.category_config
  add column if not exists subcategories jsonb not null default '[]'::jsonb,
  add column if not exists color text,
  add column if not exists bg text,
  add column if not exists description text;

alter table public.merchant
  add column if not exists subcategory text;
