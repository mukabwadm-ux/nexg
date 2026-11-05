import { minor, statementNeedsRefresh, type Context, type Snapshot } from './model';

/** Explicit sample-source facts, not a rule for calculating a real payout. */
export const sampleSettlement = {
  opening: minor(20000),
  reserve: minor(22000),
  earlierPayout: minor(150000),
  period: '1–3 Nov 2026',
  asOf: '3 Nov 2026 · 09:40 EAT',
  destination: 'Bank account ····4821',
  source: 'Sample Finance',
} as const;

export type PayoutStatus =
  | 'Queued'
  | 'Processing'
  | 'Sent'
  | 'Paid'
  | 'Failed'
  | 'Returned'
  | 'Outcome unknown';
export type PayoutRecord = {
  id: string;
  kind: 'Payout';
  status: PayoutStatus;
  amount: number;
  basis: string;
  destination: string;
  source: string;
};
export type SettlementRecord = {
  id: string;
  kind: 'Settlement';
  status: 'Eligible' | 'Needs refresh' | 'Coverage incomplete';
  amount: number | null;
  basis: string;
  destination: string;
  source: string;
};
export type PayoutListRecord = PayoutRecord | SettlementRecord;

/** A sent payout is still in progress until the source reports it as paid. */
export function payoutTotals(records: PayoutRecord[]) {
  return records.reduce(
    (total, record) => {
      if (['Queued', 'Processing', 'Sent'].includes(record.status)) {
        total.inProgress += record.amount;
        total.inProgressCount++;
      } else if (record.status === 'Paid') {
        total.paid += record.amount;
        total.paidCount++;
      } else {
        total.attentionCount++;
      }
      return total;
    },
    { inProgress: 0, inProgressCount: 0, paid: 0, paidCount: 0, attentionCount: 0 },
  );
}

export function payoutData(c: Context, s: Snapshot) {
  const enabled = s.features.payouts;
  const available = enabled && !['unknown', 'offline', 'error'].includes(c.scenario);
  const empty = c.scenario === 'empty';
  const incomplete = c.scenario === 'partial';
  const pending = statementNeedsRefresh(s);
  const currentKnown = available && !empty && !incomplete && !pending;
  const records: PayoutListRecord[] =
    available && !empty
      ? [
          {
            id: 'SET-1103',
            kind: 'Settlement',
            status: incomplete ? 'Coverage incomplete' : pending ? 'Needs refresh' : 'Eligible',
            amount: currentKnown ? s.statement.eligible : null,
            basis: sampleSettlement.period,
            destination: sampleSettlement.destination,
            source: sampleSettlement.source,
          },
          {
            id: 'PAY-1031',
            kind: 'Payout',
            status: 'Paid',
            amount: sampleSettlement.earlierPayout,
            basis: 'Earlier payout',
            destination: 'Not supplied',
            source: sampleSettlement.source,
          },
        ]
      : [];
  const totals = payoutTotals(
    records.filter((record): record is PayoutRecord => record.kind === 'Payout'),
  );
  return {
    enabled,
    available,
    empty,
    incomplete,
    pending,
    currentKnown,
    records,
    totals,
    eligible: currentKnown ? s.statement.eligible : null,
    reserve: currentKnown ? sampleSettlement.reserve : null,
  };
}

export function payoutSearchText(record: PayoutListRecord) {
  return [
    record.id,
    record.kind,
    record.status,
    record.basis,
    record.destination,
    record.source,
  ].join(' ');
}
export function matchesPayout(record: PayoutListRecord, search: string, filter: string) {
  return (
    (filter === 'All' || filter === record.kind || filter === record.status) &&
    payoutSearchText(record).toLowerCase().includes(search.trim().toLowerCase())
  );
}
