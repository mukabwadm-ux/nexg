/*
 * What the host panel reads about how NexG charges and pays a host:
 * rpc_host_commission_read and rpc_host_split_overview
 * (20270315000100_host_subaccounts_and_commission.sql).
 *
 * Both are read before that migration is on every database, so the parsers
 * never trust the shape: anything that is not the expected object is null,
 * a missing list is [], and the panel simply leaves the card out.
 */

export interface HostCommissionTerm {
  id: string;
  /** Null: back to the preset from the start day. */
  pct: number | null;
  starts_on: string;
  ends_on: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  in_force: boolean;
  terms_ref: string | null;
  requested_at: string;
  decided_at: string | null;
  /* Staff only. */
  reason?: string | null;
  decision_note?: string | null;
  requested_by_name?: string | null;
  decided_by_name?: string | null;
  mine?: boolean;
}

export interface HostCommissionCard {
  host_id: string;
  viewer: 'staff' | 'host';
  charged_now: { pct: number | null; agreed: boolean; preset_pct: number | null } | null;
  preset_pct: number | null;
  in_force: { id: string; starts_on: string; ends_on: string | null } | null;
  today: string;
  can_request: boolean;
  can_decide: boolean;
  terms: HostCommissionTerm[];
}

export interface HostSplitOverview {
  viewer: 'staff' | 'host';
  canRecord: boolean;
  subaccounts: {
    id: string;
    code: string;
    test: boolean;
    schedule: string;
    status: string;
    details: {
      business_name?: string | null;
      settlement_bank?: string | null;
      account_last4?: string | null;
      paystack_schedule?: string | null;
      active?: boolean | null;
    };
    requestedAt: string;
    decidedAt: string | null;
    requestedByName?: string | null;
    decidedByName?: string | null;
    note?: string | null;
  }[];
  stays: {
    stayId: string;
    reference: string;
    checkIn: string;
    paidAt: string;
    totalCents: number;
    commissionCents: number;
    toHostCents: number;
    test: boolean;
    refunded: boolean;
  }[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** numeric comes back as a number, but a string is read too. */
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

const STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

function term(t: Obj): HostCommissionTerm | null {
  const id = str(t.id);
  const status = STATUSES.find((s) => s === t.status);
  const starts = str(t.starts_on);
  if (!id || !status || !starts) return null;
  return {
    id,
    pct: num(t.pct),
    starts_on: starts,
    ends_on: str(t.ends_on),
    status,
    in_force: t.in_force === true,
    terms_ref: str(t.terms_ref),
    requested_at: str(t.requested_at) ?? '',
    decided_at: str(t.decided_at),
    reason: str(t.reason),
    decision_note: str(t.decision_note),
    requested_by_name: str(t.requested_by_name),
    decided_by_name: str(t.decided_by_name),
    mine: t.mine === true,
  };
}

/** rpc_host_commission_read, or null when it errored or answered something else. */
export function toHostCommission(data: unknown): HostCommissionCard | null {
  if (!isObj(data)) return null;
  if (data.viewer !== 'staff' && data.viewer !== 'host') return null;
  const charged = isObj(data.charged_now) ? data.charged_now : null;
  const inForce = isObj(data.in_force) ? data.in_force : null;
  const inForceId = inForce ? str(inForce.id) : null;
  const inForceStarts = inForce ? str(inForce.starts_on) : null;
  return {
    host_id: str(data.host_id) ?? '',
    viewer: data.viewer,
    charged_now: charged
      ? {
          pct: num(charged.pct),
          agreed: charged.agreed === true,
          preset_pct: num(charged.preset_pct),
        }
      : null,
    preset_pct: num(data.preset_pct),
    in_force:
      inForce && inForceId && inForceStarts
        ? { id: inForceId, starts_on: inForceStarts, ends_on: str(inForce.ends_on) }
        : null,
    /* Requests start today or later; the database says what today is (Nairobi). */
    today: str(data.today) ?? new Date().toISOString().slice(0, 10),
    can_request: data.can_request === true,
    can_decide: data.can_decide === true,
    terms: list(data.terms)
      .map(term)
      .filter((t): t is HostCommissionTerm => t !== null),
  };
}

/** rpc_host_split_overview, or null when it errored or answered something else. */
export function toHostSplitOverview(data: unknown): HostSplitOverview | null {
  if (!isObj(data)) return null;
  if (data.viewer !== 'staff' && data.viewer !== 'host') return null;
  return {
    viewer: data.viewer,
    canRecord: data.canRecord === true,
    subaccounts: list(data.subaccounts).flatMap((s) => {
      const id = str(s.id);
      const code = str(s.code);
      if (!id || !code) return [];
      const d = isObj(s.details) ? s.details : {};
      return [
        {
          id,
          code,
          test: s.test === true,
          schedule: str(s.schedule) ?? '',
          status: str(s.status) ?? '',
          details: {
            business_name: str(d.business_name),
            settlement_bank: str(d.settlement_bank),
            account_last4: str(d.account_last4),
            paystack_schedule: str(d.paystack_schedule),
            active: typeof d.active === 'boolean' ? d.active : null,
          },
          requestedAt: str(s.requestedAt) ?? '',
          decidedAt: str(s.decidedAt),
          requestedByName: str(s.requestedByName),
          decidedByName: str(s.decidedByName),
          note: str(s.note),
        },
      ];
    }),
    stays: list(data.stays).flatMap((s) => {
      const stayId = str(s.stayId);
      if (!stayId) return [];
      return [
        {
          stayId,
          reference: str(s.reference) ?? '',
          checkIn: str(s.checkIn) ?? '',
          paidAt: str(s.paidAt) ?? '',
          totalCents: num(s.totalCents) ?? 0,
          commissionCents: num(s.commissionCents) ?? 0,
          toHostCents: num(s.toHostCents) ?? 0,
          test: s.test === true,
          refunded: s.refunded === true,
        },
      ];
    }),
  };
}
