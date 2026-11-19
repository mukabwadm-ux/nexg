/**
 * Where a host is paid their stay shares and referral rewards, as
 * rpc_host_payouts returns it. Hospitality staff declare the details;
 * someone else with full Finance verifies them; the weekly run pays only
 * verified details. The ways to pay, and their fields, are the experience
 * partners' (PARTNER_PAYOUT_RAILS).
 */

import { isPartnerPayoutRail, type PartnerPayoutRail } from './partner-payouts';

export interface HostPayout {
  host_id: string;
  host_name: string | null;
  host_status: string;
  city: string | null;
  rail: PartnerPayoutRail;
  destination_masked: string | null;
  account_name: string | null;
  bank_name: string | null;
  /** The details themselves: only for people with full Finance. */
  account: Record<string, string> | null;
  version: number;
  declared_by: string | null;
  declared_by_name: string | null;
  declared_at: string;
  verified: boolean;
  verified_by_name: string | null;
  verified_at: string | null;
}

/** The reader's JSON, kept to the rows that have a rail this console knows. */
export function hostPayouts(data: unknown): HostPayout[] {
  if (!Array.isArray(data)) return [];
  return (data as HostPayout[])
    .filter((r) => r && typeof r.host_id === 'string' && isPartnerPayoutRail(r.rail))
    .map((r) => ({ ...r, version: Number(r.version), verified: r.verified === true }));
}
