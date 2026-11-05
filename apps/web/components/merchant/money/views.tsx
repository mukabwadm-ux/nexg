'use client';

import { AlertCircle, Banknote, CircleCheck, Clock3, Coins, CreditCard, FileText, Landmark, RotateCcw, ShieldCheck, Users, Wallet } from 'lucide-react';
import { DataTable, matchesTableRow, Metrics, Pair, type Metric, type TableRow } from './components';
import { activitySummary, formatAmount, invoiceTotals, invoices, matchesTransaction, remainingSecurity, reservationAmounts, securityTotals, statementNeedsRefresh, transactionRecords, transactionSearchText, transactionStats, workflowCopy, workLabel, type Context, type Descriptor, type Snapshot } from './model';
import { payoutData, payoutSearchText, sampleSettlement } from './payouts';
import { refundAvailability, workHref } from './source';

export type Tab = 'Overview' | 'Transactions' | 'Balances' | 'Security' | 'Reservations' | 'Payouts' | 'Statements';
export type Period = 'range' | 'today';
export type Action = 'source' | 'invoice' | 'reconcile' | 'refund' | 'payout' | 'statement' | 'downloadStatement' | 'policy' | 'reservationRefunds';
const metric = (label: string, value: string, icon: Metric['icon'], definition: string, note?: string, tone?: Metric['tone']): Metric => ({ label, value, icon, definition, note, tone });
const badge = (text: string, style = '') => <span className={`mo-badge ${style}`}>{text}</span>;

export function MoneyContent({ c, view, snapshot, tab, period, selected, search, filter, onSelect, onSearch, onFilter, onInfo, onAction, onChangeTab }: {
  c: Context; view: Descriptor; snapshot: Snapshot; tab: Tab; period: Period; selected: string; search: string; filter: string;
  onSelect: (id: string, focus?: boolean) => void; onSearch: (s: string) => void; onFilter: (s: string) => void; onInfo: (m: Metric) => void; onAction: (a: Action, recordId?: string) => void; onChangeTab: (tab: Tab) => void;
}) {
  const report = snapshot.report;
  const money = (value: number, currency = c.currency, includeCode = true) =>
    formatAmount(value, currency, includeCode);
  const signed = (v: number) => `${v < 0 ? '−' : '+'}${money(Math.abs(v), undefined, false)}`;
  const available = !['unknown', 'offline', 'error'].includes(c.scenario), empty = c.scenario === 'empty';
  const shown = (v: number) => !available ? 'Unavailable' : empty ? 'No records' : money(v);
  const statementPending = statementNeedsRefresh(snapshot);
  const statementValue = (v: number) => statementPending && available && !empty ? 'Needs refresh' : shown(v);
  const limited = c.scenario === 'partial';
  const securities = available && !empty ? snapshot.security : [];
  const confirmedReservation = (kind: 'advance' | 'booking' | 'guarantee') => snapshot.operations.filter((o) => o.kind === `${kind}-refund` && o.recordId === `BK-1048:${kind}` && o.result === 'confirmed').reduce((sum, o) => sum + o.amount, 0);
  const allInvoices = available && !empty ? invoices(view) : [];
  const allTransactions = available && !empty ? transactionRecords(view, snapshot).filter((t) => period === 'range' || t.date === (report?.date ?? '2026-11-03')).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)) : [];
  const matchingTransactions = allTransactions.filter((t) => matchesTransaction(t, search, filter));
  const txStats = transactionStats(matchingTransactions);
  const countValue = (n: number) => !available ? 'Unavailable' : empty ? 'No records' : n.toLocaleString('en-KE');
  const payouts = payoutData(c, snapshot);
  const payoutCurrent = (amount: number | null) => !payouts.available ? 'Unavailable' : payouts.empty ? 'No records' : payouts.incomplete ? 'Incomplete' : amount === null ? 'Needs refresh' : money(amount);
  const reportStatement = period === 'today' && tab !== 'Payouts' ? snapshot.statement.today : snapshot.statement;
  const sec = securityTotals(securities), inv = invoiceTotals(allInvoices);
  const values: Metric[] = report ? [
    metric('Accepted quote value', shown(report.acceptedQuoteMinor), Banknote, 'Combined value of accepted, confirmed and completed quotes.', 'Across saved quotes', 'blue'),
    metric('Payments recorded', shown(txStats.paidAmount), CircleCheck, 'Payments marked as received in the matching sample records.', `${txStats.paidCount} recorded`, 'green'),
    metric('Payment not recorded', countValue(txStats.total - txStats.paidCount), Clock3, 'Quotes without a recorded sample payment.', undefined, 'gold'),
    metric('Quote and payment records', countValue(txStats.total), FileText, 'Flight records matching the current view.', undefined, 'gold'),
  ] : tab === 'Payouts' ? [
    metric('Available for payout', payoutCurrent(payouts.eligible), Wallet, 'The source-reported eligible settlement balance. Eligible money has not necessarily been sent or paid.', payouts.currentKnown ? 'Eligible · not yet paid' : payouts.incomplete ? 'Coverage incomplete' : payouts.pending ? 'Check refund and refresh' : undefined, 'green'),
    metric('Payouts in progress', !payouts.available ? 'Unavailable' : payouts.empty ? 'No records' : payouts.incomplete ? 'Incomplete' : money(payouts.totals.inProgress), Clock3, 'Queued, processing or sent payouts reported by the source. Sent does not mean paid.', payouts.incomplete ? 'Coverage incomplete' : payouts.available && !payouts.empty ? `${payouts.totals.inProgressCount} in progress` : undefined, 'blue'),
    metric('Paid payouts', !payouts.available ? 'Unavailable' : payouts.empty ? 'No records' : money(payouts.totals.paid), CircleCheck, 'Payouts explicitly reported as paid by the sample source. This is recorded payout history, not the current settlement period.', payouts.available && !payouts.empty ? `${payouts.totals.paidCount} ${payouts.incomplete ? 'known · partial' : 'confirmed'}` : undefined, 'green'),
    metric('Settlement reserve', payoutCurrent(payouts.reserve), ShieldCheck, 'The source-reported settlement reserve, held separately from the eligible balance. It is not customer security.', payouts.currentKnown ? 'Held separately' : payouts.incomplete ? 'Coverage incomplete' : payouts.pending ? 'Check refund and refresh' : undefined, 'gold'),
  ] : tab === 'Transactions' ? [
    metric('Transactions', countValue(txStats.total), FileText, 'All matching sample payment, refund and fee records in the selected period and filters.', !available ? 'Source unavailable' : empty ? 'No sample records' : 'Matching this view', 'blue'),
    metric('Payments received', shown(txStats.paidAmount), CircleCheck, 'Confirmed payments in the matching transaction records. Work or booking confirmation alone is not payment.', !available ? 'Source unavailable' : empty ? 'No sample records' : `${txStats.paidCount} confirmed`, 'green'),
    metric('Refunds confirmed', shown(txStats.refundAmount), RotateCcw, 'Only matching refunds confirmed by the sample source. Requested, rejected or unknown refunds are excluded.', !available ? 'Source unavailable' : empty ? 'No sample records' : `${txStats.refundCount} confirmed`, 'gold'),
    metric('Needs attention', countValue(txStats.attentionCount), AlertCircle, 'Matching refund requests whose result is unknown or rejected. An unknown request is not a confirmed refund.', !available ? 'Source unavailable' : empty ? 'No sample records' : txStats.attentionCount ? 'Check the result' : 'No unresolved results', txStats.attentionCount ? 'red' : undefined),
  ] : tab === 'Security' ? [
    metric('Security collected', shown(sec.collected), ShieldCheck, 'Collected customer guarantees in this sample cohort. Security is separate from merchant sales.', undefined, 'blue'),
    metric('Security refunds confirmed', shown(sec.refunded), CircleCheck, 'Only source-confirmed security refunds; a requested or unknown refund does not reduce the recorded obligation.', undefined, 'green'),
    metric('Recorded security balance', shown(sec.recorded), Coins, 'Collected less confirmed refunds and owner-posted allocations. An unknown refund remains included.', undefined),
    metric('Refund being checked', shown(sec.unknown), AlertCircle, 'The amount with an unknown outcome is included in the recorded security balance, not added to it.', 'Included in recorded balance', 'gold'),
  ] : tab === 'Balances' ? [
    metric('Invoice total', shown(inv.invoiced), FileText, 'Issued customer invoices in this sample. Quotes and unissued work are excluded.', undefined, 'blue'),
    metric('Payments applied', shown(inv.applied), CreditCard, 'Payments the invoice owner has confirmed and applied; unapplied customer credit is separate.', undefined, 'green'),
    metric('Customer balances', shown(inv.due), Users, 'Issued invoice totals less confirmed credits and applied payments, as of the displayed cutoff.'),
    metric('Overdue', shown(inv.overdue), AlertCircle, 'The overdue portion of customer balances, based on owner-supplied due dates.', 'Included in customer balances', 'red'),
  ] : tab === 'Reservations' && snapshot.policy ? (() => {
    const p = snapshot.policy!, a = reservationAmounts(p, confirmedReservation('advance'), confirmedReservation('booking'), confirmedReservation('guarantee'));
    return [
      metric('Advance collected', shown(p.advance), Wallet, 'An advance is credited once; it is not an additional sale when applied to a bill.', undefined, 'blue'),
      metric('Booking fee collected', shown(p.bookingFee), FileText, 'A separate booking fee under the accepted policy; it is distinct from the advance and security.'),
      metric('Guarantee collected', shown(p.guarantee), ShieldCheck, 'Customer security under this accepted sample policy; it remains separate from sales.', undefined, 'green'),
      metric('Cancellation allocation', shown(a.posted), Coins, 'The owner-posted charge allocation from the advance. The same amount is not charged twice.', 'From the advance', 'gold'),
    ];
  })() : [
    metric(workflowCopy(view.schemaId).charges, statementValue(reportStatement.gross), Banknote, `Owner-issued sample statement value for the selected period. ${workflowCopy(view.schemaId).reminder}`),
    metric('Confirmed sales refunds', statementValue(reportStatement.refunds), RotateCcw, 'Only refunds confirmed in the owner-issued sample statement.', undefined, 'gold'),
    metric('Posted fees', statementValue(reportStatement.fees), FileText, 'Finance statement fees, separate from merchant booking and cancellation fees.'),
    snapshot.features.payouts ? metric('Net payable in period', statementValue(reportStatement.netPayable), Wallet, 'Owner-provided period payable; current settlement may include opening balances and other periods.', undefined, 'green') : metric('Net collections', statementValue(reportStatement.netCollections), CircleCheck, 'Owner-confirmed collections after confirmed refunds in this sample statement; this does not imply a NEXG payout entitlement.', undefined, 'green'),
  ];
  const scopeNote = tab === 'Payouts' ? `${c.scenario === 'stale' ? 'Last confirmed sample' : 'NEXG-collected sample'} · As of 3 Nov 2026, 09:40 EAT · Current balance and earlier payout history have different time bases. Summary does not follow list filters.${payouts.pending ? ' Check the refund and refresh the settlement.' : ''}` : tab === 'Statements' ? 'Choose a sample report to inspect its coverage and download its transaction records.' : tab === 'Transactions' ? `${period === 'today' ? '3 Nov' : '1–3 Nov'} 2026 · ${c.scenario === 'stale' ? 'Last confirmed sample' : 'Sample transactions'} · KES · 09:40 EAT · Totals follow the current filters.` : tab === 'Security' ? '1–3 Nov security cohort · Recorded as of 3 Nov, 09:40 EAT · Separate from sales and payout eligibility.' : tab === 'Balances' ? 'As of 3 Nov, 09:40 EAT · Credit notes KES 10,000 included; unallocated customer credit KES 6,000 is separate.' : tab === 'Reservations' ? 'The accepted policy applies to this sample reservation only. Work, charges and payment have separate states.' : statementPending ? 'A sample refund changed or has an unknown outcome. Check its result, then refresh the sample owner statement.' : `${period === 'today' ? '3 Nov' : '1–3 Nov'} 2026 · Owner-issued sample statement · KES · 09:40 EAT · ${workflowCopy(view.schemaId).reminder}`;
  let title = tab === 'Transactions' ? 'Transactions' : 'Recent activity', columns = tab === 'Transactions' ? ['Reference', workLabel(view.modelId), 'Date', 'Type', 'Method', 'KES', 'Status'] : ['Reference', 'Work', 'Type', 'KES', 'Status'];
  let rows: TableRow[] = allTransactions.map((t) => {
    const unresolved = t.type === 'Refund' && (t.status === 'Outcome unknown' || t.status === 'Rejected');
    const indicator = t.status === 'Rejected' ? 'mo-dot-red' : t.status === 'Outcome unknown' ? 'mo-dot-amber' : t.type === 'Fee' ? 'mo-dot-grey' : '';
    return { id: t.id, cells: [t.id, tab === 'Transactions' && t.type === 'Fee' ? '—' : t.work, ...(tab === 'Transactions' ? [t.date.replace('2026-11-0', '') + ' Nov'] : []), t.type === 'Sale' ? 'Payment' : t.type, ...(tab === 'Transactions' ? [t.method === 'Not applicable' ? '—' : t.method] : []), unresolved ? `${money(Math.abs(t.amount), undefined, false)} requested` : signed(t.amount), <span key="s"><i className={`mo-dot ${indicator}`} /> {t.status}</span>], search: transactionSearchText(t), type: t.type, status: t.status, tags: [t.method] };
  });
  let filters = tab === 'Transactions' ? ['All', 'Sale', 'Refund', 'Fee', ...new Set(allTransactions.map((t) => t.status)), ...new Set(allTransactions.filter((t) => t.method !== 'Not applicable').map((t) => t.method))] : ['All', 'Sale', 'Refund', 'Fee'];
  if (report) {
    title = tab === 'Transactions' ? 'Quotes and payments' : 'Recent quote and payment records';
    columns = ['Reference', 'Guest', 'Flight date', 'Type', c.currency?.code ?? 'KES', 'Status'];
    filters = ['All', ...new Set(allTransactions.map((item) => item.status))];
    rows = allTransactions.map((item) => ({
      id: item.id,
      cells: [item.work, item.customer, item.date, item.type === 'Sale' ? 'Payment' : item.type, money(item.amount, undefined, false), badge(item.status)],
      search: transactionSearchText(item),
      type: item.type,
      status: item.status,
    }));
  }
  if (tab === 'Overview') rows = rows.slice(0, 6);
  if (tab === 'Balances') {
    title = 'Customer invoices'; columns = ['Invoice', 'Work', 'Invoice KES', 'Applied KES', 'Due KES', 'Status']; filters = ['All', 'Overdue', 'Not due'];
    rows = allInvoices.map((i) => ({ id: i.id, cells: [i.id, i.work, money(i.total, undefined, false), money(i.applied, undefined, false), money(i.total - i.applied - i.credit, undefined, false), badge(i.state, i.state === 'Overdue' ? 'mo-badge-red' : 'mo-badge-neutral')], search: `${i.id} ${i.work} ${i.state}`, type: i.state, status: i.state }));
  }
  if (tab === 'Security') {
    title = 'Customer security'; columns = ['Work', 'Collected KES', 'Recorded KES', 'State']; filters = ['All', 'Outcome unknown', 'Collected', 'Refund confirmed'];
    rows = securities.map((r) => { const state = r.state === 'unknown' ? 'Outcome unknown' : r.state === 'refunded' ? 'Refund confirmed' : 'Collected'; return { id: r.id, cells: [r.work, money(r.collected, undefined, false), money(remainingSecurity(r), undefined, false), badge(state, r.state === 'unknown' ? 'mo-badge-warn' : '')], search: `${r.work} ${r.asset} ${state} ${r.id}`, type: state, status: state }; });
  }
  if (tab === 'Reservations' && snapshot.policy) {
    const p = snapshot.policy, a = reservationAmounts(p, confirmedReservation('advance'), confirmedReservation('booking'), confirmedReservation('guarantee'));
    title = 'Reservation money'; columns = ['Reference', 'Component', 'KES', 'State']; filters = ['All', 'Collected', 'Posted'];
    rows = available && !empty ? [
      ...(p.advance ? [{ id: 'advance', cells: ['BK-1048', 'Advance', money(p.advance, undefined, false), badge('Collected')], search: 'BK-1048 advance collected', type: 'Collected', status: 'Collected' }] : []),
      ...(p.bookingFee ? [{ id: 'bookingFee', cells: ['BK-1048', 'Booking fee', money(p.bookingFee, undefined, false), badge('Collected')], search: 'BK-1048 booking fee collected', type: 'Collected', status: 'Collected' }] : []),
      ...(p.guarantee ? [{ id: 'guarantee', cells: ['BK-1048', 'Guarantee', money(p.guarantee, undefined, false), badge('Collected')], search: 'BK-1048 guarantee collected', type: 'Collected', status: 'Collected' }] : []),
      ...(a.chargePosted ? [{ id: 'charge', cells: ['BK-1048', 'Cancellation charge', money(a.chargePosted, undefined, false), badge('Posted', 'mo-badge-warn')], search: 'BK-1048 cancellation charge posted', type: 'Posted', status: 'Posted' }] : []),
      ...(a.posted ? [{ id: 'allocation', cells: ['BK-1048', 'Cancellation allocation', money(a.posted, undefined, false), badge('Posted', 'mo-badge-warn')], search: 'BK-1048 cancellation allocation posted', type: 'Posted', status: 'Posted' }] : []),
      ...snapshot.operations.filter((o) => ['advance-refund', 'booking-refund', 'guarantee-refund'].includes(o.kind) && o.result !== 'rejected').map((o) => ({ id: o.id, cells: ['BK-1048', `${o.kind === 'booking-refund' ? 'Booking fee' : o.kind === 'guarantee-refund' ? 'Guarantee' : 'Advance'} refund`, money(o.amount, undefined, false), badge(o.result === 'unknown' ? 'Outcome unknown' : 'Confirmed', o.result === 'unknown' ? 'mo-badge-warn' : '')], search: `BK-1048 ${o.kind} ${o.result}`, type: o.result === 'unknown' ? 'Unknown' : 'Confirmed', status: o.result === 'unknown' ? 'Unknown' : 'Confirmed' })),
    ] : [];
  }
  if (tab === 'Payouts') {
    title = 'Payouts & settlements'; columns = ['Reference', 'Type', 'Period / basis', 'KES', 'Status'];
    filters = ['All', ...new Set([...payouts.records.map((record) => record.status), ...(filter === 'All' ? [] : [filter])])];
    rows = payouts.records.map((record) => ({ id: record.id, cells: [record.id, record.kind, record.basis, record.amount === null ? '—' : money(record.amount, undefined, false), badge(record.status, ['Needs refresh', 'Coverage incomplete', 'Outcome unknown'].includes(record.status) ? 'mo-badge-warn' : ['Failed', 'Returned'].includes(record.status) ? 'mo-badge-red' : '')], search: payoutSearchText(record), type: record.kind, status: record.status }));
  }
  if (tab === 'Statements') {
    title = 'Statements & reports'; columns = ['Reference', 'Coverage', 'Format', 'Status']; filters = ['All', 'Available', 'Needs refresh'];
    const state = statementPending ? 'Needs refresh' : 'Available';
    rows = available && !empty ? [
      { id: 'STM-1103', cells: ['STM-1103', '1–3 Nov 2026', 'CSV report', badge(state, statementPending ? 'mo-badge-warn' : '')], search: `STM-1103 1–3 Nov 2026 CSV report ${state}`, type: state, status: state },
      { id: 'STM-TODAY', cells: ['STM-TODAY', '3 Nov 2026', 'CSV report', badge(state, statementPending ? 'mo-badge-warn' : '')], search: `STM-TODAY 3 Nov 2026 CSV report ${state}`, type: state, status: state },
    ] : [];
    if (report) {
      rows = [
        { id: 'STM-1103', cells: ['Flight report', 'All recorded flight dates', 'CSV report', badge('Available')], search: 'Flight report all dates', type: 'Available', status: 'Available' },
        { id: 'STM-TODAY', cells: ['Sample day report', report.date, 'CSV report', badge('Available')], search: `Sample day report ${report.date}`, type: 'Available', status: 'Available' },
      ];
    }
  }
  const filteredRows = rows.filter((row) => matchesTableRow(row, search, filter));
  const visibleIds = new Set(filteredRows.map((r) => r.id));
  const effectiveSelection = visibleIds.has(selected) ? selected : tab === 'Security' || tab === 'Transactions' || tab === 'Statements' || tab === 'Payouts' ? filteredRows[0]?.id ?? '' : tab === 'Balances' ? (visibleIds.has('INV-0832') ? 'INV-0832' : filteredRows[0]?.id ?? '') : '';
  const selectedPayout = payouts.records.find((record) => record.id === effectiveSelection);
  const selectedSecurity = securities.find((r) => r.id === effectiveSelection);
  const selectedInvoice = allInvoices.find((r) => r.id === effectiveSelection);
  const selectedTransaction = allTransactions.find((r) => r.id === effectiveSelection);
  const refundOrigin = selectedTransaction?.type === 'Sale' ? selectedTransaction.id : selectedTransaction?.originalReference;
  const saleRefund = refundOrigin ? refundAvailability(c, snapshot, 'sale', refundOrigin) : null;
  const advanceRefund = snapshot.policy ? refundAvailability(c, snapshot, 'advance', 'BK-1048:advance') : null;
  const activity = activitySummary(c, snapshot);
  function chooseAfterFilter(nextSearch: string, nextFilter: string) {
    if (tab !== 'Security' && tab !== 'Balances' && tab !== 'Transactions' && tab !== 'Statements' && tab !== 'Payouts') { onSelect('', false); return; }
    const matching = rows.filter((row) => matchesTableRow(row, nextSearch, nextFilter));
    const target = tab === 'Balances' ? matching.find((r) => r.id === 'INV-0832') ?? matching[0] : matching[0];
    onSelect(target?.id ?? '', false);
  }
  const canChange = c.role === 'manager' && c.scenario === 'current' && c.offering.sync === 'current' && snapshot.offeringVersion === c.offering.version;
  return <>
    {tab !== 'Statements' && <Metrics metrics={values} onInfo={onInfo} />}
    <div className={`mo-note ${limited ? 'mo-note-warn' : tab === 'Balances' ? 'mo-note-blue' : ''}`}>{limited ? 'Partial source coverage · The sample totals do not represent missing sources. ' : ''}{report ? workflowCopy(view.schemaId).reminder : scopeNote}</div>
    <div className="mo-main">
      <DataTable title={title} columns={columns} rows={rows} selected={effectiveSelection} onSelect={(id) => onSelect(id, true)} search={search} onSearch={(value) => { onSearch(value); chooseAfterFilter(value, filter); }} onFilter={(value) => { onFilter(value); chooseAfterFilter(search, value); }} onClear={() => { onSearch(''); onFilter('All'); chooseAfterFilter('', 'All'); }} filter={filter} filters={filters} showControls={tab !== 'Overview'} footer={tab === 'Overview' ? <button className="mo-link" onClick={() => onChangeTab('Transactions')}>View all transactions →</button> : undefined} />
      <aside className="mo-inspector" aria-label="Selected money details" data-testid="money-inspector" tabIndex={-1}>
        <button className="mo-link mo-back-list" onClick={() => document.querySelector('[data-testid="money-table-card"]')?.scrollIntoView({ block: 'start' })}>← Back to records</button>
        {!available || empty ? <><div className="mo-inspector-head"><h2>{empty ? 'No sample records' : 'Source unavailable'}</h2></div><div className="mo-inspector-content"><p>{empty ? 'There are no records for this sample scope.' : 'The source has not confirmed the current values. Unknown is not zero.'}</p></div><div className="mo-inspector-actions"><button className="mo-button" onClick={() => onAction('source')}>Source details</button></div></> : rows.length > 0 && filteredRows.length === 0 ? <><div className="mo-inspector-head"><h2>No matching records</h2></div><div className="mo-inspector-content"><p>Change or clear the filters to see money details.</p></div></> : tab === 'Security' && selectedSecurity ? <>
          <div className="mo-inspector-head"><h2>{selectedSecurity.state === 'unknown' ? `Refund ${selectedSecurity.operationId}` : selectedSecurity.work}</h2>{selectedSecurity.state === 'unknown' ? badge('Checking result', 'mo-badge-warn') : badge(selectedSecurity.state === 'refunded' ? 'Refunded' : 'Collected')}</div>
          <div className="mo-inspector-content"><p className="mo-muted">{selectedSecurity.asset} · {selectedSecurity.work}</p><Pair label="Deposit collected" value={money(selectedSecurity.collected)} /><Pair label="Posted charge allocation" value={money(selectedSecurity.allocation)} /><Pair label="Refund requested" value={money(selectedSecurity.refundRequested)} /><Pair label="Refund confirmed" value={money(selectedSecurity.refunded)} /><Pair strong label="Recorded obligation" value={money(remainingSecurity(selectedSecurity))} />{selectedSecurity.state === 'unknown' && <p className="mo-note mo-note-warn">Unknown refund: no duplicate refund or credit.</p>}</div>
          <div className="mo-inspector-actions">{selectedSecurity.state === 'unknown' ? <><button className="mo-button mo-primary" disabled={!canChange} onClick={() => onAction('reconcile', selectedSecurity.id)}>Check refund status</button><button className="mo-button" disabled>Submit another refund</button></> : selectedSecurity.state === 'collected' && remainingSecurity(selectedSecurity) > 0 ? <button className="mo-button mo-primary" disabled={!canChange} onClick={() => onAction('refund', selectedSecurity.id)}>Review sample refund</button> : null}<a className="mo-button" href={workHref(c, selectedSecurity.work, { tab, selected: selectedSecurity.id, period })}>Open in Work ↗</a></div>
        </> : tab === 'Balances' && selectedInvoice ? <>
          <div className="mo-inspector-head"><h2>{selectedInvoice.id} · {selectedInvoice.work}</h2>{badge('ERP read only', 'mo-badge-neutral')}</div>
          <div className="mo-inspector-content"><h3>Breakdown</h3>{view.modelId === 'SERVICE_JOB' && selectedInvoice.parts !== undefined ? <><Pair label="Parts" value={money(selectedInvoice.parts)} /><Pair label="Labour" value={money(selectedInvoice.labour ?? 0)} /></> : <Pair label="Invoiced work" value={money(selectedInvoice.total)} />}<Pair strong label="Invoice total" value={money(selectedInvoice.total)} /><Pair label="Credit note" value={`− ${money(selectedInvoice.credit)}`} /><Pair label="Payments applied" value={`− ${money(selectedInvoice.applied)}`} /><Pair strong label="Outstanding" value={money(selectedInvoice.total - selectedInvoice.applied - selectedInvoice.credit)} /><p>Due {selectedInvoice.dueDate} · {selectedInvoice.state}</p><p className="mo-small mo-muted">Allocation confirmed by the invoice owner.</p></div>
          <div className="mo-inspector-actions"><button className="mo-button mo-primary" onClick={() => onAction('invoice')}>View invoice</button><a className="mo-button" href={workHref(c, selectedInvoice.work, { tab, selected: selectedInvoice.id, period })}>Open in Work ↗</a></div>
        </> : tab === 'Reservations' && snapshot.policy ? (() => { const p = snapshot.policy, a = reservationAmounts(p, confirmedReservation('advance'), confirmedReservation('booking'), confirmedReservation('guarantee')); return <>
          <div className="mo-inspector-head"><h2>Reservation · BK-1048</h2>{badge('Policy accepted')}</div><div className="mo-inspector-content"><p className="mo-muted">Accepted policy {p.acceptedVersion}</p><Pair label="Advance collected" value={money(p.advance)} /><Pair label="Separate booking fee" value={money(p.bookingFee)} /><Pair label="Guarantee collected" value={money(p.guarantee)} /><Pair strong label="Total collected" value={money(a.collected)} /><hr className="mo-divider" /><Pair label="Cancellation / no-show charge" value={money(a.chargePosted)} /><Pair label="Allocated from advance" value={money(a.posted)} />{a.chargeOutstanding > 0 && <Pair label="Charge still outstanding" value={money(a.chargeOutstanding)} />}{a.advanceRefunded > 0 && <Pair label="Advance refund confirmed" value={money(a.advanceRefunded)} />}{a.bookingRefunded > 0 && <Pair label="Booking fee refund confirmed" value={money(a.bookingRefunded)} />}{a.guaranteeRefunded > 0 && <Pair label="Guarantee refund confirmed" value={money(a.guaranteeRefunded)} />}<Pair label="Remaining advance" value={money(a.remainingAdvance)} /><Pair label="Separate guarantee" value={money(a.refundableGuarantee)} /><p className="mo-note mo-note-blue">{p.cancellation === 'customer' ? 'Customer cancellation recorded in this sample.' : p.cancellation === 'merchant' ? 'Merchant cancellation is not a customer cancellation.' : p.cancellation === 'no_show' ? 'No-show explicitly confirmed in this sample.' : 'No cancellation or no-show recorded.'} {p.refundTerms === 'not-configured' ? 'Advance refund terms are not configured; eligibility is unknown.' : p.refundTerms === 'non-refundable' ? 'Advance terms are explicitly non-refundable; the guarantee is separate.' : 'Eligible refunds are not completed refunds.'}</p></div><div className="mo-inspector-actions">{advanceRefund?.unknown ? <button className="mo-button mo-primary" disabled={!canChange} onClick={() => onAction('reconcile')}>Check advance refund</button> : advanceRefund && !advanceRefund.reason && advanceRefund.remaining > 0 ? <button className="mo-button mo-primary" disabled={!canChange} onClick={() => onAction('refund')}>Review advance refund</button> : null}{(p.bookingFee > 0 || p.guarantee > 0) && <button className="mo-button" onClick={() => onAction('reservationRefunds')}>Other reservation refunds</button>}<button className="mo-button" onClick={() => onAction('policy')}>View accepted policy</button><a className="mo-button" href={workHref(c, 'BK-1048', { tab, selected, period })}>Open in Work ↗</a></div></>; })() : tab === 'Payouts' && selectedPayout?.kind === 'Payout' ? <>
          <div className="mo-inspector-head"><h2>Payout · {selectedPayout.id}</h2>{badge(selectedPayout.status, ['Failed', 'Returned'].includes(selectedPayout.status) ? 'mo-badge-red' : selectedPayout.status === 'Outcome unknown' ? 'mo-badge-warn' : '')}</div><div className="mo-inspector-content"><p className="mo-muted">{selectedPayout.basis}</p><div className="mo-big">{money(selectedPayout.amount)}</div><p className="mo-small mo-muted">{selectedPayout.status === 'Paid' ? 'Paid status confirmed by the sample source.' : 'The source has not reported this payout as paid.'}</p><hr className="mo-divider" /><Pair label="Destination" value={selectedPayout.destination} /><Pair label="Date" value="Not supplied" /><Pair label="Source" value={selectedPayout.source} /><Pair label="Location" value={c.location} /></div><div className="mo-inspector-actions"><button className="mo-button mo-primary" onClick={() => onAction('payout', selectedPayout.id)}>View payout details</button><button className="mo-button" onClick={() => onAction('source')}>Source details</button></div>
        </> : ((tab === 'Payouts' && selectedPayout?.kind === 'Settlement') || (tab === 'Overview' && snapshot.features.payouts && !selectedTransaction)) ? <>
          <div className="mo-inspector-head"><h2>Settlement as of 3 Nov</h2>{badge(payouts.incomplete ? 'Coverage incomplete' : statementPending ? 'Needs refresh' : 'Eligible', payouts.incomplete || statementPending ? 'mo-badge-warn' : '')}</div><div className="mo-inspector-content">{!payouts.currentKnown ? <p className="mo-note mo-note-warn">{payouts.incomplete ? 'The source coverage is incomplete. The eligible balance and reserve are unavailable.' : 'A refund changed or is being checked. The current eligible balance needs an owner refresh.'}</p> : <><p className="mo-muted">Ready for payout</p><div className="mo-big">{money(snapshot.statement.eligible)}</div><Pair label="Opening payable" value={`+ ${money(sampleSettlement.opening, undefined, false)}`} /><Pair label="Settlement period payable" value={`+ ${money(snapshot.statement.netPayable, undefined, false)}`} /><Pair label="Confirmed earlier payout" value={`− ${money(sampleSettlement.earlierPayout, undefined, false)}`} /><Pair label="Settlement reserve" value={`− ${money(sampleSettlement.reserve, undefined, false)}`} /><Pair strong label="Eligible balance" value={money(snapshot.statement.eligible)} /><p className="mo-small mo-muted">Includes opening balance; eligible is not paid.</p><p><Landmark size={15} style={{ display: 'inline', marginRight: 6 }} />{sampleSettlement.destination}</p></>}</div><div className="mo-inspector-actions"><button className="mo-button mo-primary" disabled={!payouts.currentKnown} onClick={() => onAction('payout', 'SET-1103')}>View settlement details</button><button className="mo-button" onClick={() => onAction('statement')}>View statement</button></div>
        </> : tab === 'Statements' ? (() => {
          const today = effectiveSelection === 'STM-TODAY', statement = today ? snapshot.statement.today : snapshot.statement;
          const count = transactionRecords(view, snapshot).filter((t) => !today || t.date === (report?.date ?? '2026-11-03')).length;
          return <><div className="mo-inspector-head"><h2>Sample report</h2>{badge(statementPending ? 'Needs refresh' : 'Available', statementPending ? 'mo-badge-warn' : '')}</div><div className="mo-inspector-content"><p className="mo-muted">{report ? (today ? report.date : 'All recorded flight dates') : today ? '3 Nov 2026' : '1–3 Nov 2026'} · {c.location} · {c.currency?.code ?? 'KES'}</p><Pair label="Report reference" value={effectiveSelection} /><Pair label="Records included" value={String(count)} /><Pair label="Format" value="CSV" /><hr className="mo-divider" />{report ? <Pair label="Sample payments recorded" value={money(statement.gross)} /> : statementPending ? <p className="mo-note mo-note-warn">Refresh the sample statement after checking any unknown refund.</p> : <><Pair label={workflowCopy(view.schemaId).charges} value={money(statement.gross)} /><Pair label="Confirmed refunds" value={money(statement.refunds)} /><Pair label="Posted fees" value={money(statement.fees)} /></>}<p className="mo-small mo-muted">This local report is a sample, not an issued fiscal document.</p></div><div className="mo-inspector-actions"><button className="mo-button mo-primary" disabled={statementPending} onClick={() => onAction('downloadStatement')}>Download CSV report</button><button className="mo-button" onClick={() => onAction('statement')}>View report details</button></div></>;
        })() : selectedTransaction ? <>
          <div className="mo-inspector-head"><h2>{selectedTransaction.type === 'Sale' ? `${workLabel(view.modelId)} payment` : selectedTransaction.type === 'Fee' ? 'Statement fee' : selectedTransaction.type === 'Quote' ? 'Charter quote' : 'Refund'}</h2>{badge(selectedTransaction.status, selectedTransaction.status === 'Outcome unknown' ? 'mo-badge-warn' : selectedTransaction.status === 'Rejected' ? 'mo-badge-red' : '')}</div><div className="mo-inspector-content"><p className="mo-muted mo-small">{selectedTransaction.id}</p><div className="mo-big">{money(Math.abs(selectedTransaction.amount))}</div><p className="mo-small mo-muted">{selectedTransaction.type === 'Refund' && selectedTransaction.status !== 'Confirmed' ? 'Refund requested; no confirmed return of money.' : selectedTransaction.type === 'Sale' ? 'Payment confirmed in this sample.' : selectedTransaction.type === 'Fee' ? 'Posted finance statement fee.' : selectedTransaction.type === 'Quote' ? 'Quoted value. Payment is recorded separately.' : 'Refund confirmed in this sample.'}</p><hr className="mo-divider" />{selectedTransaction.type !== 'Fee' && <><Pair label={workLabel(view.modelId)} value={selectedTransaction.work} /><Pair label="Customer" value={selectedTransaction.customer} /><Pair label="Payment method" value={selectedTransaction.method} /></>}<Pair label={report ? 'Flight departure' : 'Date / time'} value={`${report ? selectedTransaction.date : `${selectedTransaction.date.replace('2026-11-0', '')} Nov 2026`} · ${selectedTransaction.time} EAT`} /><Pair label="Source" value={selectedTransaction.source} />{selectedTransaction.details?.map(([label, value]) => <Pair key={label} label={label} value={value} />)}{selectedTransaction.type === 'Refund' && <Pair label="Original payment" value={selectedTransaction.originalReference ?? 'Not recorded in sample'} />}{saleRefund?.unknown && <p className="mo-note mo-note-warn">A refund result is unknown. Do not submit another refund or credit against it.</p>}</div><div className="mo-inspector-actions">{saleRefund?.unknown && (selectedTransaction.type === 'Sale' || selectedTransaction.id === saleRefund.unknown.id) ? <button className="mo-button mo-primary" disabled={!canChange} onClick={() => onAction('reconcile', refundOrigin)}>Check refund status</button> : selectedTransaction.type === 'Sale' && saleRefund && !saleRefund.reason && saleRefund.remaining > 0 ? <button className="mo-button mo-primary" disabled={!canChange} onClick={() => onAction('refund', selectedTransaction.id)}>Review sample refund</button> : null}{selectedTransaction.type !== 'Fee' && <a className="mo-button" href={workHref(c, selectedTransaction.work, { tab, selected: selectedTransaction.id, period })}>Open in Work ↗</a>}<button className="mo-button" onClick={() => onAction('source')}>Source details</button></div>
        </> : <><div className="mo-inspector-head"><h2>{activity.title}</h2>{badge('Sample', 'mo-badge-neutral')}</div><div className="mo-inspector-content">{activity.facts.map(([label, value]) => <Pair key={label} label={label} value={value} />)}<p className="mo-note">{activity.note}</p><p className="mo-small mo-muted">Select a money record for its source and related work.</p></div><div className="mo-inspector-actions"><button className="mo-button" onClick={() => onAction('source')}>Source details</button></div></>}
      </aside>
    </div>
  </>;
}
