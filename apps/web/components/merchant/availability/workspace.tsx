'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  Check,
  Clock3,
  Copy,
  Download,
  History as HistoryIcon,
  MapPin,
  Pause,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Upload,
} from 'lucide-react';
import { MerchantLivePreviewShell } from '../live-preview-shell';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  availableSchemas,
  extendOfferingProfiles,
  fulfilmentOptions,
  seedCatalogue,
  type Catalogue,
  type OfferingProfile,
} from '../offerings/model';
import { localOfferingsSource, type OfferingsSource } from '../offerings/source';
import { schemas } from '../offerings/schemas';
import {
  Agenda,
  CalendarView,
  ResourceWeekView,
  CapacityView,
  DateToolbar,
  Empty,
  HoursView,
  OccurrenceView,
  TimelineView,
} from './views';
import { Field, ImpactReview, Modal, ProposalFields } from './forms';
import { AvailabilityTester, WorkInspector } from './inspectors';
import {
  DEMO_NOW,
  LOCATIONS,
  activeEvents,
  addMinutes,
  afterBuffer,
  beforeBuffer,
  categoryName,
  clone,
  duration,
  fitsSchedule,
  localInput,
  localDate,
  resourceHoursForDate,
  localTime,
  normalHours,
  prettyDate,
  resolveView,
  sourceLabel,
  specialtyNeeds,
  stamp,
  type Context,
  type Impact,
  type Proposal,
  type Role,
  type Scenario,
  type Snapshot,
  type Commitment,
  type Occurrence,
} from './model';
import {
  importHours,
  localAvailabilitySource,
  offeringHref,
  resetMalformedProfile,
  scheduleCsv,
  storageKey,
  workHref,
  type AvailabilitySource,
  type Operation,
} from './source';
import styles from './workspace.module.css';
import { CalendarAgenda, MonthCalendar, TimeWeekCalendar, OccurrenceInspector } from './calendar';
import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';

type Panel =
  | 'context'
  | 'edit'
  | 'sample'
  | 'test'
  | 'import'
  | 'history'
  | 'source'
  | 'unsaved'
  | 'move'
  | 'reset'
  | null;
const noAdditionalProfiles: OfferingProfile[] = [];
const scenarioNames: Record<Scenario, string> = {
  current: 'Current sample',
  stale: 'Stale source',
  unknown: 'Unknown source',
  partial: 'Partial source coverage',
  external: 'External / read only',
  offline: 'Source offline',
  empty: 'No scheduled work',
  unconfigured: 'Missing resource setup',
  error: 'Load failure',
};
function download(name: string, body: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'This preview action failed. Your current input is retained.';
export function AvailabilityWorkspace({
  additionalProfiles = noAdditionalProfiles,
  initialProfileId,
  demoContext,
}: {
  additionalProfiles?: OfferingProfile[];
  initialProfileId?: string;
  demoContext?: MerchantOnboardingDemoContext | null;
}) {
  const inheritedDemo = useMerchantOnboardingDemoContext();
  const activeDemo = demoContext ?? inheritedDemo;
  const activeDemoProfileId = activeDemo?.profileId;
  const profiles = useMemo(() => extendOfferingProfiles(additionalProfiles), [additionalProfiles]);
  const [profileId, setProfileId] = useState(
      initialProfileId ?? demoContext?.profileId ?? 'restaurant',
    ),
    [location, setLocation] = useState<string>('Westlands');
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0]!;
  useEffect(() => {
    if (
      !initialProfileId &&
      activeDemoProfileId &&
      profiles.some((item) => item.id === activeDemoProfileId)
    )
      setProfileId(activeDemoProfileId);
  }, [initialProfileId, activeDemoProfileId, profiles]);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null),
    [offeringId, setOfferingId] = useState(''),
    [method, setMethod] = useState('');
  const [source, setSource] = useState<AvailabilitySource | null>(null),
    [offeringsSource, setOfferingsSource] = useState<OfferingsSource | null>(null);
  const [scenario, setScenario] = useState<Scenario>('current'),
    [role, setRole] = useState<Role>('manager');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [date, setDate] = useState('2026-11-03'),
    [mode, setMode] = useState('week'),
    [tab, setTab] = useState('Schedule'),
    [search, setSearch] = useState(''),
    [resourceFilter, setResourceFilter] = useState('all');
  const [panel, setPanel] = useState<Panel>(null),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<{
    event: Commitment;
    start: string;
    end: string;
  } | null>(null);
  const [draft, setDraft] = useState<Proposal | null>(null),
    [baseline, setBaseline] = useState(''),
    [savedDraft, setSavedDraft] = useState<Proposal | null>(null),
    [impact, setImpact] = useState<Impact | null>(null);
  const [busy, setBusy] = useState(false),
    [panelError, setPanelError] = useState(''),
    [operations, setOperations] = useState<Operation[]>([]);
  const [sampleId, setSampleId] = useState('restaurant'),
    [sampleSchema, setSampleSchema] = useState(''),
    [sampleClock, setSampleClock] = useState(DEMO_NOW),
    [applyMode, setApplyMode] = useState<'normal' | 'reject' | 'unknown'>('normal');
  const [csv, setCsv] = useState(''),
    [csvPreview, setCsvPreview] = useState<ReturnType<typeof importHours> | null>(null);
  const [aggregate, setAggregate] = useState<{ location: string; s: Snapshot }[]>([]);
  const nextAction = useRef<(() => void) | null>(null),
    backPanel = useRef<Panel>(null),
    desiredOffering = useRef(''),
    loaded = useRef(0);
  const offering = offeringId
    ? catalogue?.offerings.find((o) => o.id === offeringId && o.publication !== 'archived')
    : catalogue?.offerings.find((o) => o.publication !== 'archived');
  const ctx = useMemo<Context | null>(
    () =>
      offering
        ? {
            profile,
            offering,
            location,
            method:
              method || (offering.fulfilmentMethods ?? fulfilmentOptions(offering.schemaId))[0]!,
            scenario,
            role,
          }
        : null,
    [profile, offering, location, method, scenario, role],
  );
  const resolution = useMemo(() => {
    if (!offering || !catalogue) return { view: null, error: '' };
    try {
      return {
        view: resolveView(profile, offering, catalogue.configuration.enabledSchemas),
        error: '',
      };
    } catch (e) {
      return { view: null, error: message(e) };
    }
  }, [profile, offering, catalogue]);
  const view = resolution.view;
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const selected = snapshot?.events.find((e) => e.id === selectedId);
  const selectedOccurrence = snapshot?.occurrences.find((o) => o.id === selectedOccurrenceId);
  const calendarModes =
    view && ['hours', 'coverage', 'access'].includes(view.renderer)
      ? ['week', 'month', 'list']
      : view?.model === 'SERVICE_JOB' && snapshot?.settings.jobMode === 'queue'
        ? ['list']
        : ['day', 'week', 'month', 'list'];
  const visualSnapshot = useMemo(() => {
    const p = draft ?? savedDraft;
    if (!snapshot || p?.kind !== 'block' || !p.start || !p.end) return snapshot;
    return {
      ...snapshot,
      events: [
        ...snapshot.events,
        {
          id: 'draft:' + p.id,
          workId: 'DRAFT',
          title: 'Draft · ' + p.title,
          customer: 'Local draft',
          start: p.start,
          end: p.end,
          resources: p.resourceIds ?? [],
          status: 'block' as const,
          draft: true,
          role: 'Not applied',
        },
      ],
    };
  }, [snapshot, draft, savedDraft]);
  useEffect(() => {
    setMode(
      view?.renderer === 'sessions'
        ? 'month'
        : ['calendar', 'roles', 'spaces'].includes(view?.renderer ?? '')
          ? 'day'
          : view?.renderer === 'jobs'
            ? 'list'
            : 'week',
    );
  }, [view?.renderer]);
  const editable =
    !!ctx &&
    ctx.role === 'manager' &&
    ctx.location !== 'All locations' &&
    ['current', 'empty', 'unconfigured'].includes(ctx.scenario) &&
    ctx.offering.sources.availability === 'nexg' &&
    ctx.offering.sync === 'current';
  const tabs = view?.resources
    ? ['Schedule', 'Rules', 'Resources', 'Exceptions']
    : ['Schedule', 'Rules', 'Exceptions'];

  useEffect(() => {
    const storage = {
      getItem: (k: string) => window.localStorage.getItem(k),
      setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
      removeItem: (k: string) => window.localStorage.removeItem(k),
    };
    setSource(localAvailabilitySource(storage));
    setOfferingsSource(localOfferingsSource(storage));
    const params = new URLSearchParams(window.location.search),
      id = params.get('profile');
    if (id && profiles.some((p) => p.id === id)) {
      setProfileId(id);
      setSampleId(id);
    }
    desiredOffering.current = params.get('offering') ?? '';
    if (
      LOCATIONS.includes(params.get('location') as (typeof LOCATIONS)[number]) ||
      params.get('location') === 'All locations'
    )
      setLocation(params.get('location')!);
    if (params.get('method')) setMethod(params.get('method')!);
    if (params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!))
      setDate(params.get('date')!);
    // Profiles are stable unless the parent explicitly supplies new descriptors.
  }, [profiles]);
  const loadCatalogue = useCallback(async () => {
    if (!offeringsSource) return;
    const id = ++loaded.current;
    setLoading(true);
    setError('');
    try {
      const data = await offeringsSource.load(profile);
      if (id !== loaded.current) return;
      setCatalogue(data);
      const item =
        data.offerings.find((o) => o.id === desiredOffering.current) ??
        data.offerings.find((o) => o.publication !== 'archived');
      desiredOffering.current = '';
      setOfferingId(item?.id ?? '');
    } catch (e) {
      if (id === loaded.current) {
        setError(message(e));
        setCatalogue(null);
        setLoading(false);
      }
    }
  }, [offeringsSource, profile]);
  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);
  const refreshData = useCallback(async () => {
    if (!source || !ctx) return;
    const [s, d, ops] = await Promise.all([
      source.load(ctx),
      source.draft(ctx),
      source.operations(ctx),
    ]);
    setSnapshot(s);
    setSavedDraft(d);
    setOperations(ops);
    setSampleClock(s.now);
    if (ctx.location === 'All locations')
      setAggregate(
        await Promise.all(
          LOCATIONS.map(async (l) => ({
            location: l,
            s: await source.load({ ...ctx, location: l }),
          })),
        ),
      );
  }, [source, ctx]);
  useEffect(() => {
    let cancelled = false;
    if (!source || !ctx) {
      if (catalogue) setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setSelectedId(null);
    setImpact(null);
    setResourceFilter('all');
    Promise.all([source.load(ctx), source.draft(ctx), source.operations(ctx)])
      .then(async ([s, d, ops]) => {
        if (cancelled) return;
        setSnapshot(s);
        setSavedDraft(d);
        setOperations(ops);
        setSampleClock(s.now);
        if (ctx.location === 'All locations') {
          const a = await Promise.all(
            LOCATIONS.map(async (l) => ({
              location: l,
              s: await source.load({ ...ctx, location: l }),
            })),
          );
          if (!cancelled) setAggregate(a);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(message(e));
          setSnapshot(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, ctx, catalogue]);
  useEffect(() => {
    if (!ctx) return;
    const p = new URLSearchParams(window.location.search);
    p.set('profile', ctx.profile.id);
    p.set('offering', ctx.offering.id);
    p.set('location', ctx.location);
    p.set('method', ctx.method);
    p.set('date', date);
    const href = appendMerchantOnboardingDemoContext(
      `${window.location.pathname}?${p.toString()}`,
      activeDemo,
    );
    window.history.replaceState(null, '', href);
  }, [ctx, date, activeDemo]);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key === 'nexg.offerings.preview.v1.' + profile.id) {
        setImpact(null);
        setNotice(
          'The offering definition changed in another tab. Review the current version before applying any draft.',
        );
        void offeringsSource
          ?.load(profile)
          .then((data) => setCatalogue(data))
          .catch((e) => setPanelError(message(e)));
      }
      if (event.key === storageKey(profile.id)) {
        setImpact(null);
        setNotice(
          'This schedule changed in another tab. Your open draft is retained; review against the current revision.',
        );
        void refreshData().catch((e) => setPanelError(message(e)));
      }
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, [profile, profile.id, refreshData, offeringsSource]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (
        !a ||
        a.target === '_blank' ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        a.href === window.location.href
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      nextAction.current = () => window.location.assign(a.href);
      backPanel.current = panel;
      setPanel('unsaved');
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty, panel]);
  useEffect(() => {
    const reveal = () => {
      const nav = document.querySelector<HTMLElement>(
        'nav[aria-label="Merchant preview navigation"]',
      );
      const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (nav && active && window.innerWidth < 1024) {
        const r = active.getBoundingClientRect(),
          n = nav.getBoundingClientRect();
        nav.scrollLeft += r.left - n.left - (nav.clientWidth - r.width) / 2;
      }
    };
    reveal();
    window.addEventListener('resize', reveal);
    return () => window.removeEventListener('resize', reveal);
  }, []);
  function guard(action: () => void) {
    if (dirty) {
      nextAction.current = action;
      backPanel.current = panel;
      setPanel('unsaved');
    } else action();
  }
  function selectEvent(event: Commitment) {
    if (event.draft) {
      const proposal = draft ?? savedDraft;
      if (proposal) {
        setDraft(clone(proposal));
        setBaseline(JSON.stringify(proposal));
        show('edit');
      }
      return;
    }
    if (
      event.role === 'Session anchor' &&
      event.occurrenceId &&
      snapshot?.occurrences.some((o) => o.id === event.occurrenceId)
    ) {
      setSelectedOccurrenceId(event.occurrenceId);
      setSelectedId(null);
    } else {
      setSelectedId(event.id);
      setSelectedOccurrenceId(null);
    }
  }
  function selectOccurrence(o: Occurrence) {
    setSelectedOccurrenceId(o.id);
    setSelectedId(null);
  }
  function slot(start: string, resourceId?: string) {
    if (!ctx || !view || !snapshot || !editable) return;
    guard(() => {
      setDate(localDate(start));
      if (['hours', 'coverage', 'access'].includes(view.renderer))
        propose('date-hours', {
          date: localDate(start),
          title: 'Special date hours',
          reason: 'Dated operating override',
        });
      else
        propose('block', {
          start,
          end: localInput(addMinutes(start, 60)),
          resourceIds: resourceId ? [resourceId] : [],
          title: 'Time block',
          reason: '',
        });
    });
  }
  function moveEvent(event: Commitment, start: string, end: string, resourceId?: string) {
    if (!editable || event.ongoing || event.ownerScope) {
      setNotice('This source, shared claim or actual custody state cannot be moved here.');
      return;
    }
    if (resourceId && !event.resources.includes(resourceId)) {
      setNotice(
        'Resource reassignment needs its own checks in Work. This calendar move has not been applied.',
      );
      selectEvent(event);
      return;
    }
    if (['block', 'break'].includes(event.status))
      propose('block', {
        eventId: event.id,
        start: localInput(start),
        end: localInput(end),
        resourceIds: event.resources,
        title: event.title,
        reason: event.role ?? 'Calendar move',
        affectScope: 'one',
      });
    else {
      setMovePreview({ event, start, end });
      show('move');
    }
  }
  function closePanel() {
    guard(() => {
      setPanel(null);
      setDraft(null);
      setImpact(null);
      setPanelError('');
    });
  }
  function show(p: Panel) {
    setPanelError('');
    setPanel(p);
  }
  function propose(kind: Proposal['kind'], extra: Partial<Proposal> = {}) {
    if (!ctx || !snapshot) return;
    const p: Proposal = {
      id: crypto.randomUUID(),
      kind,
      title:
        kind === 'hours'
          ? 'Edit operating hours'
          : kind === 'block'
            ? 'Time block'
            : kind === 'pause'
              ? 'Pause new intake'
              : kind === 'capacity'
                ? 'Change capacity'
                : kind === 'occurrence'
                  ? 'New dated occurrence'
                  : kind === 'resource-hours'
                    ? 'Edit resource schedule'
                    : kind === 'remove'
                      ? 'Remove local time block'
                      : 'Edit availability rules',
      reason: '',
      offeringVersion: ctx.offering.version,
      ...extra,
    };
    if (kind === 'hours' || kind === 'resource-hours') p.effectiveFrom = localDate(snapshot.now);
    if (kind === 'date-hours') p.date = extra.date ?? date;
    if (kind === 'hours' || kind === 'resource-hours' || kind === 'date-hours')
      p.hours = clone(extra.hours ?? snapshot.hours);
    if (kind === 'block' || kind === 'occurrence') {
      p.start = extra.start ?? date + 'T15:00';
      p.end = extra.end ?? localInput(addMinutes(p.start, 60));
      p.resourceIds =
        extra.resourceIds ??
        (view?.renderer === 'assets' ? [snapshot.resources[0]?.id ?? ''].filter(Boolean) : []);
    }
    if (kind === 'pause') {
      p.method = extra.method ?? ctx.method;
      p.start = extra.start ?? snapshot.now;
      p.end = extra.end ?? localInput(addMinutes(snapshot.now, 60));
    }
    if (kind === 'capacity' || kind === 'occurrence') {
      const pool = snapshot.pools.find((p) => p.id === extra.poolId) ?? snapshot.pools[0];
      p.poolId = pool?.id;
      p.quantity = pool?.total;
      p.unit = pool?.unit;
    }
    if (kind === 'settings') p.settings = { ...snapshot.settings };
    setDraft(p);
    setBaseline(JSON.stringify(p));
    setImpact(null);
    setPanelError('');
    setPanel('edit');
  }
  const patchDraft = (p: Proposal) => {
    setDraft({
      ...p,
      id: operations.some((o) => o.id === p.id && o.state === 'rejected')
        ? crypto.randomUUID()
        : p.id,
    });
    setImpact(null);
    setPanelError('');
  };
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setPanelError('');
    try {
      await action();
    } catch (e) {
      setPanelError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!source || !ctx || !draft) return;
    await source.saveDraft(ctx, draft);
    setSavedDraft(clone(draft));
    setBaseline(JSON.stringify(draft));
    setNotice('Draft saved locally. It has not been applied.');
  }
  async function applyDraft() {
    if (!source || !ctx || !draft || !snapshot) return;
    if (draft.targets && !draft.targets.length)
      throw new Error('Choose at least one explicit target location.');
    const op = await source.apply(ctx, draft, snapshot.revision, applyMode);
    setOperations(await source.operations(ctx));
    if (op.state === 'pending') {
      setNotice(
        'Result being checked. This operation is saved locally; capacity has not been released or confirmed.',
      );
      setBaseline(JSON.stringify(draft));
      setPanel('history');
      return;
    }
    if (op.state === 'rejected') {
      setPanelError(
        op.reason ?? 'No targets could be updated. Inspect the target results in History.',
      );
      return;
    }
    await refreshData();
    setDraft(null);
    setPanel(null);
    setImpact(null);
    setNotice(
      op.state === 'partial'
        ? 'Some targets were saved locally. Review each result in History.'
        : 'Saved in this preview. Existing work is retained.',
    );
  }
  async function acknowledge() {
    if (!source || !ctx) return;
    await source.refresh(ctx, true);
    await refreshData();
    setNotice('Sample owner result received. Only owner-confirmed expired holds were released.');
  }
  function changeProfile(id: string) {
    guard(() => {
      setCatalogue(null);
      setProfileId(id);
      setSampleId(id);
      setOfferingId('');
      setMethod('');
      setTab('Schedule');
      setSelectedId(null);
      setSearch('');
      setDraft(null);
      setPanel(null);
    });
  }
  async function addSampleActivity() {
    if (!offeringsSource || !catalogue || !sampleSchema) return;
    if (!availableSchemas(profile).includes(sampleSchema))
      throw new Error('Choose a registered candidate for this specialty.');
    const example = seedCatalogue({ ...profile, schema: sampleSchema }).offerings[0]!;
    const item = {
      ...example,
      id: profile.id + '-availability-' + crypto.randomUUID(),
      name: profile.name + ' · ' + schemas[sampleSchema]!.label + ' sample',
    };
    const next = {
      ...catalogue,
      configuration: {
        ...catalogue.configuration,
        enabledSchemas: [...new Set([...catalogue.configuration.enabledSchemas, sampleSchema])],
      },
      offerings: [...catalogue.offerings, item],
    };
    await offeringsSource.replace(profile, next);
    setCatalogue(next);
    setOfferingId(item.id);
    setMethod('');
    setPanel(null);
    setNotice('Sample activity explicitly configured in the local Offerings catalogue.');
  }
  function tabKey(e: KeyboardEvent<HTMLButtonElement>, name: string) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const n =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? tabs.length - 1
          : (tabs.indexOf(name) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[n]!);
    document.getElementById('av-tab-' + tabs[n])?.focus();
  }
  const headerLocation = (
    <label className="av-header-location">
      <MapPin size={16} />
      <span className="av-sr">Availability location</span>
      <select
        aria-label="Availability location"
        value={location}
        onChange={(e) =>
          guard(() => {
            setLocation(e.target.value);
            setDraft(null);
            setSelectedId(null);
          })
        }
      >
        <option>All locations</option>
        {LOCATIONS.map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
    </label>
  );
  const headerSample = (
    <button
      className="av-link"
      onClick={() => {
        setSampleId(profileId);
        show('sample');
      }}
    >
      Choose sample state
    </button>
  );
  const initials =
    profile.categoryId === 'vehicle_rentals' ? 'NM' : profile.categoryId === 'beauty' ? 'ZS' : 'NC';
  const contextSummary =
    snapshot && ctx && view ? (
      <>
        <div className="av-summary">
          <div>
            <Clock3 size={23} />
            <span>
              <strong>Location / activity hours</strong>
              <small>
                {fitsSchedule(snapshot, snapshot.now, addMinutes(snapshot.now, 1))
                  ? 'Open now under the current schedule'
                  : 'Closed now or hours not set'}
              </small>
            </span>
          </div>
          <div>
            <span>
              <strong>{ctx.method}</strong>
              <small>
                {snapshot.pauses.some(
                  (p) =>
                    p.method === ctx.method &&
                    stamp(p.start) <= stamp(snapshot.now) &&
                    (!p.end || stamp(p.end) > stamp(snapshot.now)),
                )
                  ? 'New intake paused'
                  : 'New intake follows its rules'}
              </small>
            </span>
            <button className="av-link" disabled={!editable} onClick={() => propose('pause')}>
              <Pause size={15} />
              Manage
            </button>
          </div>
          <div>
            <span>
              <strong>{view.title}</strong>
              <small>
                {snapshot.events.filter((e) => e.ongoing).length
                  ? snapshot.events.filter((e) => e.ongoing).length + ' actual return outstanding'
                  : ctx.offering.publication === 'published'
                    ? 'Offering published'
                    : 'Offering is a draft'}
              </small>
            </span>
          </div>
        </div>
        {view.resources && (
          <div className="av-rules-strip">
            <span>
              {['APPOINTMENT', 'FIELD_VISIT', 'TRANSFER'].includes(view.model)
                ? 'Selected service ' + duration(ctx) + ' min · '
                : ''}
              Before/travel {beforeBuffer(ctx)} min · After/turnover {afterBuffer(ctx)} min · Notice{' '}
              {snapshot.settings.noticeMinutes} min
            </span>
            <a
              className="av-link"
              href={appendMerchantOnboardingDemoContext(offeringHref(ctx), activeDemo)}
            >
              Edit in Offerings
            </a>
          </div>
        )}
      </>
    ) : null;
  return (
    <div className={styles.root}>
      <MerchantLivePreviewShell
        active="Availability"
        businessName={activeDemo?.businessName}
        demoContext={activeDemo}
        locationControl={headerLocation}
        sampleControl={headerSample}
        accountInitials={activeDemo?.initials ?? initials}
      >
        <div
          className={
            'av-workspace ' +
            (selected || selectedOccurrence ? 'av-mobile-detail' : '') +
            (panel === 'edit' &&
            draft &&
            ['block', 'pause', 'capacity', 'remove'].includes(draft.kind)
              ? 'av-editing-side'
              : '')
          }
          data-availability-workspace
          data-profile={profile.id}
          data-model={view?.model ?? 'unresolved'}
          data-schema={offering?.schemaId ?? ''}
          aria-busy={loading}
        >
          <div className="av-page-heading">
            <div>
              <h1>Availability</h1>
              <p>{view?.subtitle ?? 'Configure when each activity can accept work.'}</p>
              <small>
                {profile.name} · {location}
              </small>
            </div>
            <div className="av-actions">
              <button className="av-button" onClick={() => show('sample')}>
                <Settings2 size={16} />
                Sample specialty
              </button>
              {view && snapshot && (
                <>
                  <button
                    className="av-button"
                    disabled={!editable}
                    title={
                      !editable
                        ? 'Select an editable location and current managed source.'
                        : undefined
                    }
                    onClick={() => propose('block')}
                  >
                    <Plus size={16} />
                    Add exception
                  </button>
                  <button
                    className="av-button av-primary"
                    disabled={!editable}
                    onClick={() =>
                      propose(
                        view.renderer === 'hours' || !view.resources
                          ? 'hours'
                          : view.renderer === 'sessions'
                            ? 'occurrence'
                            : 'block',
                      )
                    }
                  >
                    {view.renderer === 'hours' || !view.resources ? (
                      <Pencil size={16} />
                    ) : (
                      <Plus size={16} />
                    )}{' '}
                    {view.renderer === 'hours' || !view.resources
                      ? 'Edit hours'
                      : view.renderer === 'sessions'
                        ? 'Add occurrence'
                        : 'Add time block'}
                  </button>
                </>
              )}
            </div>
          </div>
          {notice && (
            <p className="av-notice" role="status">
              <Check size={16} />
              {notice}
              <button className="av-icon" aria-label="Dismiss status" onClick={() => setNotice('')}>
                ×
              </button>
            </p>
          )}
          <div className="av-context-row">
            <label>
              <span className="av-sr">Selected offering</span>
              <select
                aria-label="Selected offering"
                value={offering?.id ?? ''}
                disabled={!catalogue}
                onChange={(e) =>
                  guard(() => {
                    setOfferingId(e.target.value);
                    setMethod('');
                    setDraft(null);
                    setTab('Schedule');
                  })
                }
              >
                {!offering && <option value="">Choose an offering</option>}
                {catalogue?.offerings
                  .filter((o) => o.publication !== 'archived')
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {o.publication}
                    </option>
                  ))}
              </select>
            </label>
            {offering && (
              <label>
                <span className="av-sr">Fulfilment method</span>
                <select
                  aria-label="Fulfilment method"
                  value={ctx?.method ?? ''}
                  onChange={(e) =>
                    guard(() => {
                      setMethod(e.target.value);
                      setDraft(null);
                    })
                  }
                >
                  {(offering.fulfilmentMethods ?? fulfilmentOptions(offering.schemaId)).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            )}
            <span className={'av-source ' + (scenario !== 'current' ? 'av-source-warning' : '')}>
              <i />
              {ctx ? sourceLabel(ctx) : 'Loading sample'}
              {snapshot ? ' · ' + localTime(snapshot.observedAt) + ' EAT' : ''}
            </span>
            <button
              className="av-icon"
              aria-label="Refresh Availability"
              disabled={busy || !ctx}
              onClick={() =>
                void run(async () => {
                  await source?.refresh(ctx!);
                  await refreshData();
                  setNotice('Sample source refreshed.');
                })
              }
            >
              <RefreshCw size={17} />
            </button>
            <button className="av-link" onClick={() => show('source')}>
              Source details
            </button>
            {view?.resources && (
              <button className="av-link av-operating-control" onClick={() => show('context')}>
                Operating status
              </button>
            )}
          </div>
          {savedDraft && !draft && (
            <div className="av-draft-banner">
              <span>Saved local draft: {savedDraft.title}</span>
              <button
                className="av-link"
                onClick={() => {
                  setDraft(clone(savedDraft));
                  setBaseline(JSON.stringify(savedDraft));
                  setImpact(null);
                  show('edit');
                }}
              >
                Resume draft
              </button>
              <button
                className="av-link"
                onClick={() =>
                  void run(async () => {
                    if (source && ctx) await source.discardDraft(ctx);
                    setSavedDraft(null);
                  })
                }
              >
                Discard saved draft
              </button>
            </div>
          )}
          {panelError && !panel && (
            <p className="av-error" role="alert">
              {panelError}
            </p>
          )}
          {loading ? (
            <div className="av-loading" role="status">
              <div />
              <p>Loading sample schedule…</p>
            </div>
          ) : error || resolution.error ? (
            <Empty title="Availability could not be loaded" text={error || resolution.error}>
              <div className="av-actions">
                <button className="av-button" onClick={() => void loadCatalogue()}>
                  Retry
                </button>
                <button className="av-button" onClick={() => show('reset')}>
                  Reset Availability sample
                </button>
              </div>
            </Empty>
          ) : !ctx || !snapshot || !view ? (
            <Empty
              title="No configured activity"
              text="Choose a sample specialty or configure an actual offering in Offerings. Onboarding will be handled later."
            >
              <a
                className="av-button"
                href={appendMerchantOnboardingDemoContext(
                  '/merchant-live-preview/offerings',
                  activeDemo,
                )}
              >
                Open Offerings
              </a>
            </Empty>
          ) : location === 'All locations' ? (
            <>
              <p className="av-note">
                All locations is a read-only summary. Choose a location to edit, or copy a reviewed
                schedule to explicit targets.
              </p>
              <div className="av-location-grid">
                {aggregate.map((a) => (
                  <section className="av-card" key={a.location}>
                    <h2>{a.location}</h2>
                    <p>
                      {activeEvents(a.s).length} sample resource claims · revision {a.s.revision}
                    </p>
                    <button className="av-button" onClick={() => setLocation(a.location)}>
                      Open {a.location}
                    </button>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              {!editable && (
                <p className="av-note">
                  <AlertCircle size={17} />
                  {role === 'viewer' ? 'View-only sample role.' : sourceLabel(ctx) + '.'} Local
                  drafts can be kept. Unknown data never appears as free capacity.
                </p>
              )}
              <div className="av-tabs" role="tablist" aria-label="Availability sections">
                {tabs.map((name) => (
                  <button
                    key={name}
                    id={'av-tab-' + name}
                    role="tab"
                    aria-selected={tab === name}
                    aria-controls="av-active-panel"
                    tabIndex={tab === name ? 0 : -1}
                    onClick={() => setTab(name)}
                    onKeyDown={(e) => tabKey(e, name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id="av-active-panel" aria-labelledby={'av-tab-' + tab}>
                {tab === 'Schedule' && (
                  <>
                    <div
                      className={
                        'av-layout ' + (selected || selectedOccurrence ? 'av-detail-open' : '')
                      }
                    >
                      <div className="av-main">
                        {view.renderer === 'assets' &&
                          (snapshot.events.some((e) => e.ongoing) ||
                            snapshot.resources.some((r) => r.state === 'unknown')) && (
                            <div className="av-attention-strip">
                              {snapshot.events.some((e) => e.ongoing) && (
                                <button
                                  onClick={() =>
                                    selectEvent(snapshot.events.find((e) => e.ongoing)!)
                                  }
                                >
                                  <AlertCircle size={23} />
                                  <span>
                                    <strong>
                                      {snapshot.events.filter((e) => e.ongoing).length} overdue
                                      return
                                    </strong>
                                    <small>Actual return not recorded · Review in Work</small>
                                  </span>
                                  <span aria-hidden="true">›</span>
                                </button>
                              )}
                              {snapshot.resources.some((r) => r.state === 'unknown') && (
                                <button
                                  onClick={() =>
                                    setResourceFilter(
                                      snapshot.resources.find((r) => r.state === 'unknown')!.id,
                                    )
                                  }
                                >
                                  <AlertCircle size={23} />
                                  <span>
                                    <strong>
                                      {
                                        snapshot.resources.filter((r) => r.state === 'unknown')
                                          .length
                                      }{' '}
                                      resource source unknown
                                    </strong>
                                    <small>
                                      {snapshot.resources.find((r) => r.state === 'unknown')?.name}
                                    </small>
                                  </span>
                                  <span aria-hidden="true">›</span>
                                </button>
                              )}
                            </div>
                          )}
                        <div
                          className={
                            'av-desktop-context ' +
                            (!['hours', 'coverage', 'access'].includes(view.renderer)
                              ? 'av-compact-context'
                              : '') +
                            (!['APPOINTMENT', 'FIELD_VISIT', 'TRANSFER'].includes(view.model)
                              ? ' av-context-no-duration'
                              : '')
                          }
                        >
                          {contextSummary}
                        </div>
                        <button
                          className="av-button av-context-summary-trigger"
                          onClick={() => show('context')}
                        >
                          <Clock3 size={15} /> Hours, intake &amp; booking rules
                        </button>
                        <DateToolbar
                          date={date}
                          mode={mode}
                          modes={calendarModes}
                          setDate={setDate}
                          setMode={setMode}
                          now={snapshot.now}
                          resources={snapshot.resources}
                          resourceFilter={resourceFilter}
                          setResourceFilter={setResourceFilter}
                          search={search}
                          setSearch={setSearch}
                        />
                        {stamp(date + 'T00:00') < stamp(snapshot.coverageStart) ||
                        stamp(date + 'T23:59') > stamp(snapshot.coverageEnd) ? (
                          <p className="av-note">
                            This date is outside confirmed sample coverage. No free-capacity promise
                            is available.
                          </p>
                        ) : null}

                        {!['hours', 'coverage', 'access'].includes(view.renderer) &&
                          mode !== 'list' && (
                            <div className="av-mobile-agenda">
                              <CalendarAgenda
                                s={snapshot}
                                c={ctx}
                                view={view}
                                date={date}
                                allDates={mode !== 'day'}
                                onEvent={selectEvent}
                                onOccurrence={selectOccurrence}
                                onSlot={slot}
                                editable={editable}
                              />
                            </div>
                          )}
                        {view.model === 'SERVICE_JOB' && snapshot.settings.jobMode === 'queue' ? (
                          <section className="av-card av-spaced av-queue-board">
                            <h2>Unscheduled queue</h2>
                            <p>
                              These jobs have no reserved start, bay or completion promise. Use
                              Rules to enable scheduled intake or actual work.
                            </p>
                            {snapshot.events
                              .filter((e) => e.status === 'tentative')
                              .map((e) => (
                                <button
                                  key={e.id}
                                  className="av-agenda-row"
                                  onClick={() => selectEvent(e)}
                                >
                                  <div>
                                    <strong>
                                      {e.workId} · {e.title}
                                    </strong>
                                    <span>{e.role}</span>
                                  </div>
                                  Inspect →
                                </button>
                              ))}
                          </section>
                        ) : mode === 'month' ? (
                          <MonthCalendar
                            s={visualSnapshot ?? snapshot}
                            c={ctx}
                            view={view}
                            date={date}
                            search={search}
                            resourceFilter={resourceFilter}
                            onEvent={selectEvent}
                            onOccurrence={selectOccurrence}
                            onSlot={slot}
                            onMove={moveEvent}
                            editable={editable}
                            onDate={(d) => {
                              setDate(d);
                              setMode(
                                ['hours', 'coverage', 'access'].includes(view.renderer)
                                  ? 'week'
                                  : 'day',
                              );
                            }}
                          />
                        ) : mode === 'week' &&
                          !['hours', 'coverage', 'access', 'assets', 'spaces'].includes(
                            view.renderer,
                          ) ? (
                          <TimeWeekCalendar
                            s={visualSnapshot ?? snapshot}
                            c={ctx}
                            view={view}
                            date={date}
                            search={search}
                            resourceFilter={resourceFilter}
                            onEvent={selectEvent}
                            onOccurrence={selectOccurrence}
                            onSlot={slot}
                            onMove={moveEvent}
                            editable={editable}
                          />
                        ) : mode === 'day' &&
                          ['sessions', 'workload', 'occupancy'].includes(view.renderer) ? (
                          <TimeWeekCalendar
                            s={visualSnapshot ?? snapshot}
                            c={ctx}
                            view={view}
                            date={date}
                            dayCount={1}
                            resourceFilter={resourceFilter}
                            onEvent={selectEvent}
                            onOccurrence={selectOccurrence}
                            onSlot={slot}
                            onMove={moveEvent}
                            editable={editable}
                          />
                        ) : mode === 'day' && ['roles', 'jobs'].includes(view.renderer) ? (
                          <CalendarView
                            s={visualSnapshot ?? snapshot}
                            c={ctx}
                            date={date}
                            resourceFilter={resourceFilter}
                            onSelect={selectEvent}
                            onSlot={slot}
                            onMove={moveEvent}
                            editable={editable}
                          />
                        ) : mode === 'list' && view.renderer === 'sessions' ? (
                          <CalendarAgenda
                            s={snapshot}
                            c={ctx}
                            view={view}
                            date={date}
                            allDates
                            onEvent={selectEvent}
                            onOccurrence={selectOccurrence}
                            onSlot={slot}
                            editable={editable}
                          />
                        ) : mode === 'list' || search ? (
                          <Agenda
                            s={snapshot}
                            date={date}
                            onSelect={selectEvent}
                            allDates={mode === 'list'}
                            search={search}
                            resourceFilter={resourceFilter}
                          />
                        ) : ['hours', 'coverage', 'access'].includes(view.renderer) ? (
                          <HoursView
                            s={snapshot}
                            date={date}
                            onEdit={() => propose('hours')}
                            onSelect={selectEvent}
                          />
                        ) : view.renderer === 'calendar' ? (
                          mode === 'week' ? (
                            <ResourceWeekView
                              s={snapshot}
                              c={ctx}
                              date={date}
                              resourceFilter={resourceFilter}
                              onSelect={selectEvent}
                            />
                          ) : (
                            <CalendarView
                              s={snapshot}
                              c={ctx}
                              date={date}
                              resourceFilter={resourceFilter}
                              onSelect={selectEvent}
                              onSlot={slot}
                              onMove={moveEvent}
                              editable={editable}
                            />
                          )
                        ) : ['assets', 'spaces'].includes(view.renderer) ? (
                          <TimelineView
                            s={visualSnapshot ?? snapshot}
                            c={ctx}
                            date={date}
                            resourceFilter={resourceFilter}
                            onSelect={selectEvent}
                            editable={editable}
                            onSlot={slot}
                            onMove={moveEvent}
                            dayCount={mode === 'day' ? 1 : 7}
                          />
                        ) : view.renderer === 'sessions' ? (
                          <OccurrenceView
                            s={snapshot}
                            onSelect={selectEvent}
                            onAdd={() => propose('occurrence')}
                            onCapacity={(id) => propose('capacity', { poolId: id })}
                          />
                        ) : (
                          <>
                            <CapacityView
                              s={snapshot}
                              onCapacity={(id) => propose('capacity', { poolId: id })}
                            />
                            {view.model === 'SERVICE_JOB' &&
                              snapshot.events.some((e) => e.status === 'tentative') && (
                                <section className="av-card av-spaced">
                                  <h2>Unscheduled queue</h2>
                                  <p>
                                    These jobs have no reserved start, bay or completion promise.
                                    Keep them separate from actual work allocations.
                                  </p>
                                  {snapshot.events
                                    .filter((e) => e.status === 'tentative')
                                    .map((e) => (
                                      <button
                                        key={e.id}
                                        className="av-agenda-row"
                                        onClick={() => setSelectedId(e.id)}
                                      >
                                        <div>
                                          <strong>
                                            {e.workId} · {e.title}
                                          </strong>
                                          <span>{e.role}</span>
                                        </div>
                                        Inspect →
                                      </button>
                                    ))}
                                </section>
                              )}
                            {view.model === 'SERVICE_JOB' && (
                              <p className="av-note">
                                Current mode:{' '}
                                {snapshot.settings.jobMode === 'queue'
                                  ? 'Walk-in queue. No fixed start or completion promise.'
                                  : snapshot.settings.jobMode === 'intake'
                                    ? 'Scheduled intake. Completion remains an estimate.'
                                    : 'Scheduled bay/team work.'}
                              </p>
                            )}
                            {view.model === 'LINKED_WINDOWS' && (
                              <p className="av-note">
                                {snapshot.settings.promise === 'firm'
                                  ? 'Firm promise checks incoming, processing and outgoing.'
                                  : 'Assessment commits incoming only.'}{' '}
                                Method: {ctx.method}
                              </p>
                            )}
                            <Agenda
                              s={snapshot}
                              date={date}
                              allDates
                              onSelect={selectEvent}
                              resourceFilter={resourceFilter}
                            />
                          </>
                        )}
                        {view.model === 'ENTITLEMENT' && (
                          <section className="av-card av-spaced">
                            <h2>Membership is access, not reserved time</h2>
                            <p>
                              {String(ctx.offering.fields.included_units ?? 0)}{' '}
                              {String(ctx.offering.fields.usage_unit ?? 'credits')} · Validity{' '}
                              {String(ctx.offering.fields.validity_days ?? 30)} days
                            </p>
                            <p>
                              Book each covered trainer, class or service against its own
                              availability. Existing accepted child bookings keep their rights.
                            </p>
                            <a
                              className="av-link"
                              href={appendMerchantOnboardingDemoContext(
                                offeringHref(ctx),
                                activeDemo,
                              )}
                            >
                              View covered-service configuration
                            </a>
                          </section>
                        )}
                        {view.model === 'REQUEST_QUOTE' && (
                          <section className="av-card av-spaced">
                            <h2>Response coverage</h2>
                            <p>
                              {String(
                                ctx.offering.fields.response_owner_reference ?? 'Provider liaison',
                              )}{' '}
                              · Response window {String(ctx.offering.fields.response_hours ?? 24)}{' '}
                              hours
                            </p>
                            <p>
                              Enquiries reserve no capacity. A regulated enquiry is an
                              administrative handoff, not provider or regulatory approval.
                            </p>
                          </section>
                        )}
                      </div>
                      {selectedOccurrence ? (
                        <OccurrenceInspector
                          o={selectedOccurrence}
                          s={snapshot}
                          c={ctx}
                          onEvent={selectEvent}
                          onClose={() => setSelectedOccurrenceId(null)}
                          onCapacity={(id) => propose('capacity', { poolId: id })}
                        />
                      ) : selected ? (
                        <WorkInspector
                          e={selected}
                          s={snapshot}
                          c={ctx}
                          onClose={() => setSelectedId(null)}
                          onEdit={(e) =>
                            propose('block', {
                              eventId: e.id,
                              start: localInput(e.start),
                              end: localInput(e.end),
                              resourceIds: e.resources,
                              title: e.title,
                              reason: e.role ?? 'Edit local time block',
                              affectScope: 'one',
                            })
                          }
                          onRemove={(e) =>
                            propose('remove', {
                              eventId: e.id,
                              title: 'Remove ' + e.title,
                              reason: 'Remove a local time block',
                            })
                          }
                        />
                      ) : ['hours', 'coverage', 'access'].includes(view.renderer) ? (
                        <aside className="av-side-stack">
                          <section className="av-card av-spaced">
                            <h2>New intake</h2>
                            <p>{ctx.method}</p>
                            {snapshot.pauses
                              .filter((p) => p.method === ctx.method)
                              .map((p) => (
                                <div className="av-note" key={p.method}>
                                  <strong>{p.reason}</strong>
                                  <p>
                                    {p.end
                                      ? 'Until ' +
                                        prettyDate(p.end) +
                                        ' ' +
                                        localTime(p.end) +
                                        ' EAT'
                                      : 'Until manually resumed'}
                                  </p>
                                  <small>Existing work continues.</small>
                                  <button
                                    className="av-button"
                                    disabled={!editable}
                                    onClick={() =>
                                      propose('pause', {
                                        method: p.method,
                                        title: 'Resume ' + p.method,
                                        reason: 'Resume new intake',
                                        start: snapshot.now,
                                        end: snapshot.now,
                                      })
                                    }
                                  >
                                    Review resume
                                  </button>
                                </div>
                              ))}
                            <button
                              className="av-button"
                              disabled={!editable}
                              onClick={() => propose('pause')}
                            >
                              Set intake pause
                            </button>
                          </section>
                          <section className="av-card av-spaced">
                            <h2>
                              {view.model === 'ORDER' ? 'Order cutoff' : 'Availability context'}
                            </h2>
                            <p>
                              {view.model === 'ORDER'
                                ? snapshot.settings.cutoff + ' EAT · Configured for this activity'
                                : view.guidance}
                            </p>
                            <button className="av-link" onClick={() => setTab('Rules')}>
                              View rules
                            </button>
                          </section>
                        </aside>
                      ) : null}
                    </div>
                  </>
                )}
                {tab === 'Rules' && (
                  <div className="av-rule-grid">
                    <section className="av-card av-spaced">
                      <h2>Effective schedule</h2>
                      <p>
                        Scoped to {ctx.offering.name} · {ctx.location} · {ctx.method}
                      </p>
                      <p className="av-footnote">
                        {snapshot.history.some((h) => h.title.toLowerCase().includes('hour'))
                          ? 'Local override applied.'
                          : 'Inherited sample template. No local hours override yet.'}
                      </p>
                      <div className="av-actions">
                        <button
                          className="av-button"
                          disabled={!editable}
                          onClick={() => propose('hours')}
                        >
                          Edit hours
                        </button>
                        <button
                          className="av-button"
                          disabled={!editable}
                          onClick={() =>
                            propose('hours', {
                              hours: normalHours(),
                              title: 'Reset to standard sample template',
                              reason: 'Explicit reset of local hours override',
                            })
                          }
                        >
                          Review standard template
                        </button>
                      </div>
                      <p>{view.guidance}</p>
                    </section>
                    <section className="av-card av-spaced">
                      <h2>Booking and intake rules</h2>
                      <dl className="av-details-list">
                        <dt>Notice</dt>
                        <dd>{snapshot.settings.noticeMinutes} min</dd>
                        <dt>Horizon</dt>
                        <dd>{snapshot.settings.horizonDays} days</dd>
                        {view.model === 'ORDER' && (
                          <>
                            <dt>Cutoff</dt>
                            <dd>{snapshot.settings.cutoff} EAT</dd>
                          </>
                        )}
                        {view.resources && (
                          <>
                            <dt>Timing</dt>
                            <dd>
                              {['APPOINTMENT', 'FIELD_VISIT', 'TRANSFER'].includes(view.model)
                                ? duration(ctx) + ' min · Owned by Offerings'
                                : view.guidance}
                            </dd>
                            <dt>Buffers</dt>
                            <dd>
                              {beforeBuffer(ctx)} before / {afterBuffer(ctx)} after
                            </dd>
                          </>
                        )}
                      </dl>
                      <button
                        className="av-button"
                        disabled={!editable}
                        onClick={() => propose('settings')}
                      >
                        Edit applicable rules
                      </button>
                      <a
                        className="av-link"
                        href={appendMerchantOnboardingDemoContext(offeringHref(ctx), activeDemo)}
                      >
                        Edit service definition in Offerings
                      </a>
                    </section>
                    <section className="av-card av-spaced">
                      <h2>Specialty requirements</h2>
                      <p>{specialtyNeeds(profile.id)}</p>
                      <p className="av-footnote">
                        Selected editor: {ctx.offering.schemaId}. Workflow: {view.workflowId}.
                        Candidates remain inactive until explicitly configured.
                      </p>
                      <button className="av-link" onClick={() => show('sample')}>
                        Inspect sample configuration
                      </button>
                    </section>
                    <section className="av-card av-spaced">
                      <h2>Reservation fees</h2>
                      <p>
                        {!ctx.offering.reservationFee || ctx.offering.reservationFee.mode === 'none'
                          ? 'No reservation fee is configured for new bookings.'
                          : ctx.offering.reservationFee.mode === 'fixed'
                            ? 'KES ' + ctx.offering.reservationFee.amount + ' reservation fee'
                            : ctx.offering.reservationFee.amount + '% of the accepted price'}
                      </p>
                      <p>
                        A fee may be required while capacity is held. Payment alone does not prove a
                        reservation is confirmed.
                      </p>
                      <p>
                        Policies belong to Offerings. Collection, evidence and operational
                        resolution belong to Work/Money.
                      </p>
                      <a className="av-link" href={offeringHref(ctx)}>
                        View offering policies
                      </a>
                    </section>
                  </div>
                )}
                {tab === 'Resources' && (
                  <section className="av-card av-spaced">
                    <h2>Resources and schedule ownership</h2>
                    <p className="av-footnote">
                      Offering-resource associations edit in Offerings. This screen manages declared
                      schedules and displays actual booking claims.
                    </p>
                    {!snapshot.resources.length ? (
                      <Empty
                        title="No resources linked"
                        text="Complete the actual resource links in Offerings. No available capacity has been inferred."
                      />
                    ) : (
                      snapshot.resources.map((r) => (
                        <div className="av-resource-row" key={r.id}>
                          <div>
                            <h3>{r.name}</h3>
                            <p>
                              {r.kind} ·{' '}
                              {r.state === 'unknown' ? 'Source unknown' : 'Current sample'} ·{' '}
                              {r.hours || r.hoursVersions?.length
                                ? 'Custom / scheduled shift'
                                : 'Uses activity schedule'}
                            </p>
                          </div>
                          <button
                            className="av-button"
                            disabled={!editable || r.state === 'unknown'}
                            onClick={() =>
                              propose('resource-hours', {
                                resourceIds: [r.id],
                                hours: resourceHoursForDate(snapshot, r, localDate(snapshot.now)),
                                title: 'Schedule for ' + r.name,
                              })
                            }
                          >
                            Edit shifts / breaks
                          </button>
                        </div>
                      ))
                    )}
                    <a
                      className="av-button"
                      href={appendMerchantOnboardingDemoContext(offeringHref(ctx), activeDemo)}
                    >
                      Manage offering resource links
                    </a>
                  </section>
                )}
                {tab === 'Exceptions' && (
                  <section className="av-card av-spaced">
                    <div className="av-card-heading">
                      <h2>Exceptions and affected work</h2>
                      <button
                        className="av-button"
                        disabled={!editable}
                        onClick={() =>
                          propose('date-hours', {
                            title: 'Special date hours',
                            reason: 'Dated schedule override',
                          })
                        }
                      >
                        Special opening hours
                      </button>
                      <button
                        className="av-button"
                        disabled={!editable}
                        onClick={() => propose('block')}
                      >
                        Add exception
                      </button>
                    </div>
                    <p>Closures, maintenance and breaks never silently cancel existing work.</p>
                    {activeEvents(snapshot)
                      .filter((e) => ['block', 'break'].includes(e.status))
                      .map((e) => (
                        <button
                          key={e.id}
                          className="av-agenda-row"
                          onClick={() => setSelectedId(e.id)}
                        >
                          <div>
                            <strong>{e.title}</strong>
                            <span>
                              {prettyDate(e.start)} · {localTime(e.start)}–{localTime(e.end)}
                            </span>
                            <small>{e.role}</small>
                          </div>
                          <span>Inspect →</span>
                        </button>
                      ))}
                    {!activeEvents(snapshot).some((e) => ['block', 'break'].includes(e.status)) && (
                      <p className="av-empty-inline">
                        No date exceptions in this sample. Public holidays are not applied
                        automatically.
                      </p>
                    )}
                    {selected && (
                      <WorkInspector
                        e={selected}
                        s={snapshot}
                        c={ctx}
                        onClose={() => setSelectedId(null)}
                        onRemove={(e) =>
                          propose('remove', {
                            eventId: e.id,
                            title: 'Remove ' + e.title,
                            reason: 'Explicit removal of local time block',
                          })
                        }
                      />
                    )}
                  </section>
                )}
              </div>
              <footer className="av-workspace-footer">
                <span>
                  Sample snapshot · Revision {snapshot.revision} · {localTime(snapshot.now)} EAT
                </span>
                <div className="av-actions">
                  <button className="av-link" onClick={() => show('history')}>
                    <HistoryIcon size={15} />
                    History{operations.some((o) => o.state === 'pending') ? ' · Pending' : ''}
                  </button>
                  <button
                    className="av-link"
                    disabled={!editable}
                    onClick={() =>
                      propose('hours', {
                        title: 'Copy schedule to selected locations',
                        reason: 'Explicit scoped schedule copy',
                        targets: [location],
                      })
                    }
                  >
                    <Copy size={15} />
                    Copy
                  </button>
                  <button className="av-link" onClick={() => show('import')}>
                    <Upload size={15} />
                    Import
                  </button>
                  <button
                    className="av-link"
                    onClick={() => download('nexg-sample-hours.csv', scheduleCsv(snapshot))}
                  >
                    <Download size={15} />
                    Export
                  </button>
                  <button className="av-button" onClick={() => show('test')}>
                    Check sample availability
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
        {panel === 'sample' && (
          <Modal
            title="Availability sample configuration"
            description="Preview all128 specialties using the existing catalogue. This does not change onboarding or connect a live system."
            onClose={closePanel}
          >
            <div className="av-form">
              <Field label="Sample specialty">
                <select
                  aria-label="Sample specialty"
                  value={sampleId}
                  onChange={(e) => setSampleId(e.target.value)}
                >
                  {[...new Set(profiles.map((p) => p.categoryId))].map((cat) => (
                    <optgroup key={cat} label={categoryName(cat)}>
                      {profiles
                        .filter((p) => p.categoryId === cat)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <button className="av-button av-primary" onClick={() => changeProfile(sampleId)}>
                Open specialty
              </button>
              <Field label="Simulated source state">
                <select
                  value={scenario}
                  onChange={(e) =>
                    guard(() => {
                      setScenario(e.target.value as Scenario);
                      setPanel(null);
                    })
                  }
                >
                  {Object.entries(scenarioNames).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sample role">
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="manager">Manager · Editable when source permits</option>
                  <option value="viewer">Viewer · Read only</option>
                </select>
              </Field>
              <Field label="Next apply result">
                <select
                  value={applyMode}
                  onChange={(e) => setApplyMode(e.target.value as typeof applyMode)}
                >
                  <option value="normal">Confirmed local result</option>
                  <option value="reject">Simulated rejection</option>
                  <option value="unknown">Outcome unknown, reconcile later</option>
                </select>
              </Field>
              {ctx && snapshot && (
                <>
                  <Field label="Controlled sample clock (EAT)">
                    <input
                      type="datetime-local"
                      value={sampleClock}
                      onChange={(e) => setSampleClock(e.target.value)}
                    />
                  </Field>
                  <div className="av-actions">
                    <button
                      className="av-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await source?.setClock(ctx, sampleClock);
                          await refreshData();
                          setNotice(
                            'Sample clock changed. Hold release still needs an owner result.',
                          );
                        })
                      }
                    >
                      Set sample clock
                    </button>
                    <button
                      className="av-button"
                      disabled={busy || !editable}
                      onClick={() => void run(acknowledge)}
                    >
                      Receive expiry result
                    </button>
                  </div>
                </>
              )}
              <hr />
              <h3>Explicitly enable a candidate activity</h3>
              <p className="av-footnote">
                Creates a local sample offering through OfferingsSource. It is not enabled merely
                because this category can support it.
              </p>
              <Field label="Candidate offering type">
                <select value={sampleSchema} onChange={(e) => setSampleSchema(e.target.value)}>
                  <option value="">Choose a registered type</option>
                  {availableSchemas(profile).map((id) => (
                    <option key={id} value={id}>
                      {schemas[id]?.label} · {schemas[id]?.model}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="av-button"
                disabled={busy || !sampleSchema || !catalogue}
                onClick={() => void run(addSampleActivity)}
              >
                Create sample activity
              </button>
              <p className="av-footnote">
                New categories can reuse registered descriptors through the component’s
                additionalProfiles input. Unknown editors/models remain unresolved. The onboarding
                and category-admin interfaces come later.
              </p>
              <button className="av-link" onClick={() => show('reset')}>
                Reset this Availability sample
              </button>
              {panelError && (
                <p className="av-error" role="alert">
                  {panelError}
                </p>
              )}
            </div>
          </Modal>
        )}
        {panel === 'edit' && draft && snapshot && ctx && (
          <Modal
            title={draft.title || 'Edit availability'}
            description="Review scope and affected work before applying this local change."
            side={['block', 'pause', 'capacity', 'remove'].includes(draft.kind)}
            wide
            onClose={closePanel}
            footer={
              <>
                <button
                  className="av-button"
                  aria-label="Save draft locally"
                  onClick={() => void run(saveDraft)}
                  disabled={busy}
                >
                  <span className="av-full-label">Save draft locally</span>
                  <span className="av-short-label">Save draft</span>
                </button>
                <button
                  className="av-button"
                  aria-label="Review change"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setImpact(await source!.impact(ctx, draft, snapshot.revision));
                    })
                  }
                >
                  <span className="av-full-label">Review change</span>
                  <span className="av-short-label">Review</span>
                </button>
                {panelError && (
                  <button
                    className="av-button"
                    onClick={() =>
                      download(
                        'nexg-availability-draft.json',
                        JSON.stringify({ sample: true, scope: snapshot.scope, draft }, null, 2),
                        'application/json',
                      )
                    }
                  >
                    Export draft
                  </button>
                )}
                <button
                  className="av-button av-primary"
                  disabled={busy || !impact || impact.errors.length > 0}
                  onClick={() => void run(applyDraft)}
                >
                  {busy ? 'Working…' : 'Apply in preview'}
                </button>
              </>
            }
          >
            <ProposalFields p={draft} s={snapshot} c={ctx} onChange={patchDraft} />
            {draft.offeringVersion !== ctx.offering.version && (
              <p className="av-note">
                This draft references an older offering.{' '}
                <button
                  className="av-link"
                  onClick={() =>
                    patchDraft({
                      ...draft,
                      id: crypto.randomUUID(),
                      offeringVersion: ctx.offering.version,
                    })
                  }
                >
                  Keep this draft and review the current offering version
                </button>
              </p>
            )}
            {draft.kind === 'hours' && (
              <details className="av-details">
                <summary>Before and after</summary>
                <div className="av-comparison">
                  <div>
                    <h4>Current</h4>
                    <pre>
                      {snapshot.hours
                        .map(
                          (h) =>
                            h.day +
                            ': ' +
                            h.state +
                            ' ' +
                            h.intervals
                              .map((i) => i.start + '–' + i.end + (i.nextDay ? ' next day' : ''))
                              .join(', '),
                        )
                        .join('\n')}
                    </pre>
                  </div>
                  <div>
                    <h4>Proposed</h4>
                    <pre>
                      {draft.hours
                        ?.map(
                          (h) =>
                            h.day +
                            ': ' +
                            h.state +
                            ' ' +
                            h.intervals
                              .map((i) => i.start + '–' + i.end + (i.nextDay ? ' next day' : ''))
                              .join(', '),
                        )
                        .join('\n')}
                    </pre>
                  </div>
                </div>
              </details>
            )}
            {impact && <ImpactReview impact={impact} c={ctx} />}
            <p className="av-footnote">
              {dirty
                ? 'Unsaved changes'
                : savedDraft?.id === draft.id
                  ? 'Draft saved locally; not applied'
                  : 'Local draft'}
            </p>
            {panelError && (
              <p role="alert" className="av-error">
                {panelError}
              </p>
            )}
          </Modal>
        )}
        {panel === 'test' && snapshot && ctx && view && (
          <Modal
            title="Check sample availability"
            description="Test the selected offering, method, exact time and real dependencies using local sample data."
            wide
            onClose={closePanel}
          >
            <AvailabilityTester
              s={snapshot}
              c={ctx}
              view={view}
              onHold={async (p) => {
                const op = await source!.apply(ctx, p, snapshot.revision);
                if (op.state !== 'applied')
                  throw new Error('The sample hold was not confirmed by its source.');
                await refreshData();
                setNotice('Sample hold created locally. No real reservation or charge.');
              }}
            />
          </Modal>
        )}
        {panel === 'import' && snapshot && ctx && (
          <Modal
            title="Import sample hours"
            description="Use an exported CSV. All rows are validated before any local change."
            onClose={closePanel}
          >
            <div className="av-form">
              <Field label="Choose CSV file">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) =>
                    void run(async () => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 1000000) throw new Error('Use a CSV smaller than1MB.');
                      setCsv(await f.text());
                      setCsvPreview(null);
                    })
                  }
                />
              </Field>
              <Field label="Or paste CSV">
                <textarea
                  rows={8}
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setCsvPreview(null);
                  }}
                />
              </Field>
              <button
                className="av-button"
                onClick={() => {
                  try {
                    setCsvPreview(importHours(csv));
                  } catch (e) {
                    setPanelError(message(e));
                  }
                }}
              >
                Check import
              </button>
              {csvPreview && (
                <>
                  <ul>
                    {csvPreview.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <p>
                    {csvPreview.hours.filter((h) => h.state !== 'unspecified').length} day rules
                    read. Every target will still be checked for conflicts.
                  </p>
                  <button
                    className="av-button av-primary"
                    disabled={csvPreview.errors.length > 0 || !editable}
                    onClick={() =>
                      propose('hours', {
                        hours: csvPreview.hours,
                        title: 'Import validated sample hours',
                        reason: 'Reviewed CSV import',
                      })
                    }
                  >
                    Review imported hours
                  </button>
                </>
              )}
              {panelError && (
                <p role="alert" className="av-error">
                  {panelError}
                </p>
              )}
            </div>
          </Modal>
        )}
        {panel === 'history' && ctx && snapshot && (
          <Modal
            title="History and pending changes"
            description="Local preview history, not a production audit log."
            onClose={closePanel}
          >
            <div className="av-form">
              {operations
                .filter((o) => o.state === 'pending')
                .map((o) => (
                  <section key={o.id} className="av-note">
                    <h3>Result being checked</h3>
                    <p>{o.proposal.title}</p>
                    <small>Operation {o.id}</small>
                    <button
                      className="av-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await source!.reconcile(ctx, o.id);
                          await refreshData();
                          setNotice(
                            result.state === 'applied'
                              ? 'Pending change saved in this preview.'
                              : (result.reason ?? 'Change rejected.'),
                          );
                        })
                      }
                    >
                      Check saved operation result
                    </button>
                  </section>
                ))}
              {operations
                .filter((o) => o.state !== 'pending')
                .map((o) => (
                  <section className="av-history-row" key={o.id}>
                    <strong>
                      {o.proposal.title} · {o.state}
                    </strong>
                    <p>{o.reason}</p>
                    {o.targets?.map((t) => (
                      <p key={t.location}>
                        {t.location} · {t.state}
                        {t.reason ? ' · ' + t.reason : ''}
                      </p>
                    ))}
                  </section>
                ))}
              {snapshot.history.map((h) => (
                <section className="av-history-row" key={h.operationId}>
                  <strong>{h.title}</strong>
                  <p>
                    You (sample) · Revision {h.revision} · {prettyDate(h.at)} {localTime(h.at)}
                  </p>
                  {h.effectiveFrom && <p>Effective: {prettyDate(h.effectiveFrom)}</p>}
                  {h.before !== undefined && h.after !== undefined && (
                    <details>
                      <summary>Before and after</summary>
                      <div className="av-comparison">
                        <section>
                          <h4>Before</h4>
                          <pre>{h.before}</pre>
                        </section>
                        <section>
                          <h4>After</h4>
                          <pre>{h.after}</pre>
                        </section>
                      </div>
                    </details>
                  )}
                </section>
              ))}
              {!operations.length && !snapshot.history.length && <p>No local changes yet.</p>}
              {panelError && (
                <p className="av-error" role="alert">
                  {panelError}
                </p>
              )}
            </div>
          </Modal>
        )}
        {panel === 'move' && movePreview && ctx && (
          <Modal
            title="Review proposed calendar move"
            side
            description="The saved schedule has not changed."
            onClose={closePanel}
          >
            <div className="av-form">
              <h3>
                {movePreview.event.workId} · {movePreview.event.title}
              </h3>
              <p>
                Current: {prettyDate(movePreview.event.start)} {localTime(movePreview.event.start)}–
                {localTime(movePreview.event.end)}
              </p>
              <p>
                Proposed: {prettyDate(movePreview.start)} {localTime(movePreview.start)} →{' '}
                {prettyDate(movePreview.end)} {localTime(movePreview.end)}
              </p>
              <p className="av-note">
                Open the same record in Work to recheck every required resource and complete this
                move. Existing work is retained.
              </p>
              <a
                className="av-button av-primary"
                href={
                  workHref(ctx, movePreview.event.workId, movePreview.event.ownerScope) +
                  '&' +
                  new URLSearchParams({
                    proposedStart: movePreview.start,
                    proposedEnd: movePreview.end,
                    referenceEvent: movePreview.event.id,
                  })
                }
              >
                Review reschedule in Work
              </a>
              <button className="av-button" onClick={closePanel}>
                Keep current schedule
              </button>
            </div>
          </Modal>
        )}
        {panel === 'context' && (
          <Modal
            title="Operating status and booking rules"
            description="Hours, intake and offering rules remain separate facts."
            onClose={closePanel}
          >
            <div className="av-context-detail">{contextSummary}</div>
          </Modal>
        )}
        {panel === 'source' && (
          <Modal
            title="Availability source"
            description="Ownership and freshness are independent of opening hours and offering publication."
            onClose={closePanel}
          >
            <div className="av-form">
              <p>{ctx ? sourceLabel(ctx) : 'Choose an offering first.'}</p>
              <p>
                Availability in this workspace is local sample data. External ERP and calendar
                states are simulated. Google Calendar is optional and is not connected.
              </p>
              {snapshot && (
                <dl className="av-details-list">
                  <dt>Observed</dt>
                  <dd>
                    {prettyDate(snapshot.observedAt)} {localTime(snapshot.observedAt)} EAT
                  </dd>
                  <dt>Coverage</dt>
                  <dd>
                    {prettyDate(snapshot.coverageStart)} – {prettyDate(snapshot.coverageEnd)}
                  </dd>
                  <dt>Revision</dt>
                  <dd>{snapshot.revision}</dd>
                  <dt>Offering version</dt>
                  <dd>
                    {ctx?.offering.version}
                    {snapshot.offeringVersion !== ctx?.offering.version
                      ? ' · Definition changed since this schedule snapshot'
                      : ''}
                  </dd>
                </dl>
              )}
              <p className="av-note">
                An empty or stale external calendar is never treated as proof of free capacity.
                Normal source-confirmed work advances automatically; unknown data does not become a
                merchant acceptance task.
              </p>
              <button className="av-button" onClick={() => show('sample')}>
                Change simulated source state
              </button>
            </div>
          </Modal>
        )}
        {panel === 'unsaved' && (
          <Modal
            title="Keep your local changes?"
            description="The current draft has unsaved edits."
            onClose={() => setPanel(backPanel.current)}
            footer={
              <>
                <button className="av-button" onClick={() => setPanel(backPanel.current)}>
                  Keep editing
                </button>
                <button
                  className="av-button"
                  onClick={() => {
                    const action = nextAction.current;
                    nextAction.current = null;
                    setDraft(null);
                    setPanel(null);
                    action?.();
                  }}
                >
                  Discard and continue
                </button>
                <button
                  className="av-button av-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await saveDraft();
                      const action = nextAction.current;
                      nextAction.current = null;
                      setDraft(null);
                      setPanel(null);
                      action?.();
                    })
                  }
                >
                  Save draft and continue
                </button>
              </>
            }
          >
            <p>
              Changes stay scoped to {ctx?.offering.name} at {ctx?.location}. Discard does not undo
              an applied change.
            </p>
            {panelError && (
              <p className="av-error" role="alert">
                {panelError}
              </p>
            )}
          </Modal>
        )}
        {panel === 'reset' && (
          <Modal
            title="Reset this Availability sample?"
            description="Only local Availability preview data is affected. Offerings and other screens are kept."
            onClose={() => setPanel(null)}
            footer={
              <>
                <button className="av-button" onClick={() => setPanel(null)}>
                  Keep sample
                </button>
                <button
                  className="av-button av-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (!source || !ctx) {
                        resetMalformedProfile(window.localStorage, profile.id);
                        await loadCatalogue();
                      } else if (error) {
                        resetMalformedProfile(window.localStorage, profile.id);
                      } else await source.reset(ctx);
                      setDraft(null);
                      setSavedDraft(null);
                      await refreshData();
                      setPanel(null);
                      setError('');
                      setNotice('Availability sample reset locally.');
                    })
                  }
                >
                  Reset Availability preview
                </button>
              </>
            }
          >
            <p>
              {error
                ? 'The malformed Availability document for this specialty will be removed.'
                : ctx?.offering.name + ' · ' + ctx?.location + ' · ' + ctx?.method}{' '}
              Saved drafts and pending operations in the reset scope will be lost.
            </p>
            {panelError && (
              <p className="av-error" role="alert">
                {panelError}
              </p>
            )}
          </Modal>
        )}
      </MerchantLivePreviewShell>
    </div>
  );
}
