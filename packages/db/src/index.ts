/**
 * @nexg/db — the database contract shared by both apps.
 *
 * M1 ships only the enum unions, hand-written from spec section 3.1 so that the
 * design system and the ui-kit can be typed against real values today. M2 adds
 * the migrations and regenerates `types.generated.ts`, after which these
 * literals are checked against the database rather than standing in for it.
 */

export type { Database, Json } from './types.generated';

/** Merchant lifecycle — spec section 3.1 `partner_status`. */
export const PARTNER_STATUSES = [
  'applied',
  'documents_pending',
  'under_review',
  'live',
  'paused',
  'delisted',
] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** Rider lifecycle — the same shape with `active` in place of `live`. */
export const RIDER_STATUSES = [
  'applied',
  'documents_pending',
  'under_review',
  'active',
  'suspended',
  'offboarded',
] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const DOCUMENT_STATUSES = ['uploaded', 'verified', 'rejected', 'expired'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const VEHICLE_TYPES = ['motorbike', 'bicycle', 'car', 'tuktuk'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const MERCHANT_CATEGORIES = [
  'restaurant',
  'bar_liquor',
  'laundry',
  'florist',
  'beauty_fashion',
  'pharmacy',
  'supermarket',
  'gift_shop',
  'other',
] as const;
export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

export const ACTOR_TYPES = [
  'staff',
  'merchant_user',
  'rider',
  'guest',
  'host_user',
  'system',
] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Staff roles — spec section 3.2 `role` seed. */
export const STAFF_ROLES = [
  'super_admin',
  'ops_manager',
  'merchant_ops',
  'rider_ops',
  'finance',
  'growth',
  'hr',
  'dpo',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Vehicles that require a licence, logbook and insurance (section 3.2 seed). */
export const MOTORISED_VEHICLES: readonly VehicleType[] = ['motorbike', 'car', 'tuktuk'];

export function isMotorised(vehicle: VehicleType): boolean {
  return MOTORISED_VEHICLES.includes(vehicle);
}
