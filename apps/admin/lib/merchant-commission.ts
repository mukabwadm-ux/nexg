/** What rpc_merchant_commission_read answers (20270306000100). */
export interface CommissionTerm {
  id: string;
  own_delivery_pct: number | null;
  nexg_delivery_pct: number | null;
  starts_on: string;
  ends_on: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  in_force: boolean;
  terms_ref: string | null;
  requested_at: string;
  decided_at: string | null;
  /* Staff only. */
  reason?: string;
  decision_note?: string | null;
  requested_by?: string | null;
  decided_by?: string | null;
  mine?: boolean;
}

export interface CommissionCard {
  merchant_id: string;
  viewer: 'staff' | 'merchant';
  own_riders: boolean;
  charged_now: {
    pct: number | null;
    basis: 'negotiated' | 'category' | 'own_riders' | 'nexg_delivery';
    agreed: boolean;
    preset_pct: number | null;
  } | null;
  own_delivery_pct: number | null;
  own_delivery_agreed: boolean;
  nexg_delivery_pct: number | null;
  nexg_delivery_agreed: boolean;
  preset: { own_delivery_pct: number | null; nexg_delivery_pct: number | null };
  in_force: { id: string; starts_on: string; ends_on: string | null } | null;
  legacy_pct: number | null;
  today: string;
  can_request: boolean;
  can_decide: boolean;
  terms: CommissionTerm[];
}

export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Number(value)}%`;

export const day = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

/** A rate field: blank stays on the preset; otherwise 0–100, two decimals at most. */
export function parseRate(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim().replace(/%$/, '').trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return { ok: false };
  const value = Number(text);
  return value >= 0 && value <= 100 ? { ok: true, value } : { ok: false };
}
