/**
 * Where an experience partner is paid, as rpc_experience_partner_payouts
 * returns it. Experiences staff declare the details; someone else with full
 * Finance verifies them; the weekly run pays only verified details.
 */

export type PartnerPayoutRail = 'mpesa_phone' | 'mpesa_till' | 'mpesa_paybill' | 'bank';

export interface PartnerPayoutField {
  key: string;
  label: string;
  placeholder: string;
  numeric?: boolean;
}

/** Each way to pay a partner, and the fields the database expects for it. */
export const PARTNER_PAYOUT_RAILS: Record<
  PartnerPayoutRail,
  { label: string; fields: PartnerPayoutField[] }
> = {
  mpesa_phone: {
    label: 'M-PESA Number',
    fields: [
      { key: 'phoneNumber', label: 'M-PESA Number', placeholder: '0712 345 678' },
      { key: 'accountName', label: 'Registered Name', placeholder: 'Jane Wanjiku' },
    ],
  },
  mpesa_till: {
    label: 'M-PESA Till',
    fields: [{ key: 'tillNumber', label: 'Till Number', placeholder: '5123456', numeric: true }],
  },
  mpesa_paybill: {
    label: 'M-PESA Paybill',
    fields: [
      { key: 'paybillNumber', label: 'Paybill Number', placeholder: '400200', numeric: true },
      { key: 'accountReference', label: 'Account Number', placeholder: 'ACC-778899' },
    ],
  },
  bank: {
    label: 'Bank Account',
    fields: [
      { key: 'bankName', label: 'Bank', placeholder: 'Equity Bank' },
      { key: 'accountName', label: 'Account Name', placeholder: 'Savannah Trails Ltd' },
      { key: 'accountNumber', label: 'Account Number', placeholder: '0123456789012' },
    ],
  },
};

export function isPartnerPayoutRail(v: unknown): v is PartnerPayoutRail {
  return typeof v === 'string' && v in PARTNER_PAYOUT_RAILS;
}

export interface PartnerPayout {
  partner_id: string;
  partner_name: string;
  partner_status: string;
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
export function partnerPayouts(data: unknown): PartnerPayout[] {
  if (!Array.isArray(data)) return [];
  return (data as PartnerPayout[])
    .filter((r) => r && typeof r.partner_id === 'string' && isPartnerPayoutRail(r.rail))
    .map((r) => ({ ...r, version: Number(r.version), verified: r.verified === true }));
}

/** The fields to send for a rail, trimmed, with nothing from another rail. */
export function payoutDeclaration(
  rail: PartnerPayoutRail,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { rail };
  for (const f of PARTNER_PAYOUT_RAILS[rail].fields) out[f.key] = (values[f.key] ?? '').trim();
  return out;
}
