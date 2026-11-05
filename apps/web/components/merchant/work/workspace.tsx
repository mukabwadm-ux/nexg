'use client';

import { listBookingProfiles } from '@nexg/booking-config/profiles';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { WorkHeading, WorkLayout, WorkQueue, WorkQueueRow, WorkRecordPanel, WorkSearch, WorkTabs } from './presentation';
import { WorkSteps } from './work-steps';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  candidateWorkflows,
  defaultWorkflow,
  inTab,
  sampleSource,
  workTemplate,
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

export function WorkWorkspace({ source = sampleSource }: { source?: WorkSource }) {
  const demoContext = useMerchantOnboardingDemoContext();
  const availableProfiles = useMemo(() => {
    if (!demoContext) return profiles;
    const selected = demoContext.subcategories.flatMap(({ id }) => {
      const match = profiles.find((item) => item.subcategoryId === id);
      return match ? [match] : [];
    });
    return selected.length ? selected : profiles;
  }, [demoContext]);
  const contextProfile = availableProfiles.find((item) => item.subcategoryId === demoContext?.profileId) ?? availableProfiles[0] ?? initialProfile;
  const [profileId, setProfileId] = useState(contextProfile.subcategoryId);
  const profile = profiles.find((p) => p.subcategoryId === profileId) ?? initialProfile;
  const candidates = useMemo(() => candidateWorkflows(profile), [profile]);
  const [workflow, setWorkflow] = useState<WorkflowId | undefined>(() =>
    defaultWorkflow(contextProfile),
  );
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<WorkTab>('progress');
  const [search, setSearch] = useState('');
  const [operator, setOperator] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!demoContext) return;
    setProfileId(contextProfile.subcategoryId);
    setWorkflow(defaultWorkflow(contextProfile));
    setTab('progress');
  }, [demoContext, contextProfile]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
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
          setSelectedId(items.find((item) => inTab(item, 'progress'))?.id ?? null);
        }
      })
      .catch(() => {
        if (active) setError('Work could not be loaded. Try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workflow, profile, source, reload]);

  const filtered = records.filter(
    (record) =>
      inTab(record, tab) &&
      (operator === 'all' || record.operator === operator) &&
      `${record.id} ${record.customer} ${record.item} ${record.context}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const selected = filtered.find((record) => record.id === selectedId);
  const template = workflow ? workTemplate(workflow, profile) : undefined;
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
  async function advance() {
    if (!selected?.nextAction || pending) return;
    setPending(true);
    setNotice('');
    try {
      const updated = await source.advance(selected, selected.nextAction.id);
      setRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(
        `Preview updated: ${workTemplate(updated.workflowId, profile).stages[updated.stage]}. Changes are not saved.`,
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
    } catch {
      setNotice('The preview action could not be completed. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (!template) {
    return (
      <WorkLayout>
        <WorkHeading description="This activity needs a supported workflow before it can be shown." />
      </WorkLayout>
    );
  }

  function closeDetails() {
    setSelectedId(null);
    setMobileDetail(false);
  }

  return (
    <WorkLayout
      mobileDetail={mobileDetail}
      detail={selected && (
        <WorkRecordPanel
          key={`${selected.id}:${selectionVersion}`}
          title={selected.id}
          subtitle={`${selected.customer} · Sample record`}
          stage={
            <span className="rounded-full bg-[#e4f0fa] px-2 py-1 text-xs font-semibold text-[#23669b]">
              {template.stages[selected.stage]}
            </span>
          }
          onBack={() => setMobileDetail(false)}
          onClose={closeDetails}
          history={selected.history}
          busy={pending}
          footer={
            <div className="w-full">
              <p className="mb-2 text-xs text-[#72808e]">{selected.sourceLabel} · sample</p>
              {selected.readOnly ? (
                <p className="rounded-md bg-[#f2f4f5] p-3 text-sm">
                  This record is read-only in this workspace.
                </p>
              ) : selected.nextAction ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={advance}
                  className="w-full rounded-md bg-[#d4a72c] px-4 py-2 text-sm font-bold text-[#171b24] hover:bg-[#c49a29] disabled:opacity-50"
                >
                  {pending ? 'Updating preview…' : selected.nextAction.label}
                </button>
              ) : (
                <p className="rounded-md bg-[#edf5ee] p-3 text-sm font-semibold text-[#397348]">
                  {selected.stage >= template.stages.length - 1
                    ? 'This sample work is complete.'
                    : 'No action is available in this preview.'}
                </p>
              )}
              {notice && (
                <p role="status" className="mt-3 text-sm text-[#536779]">
                  {notice}
                </p>
              )}
            </div>
          }
        >
          <p className="flex items-start gap-2 text-sm text-[#48596c]">
            <Check size={16} className="mt-0.5 shrink-0 text-[#92712f]" />{' '}
            {selected.confirmation}
          </p>
          <WorkSteps stages={template.stages} current={selected.stage} />
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
        </WorkRecordPanel>
      )}
    >
      <WorkHeading
        description={template.label}
        actions={
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
                  {[...new Set(availableProfiles.map((p) => p.categoryName))].map((category) => (
                    <optgroup key={category} label={category}>
                      {availableProfiles
                        .filter((p) => p.categoryName === category)
                        .map((p) => (
                          <option key={p.subcategoryId} value={p.subcategoryId}>
                            {p.name.replace('CafÃƒÂ©', 'Café')}
                          </option>
                        ))}
                    </optgroup>
                  ))}
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
                      {workTemplate(id, profile).label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        }
      />
      <WorkTabs
        tabs={tabs.map(({ id, label }) => ({ id, label, count: loading || error ? '–' : counts[id] }))}
        value={tab}
        onChange={(id) => {
          setTab(id);
          closeDetails();
        }}
      />
      <WorkSearch
        value={search}
        onChange={setSearch}
        placeholder={`Search ${template.label.toLowerCase()}`}
      >
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
      </WorkSearch>
      {loading ? (
        <p role="status" className="rounded-lg bg-white p-6 text-sm text-[#5e6b79]">
          Loading sample work…
        </p>
      ) : error ? (
        <div role="alert" className="rounded-lg bg-white p-6 text-sm">
          {error}{' '}
          <button
            type="button"
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
              : `There are no sample ${template.label.toLowerCase()} in this view.`}
          </p>
        </div>
      ) : (
        <WorkQueue columns={[
          'Reference',
          template.itemLabel,
          `${template.contextLabel} & ${template.milestoneLabel.toLowerCase()}`,
          'Stage',
          'Operator',
        ]}>
          {filtered.map((record) => (
            <WorkQueueRow
              key={record.id}
              id={record.id}
              customer={record.customer}
              item={record.item}
              context={record.context === 'Customer pickup' ? 'Pickup' : record.context}
              milestone={record.milestone.replace('Today, ', 'Today ')}
              stage={
                <span className="rounded-md bg-[#e4f0fa] px-2 py-0.5 text-xs font-semibold text-[#23669b]">
                  {template.stages[record.stage]}
                </span>
              }
              operator={record.operator}
              selected={selectedId === record.id}
              onSelect={() => {
                setSelectedId(record.id);
                setSelectionVersion((version) => version + 1);
                setMobileDetail(true);
              }}
            />
          ))}
        </WorkQueue>
      )}
      {!loading && !error && (
        <p className="mt-3 text-xs text-[#75808c]">
          {filtered.length}{' '}
          {filtered.length === 1 ? template.singular : template.label.toLowerCase()} · sample records
        </p>
      )}
    </WorkLayout>
  );
}
