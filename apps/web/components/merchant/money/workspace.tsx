'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, History, MapPin, RefreshCw, Settings2 } from 'lucide-react';
import { MerchantLivePreviewShell } from '../live-preview-shell';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import { availableSchemas, extendOfferingProfiles, fulfilmentOptions, seedCatalogue, type Catalogue, type OfferingProfile } from '../offerings/model';
import { localOfferingsSource, type OfferingsSource } from '../offerings/source';
import { schemas } from '../offerings/schemas';
import { Modal, MoneyFrame, MoneyTabs, Pair, type Metric } from './components';
import { formatAmount, invoices as invoiceRecords, isReservation, KES, parseMinor, policyFromChoices, profileInfo, resolveMoneyView, statementNeedsRefresh, supportsSecurity, workflowCopy, type Context, type Features, type RefundDraft, type RefundKind, type ReservationPolicy, type Role, type Scenario, type Snapshot } from './model';
import { localMoneySource, moneyHref, offeringsHref, refundAvailability, scopeKey, storageKey, type MoneySource } from './source';
import { sampleCsv } from './export';
import { payoutData, sampleSettlement } from './payouts';
import { MoneyContent, type Action, type Period, type Tab } from './views';
import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';

type Panel = 'sample' | 'source' | 'definition' | 'history' | 'refund' | 'reconcile' | 'invoice' | 'payout' | 'statement' | 'policy' | 'reservationRefunds' | 'reset' | null;
const noProfiles: OfferingProfile[] = [];
const scenarioNames: Record<Scenario, string> = { current: 'Current sample', stale: 'Stale source', partial: 'Partial coverage', unknown: 'Unknown result', offline: 'Source offline', external: 'External / read only', empty: 'No records', error: 'Load failure' };
const tabsFor = (s: Snapshot): Tab[] => ['Overview', 'Transactions', ...(s.features.balances ? ['Balances' as const] : []), ...(s.features.security ? ['Security' as const] : []), ...(s.features.reservation && s.policy ? ['Reservations' as const] : []), ...(s.features.payouts ? ['Payouts' as const] : []), 'Statements'];
const selectedFor = (tab: Tab) => tab === 'Transactions' ? 'TX-6112' : tab === 'Security' ? 'SEC-2070' : tab === 'Balances' ? 'INV-0832' : tab === 'Payouts' ? 'SET-1103' : tab === 'Statements' ? 'STM-1103' : '';
const message = (e: unknown) => e instanceof Error ? e.message : 'This sample action could not be completed.';
function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MoneyWorkspace({ additionalProfiles = noProfiles, initialProfileId, demoContext }: { additionalProfiles?: OfferingProfile[]; initialProfileId?: string; demoContext?: MerchantOnboardingDemoContext | null }) {
  const inheritedDemo = useMerchantOnboardingDemoContext();
  const activeDemo = demoContext ?? inheritedDemo;
  const profiles = useMemo(() => extendOfferingProfiles(additionalProfiles), [additionalProfiles]);
  const [initialized, setInitialized] = useState(false), [profileId, setProfileId] = useState(initialProfileId ?? demoContext?.profileId ?? 'restaurant'), [location, setLocation] = useState('Westlands');
  const [invalidProfile, setInvalidProfile] = useState('');
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0]!;
  const demoProfileId = activeDemo?.profileId;
  useEffect(() => {
    if (!initialProfileId && demoProfileId && profiles.some((item) => item.id === demoProfileId))
      setProfileId(demoProfileId);
  }, [initialProfileId, demoProfileId, profiles]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null), [offeringId, setOfferingId] = useState(''), [method, setMethod] = useState('');
  const [source, setSource] = useState<MoneySource | null>(null), [offeringsSource, setOfferingsSource] = useState<OfferingsSource | null>(null);
  const [scenario, setScenario] = useState<Scenario>('current'), [role, setRole] = useState<Role>('manager');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [externalChange, setExternalChange] = useState(false);
  const [tab, setTab] = useState<Tab>('Overview'), [period, setPeriod] = useState<Period>('range'), [selected, setSelected] = useState(''), [search, setSearch] = useState(''), [filter, setFilter] = useState('All');
  const [payoutDetailId, setPayoutDetailId] = useState('SET-1103');
  const [panel, setPanel] = useState<Panel>(null), [definition, setDefinition] = useState<Metric | null>(null), [panelError, setPanelError] = useState(''), [busy, setBusy] = useState(false);
  const [sampleSchema, setSampleSchema] = useState(''), [features, setFeatures] = useState<Features>({ payouts: false, balances: false, security: false, reservation: false, refunds: true });
  const [choices, setChoices] = useState({ advance: true, bookingFee: false, guarantee: false, cancellationCharge: true, refundTerms: 'refundable' as ReservationPolicy['refundTerms'], bookingFeeRefundTerms: 'not-configured' as ReservationPolicy['bookingFeeRefundTerms'], cancellation: 'customer' as ReservationPolicy['cancellation'] });
  const [draft, setDraft] = useState<RefundDraft | null>(null), [draftStage, setDraftStage] = useState<'edit' | 'review'>('edit'), [result, setResult] = useState<'unknown' | 'confirmed' | 'rejected'>('unknown');
  const [refundTarget, setRefundTarget] = useState<RefundKind>('security');
  const [refundRecord, setRefundRecord] = useState('');
  const desiredOffering = useRef(''), desiredTab = useRef<Tab | null>(null), desiredSelected = useRef(''), scopeRef = useRef('');
  const offering = catalogue?.offerings.find((o) => o.id === offeringId && o.publication !== 'archived');
  const ctx = useMemo<Context | null>(() => offering ? { profile, offering, location, method: method || (offering.fulfilmentMethods ?? fulfilmentOptions(offering.schemaId))[0]!, scenario, role } : null, [profile, offering, location, method, scenario, role]);
  const resolution = useMemo(() => {
    if (!offering || !catalogue) return { view: null, error: '' };
    try { return { view: resolveMoneyView(profile, offering, catalogue.configuration.enabledSchemas), error: '' }; }
    catch (e) { return { view: null, error: message(e) }; }
  }, [profile, offering, catalogue]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), id = params.get('profile');
    if (id && profiles.some((p) => p.id === id)) setProfileId(id);
    else if (id) setInvalidProfile(id);
    if (params.get('location')) setLocation(params.get('location')!);
    if (params.get('method')) setMethod(params.get('method')!);
    const sampleScenario = params.get('scenario');
    if (sampleScenario && Object.hasOwn(scenarioNames, sampleScenario)) setScenario(sampleScenario as Scenario);
    if (params.get('role') === 'viewer') setRole('viewer');
    if (params.get('period') === 'today') setPeriod('today');
    desiredOffering.current = params.get('offering') ?? '';
    desiredTab.current = (['Overview', 'Transactions', 'Balances', 'Security', 'Reservations', 'Payouts', 'Statements'] as Tab[]).find((t) => t === params.get('tab')) ?? null;
    desiredSelected.current = params.get('selected') ?? '';
    const storage = { getItem: (k: string) => window.localStorage.getItem(k), setItem: (k: string, v: string) => window.localStorage.setItem(k, v), removeItem: (k: string) => window.localStorage.removeItem(k) };
    setSource(localMoneySource(storage)); setOfferingsSource(localOfferingsSource(storage)); setInitialized(true);
  }, [profiles]);
  useEffect(() => {
    if (!initialized || !offeringsSource) return;
    if (invalidProfile) { setCatalogue(null); setSnapshot(null); setLoading(false); setError('This sample specialty is not registered. Choose a supported specialty.'); return; }
    let current = true; setCatalogue(null); setSnapshot(null); setLoading(true); setError('');
    void offeringsSource.load(profile).then((data) => {
      if (!current) return;
      const requested = desiredOffering.current;
      const item = requested ? data.offerings.find((o) => o.id === requested && o.publication !== 'archived') : data.offerings.find((o) => o.publication !== 'archived');
      setCatalogue(data); setOfferingId(item?.id ?? '');
      if (!item) { desiredOffering.current = ''; setLoading(false); setError(requested ? 'The selected offering is no longer available. Choose a current offering.' : 'Add a sample offering before viewing Money.'); return; }
      const methods = item.fulfilmentMethods ?? fulfilmentOptions(item.schemaId);
      setMethod((old) => methods.includes(old) ? old : methods[0] ?? 'Merchant location');
      desiredOffering.current = '';
    }).catch((e) => { if (current) { setError(message(e)); setLoading(false); } });
    return () => { current = false; };
  }, [initialized, offeringsSource, profile, invalidProfile]);
  const reload = useCallback(async () => {
    if (!ctx || !source) return;
    setLoading(true); setError('');
    try { const s = await source.load(ctx); setSnapshot(s); setExternalChange(false); }
    catch (e) { setSnapshot(null); setError(message(e)); }
    finally { setLoading(false); }
  }, [ctx, source]);
  useEffect(() => {
    if (!ctx || !source) return;
    let current = true; setLoading(true); setError('');
    void source.load(ctx).then((s) => {
      if (!current) return;
      setSnapshot(s); setExternalChange(false);
      if (scopeRef.current !== s.scope) {
        scopeRef.current = s.scope;
        const preferred = desiredTab.current && tabsFor(s).includes(desiredTab.current) ? desiredTab.current : s.features.security ? 'Security' : s.features.balances ? 'Balances' : 'Overview';
        setTab(preferred); setSelected(desiredSelected.current || selectedFor(preferred)); setSearch(''); setFilter('All'); desiredTab.current = null; desiredSelected.current = '';
      }
    }).catch((e) => { if (current) { setSnapshot(null); setError(message(e)); } }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [ctx, source]);
  useEffect(() => {
    if (!ctx) return;
    window.history.replaceState(null, '', appendMerchantOnboardingDemoContext(moneyHref(ctx, { tab, period, ...(selected ? { selected } : {}) }), activeDemo));
  }, [ctx, tab, period, selected, activeDemo]);
  useEffect(() => {
    const changed = (e: StorageEvent) => { if (ctx && e.key === storageKey(ctx)) setExternalChange(true); };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, [ctx]);
  useEffect(() => { if (panel === 'sample' && snapshot) setFeatures(snapshot.features); }, [panel, snapshot]);
  function changeTab(next: Tab) { setTab(next); setSelected(selectedFor(next)); setSearch(''); setFilter('All'); }
  function show(next: Panel) { setPanelError(''); setPanel(next); }
  function changeProfile(id: string) { if (!profiles.some((p) => p.id === id)) return; setInvalidProfile(''); desiredOffering.current = ''; setProfileId(id); setOfferingId(''); setMethod(''); setSampleSchema(''); scopeRef.current = ''; setNotice(''); }
  async function run(fn: () => Promise<void>) { setBusy(true); setPanelError(''); try { await fn(); } catch (e) { setPanelError(message(e)); } finally { setBusy(false); } }
  async function addSampleActivity() {
    if (!offeringsSource || !catalogue || !sampleSchema) return;
    if (!availableSchemas(profile).includes(sampleSchema)) throw new Error('Choose a registered activity for this specialty.');
    const example = seedCatalogue({ ...profile, schema: sampleSchema }).offerings[0]!;
    const item = { ...example, id: `${profile.id}-money-${crypto.randomUUID()}`, name: `${profile.name} · ${schemas[sampleSchema]!.label} sample` };
    const next = { ...catalogue, configuration: { ...catalogue.configuration, enabledSchemas: [...new Set([...catalogue.configuration.enabledSchemas, sampleSchema])] }, offerings: [...catalogue.offerings, item] };
    await offeringsSource.replace(profile, next); setCatalogue(next); setOfferingId(item.id); setMethod((item.fulfilmentMethods ?? fulfilmentOptions(item.schemaId))[0]!); setSampleSchema(''); setNotice('Sample activity added through Offerings.');
  }
  async function saveFeatures() {
    if (!source || !ctx || !snapshot) return;
    if (features.reservation && !snapshot.features.reservation && !choices.advance && !choices.bookingFee && !choices.guarantee && !choices.cancellationCharge) throw new Error('Choose an actual reservation money component, or leave this sample disabled.');
    const policy = features.reservation && !snapshot.features.reservation ? policyFromChoices(choices) : undefined;
    const next = await source.configure(ctx, features, snapshot.revision, policy); setSnapshot(next); setNotice('Sample capabilities updated for this offering and location.'); show(null);
    if (!tabsFor(next).includes(tab)) changeTab('Overview');
  }
  function refundRecordId(kind: RefundKind) {
    return kind === 'security' ? (snapshot?.security.find((v) => v.id === selected) ?? snapshot?.security[0])?.id ?? '' : kind === 'sale' ? selected : `BK-1048:${kind}`;
  }
  function startRefund(kind: RefundKind, originalRecordId?: string) {
    if (!snapshot || !ctx) return;
    const recordId = originalRecordId ?? refundRecordId(kind), eligibility = refundAvailability(ctx, snapshot, kind, recordId);
    if (eligibility.reason || !eligibility.remaining) { setNotice(eligibility.reason || 'There is no refundable sample balance.'); return; }
    const existing = snapshot.drafts.find((d) => d.kind === kind && d.recordId === recordId);
    setRefundTarget(kind); setRefundRecord(recordId); setDraft(existing ?? { id: `OP-${crypto.randomUUID()}`, kind, recordId, amount: eligibility.remaining, reason: '' }); setDraftStage('edit'); setResult('unknown'); show('refund');
  }
  function startReconcile(kind: RefundKind, recordId?: string) { setRefundTarget(kind); setRefundRecord(recordId ?? refundRecordId(kind)); show('reconcile'); }
  function act(action: Action, recordId?: string) {
    const kind: RefundKind = tab === 'Security' ? 'security' : tab === 'Reservations' ? 'advance' : 'sale';
    if (action === 'refund') return startRefund(kind, recordId);
    if (action === 'reconcile') return startReconcile(kind, recordId);
    if (action === 'downloadStatement') return exportStatement();
    if (action === 'payout') setPayoutDetailId(recordId ?? 'SET-1103');
    show(action);
  }
  async function saveDraft() {
    if (!ctx || !source || !snapshot || !draft) return;
    const next = await source.saveDraft(ctx, draft, snapshot.revision); setSnapshot(next); setDraftStage('review');
  }
  async function submitDraft() {
    if (!ctx || !source || !snapshot || !draft) return;
    const next = await source.submitRefund(ctx, draft.id, result, snapshot.revision); setSnapshot(next); setSelected(['advance', 'booking', 'guarantee'].includes(draft.kind) ? draft.kind : draft.recordId); setNotice(`Sample refund result: ${result}. No money moved.`); show(null);
  }
  async function reconcile(resultValue: 'confirmed' | 'rejected') {
    if (!ctx || !source || !snapshot) return;
    const op = refundAvailability(ctx, snapshot, refundTarget, refundRecord).unknown;
    if (!op) throw new Error('No unknown operation is linked to this record.');
    const next = await source.reconcile(ctx, op.id, resultValue, snapshot.revision); setSnapshot(next); setNotice(`Sample source ${resultValue} the existing refund.`); show(null);
  }
  async function refreshStatement() {
    if (!ctx || !source || !snapshot) return;
    setBusy(true);
    try { setSnapshot(await source.refreshStatement(ctx, snapshot.revision)); setNotice('Sample owner statement refreshed.'); }
    catch (e) { setNotice(message(e)); }
    finally { setBusy(false); }
  }
  function exportSample() {
    if (!ctx || !snapshot || !resolution.view) return;
    const exportPeriod = tab === 'Statements' ? (selected === 'STM-TODAY' ? 'today' : 'range') : period;
    download('nexg-money-sample.csv', sampleCsv(ctx, resolution.view, snapshot, tab, tab === 'Statements' ? '' : search, tab === 'Statements' ? 'All' : filter, exportPeriod)); setNotice('Sample report downloaded.');
  }
  function exportStatement() {
    if (!ctx || !snapshot || !resolution.view) return;
    const reportPeriod = tab === 'Statements' ? (selected === 'STM-TODAY' ? 'today' : 'range') : tab === 'Payouts' ? 'range' : period;
    download('nexg-money-statement-sample.csv', sampleCsv(ctx, resolution.view, snapshot, 'Statements', '', 'All', reportPeriod));
    setNotice('Sample statement report downloaded.');
  }
  const draftSecurity = snapshot?.security.find((v) => v.id === draft?.recordId);
  const activeRefund = ctx && snapshot && refundRecord ? refundAvailability(ctx, snapshot, refundTarget, refundRecord) : null;
  const draftRefund = ctx && snapshot && draft ? refundAvailability(ctx, snapshot, draft.kind, draft.recordId) : null;
  const statementPending = !!snapshot && statementNeedsRefresh(snapshot);
  const unknownSaleRefund = !!snapshot?.operations.some((o) => o.kind === 'sale-refund' && o.result === 'unknown');
  const statementPeriod = tab === 'Statements' ? (selected === 'STM-TODAY' ? 'today' : 'range') : tab === 'Payouts' ? 'range' : period;
  const scopeReady = !!ctx && !!snapshot && snapshot.scope === scopeKey(ctx) && !loading;
  const activeInvoice = resolution.view ? invoicesForSelected(resolution.view, selected) : null;
  const canChange = !!ctx && !!snapshot && role === 'manager' && scenario === 'current' && ctx.offering.sync === 'current' && snapshot.offeringVersion === ctx.offering.version;
  const headerLocation = <label className="flex items-center gap-1 text-xs font-bold"><MapPin size={16} /><span className="sr-only">Location</span><select value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-lg border border-[#e4ddd0] bg-white px-2 py-1.5"><option>Westlands</option><option>Kilimani</option><option>Industrial Area</option></select></label>;
  const sampleControl = <button className="text-xs font-bold text-[#805b12] underline underline-offset-2" onClick={() => show('sample')}>Choose sample state</button>;
  return <MerchantLivePreviewShell active="Money" businessName={activeDemo?.businessName} demoContext={activeDemo} locationControl={headerLocation} sampleControl={sampleControl} accountInitials={activeDemo?.initials ?? (profile.id === 'self_drive' ? 'NM' : 'NC')}>
    <MoneyFrame
      description={resolution.view ? workflowCopy(resolution.view.schemaId).heading : 'Understand your sales, balances and settlements.'}
      profile={invalidProfile || profile.id}
      schema={offering?.schemaId ?? ''}
      ready={scopeReady}
      actions={<><button className="mo-button" onClick={() => show('sample')}><Settings2 size={15} /> Sample specialty</button><button className="mo-button" onClick={exportSample} disabled={!snapshot || !ctx}><Download size={15} /> Export</button></>}
    >
      <div className="mo-context">
        <label><span className="mo-sr">Offering</span><select aria-label="Offering" value={offeringId} onChange={(e) => { const item = catalogue?.offerings.find((o) => o.id === e.target.value); setOfferingId(e.target.value); if (item) { setError(''); setMethod((item.fulfilmentMethods ?? fulfilmentOptions(item.schemaId))[0]!); } }}>{!offeringId && <option value="">Choose an offering</option>}{catalogue?.offerings.filter((o) => o.publication !== 'archived').map((o) => <option key={o.id} value={o.id}>{o.name} · {o.publication}</option>)}</select></label>
        {offering && <label><span className="mo-sr">Fulfilment method</span><select aria-label="Fulfilment method" value={method} onChange={(e) => setMethod(e.target.value)}>{(offering.fulfilmentMethods ?? fulfilmentOptions(offering.schemaId)).map((m) => <option key={m}>{m}</option>)}</select></label>}
        {['Overview', 'Transactions'].includes(tab) && <label><span className="mo-sr">Reporting period</span><select aria-label="Reporting period" value={period} onChange={(e) => { setPeriod(e.target.value as Period); setSelected(tab === 'Transactions' ? 'TX-6112' : ''); }}><option value="range">1–3 Nov 2026</option><option value="today">Today · 3 Nov</option></select></label>}
        <span className="mo-source"><i className={`mo-dot ${scenario === 'current' ? '' : scenario === 'offline' || scenario === 'error' ? 'mo-dot-red' : 'mo-dot-amber'}`} />{scenarioNames[scenario]} · 09:40 EAT</span><button className="mo-icon" aria-label="Reload sample" onClick={() => void reload()}><RefreshCw size={15} /></button><button className="mo-link" onClick={() => show('source')}>Source details</button>{statementPending && !unknownSaleRefund && <button className="mo-link" disabled={!canChange || busy} onClick={() => void refreshStatement()}>Refresh sample statement</button>}
      </div>
      {scopeReady && snapshot && <MoneyTabs tabs={tabsFor(snapshot)} active={tab} onSelect={changeTab} />}
      {(externalChange || notice) && <div className={`mo-note ${externalChange ? 'mo-note-warn' : ''}`} role="status">{externalChange ? <>This sample changed in another view. <button className="mo-link" onClick={() => void reload()}>Reload the current revision</button></> : notice}</div>}
      {loading || (!!ctx && !!snapshot && !scopeReady) ? <div className="mo-note" role="status">Loading sample money…</div> : error || resolution.error ? <div className="mo-note mo-note-error" role="alert">{error || resolution.error} <button className="mo-link" onClick={() => show('sample')}>Choose another sample</button></div> : ctx && snapshot && resolution.view && scopeReady ? <MoneyContent c={ctx} view={resolution.view} snapshot={snapshot} tab={tab} period={period} selected={selected} search={search} filter={filter} onSelect={(id, focus) => { setSelected(id); if (focus && window.innerWidth < 1024) requestAnimationFrame(() => { const detail = document.querySelector<HTMLElement>('[data-testid="money-inspector"]'); detail?.scrollIntoView({ block: 'start' }); detail?.focus({ preventScroll: true }); }); }} onSearch={setSearch} onFilter={setFilter} onInfo={(m) => { setDefinition(m); show('definition'); }} onAction={act} onChangeTab={changeTab} /> : <div className="mo-note">Choose a sample offering to view Money.</div>}
      <footer className="mo-footer"><span>{invalidProfile ? 'Unregistered specialty' : profile.name} · {location} · Sample snapshot{snapshot ? ` · Revision ${snapshot.revision}` : ''} · 09:40 EAT</span><div className="mo-footer-actions"><button className="mo-link" onClick={() => show('history')}><History size={13} style={{ display: 'inline' }} /> History</button>{ctx && <a className="mo-link" href={appendMerchantOnboardingDemoContext(offeringsHref(ctx, { tab, selected, period }), activeDemo)}>View in Offerings</a>}<button className="mo-link" onClick={exportSample} disabled={!snapshot}>Export sample</button></div></footer>
    </MoneyFrame>
    {panel === 'sample' && <Modal title="Money sample configuration" description="Preview a specialty, offering and source state. Changes apply only to this browser sample." onClose={() => show(null)} footer={<button className="mo-button" disabled={loading && !invalidProfile} onClick={() => show(null)}>Done</button>}>
      <div className="mo-form"><label className="mo-field">Sample specialty<select aria-label="Sample specialty" value={invalidProfile ? '' : profileId} onChange={(e) => changeProfile(e.target.value)}>{invalidProfile && <option value="">Choose a registered specialty</option>}{[...new Set(profiles.map((p) => p.categoryId))].map((cat) => <optgroup key={cat} label={profileInfo(profiles.find((p) => p.categoryId === cat)?.id ?? '')?.categoryName ?? cat}>{profiles.filter((p) => p.categoryId === cat).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}</select></label>
        <label className="mo-field">Source state<select aria-label="Source state" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>{Object.entries(scenarioNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="mo-field">Sample role<select aria-label="Sample role" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="manager">Manager</option><option value="viewer">Viewer · read only</option></select></label>
        <div className="mo-group"><h3>Add a sample activity</h3><p>Candidate activities are enabled only when you create a sample offering.</p><label className="mo-field">Candidate offering type<select aria-label="Candidate offering type" value={sampleSchema} onChange={(e) => setSampleSchema(e.target.value)}><option value="">Choose a registered type</option>{availableSchemas(profile).map((id) => <option key={id} value={id}>{schemas[id]?.label} · {schemas[id]?.model}</option>)}</select></label><button className="mo-button" disabled={!sampleSchema || !catalogue || busy} onClick={() => void run(addSampleActivity)}>Create sample activity</button></div>
        {ctx && snapshot && <div className="mo-group"><h3>Sample financial capabilities</h3><p>These represent explicit source and policy support for the selected offering; specialty alone does not enable them.</p><label className="mo-check"><input type="checkbox" checked={features.payouts} onChange={(e) => setFeatures({ ...features, payouts: e.target.checked })} /> NEXG settlement and payout source</label><label className="mo-check"><input type="checkbox" checked={features.balances} onChange={(e) => setFeatures({ ...features, balances: e.target.checked })} /> Customer invoices and balances source</label><label className="mo-check"><input type="checkbox" checked={features.refunds} onChange={(e) => setFeatures({ ...features, refunds: e.target.checked })} /> Sample refund source</label>{supportsSecurity(ctx.offering.schemaId) && <label className="mo-check"><input type="checkbox" checked={features.security} onChange={(e) => setFeatures({ ...features, security: e.target.checked })} /> Accepted security policy and source</label>}{isReservation(ctx.offering.schemaId) && <label className="mo-check"><input type="checkbox" checked={features.reservation} onChange={(e) => setFeatures({ ...features, reservation: e.target.checked })} /> Accepted reservation money policy</label>}
          {features.reservation && !snapshot.features.reservation && <div className="mo-group"><h3>Accepted sample terms</h3><p>Components can coexist. Leave the policy disabled for reservations with no fees or guarantees.</p>{(['advance', 'bookingFee', 'guarantee', 'cancellationCharge'] as const).map((key) => <label className="mo-check" key={key}><input type="checkbox" checked={choices[key]} onChange={(e) => setChoices({ ...choices, [key]: e.target.checked })} />{{ advance: 'Advance credited to the bill · KES 500', bookingFee: 'Separate booking fee · KES 100', guarantee: 'Refundable guarantee · KES 1,000', cancellationCharge: 'Conditional cancellation / no-show charge · KES 300' }[key]}</label>)}{choices.advance && <label className="mo-field">Advance refund terms<select value={choices.refundTerms} onChange={(e) => setChoices({ ...choices, refundTerms: e.target.value as ReservationPolicy['refundTerms'] })}><option value="refundable">Refundable under accepted terms</option><option value="non-refundable">Explicitly non-refundable</option><option value="not-configured">Not configured · eligibility unknown</option></select></label>}{choices.bookingFee && <label className="mo-field">Booking fee refund terms<select value={choices.bookingFeeRefundTerms} onChange={(e) => setChoices({ ...choices, bookingFeeRefundTerms: e.target.value as ReservationPolicy['bookingFeeRefundTerms'] })}><option value="not-configured">Not configured · eligibility unknown</option><option value="refundable">Refundable under accepted terms</option><option value="non-refundable">Explicitly non-refundable</option></select></label>}<label className="mo-field">Sample trigger<select value={choices.cancellation} onChange={(e) => setChoices({ ...choices, cancellation: e.target.value as ReservationPolicy['cancellation'] })}><option value="customer">Customer cancellation confirmed</option><option value="merchant">Merchant cancellation</option><option value="no_show">No-show explicitly confirmed</option><option value="none">No cancellation or no-show</option></select></label></div>}
          {snapshot.features.reservation && <p>Historical accepted terms stay attached to the reservation. Reset the sample to choose a different example.</p>}
          <button className="mo-button mo-primary" disabled={!canChange || busy} onClick={() => void run(saveFeatures)}>Apply sample capabilities</button>{!canChange && <p>Select a current source and manager role to change this sample.</p>}</div>}
        <button className="mo-link" onClick={() => show('reset')}>Reset this Money sample</button>{panelError && <p className="mo-note mo-note-error" role="alert">{panelError}</p>}
      </div>
    </Modal>}
    {panel === 'definition' && definition && <Modal title={definition.label} description="Definition and scope" onClose={() => show(null)}><p>{definition.definition}</p><p>Sample scope: {profile.name} · {location} · KES · 3 Nov 2026, 09:40 EAT. {tab === 'Transactions' ? `The selected period and filters (${filter}${search ? `, search: ${search}` : ''}) determine the records in this figure.` : 'Owner-provided amounts retain their own reporting basis.'}</p></Modal>}
    {panel === 'source' && <Modal title="Source details" description="Where the displayed sample facts come from." onClose={() => show(null)}><div className="mo-form"><Pair label="Current state" value={scenarioNames[scenario]} /><Pair label="Offering" value={offering?.name ?? 'Not selected'} /><Pair label="Location / method" value={`${location} · ${method}`} /><Pair label="Snapshot" value="3 Nov 2026 · 09:40 EAT" /><p>Figures and owner results here are local examples. External finance, ERP, payment and payout providers are not connected.</p><p>A stale, partial or unknown source does not turn missing values into zero. An ERP-owned invoice is read only in this sample.</p>{offering?.reservationFee && offering.reservationFee.mode !== 'none' && <p className="mo-note">Offerings has a configured reservation fee. This alone does not prove that a customer accepted or paid it.</p>}</div></Modal>}
    {panel === 'history' && <Modal title="Sample history" description="Local changes for the selected offering and location." onClose={() => show(null)}>{snapshot?.history.length ? snapshot.history.map((h) => <p key={h.revision}><strong>Revision {h.revision}</strong> · {h.description}<br /><span className="mo-muted">{h.at}</span></p>) : <p>No local sample changes yet.</p>}</Modal>}
    {panel === 'reset' && <Modal title="Reset this Money sample?" description="This clears only the selected local Money sample and its drafts." onClose={() => show(null)} footer={<><button className="mo-button" onClick={() => show('sample')}>Keep sample</button><button className="mo-button mo-primary" disabled={!ctx || !source || busy} onClick={() => void run(async () => { if (ctx && source) { const next = await source.reset(ctx); setSnapshot(next); const target: Tab = next.features.security ? 'Security' : next.features.balances ? 'Balances' : 'Overview'; changeTab(target); setNotice('Money sample reset.'); show(null); } })}>Reset sample</button></>}><p>Offerings, Work and other locations are not reset.</p>{panelError && <p className="mo-note mo-note-error" role="alert">{panelError}</p>}</Modal>}
    {panel === 'refund' && draft && draftRefund && <Modal title={draftStage === 'edit' ? 'Review sample refund' : 'Confirm sample refund'} description={`${draft.kind === 'security' ? `Security · ${draftSecurity?.policyVersion ?? ''}` : draft.kind === 'sale' ? 'Original sale' : `${draft.kind === 'booking' ? 'Booking fee' : draft.kind === 'guarantee' ? 'Guarantee' : 'Advance'} · ${snapshot?.policy?.acceptedVersion ?? ''}`} · ${draft.recordId}`} onClose={() => show(null)} footer={<><button className="mo-button" onClick={() => show(null)}>Close</button>{draftStage === 'edit' ? <button className="mo-button mo-primary" disabled={!canChange || busy} onClick={() => void run(saveDraft)}>Save and review</button> : <button className="mo-button mo-primary" disabled={!canChange || busy} onClick={() => void run(submitDraft)}>Submit sample result</button>}</>}><div className="mo-form"><Pair label="Refundable sample balance" value={formatAmount(draftRefund.remaining)} />{draftStage === 'edit' ? <><label className="mo-field">Refund amount (KES)<input aria-label="Refund amount (KES)" type="number" min="0.01" step="0.01" defaultValue={draft.amount / 10 ** KES.minorUnit} onChange={(e) => setDraft({ ...draft, amount: parseMinor(e.target.value) ?? 0 })} /></label><label className="mo-field">Reason<textarea aria-label="Refund reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} rows={2} /></label></> : <><Pair label="Sample refund" value={formatAmount(draft.amount)} /><Pair label="Reason" value={draft.reason} /><label className="mo-field">Simulated source outcome<select value={result} onChange={(e) => setResult(e.target.value as typeof result)}><option value="unknown">Unknown · requires checking</option><option value="confirmed">Confirmed by sample source</option><option value="rejected">Rejected by sample source</option></select></label><p className="mo-note">Submission changes only the local sample. An unknown result keeps the obligation recorded and blocks a duplicate.</p></>}{panelError && <><p className="mo-note mo-note-error" role="alert">{panelError}</p>{panelError.includes('changed in another view') && <button className="mo-button" onClick={() => void run(async () => { await reload(); setPanelError(''); setDraftStage('edit'); })}>Reload current sample and keep input</button>}</>}</div></Modal>}
    {panel === 'reconcile' && activeRefund?.unknown && <Modal title={`Check ${activeRefund.unknown.id}`} description="Resolve the original sample operation, without submitting a second refund." onClose={() => show(null)} footer={<><button className="mo-button" onClick={() => show(null)}>Keep checking</button><button className="mo-button" disabled={!canChange || busy} onClick={() => void run(() => reconcile('rejected'))}>Sample says rejected</button><button className="mo-button mo-primary" disabled={!canChange || busy} onClick={() => void run(() => reconcile('confirmed'))}>Sample confirms refund</button></>}><Pair label="Requested" value={formatAmount(activeRefund.unknown.amount)} /><Pair label="Still recorded" value={formatAmount(activeRefund.remaining)} /><p className="mo-note mo-note-warn">Choose an outcome only to simulate what the source reports. No live provider is contacted.</p>{panelError && <p className="mo-note mo-note-error" role="alert">{panelError}</p>}</Modal>}
    {panel === 'invoice' && activeInvoice && <Modal title={`Invoice ${activeInvoice.id}`} description="Sample owner-issued invoice · ERP read only" onClose={() => show(null)}><Pair label="Work" value={activeInvoice.work} /><Pair label="Invoice total" value={formatAmount(activeInvoice.total)} /><Pair label="Credit note" value={formatAmount(activeInvoice.credit)} /><Pair label="Payments applied" value={formatAmount(activeInvoice.applied)} /><Pair strong label="Amount due" value={formatAmount(activeInvoice.total - activeInvoice.credit - activeInvoice.applied)} /><p className="mo-note">This example is read only. The invoice owner supplies payment allocations and corrections.</p></Modal>}
    {panel === 'payout' && snapshot && ctx && (() => {
      const data = payoutData(ctx, snapshot), record = data.records.find((item) => item.id === payoutDetailId);
      if (!record) return <Modal title="Payout details unavailable" description="The sample source has no matching record." onClose={() => show(null)}><p>Check the source state and try again.</p></Modal>;
      return <Modal title={`${record.kind} ${record.id}`} description="Owner-issued sample · NEXG-collected only" onClose={() => show(null)}>{record.kind === 'Payout' ? <><Pair label="Status" value={record.status} /><Pair label="Amount" value={formatAmount(record.amount)} /><Pair label="Period / basis" value={record.basis} /><Pair label="Destination" value={record.destination} /><Pair label="Date" value="Not supplied" /><Pair label="Source" value={record.source} /><p className="mo-note">The displayed status is the sample source result. No payout action is connected.</p></> : !data.currentKnown ? <p className="mo-note mo-note-warn">The current settlement is unavailable until the source is complete and the sample statement is refreshed.</p> : <><Pair label="Opening payable" value={formatAmount(sampleSettlement.opening)} /><Pair label="Period net payable" value={formatAmount(snapshot.statement.netPayable)} /><Pair label="Confirmed earlier payout" value={`− ${formatAmount(sampleSettlement.earlierPayout)}`} /><Pair label="Settlement reserve" value={`− ${formatAmount(sampleSettlement.reserve)}`} /><Pair strong label="Eligible" value={formatAmount(snapshot.statement.eligible)} /><Pair label="Destination" value={sampleSettlement.destination} /><Pair label="Source" value={sampleSettlement.source} /><p className="mo-note">Eligible balance is not a sent or paid payout. No payout action is connected.</p></>}</Modal>;
    })()}
    {panel === 'statement' && snapshot && <Modal title="Sample statement" description={`${statementPeriod === 'today' ? '3 Nov' : '1–3 Nov'} 2026 · KES · 09:40 EAT`} onClose={() => show(null)} footer={<button className="mo-button mo-primary" disabled={statementPending} onClick={exportStatement}>Download sample report</button>}>{statementPending ? <p className="mo-note mo-note-warn">The current statement needs an owner refresh after the sample refund.</p> : <><Pair label="Posted charges" value={formatAmount((statementPeriod === 'today' ? snapshot.statement.today : snapshot.statement).gross)} /><Pair label="Confirmed refunds" value={formatAmount((statementPeriod === 'today' ? snapshot.statement.today : snapshot.statement).refunds)} /><Pair label="Posted finance fees" value={formatAmount((statementPeriod === 'today' ? snapshot.statement.today : snapshot.statement).fees)} /></>}<p className="mo-note">The local report is a sample, not an issued fiscal document.</p></Modal>}
    {panel === 'policy' && snapshot?.policy && <Modal title="Accepted reservation policy" description={`Version ${snapshot.policy.acceptedVersion} · sample reservation BK-1048`} onClose={() => show(null)}><Pair label="Advance" value={formatAmount(snapshot.policy.advance)} /><Pair label="Separate booking fee" value={formatAmount(snapshot.policy.bookingFee)} /><Pair label="Guarantee" value={formatAmount(snapshot.policy.guarantee)} /><Pair label="Conditional cancellation / no-show charge" value={formatAmount(snapshot.policy.cancellationCharge)} /><Pair label="Charge posted" value={snapshot.policy.ownerPosted ? `Yes · ${snapshot.policy.cancellation === 'no_show' ? 'confirmed no-show' : 'customer cancellation'}` : 'No'} /><Pair label="Advance refund terms" value={snapshot.policy.refundTerms.replace('-', ' ')} /><Pair label="Booking fee refund terms" value={snapshot.policy.bookingFeeRefundTerms.replace('-', ' ')} /><p className="mo-note">A charge can be allocated from an advance once. A refund or credit needs its own confirmed outcome.</p></Modal>}
    {panel === 'reservationRefunds' && ctx && snapshot?.policy && <Modal title="Reservation refunds" description="Each collected component has its own terms and outcome." onClose={() => show(null)}><div className="mo-form">{(['booking', 'guarantee'] as const).map((kind) => { const state = refundAvailability(ctx, snapshot, kind, `BK-1048:${kind}`), label = kind === 'booking' ? 'Booking fee' : 'Guarantee', collected = kind === 'booking' ? snapshot.policy!.bookingFee : snapshot.policy!.guarantee; if (!collected) return null; return <section className="mo-group" key={kind}><h3>{label}</h3><Pair label="Remaining recorded amount" value={formatAmount(state.remaining)} />{state.reason && <p>{state.reason}</p>}{state.unknown ? <button className="mo-button" disabled={!canChange} onClick={() => startReconcile(kind)}>Check {label.toLowerCase()} refund</button> : !state.reason && state.remaining > 0 ? <button className="mo-button" disabled={!canChange} onClick={() => startRefund(kind)}>Review {label.toLowerCase()} refund</button> : null}</section>; })}</div></Modal>}
  </MerchantLivePreviewShell>;
}
function invoicesForSelected(view: NonNullable<ReturnType<typeof resolveMoneyView>>, selected: string) {
  // Import at module scope below so invoice details use the same sample records as the table.
  return invoiceRecords(view).find((i) => i.id === selected) ?? invoiceRecords(view).find((i) => i.id === 'INV-0832');
}
