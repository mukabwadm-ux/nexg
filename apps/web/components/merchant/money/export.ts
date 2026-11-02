import { formatAmount, invoiceTotals, invoices, matchesTransaction, minor, remainingSecurity, reservationAmounts, statementNeedsRefresh, transactionRecords, type Context, type Descriptor, type Snapshot } from './model';
import { matchesPayout, payoutData } from './payouts';
import { csvCell } from './source';
import type { Period, Tab } from './views';

/** Export the visible sample scope as a report, never as an issued invoice or statement. */
export function sampleCsv(c: Context, view: Descriptor, s: Snapshot, tab: Tab, search: string, filter: string, period: Period = 'range') {
  const periodLabel = ['Overview', 'Transactions', 'Statements'].includes(tab) ? (period === 'today' ? '3 Nov 2026' : '1–3 Nov 2026') : tab === 'Security' ? 'Security cohort · 1–3 Nov 2026' : 'As of 3 Nov 2026';
  const rows: (string | number)[][] = [
    ['NEXG Money sample report', 'Not a fiscal document'],
    ['Specialty', c.profile.name, 'Offering', c.offering.name],
    ['Location', c.location, 'Method', c.method],
    ['View', tab, 'Period / basis', periodLabel, 'Currency', 'KES', 'Source state', c.scenario],
    ['Snapshot', '3 Nov 2026 09:40 EAT', 'Sample revision', s.revision],
    ['Search', search || 'All', 'Filter', filter],
    [],
  ];
  if (['unknown', 'offline', 'error'].includes(c.scenario)) {
    rows.push(['Source unavailable', 'No current amounts exported']);
  } else if (c.scenario === 'empty') {
    rows.push(['No sample records in this scope']);
  } else if (tab === 'Security') {
    rows.push(['Work', 'Resource', 'Collected', 'Posted allocation', 'Confirmed refund', 'Recorded obligation', 'Status']);
    for (const r of s.security) {
      const status = r.state === 'unknown' ? 'Outcome unknown' : r.state === 'refunded' ? 'Refund confirmed' : 'Collected';
      if (filter !== 'All' && filter !== status) continue;
      if (!`${r.work} ${r.asset} ${r.id} ${status}`.toLowerCase().includes(search.trim().toLowerCase())) continue;
      rows.push([r.work, r.asset, formatAmount(r.collected), formatAmount(r.allocation), formatAmount(r.refunded), formatAmount(remainingSecurity(r)), status]);
    }
  } else if (tab === 'Balances') {
    const list = invoices(view);
    rows.push(['Invoice', 'Work', 'Invoice total', 'Payments applied', 'Credit note', 'Amount due', 'Due date', 'Status']);
    for (const i of list) {
      if (filter !== 'All' && filter !== i.state) continue;
      if (!`${i.id} ${i.work} ${i.state}`.toLowerCase().includes(search.trim().toLowerCase())) continue;
      rows.push([i.id, i.work, formatAmount(i.total), formatAmount(i.applied), formatAmount(i.credit), formatAmount(i.total - i.applied - i.credit), i.dueDate, i.state]);
    }
    rows.push([], ['Unallocated customer credit (separate)', formatAmount(minor(6000))], ['All-scope customer balances', formatAmount(invoiceTotals(list).due)]);
  } else if (tab === 'Reservations' && s.policy) {
    const confirmed = (kind: 'advance' | 'booking' | 'guarantee') => s.operations.filter((o) => o.kind === `${kind}-refund` && o.result === 'confirmed').reduce((n, o) => n + o.amount, 0);
    const p = s.policy, amounts = reservationAmounts(p, confirmed('advance'), confirmed('booking'), confirmed('guarantee'));
    rows.push(['Accepted policy', p.acceptedVersion], ['Component', 'Collected / posted', 'Notes'], ['Advance', formatAmount(p.advance), `Remaining ${formatAmount(amounts.remainingAdvance)}; terms ${p.refundTerms}`], ['Booking fee', formatAmount(p.bookingFee), `Remaining ${formatAmount(amounts.remainingBookingFee)}; terms ${p.bookingFeeRefundTerms}`], ['Guarantee', formatAmount(p.guarantee), `Remaining ${formatAmount(amounts.refundableGuarantee)}`], ['Conditional charge posted', formatAmount(amounts.chargePosted), `Allocated once ${formatAmount(amounts.posted)}`], [], ['Refund operation', 'Component', 'Amount', 'Source result']);
    for (const operation of s.operations.filter((o) => ['advance-refund', 'booking-refund', 'guarantee-refund'].includes(o.kind))) rows.push([operation.id, operation.kind, formatAmount(operation.amount), operation.result]);
    rows.push([], ['Reservation export shows the whole accepted policy; component filters are not applied.']);
  } else if (tab === 'Payouts') {
    const payouts = payoutData(c, s);
    rows.push(['Scope', 'NEXG-collected sample; current settlement and payout history have different time bases']);
    if (!payouts.enabled) rows.push(['Payout source not enabled']);
    if (payouts.incomplete) rows.push(['Partial coverage', 'Missing sources are not represented']);
    rows.push(['Reference', 'Type', 'Period / basis', 'Destination', 'Amount', 'Status', 'Source']);
    for (const record of payouts.records.filter((item) => matchesPayout(item, search, filter))) {
      rows.push([record.id, record.kind, record.basis, record.destination, record.amount === null ? 'Unavailable' : formatAmount(record.amount), record.status, record.source]);
    }
  } else {
    rows.push(['Reference', 'Work', 'Date', 'Time (EAT)', 'Type', 'Method', 'Customer', 'Amount', 'Status', 'Source', 'Original payment']);
    for (const t of transactionRecords(view, s)) {
      if (period === 'today' && t.date !== '2026-11-03') continue;
      if (!matchesTransaction(t, search, filter)) continue;
      const amount = t.type === 'Refund' && t.status !== 'Confirmed' ? `Requested ${formatAmount(Math.abs(t.amount))}` : formatAmount(t.amount);
      rows.push([t.id, t.work, t.date, t.time, t.type, t.method, t.customer, amount, t.status, t.source, t.originalReference ?? '']);
    }
    if (statementNeedsRefresh(s)) rows.push([], ['Current statement and eligible balance need owner refresh.']);
  }
  return '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
