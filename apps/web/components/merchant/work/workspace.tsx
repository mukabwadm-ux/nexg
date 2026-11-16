'use client';

import Link from 'next/link';
import { listBookingProfiles } from '@nexg/booking-config/profiles';
import { TableViewport } from '@nexg/ui/table-viewport';
import { ArrowLeft, Check, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import offeringStyles from '../offerings/workspace.module.css';
import workspaceStyles from '../workspace/workspace.module.css';
import { WorkSteps } from './work-steps';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  candidateWorkflows,
  defaultWorkflow,
  inTab,
  sampleSource,
  templates,
  type WorkRecord,
  type WorkSource,
  type WorkTab,
  type WorkflowId,
} from './model';

const profiles = listBookingProfiles();
const initialProfile =
  profiles.find((p) => p.categoryId === 'groceries_essentials' && p.defaultModelId === 'ORDER') ??
  profiles[0]!;
const tabs: { id: WorkTab; label: string }[] = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'progress', label: 'In progress' },
  { id: 'history', label: 'History' },
];

export function WorkWorkspace({
  source = sampleSource,
  preview = true,
  initialWorkflow = 'WF_ORDER',
  initialWorkId,
}: {
  source?: WorkSource;
  preview?: boolean;
  initialWorkflow?: WorkflowId;
  initialWorkId?: string;
}) {
  const demoContext = useMerchantOnboardingDemoContext();
  const availableProfiles = useMemo(() => {
    if (!demoContext) return profiles;
    const selected = demoContext.subcategories.flatMap(({ id }) => {
      const match = profiles.find((item) => item.subcategoryId === id);
      return match ? [match] : [];
    });
    return selected.length ? selected : profiles;
  }, [demoContext]);
  const contextProfile =
    availableProfiles.find((item) => item.subcategoryId === demoContext?.profileId) ??
    availableProfiles[0] ??
    initialProfile;
  const [profileId, setProfileId] = useState(contextProfile.subcategoryId);
  const profile = profiles.find((p) => p.subcategoryId === profileId) ?? initialProfile;
  const candidates = useMemo(
    () =>
      preview
        ? candidateWorkflows(profile)
        : (['WF_ORDER', 'WF_SCHEDULED_WORK', 'WF_BOOKING'] as const),
    [profile, preview],
  );
  const [workflow, setWorkflow] = useState<WorkflowId | undefined>(() =>
    preview ? defaultWorkflow(contextProfile) : initialWorkflow,
  );
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<WorkTab>('progress');
  const [search, setSearch] = useState('');
  const [operator, setOperator] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [detailTab, setDetailTab] = useState<'activity' | 'details'>('details');

  useEffect(() => {
    if (!preview || !demoContext) return;
    setProfileId(contextProfile.subcategoryId);
    setWorkflow(defaultWorkflow(contextProfile));
    setTab('progress');
  }, [demoContext, contextProfile, preview]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setRecords([]);
    setSelectedId(null);
    setNotice('');
    if (!workflow) {
      setRecords([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    source
      .list(workflow, profile)
      .then((items) => {
        if (active) {
          setRecords(items);
          const linked =
            workflow === initialWorkflow
              ? items.find((item) => item.id === initialWorkId)
              : undefined;
          const selected =
            linked ??
            items.find((item) => inTab(item, 'progress')) ??
            (!preview ? items[0] : undefined);
          setSelectedId(selected?.id ?? null);
          if (linked || (!preview && selected && !inTab(selected, 'progress')))
            setTab(tabs.find(({ id }) => selected && inTab(selected, id))?.id ?? 'progress');
          if (linked) {
            setMobileDetail(true);
          }
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error ? failure.message : 'Work could not be loaded. Try again.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workflow, profile, source, reload, initialWorkflow, initialWorkId, preview]);

  const filtered = records.filter(
    (record) =>
      inTab(record, tab) &&
      (operator === 'all' || record.operator === operator) &&
      `${record.reference ?? record.id} ${record.customer} ${record.item} ${record.context}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const selected = filtered.find((record) => record.id === selectedId);
  const template = workflow
    ? !preview && workflow === 'WF_ORDER'
      ? { ...templates[workflow], contextLabel: 'Location', milestoneLabel: 'Time' }
      : templates[workflow]
    : undefined;
  const counts = Object.fromEntries(
    tabs.map(({ id }) => [id, records.filter((record) => inTab(record, id)).length]),
  ) as Record<WorkTab, number>;

  function changeProfile(id: string) {
    const next = availableProfiles.find((item) => item.subcategoryId === id);
    if (!next) return;
    setProfileId(id);
    setWorkflow(defaultWorkflow(next));
    setTab('progress');
    setSearch('');
    setOperator('all');
    setMobileDetail(false);
  }
  function changeWorkflow(value: string) {
    setWorkflow(value as WorkflowId);
    setTab('progress');
    setSearch('');
    setOperator('all');
    setMobileDetail(false);
  }
  function handleDetailTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'details'
        : event.key === 'End'
          ? 'activity'
          : detailTab === 'details'
            ? 'activity'
            : 'details';
    setDetailTab(next);
    document.getElementById(`work-tab-${next}`)?.focus();
  }
  async function advance(action = selected?.nextAction) {
    if (!selected || !action || pending) return;
    if (action.id === 'cancelled' && !window.confirm('Cancel this booking?')) return;
    setPending(true);
    setNotice('');
    try {
      const updated = await source.advance(selected, action.id);
      setRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(
        preview
          ? `Preview updated: ${templates[updated.workflowId].stages[updated.stage]}. Changes are not saved.`
          : `Booking updated: ${updated.statusLabel}.`,
      );
      if (!inTab(updated, tab)) {
        setTab(
          inTab(updated, 'history')
            ? 'history'
            : inTab(updated, 'upcoming')
              ? 'upcoming'
              : 'progress',
        );
        setMobileDetail(false);
      }
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : 'The action could not be completed. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={workspaceStyles.workRoot}>
      {!template ? (
        <div className="p-8">
          <h1 className="text-2xl font-bold">Work</h1>
          <p className="mt-3">This activity needs a supported workflow before it can be shown.</p>
        </div>
      ) : (
        <div
          data-work-layout
          className={`${workspaceStyles.workLayout} ${selected ? workspaceStyles.workSplit : ''}`}
        >
          <main
            data-work-main
            data-mobile-detail={mobileDetail ? 'true' : 'false'}
            className={workspaceStyles.workMain}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-[28px] font-bold tracking-tight">Work</h1>
                <p className="mt-1 text-sm text-[#626675]">{template.label}</p>
              </div>
              {preview ? (
                <details className="relative">
                  <summary className="cursor-pointer rounded-md border border-[#e1d7c3] bg-white px-3 py-2 text-xs font-semibold text-[#805c1d]">
                    Choose sample specialty
                  </summary>
                  <div className="absolute right-0 z-40 mt-2 grid w-72 gap-3 rounded-lg border border-[#e6e4df] bg-white p-4 shadow-lg">
                    <p className="text-xs leading-relaxed text-[#667384]">
                      Preview possibilities only. Sample changes are not saved.
                    </p>
                    <label className="text-xs font-semibold text-[#526071]">
                      Sample specialty
                      <select
                        value={profileId}
                        onChange={(event) => changeProfile(event.target.value)}
                        className="mt-1 block w-full rounded-md border border-[#d8dce1] bg-white px-3 py-2 text-sm text-[#14243a]"
                      >
                        {[...new Set(availableProfiles.map((p) => p.categoryName))].map(
                          (category) => (
                            <optgroup key={category} label={category}>
                              {availableProfiles
                                .filter((p) => p.categoryName === category)
                                .map((p) => (
                                  <option key={p.subcategoryId} value={p.subcategoryId}>
                                    {p.name.replace('CafÃƒÂ©', 'Café')}
                                  </option>
                                ))}
                            </optgroup>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-[#526071]">
                      Sample activity
                      <select
                        value={workflow ?? ''}
                        onChange={(event) => changeWorkflow(event.target.value)}
                        className="mt-1 block w-full rounded-md border border-[#d8dce1] bg-white px-3 py-2 text-sm text-[#14243a]"
                      >
                        {candidates.length === 0 && <option value="">No supported activity</option>}
                        {candidates.map((id) => (
                          <option key={id} value={id}>
                            {templates[id].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </details>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    Work type
                    <select
                      value={workflow}
                      disabled={pending}
                      onChange={(event) => changeWorkflow(event.target.value)}
                      className="rounded-md border border-[#dedfdf] bg-white px-3 py-2"
                    >
                      {candidates.map((id) => (
                        <option key={id} value={id}>
                          {templates[id].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={loading || pending}
                    className="rounded-md border border-[#dedfdf] bg-white px-3 py-2 text-sm font-semibold"
                    onClick={() => setReload((value) => value + 1)}
                  >
                    Refresh
                  </button>
                </div>
              )}
            </div>
            <div
              role="tablist"
              aria-label="Work views"
              className="mt-2 flex overflow-x-auto overflow-y-hidden border-b border-[#e2e2df]"
            >
              {tabs.map(({ id, label }) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setSelectedId(null);
                    setMobileDetail(false);
                  }}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2 text-sm font-semibold ${tab === id ? 'border-[#b68a35] text-[#14243a]' : 'border-transparent text-[#6b7583]'}`}
                >
                  {label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? 'bg-[#f2e3c3] text-[#72551b]' : 'bg-[#eeefef] text-[#606b78]'}`}
                  >
                    {loading || error ? '–' : counts[id]}
                  </span>
                </button>
              ))}
            </div>
            <div className="my-2 flex flex-wrap gap-2">
              <label className="relative min-w-[12rem] flex-1">
                <span className="sr-only">Search {template.label.toLowerCase()}</span>
                <Search size={17} className="absolute left-3 top-3 text-[#6a7787]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${template.label.toLowerCase()}`}
                  className="w-full rounded-md border border-[#dedfdf] bg-white py-2 pl-10 pr-3 text-sm outline-[#b68a35]"
                />
              </label>
              <label className="sr-only" htmlFor="work-operator">
                Filter by operator
              </label>
              <select
                id="work-operator"
                value={operator}
                onChange={(event) => setOperator(event.target.value)}
                className="rounded-md border border-[#dedfdf] bg-white px-3 py-2 text-sm"
              >
                <option value="all">All operators</option>
                {[...new Set(records.map((record) => record.operator))].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
            {loading ? (
              <p role="status" className="rounded-lg bg-white p-6 text-sm text-[#5e6b79]">
                {preview ? 'Loading sample work…' : 'Loading work…'}
              </p>
            ) : error ? (
              <div role="alert" className="rounded-lg bg-white p-6 text-sm">
                {error}{' '}
                <button
                  className="font-bold text-[#936a1b] underline"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-[#e9e8e5] bg-white p-8 text-center">
                <h2 className="font-semibold">Nothing to show here</h2>
                <p className="mt-2 text-sm text-[#667384]">
                  {search || operator !== 'all'
                    ? 'Try another search or operator.'
                    : `There are no ${preview ? 'sample ' : ''}${template.label.toLowerCase()} in this view.`}
                </p>
              </div>
            ) : (
              <TableViewport
                label="Work queue"
                data-testid="work-queue"
                className={workspaceStyles.workQueue}
              >
                <div
                  data-work-queue-header
                  className={`${workspaceStyles.workQueueHeader} hidden grid-cols-[1.2fr_.7fr_1.6fr_.8fr_.7fr] gap-3 border-b border-[#ecebe8] px-3 py-2 text-xs font-semibold text-[#687585] md:grid`}
                >
                  <span>Reference</span>
                  <span>{template.itemLabel}</span>
                  <span>
                    {template.contextLabel} &amp; {template.milestoneLabel.toLowerCase()}
                  </span>
                  <span>Stage</span>
                  <span>Operator</span>
                </div>
                {filtered.map((record) => (
                  <button
                    type="button"
                    key={record.id}
                    onClick={() => {
                      setSelectedId(record.id);
                      setMobileDetail(true);
                      setDetailTab('details');
                    }}
                    className={`grid min-h-[2rem] w-full grid-cols-[1fr_auto] items-center gap-2 border-b border-[#eeedea] px-3 py-2 text-left last:border-b-0 hover:bg-[#fbf7ee] md:grid-cols-[1.2fr_.7fr_1.6fr_.8fr_.7fr] md:gap-3 md:py-1 ${selectedId === record.id ? 'border-l-4 border-l-[#bd9343] bg-[#fbf1dc]' : 'border-l-4 border-l-transparent'}`}
                  >
                    <span
                      className="min-w-0 truncate text-xs"
                      title={`${record.reference ?? record.id} · ${record.customer}`}
                    >
                      <strong>{record.reference ?? record.id}</strong>
                      <span className="ml-1.5 text-[#667384]">{record.customer}</span>
                    </span>
                    <span className="hidden min-w-0 truncate text-xs md:block" title={record.item}>
                      {record.item}
                    </span>
                    <span
                      className="hidden min-w-0 truncate text-xs md:block"
                      title={`${record.context} · ${record.milestone}`}
                    >
                      {record.context === 'Customer pickup' ? 'Pickup' : record.context}{' '}
                      <span className="text-[#667384]">
                        · {record.milestone.replace('Today, ', 'Today ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-md bg-[#e4f0fa] px-2 py-0.5 text-xs font-semibold text-[#23669b]">
                        {record.statusLabel ?? template.stages[record.stage]}
                      </span>
                      <ChevronRight size={16} className="text-[#6d7885] md:hidden" />
                    </span>
                    <span className="hidden min-w-0 items-center justify-between gap-1 text-xs md:flex">
                      <span className="truncate">{record.operator}</span>
                      <ChevronRight size={14} className="shrink-0 text-[#6d7885]" />
                    </span>
                  </button>
                ))}
              </TableViewport>
            )}
            {!loading && !error && (
              <p className="mt-3 text-xs text-[#75808c]">
                {filtered.length}{' '}
                {filtered.length === 1 ? template.singular : template.label.toLowerCase()}
                {preview ? ' · sample' : ''} records
              </p>
            )}
          </main>
          {selected && (
            <div
              className={`${offeringStyles.root} ${workspaceStyles.workDetail} min-h-0 min-w-0 px-5 pb-3 pt-3 xl:flex xl:px-3 ${mobileDetail ? 'block' : 'hidden xl:flex'}`}
            >
              <aside className="of-editor" aria-label="Selected work detail" aria-busy={pending}>
                <div className="of-editor-heading" style={{ padding: '10px 14px 4px' }}>
                  <div>
                    <button
                      type="button"
                      onClick={() => setMobileDetail(false)}
                      className="mb-3 flex items-center gap-1 text-sm font-semibold text-[#806124] xl:hidden"
                    >
                      <ArrowLeft size={16} /> Back to work
                    </button>
                    <div className="of-title-row">
                      <h2>{selected.reference ?? selected.id}</h2>
                      <span className="rounded-full bg-[#e4f0fa] px-2 py-1 text-xs font-semibold text-[#23669b]">
                        {selected.statusLabel ?? template.stages[selected.stage]}
                      </span>
                    </div>
                    <p>
                      {selected.customer}
                      {preview ? ' · Sample record' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="of-icon"
                    aria-label="Close work details"
                    onClick={() => {
                      setSelectedId(null);
                      setMobileDetail(false);
                    }}
                  >
                    <X size={19} />
                  </button>
                </div>
                <div
                  className="of-editor-tabs"
                  style={{ margin: '0 14px' }}
                  role="tablist"
                  aria-label="Work detail sections"
                >
                  <button
                    type="button"
                    role="tab"
                    id="work-tab-details"
                    style={{ padding: '6px 8px' }}
                    aria-controls="work-panel-details"
                    aria-selected={detailTab === 'details'}
                    tabIndex={detailTab === 'details' ? 0 : -1}
                    onKeyDown={handleDetailTabKey}
                    onClick={() => setDetailTab('details')}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="work-tab-activity"
                    style={{ padding: '6px 8px' }}
                    aria-controls="work-panel-activity"
                    aria-selected={detailTab === 'activity'}
                    tabIndex={detailTab === 'activity' ? 0 : -1}
                    onKeyDown={handleDetailTabKey}
                    onClick={() => setDetailTab('activity')}
                  >
                    Activity
                  </button>
                </div>
                <div
                  className="of-editor-body"
                  style={{ padding: '8px 14px' }}
                  role="tabpanel"
                  id={`work-panel-${detailTab}`}
                  aria-labelledby={`work-tab-${detailTab}`}
                  tabIndex={0}
                >
                  {detailTab === 'details' ? (
                    <>
                      <p className="flex items-start gap-2 text-sm text-[#48596c]">
                        <Check size={16} className="mt-0.5 shrink-0 text-[#92712f]" />{' '}
                        {selected.confirmation}
                      </p>
                      {preview && <WorkSteps stages={template.stages} current={selected.stage} />}
                      <h3 className="border-b border-[#e8e7e4] pb-2 text-base font-bold">
                        {template.itemLabel}
                        {selected.lines ? ` (${selected.lines.length})` : ''}
                      </h3>
                      {selected.lines ? (
                        <div>
                          {selected.lines.map((line) => (
                            <div
                              key={line.name}
                              className="flex justify-between gap-3 border-b border-[#e8e7e4] py-1 text-sm"
                            >
                              <span className="font-semibold">{line.name}</span>
                              <span className="text-[#617080]">
                                {line.quantity} · {line.amount}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between border-b border-[#e8e7e4] py-1 text-sm font-bold">
                            <span>Sample order total</span>
                            <span>KES 1,210</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3 border-b border-[#e8e7e4] py-1.5 text-sm">
                          <span className="font-semibold">{selected.item}</span>
                          <span className="text-[#617080]">{selected.context}</span>
                        </div>
                      )}
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-[#e8e7e4] py-2 text-xs">
                        <div>
                          <dt className="inline text-[#78828e]">{template.milestoneLabel}: </dt>
                          <dd className="inline font-semibold">{selected.milestone}</dd>
                        </div>
                        <div>
                          <dt className="inline text-[#78828e]">Operator: </dt>
                          <dd className="inline font-semibold">{selected.operator}</dd>
                        </div>
                        <div>
                          <dt className="inline text-[#78828e]">{template.contextLabel}: </dt>
                          <dd className="inline">{selected.context}</dd>
                        </div>
                        <div>
                          <dt className="inline text-[#78828e]">Specialty: </dt>
                          <dd className="inline">{profile.name.replace('CafÃƒÂ©', 'Café')}</dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <div>
                      <h3 className="text-base font-semibold">Activity history</h3>
                      <p className="mt-1 text-xs text-[#72808e]">
                        {preview ? 'Sample events for this record' : 'Recorded events'}
                      </p>
                      <ol className="mt-4 space-y-3">
                        {selected.history.map((entry, index) => (
                          <li key={`${entry}-${index}`} className="flex gap-3 text-sm">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b58a38] text-white">
                              <Check size={12} />
                            </span>
                            <span>{entry}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
                <div className="of-editor-footer" style={{ padding: '8px 14px' }}>
                  <div className="w-full">
                    <p className="mb-2 text-xs text-[#72808e]">
                      {selected.sourceLabel}
                      {preview ? ' · sample' : ''}
                    </p>
                    {selected.readOnly ? (
                      <p className="rounded-md bg-[#f2f4f5] p-3 text-sm">
                        This record is read-only in this workspace.
                      </p>
                    ) : selected.manageHref ? (
                      <Link
                        href={selected.manageHref}
                        className="inline-flex rounded-md bg-[#b58a38] px-4 py-2 text-sm font-bold text-white"
                      >
                        Manage booking
                      </Link>
                    ) : selected.nextAction ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void advance()}
                        className="w-full rounded-md bg-[#FDD128] px-4 py-2 text-sm font-bold text-[#171b24] hover:bg-[#c49a29] disabled:opacity-50"
                      >
                        {pending
                          ? preview
                            ? 'Updating preview…'
                            : 'Saving…'
                          : selected.nextAction.label}
                      </button>
                    ) : (
                      <p className="rounded-md bg-[#edf5ee] p-3 text-sm font-semibold text-[#397348]">
                        {selected.stage >= template.stages.length - 1
                          ? preview
                            ? 'This sample work is complete.'
                            : 'This record is closed.'
                          : preview
                            ? 'No action is available in this preview.'
                            : 'No primary action is available for this record.'}
                      </p>
                    )}
                    {selected.additionalActions?.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={pending}
                        className="mr-2 mt-2 rounded-md border px-3 py-2 text-sm font-semibold"
                        onClick={() => void advance(action)}
                      >
                        {action.label}
                      </button>
                    ))}
                    {notice && (
                      <p role="status" className="mt-3 text-sm text-[#536779]">
                        {notice}
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
