'use client';

import { DetailPanel, DetailRow as PrimitiveDetailRow, type ColumnDef } from '@nexg/ui';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Filter,
  Info,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MerchantLivePreviewShell } from '../live-preview-shell';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';
import {
  createModelSnapshot,
  createRestaurantSnapshot,
  createUnavailableSnapshot,
  DEFAULT_FILTERS,
  SAMPLE_POLICY,
} from './fixtures';
import {
  buildInsights,
  exportInsightsCsv,
  formatInsightValue,
  METRIC_DEFINITIONS,
  MODEL_REPORTS,
  parseDateRange,
  previousDateRange,
  profiles,
  resolveInsightTabs,
  REPORTS,
} from './model';
import { ReportEvidence } from './report-evidence';
import {
  BarReport,
  EvidenceTable,
  MetricCards,
  money,
  number,
  ReportPanel,
  Unavailable,
} from './presentation';
import type {
  BookingModel,
  InsightFilters,
  InsightMetric,
  InsightPermissionPolicy,
  InsightRecord,
  InsightReport,
  InsightsSourceSnapshot,
  InsightView,
  MenuRow,
} from './types';
import styles from './workspace.module.css';
import { protectedBrowserFetch } from '../../../lib/supabase/protected-request';

type Panel =
  | { kind: 'period' | 'filters' | 'coverage' | 'export' | 'save' | 'sample' }
  | { kind: 'definition'; metric: string }
  | { kind: 'record'; record: InsightRecord }
  | null;
type SavedView = {
  id: string;
  name: string;
  reportId: string;
  filters: InsightFilters;
  sourceMode: string;
  definition: string;
  createdAt: string;
};
type ExportEntry = {
  id: string;
  name: string;
  reportId: string;
  createdAt: string;
  scope: string;
  sourceMode: string;
};
type Props = {
  initialSnapshot?: InsightsSourceSnapshot;
  initialPolicy?: InsightPermissionPolicy;
  initialFilters?: Partial<InsightFilters>;
  initialProfileId?: string;
  initialTab?: string;
  mode?: 'sample' | 'live';
  demoContext?: MerchantOnboardingDemoContext | null;
};
const ALL_MODELS = Object.keys(MODEL_REPORTS) as BookingModel[];
const DENIED: InsightPermissionPolicy = {
  canRead: false,
  canExport: false,
  canReadFinance: false,
  canReadCustomers: false,
  canReadPromotions: false,
  allowedLocationIds: [],
  allowedModels: [],
};
const BASIS: Record<string, string> = {
  requested: 'Request cohort',
  completed: 'Completed in period',
  scheduled: 'Scheduled in period',
  due: 'Promise due in period',
  posted: 'Posted in period',
  occurred: 'Occurred in period',
};
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(new Date(`${date}T12:00:00+03:00`));
const asOfLabel = (instant: string) =>
  instant && Number.isFinite(Date.parse(instant))
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      }).format(new Date(instant)) + ' EAT'
    : 'Not supplied';
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const currentRange = () => {
  const end = new Date(Date.now() + 3 * 3600000);
  end.setUTCDate(end.getUTCDate() - 1);
  const to = end.toISOString().slice(0, 10);
  end.setUTCDate(end.getUTCDate() - 27);
  return { from: end.toISOString().slice(0, 10), to };
};
const reportForTab = (tab: string, view: InsightView) => {
  const explicit: Record<string, string> = {
    overview: 'RPT_ORDER_OUTCOMES',
    orders: 'RPT_ORDER_OUTCOMES',
    menu: 'RPT_ORDER_VARIANTS',
    products: 'RPT_ORDER_VARIANTS',
    customers: 'RPT_REPEAT_ACTIVITY',
    operations: 'RPT_ORDER_READINESS',
    promotions: 'RPT_CAMPAIGN_MEASUREMENT',
    finance: 'RPT_POSTED_MERCHANT_ACTIVITY',
    fleet: 'RPT_ASSET_UTILIZATION',
    rentals: 'RPT_ASSET_UTILIZATION',
  };
  return (
    view.reports.find((report) => report.id === explicit[tab])?.id ??
    view.reports.find((report) => report.area.toLowerCase() === tab)?.id ??
    view.reports[0]?.id ??
    ''
  );
};

function readList<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Stored report preferences could not be read.');
  return value.slice(0, 50) as T[];
}

function isSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SavedView>;
  const scope = entry.filters;
  if (
    typeof entry.id !== 'string' ||
    typeof entry.name !== 'string' ||
    entry.name.length > 80 ||
    typeof entry.reportId !== 'string' ||
    !REPORTS.some((report) => report.id === entry.reportId) ||
    entry.definition !== '1' ||
    !['sample', 'live'].includes(entry.sourceMode ?? '') ||
    typeof entry.createdAt !== 'string' ||
    !scope ||
    typeof scope.from !== 'string' ||
    typeof scope.to !== 'string' ||
    typeof scope.locationId !== 'string' ||
    typeof scope.keyword !== 'string' ||
    scope.keyword.length > 200 ||
    (scope.activity !== 'all' && !ALL_MODELS.includes(scope.activity))
  )
    return false;
  try {
    parseDateRange(scope.from, scope.to);
    return true;
  } catch {
    return false;
  }
}

function sampleSnapshot(profileId?: string, model?: BookingModel): InsightsSourceSnapshot {
  try {
    return profileId ? createModelSnapshot(profileId, model) : createRestaurantSnapshot();
  } catch {
    return {
      ...createRestaurantSnapshot(),
      notice: 'That sample activity was not found. The restaurant example is shown.',
    };
  }
}

export function InsightsWorkspace({
  initialSnapshot,
  initialPolicy,
  initialFilters,
  initialProfileId,
  initialTab = 'overview',
  mode = initialSnapshot?.sourceMode ?? 'sample',
  demoContext,
}: Props) {
  const inheritedDemo = useMerchantOnboardingDemoContext();
  const activeDemo = demoContext ?? inheritedDemo;
  const [snapshot, setSnapshot] = useState<InsightsSourceSnapshot>(
    () =>
      initialSnapshot ??
      (mode === 'live' ? createUnavailableSnapshot() : sampleSnapshot(initialProfileId ?? demoContext?.profileId)),
  );
  const [policy, setPolicy] = useState(
    initialPolicy ?? (mode === 'sample' ? SAMPLE_POLICY : DENIED),
  );
  const [filters, setFilters] = useState<InsightFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...(mode === 'live' ? { ...currentRange(), locationId: 'all' } : {}),
    ...initialFilters,
  }));
  const [tab, setTab] = useState(initialTab);
  const [compare, setCompare] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [periodDraft, setPeriodDraft] = useState({ from: filters.from, to: filters.to });
  const [periodError, setPeriodError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [scenario, setScenario] = useState('current');
  const [reportId, setReportId] = useState('RPT_ORDER_OUTCOMES');
  const [reportOpen, setReportOpen] = useState(false);
  const [evidenceMetric, setEvidenceMetric] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<'library' | 'saved' | 'exports'>('library');
  const [reportSearch, setReportSearch] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportEntry[]>([]);
  const [viewName, setViewName] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [origin, setOrigin] = useState<{
    tab: string;
    filters: InsightFilters;
    scroll: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState(960);
  const [collectionPage, setCollectionPage] = useState(0);
  const demoProfileId = activeDemo?.profileId;
  useEffect(() => {
    if (!initialProfileId && !initialSnapshot && mode === 'sample' && demoProfileId)
      setSnapshot(sampleSnapshot(demoProfileId));
  }, [initialProfileId, initialSnapshot, mode, demoProfileId]);
  const [offeringUnit, setOfferingUnit] = useState('');
  useEffect(() => setCollectionPage(0), [libraryTab, reportSearch]);
  const hasLoaded = useRef(false);
  const requestVersion = useRef(0);
  const storageKey = `nexg.insights.views.v1.${mode}.${snapshot.merchantId}`;
  const exportKey = `nexg.insights.exports.v1.${mode}.${snapshot.merchantId}`;

  useEffect(() => {
    const element = tabsRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTabWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resolvedPolicy = useMemo(
    () =>
      scenario === 'restricted' && mode === 'sample'
        ? { ...policy, canReadFinance: false, canReadCustomers: false, canReadPromotions: false }
        : policy,
    [policy, scenario, mode],
  );
  const visibleSnapshot = useMemo((): InsightsSourceSnapshot => {
    if (mode !== 'sample' || scenario === 'current' || scenario === 'restricted') return snapshot;
    if (scenario === 'empty')
      return {
        ...snapshot,
        records: [],
        lineItems: [],
        postings: [],
        campaignEvents: [],
        capacity: [],
        notice: 'This sample source confirmed no activity. Zero is different from a failed source.',
      };
    if (scenario === 'unavailable')
      return {
        ...snapshot,
        status: 'unavailable',
        records: [],
        lineItems: [],
        postings: [],
        campaignEvents: [],
        capacity: [],
        coverage: snapshot.coverage.map((row) => ({ ...row, status: 'unavailable' })),
        notice:
          'The reporting source could not be read. No missing value has been replaced with zero.',
      };
    const records = snapshot.records.filter(
      (record) => (record.completedOn ?? record.requestedOn).slice(0, 10) < '2026-10-31',
    );
    const ids = new Set(records.map((record) => record.id));
    return {
      ...snapshot,
      status: 'partial',
      records,
      lineItems: snapshot.lineItems.filter((row) => ids.has(row.recordId)),
      coverage: snapshot.coverage.map((row) =>
        row.kind === 'work' ||
        row.kind === 'items' ||
        row.kind === 'operations' ||
        row.kind === 'customers'
          ? {
              ...row,
              status: 'partial',
              asOf: '2026-10-30T15:00:00Z',
              message: 'The final reporting day has incomplete evidence.',
            }
          : row,
      ),
      notice:
        'Work evidence is partial through 30 October, 18:00 EAT. Other sources keep their own coverage.',
    };
  }, [snapshot, scenario, mode]);
  const admittedTabs = useMemo(
    () => resolveInsightTabs(visibleSnapshot, resolvedPolicy),
    [visibleSnapshot, resolvedPolicy],
  );
  const activeTab = admittedTabs.some((item) => item.key === tab) ? tab : 'overview';
  const reportModelScope =
    activeTab === 'reports' ? REPORTS.find((report) => report.id === reportId)?.models : undefined;
  const peerModels = useMemo(
    () =>
      reportModelScope && reportModelScope !== '*'
        ? reportModelScope
        : (admittedTabs.find((item) => item.key === activeTab)?.models ?? []),
    [admittedTabs, activeTab, reportModelScope],
  );
  const peerPolicy = useMemo(
    () =>
      peerModels.length
        ? {
            ...resolvedPolicy,
            allowedModels: resolvedPolicy.allowedModels.filter((model) =>
              peerModels.includes(model),
            ),
          }
        : resolvedPolicy,
    [resolvedPolicy, peerModels],
  );
  const catalogueView = useMemo(
    () => buildInsights(visibleSnapshot, filters, resolvedPolicy),
    [visibleSnapshot, filters, resolvedPolicy],
  );
  const view = useMemo(
    () => ({
      ...buildInsights(visibleSnapshot, filters, peerPolicy),
      tabs: admittedTabs,
      reports: catalogueView.reports,
    }),
    [visibleSnapshot, filters, peerPolicy, admittedTabs, catalogueView.reports],
  );
  const prior = useMemo(
    () =>
      compare
        ? buildInsights(visibleSnapshot, { ...filters, ...previousDateRange(filters) }, peerPolicy)
        : undefined,
    [compare, visibleSnapshot, filters, peerPolicy],
  );
  const selectedReport = view.reports.find((item) => item.id === reportId) ?? view.reports[0];
  const sampleProfile = profiles.find((item) => item.subcategoryId === snapshot.subcategoryId);
  const metric = panel?.kind === 'definition' ? view.metrics[panel.metric] : undefined;
  const metrics = (ids: string[]) =>
    ids.map((id) => view.metrics[id]).filter((item): item is InsightMetric => Boolean(item));
  const moneyValue = (minor: number | null | undefined) => money(minor, view.currency);
  const visibleSavedViews = savedViews.filter((entry) =>
    view.reports.some((report) => report.id === entry.reportId),
  );
  const authorizedRecords = useMemo(
    () =>
      new Map(
        [
          ...view.records,
          ...Object.values(view.reportRecords).flat(),
          ...Object.values(view.metricRecords).flat(),
        ].map((record) => [record.id, record]),
      ),
    [view],
  );
  const panelRecord =
    panel?.kind === 'record' && resolvedPolicy.canRead
      ? authorizedRecords.get(panel.record.id)
      : undefined;

  useEffect(() => {
    if (!resolvedPolicy.canRead || (panel?.kind === 'record' && !panelRecord)) {
      setPanel(null);
      if (!resolvedPolicy.canRead) {
        setReportOpen(false);
        setEvidenceMetric(null);
      }
    }
  }, [resolvedPolicy.canRead, panel, panelRecord]);

  useEffect(() => {
    try {
      const parsed = readList<unknown>(storageKey).filter(isSavedView);
      setSavedViews(parsed);
      setExportHistory(
        readList<ExportEntry>(exportKey).filter(
          (entry) =>
            typeof entry.id === 'string' &&
            typeof entry.reportId === 'string' &&
            typeof entry.name === 'string' &&
            typeof entry.scope === 'string' &&
            typeof entry.createdAt === 'string' &&
            typeof entry.sourceMode === 'string',
        ),
      );
    } catch {
      setNotice(
        'Device storage is unavailable. You can still explore reports; saved views will need storage access.',
      );
      setSavedViews([]);
      setExportHistory([]);
    }
    setStorageReady(true);
  }, [storageKey, exportKey]);

  useEffect(() => {
    const readLocation = (event?: PopStateEvent) => {
      const params = new URLSearchParams(window.location.search);
      setTab(params.get('tab') ?? (event ? 'overview' : initialTab));
      try {
        const from = params.get('from'),
          to = params.get('to');
        const fallback =
          mode === 'live' ? currentRange() : { from: DEFAULT_FILTERS.from, to: DEFAULT_FILTERS.to };
        const range = from && to ? parseDateRange(from, to) : fallback;
        const activity = params.get('activity');
        setFilters((current) => ({
          ...current,
          ...range,
          locationId:
            params.get('location') ??
            (event
              ? 'all'
              : (initialFilters?.locationId ??
                (mode === 'sample' ? DEFAULT_FILTERS.locationId : 'all'))),
          activity:
            activity && ALL_MODELS.includes(activity as BookingModel)
              ? (activity as BookingModel)
              : 'all',
          keyword: params.get('q') ?? '',
        }));
        const report = params.get('report');
        setReportOpen(Boolean(report));
        if (report) setReportId(report);
        const exact = params.get('metric');
        setEvidenceMetric(
          exact &&
            METRIC_DEFINITIONS.some((metric) => metric.id === exact && metric.reportId === report)
            ? exact
            : null,
        );
      } catch {
        setNotice('The saved date range is invalid. The default reporting period is shown.');
      }
    };
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
    // Initial route inputs are intentionally applied once; subsequent navigation uses popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    params.set('from', filters.from);
    params.set('to', filters.to);
    if (filters.locationId === 'all') params.delete('location');
    else params.set('location', filters.locationId);
    if (filters.activity === 'all') params.delete('activity');
    else params.set('activity', filters.activity);
    if (filters.keyword) params.set('q', filters.keyword);
    else params.delete('q');
    if (reportOpen && selectedReport) params.set('report', selectedReport.id);
    else params.delete('report');
    if (
      reportOpen &&
      evidenceMetric &&
      view.metrics[evidenceMetric]?.reportId === selectedReport?.id
    )
      params.set('metric', evidenceMetric);
    else params.delete('metric');
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [activeTab, filters, reportOpen, selectedReport, evidenceMetric, view.metrics]);

  useEffect(() => {
    if (mode !== 'live') return;
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      return;
    }
    const controller = new AbortController();
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    protectedBrowserFetch(
      `/api/merchant/insights?from=${encodeURIComponent(filters.from)}&to=${encodeURIComponent(filters.to)}`,
      { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' },
    )
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setPolicy(DENIED);
          setPanel(null);
          setReportOpen(false);
          setEvidenceMetric(null);
          setSnapshot((current) => ({
            ...current,
            status: 'unavailable',
            records: [],
            lineItems: [],
            postings: [],
            campaignEvents: [],
            capacity: [],
            coverage: [],
          }));
          throw new Error(
            'Your report access has changed. Sign in again or contact the workspace owner.',
          );
        }
        const result = await response.json();
        if (!response.ok || !result.snapshot || !result.policy)
          throw new Error(result.error || 'Reports could not be refreshed.');
        if (version === requestVersion.current) {
          setSnapshot(result.snapshot);
          setPolicy(result.policy);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Reports could not be refreshed.');
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersion.current) setBusy(false);
      });
    return () => controller.abort();
  }, [mode, filters.from, filters.to, refresh]);

  useEffect(() => {
    if (mode !== 'live') return;
    const recheck = () => {
      if (document.visibilityState === 'visible') setRefresh((value) => value + 1);
    };
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [mode]);

  const pushTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', next);
      params.delete('report');
      params.delete('metric');
      window.history.pushState(
        window.history.state,
        '',
        `${window.location.pathname}?${params.toString()}`,
      );
      setTab(next);
      setReportOpen(false);
      setEvidenceMetric(null);
      setNotice('');
      const target = view.tabs.find((item) => item.key === next);
      if (
        target?.models.length &&
        filters.activity !== 'all' &&
        !target.models.includes(filters.activity)
      ) {
        setFilters((current) => ({ ...current, activity: target.models[0]!, keyword: '' }));
        setNotice(`Activity changed to ${MODEL_REPORTS[target.models[0]!]!.label} for this view.`);
      }
    },
    [view.tabs, filters.activity],
  );

  function openReport(id: string, exactMetric?: string) {
    const found = view.reports.find((report) => report.id === id);
    if (!found) {
      setNotice('That report is not available for your current access and activity.');
      return;
    }
    setOrigin({
      tab: activeTab,
      filters: { ...filters },
      scroll: scrollRef.current?.scrollTop ?? 0,
    });
    setReportId(id);
    setEvidenceMetric(exactMetric ?? null);
    setReportOpen(true);
    setLibraryTab('library');
    setTab('reports');
    setPanel(null);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'reports');
    params.set('report', id);
    if (exactMetric) params.set('metric', exactMetric);
    else params.delete('metric');
    window.history.pushState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function returnToOrigin() {
    setReportOpen(false);
    setEvidenceMetric(null);
    if (origin) {
      setTab(origin.tab);
      setFilters(origin.filters);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: origin.scroll }));
    }
  }

  function openExport() {
    setReportId(reportOpen && selectedReport ? selectedReport.id : reportForTab(activeTab, view));
    setPanel({ kind: 'export' });
  }
  function openSave() {
    setViewName(selectedReport?.label ?? 'My report');
    setPanel({ kind: 'save' });
  }
  function saveView() {
    if (!selectedReport || !viewName.trim()) {
      setNotice('Give this saved view a name.');
      return;
    }
    const next = [
      ...savedViews,
      {
        id: uid(),
        name: viewName.trim().slice(0, 80),
        reportId: selectedReport.id,
        filters: { ...filters },
        sourceMode: mode,
        definition: '1',
        createdAt: new Date().toISOString(),
      },
    ];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSavedViews(next);
      setPanel(null);
      setNotice('View saved on this device. Report values are recalculated when it is opened.');
    } catch {
      setNotice(
        'The view could not be saved on this device. Your name and filter choices are still here.',
      );
    }
  }
  function deleteView(id: string) {
    const next = savedViews.filter((entry) => entry.id !== id);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSavedViews(next);
      setNotice('Saved view removed from this device.');
    } catch {
      setNotice('The saved view could not be removed. Please try again.');
    }
  }
  function loadSaved(entry: SavedView) {
    try {
      parseDateRange(entry.filters.from, entry.filters.to);
      if (
        entry.definition !== '1' ||
        entry.sourceMode !== mode ||
        !view.reports.some((item) => item.id === entry.reportId)
      )
        throw new Error('The saved report or its access has changed. Review it in Library.');
      if (
        entry.filters.locationId !== 'all' &&
        !resolvedPolicy.allowedLocationIds.includes(entry.filters.locationId)
      )
        throw new Error('The saved location is no longer permitted. Choose an allowed location.');
      if (
        entry.filters.activity !== 'all' &&
        !resolvedPolicy.allowedModels.includes(entry.filters.activity)
      )
        throw new Error('The saved activity is no longer permitted.');
      setFilters(entry.filters);
      setReportId(entry.reportId);
      setEvidenceMetric(null);
      setReportOpen(true);
      setLibraryTab('library');
      setNotice(`Opened ${entry.name}. Current source coverage and permissions apply.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'The saved view could not be opened.');
    }
  }
  function createExport() {
    if (!selectedReport) return;
    try {
      const exact =
        evidenceMetric && view.metrics[evidenceMetric]?.reportId === selectedReport.id
          ? evidenceMetric
          : undefined;
      const csv = exportInsightsCsv(view, selectedReport.id, exact);
      const name = `nexg-${selectedReport.id.toLowerCase()}-${filters.from}-${filters.to}.csv`;
      const url = URL.createObjectURL(
        new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const next = [
        {
          id: uid(),
          name,
          reportId: selectedReport.id,
          createdAt: new Date().toISOString(),
          scope: `${filters.from} to ${filters.to} · ${filters.locationId} · ${filters.keyword || 'All matching records'}`,
          sourceMode: mode,
        },
        ...exportHistory,
      ].slice(0, 30);
      setExportHistory(next);
      try {
        localStorage.setItem(exportKey, JSON.stringify(next));
      } catch {
        setNotice('CSV prepared. Export history could not be saved on this device.');
      }
      setPanel(null);
      setNotice(
        'CSV prepared for the selected scope. It includes all matching records, not only the displayed page.',
      );
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'The export could not be prepared. Please try again.',
      );
    }
  }

  function changeProfile(id: string, model?: BookingModel) {
    const next = sampleSnapshot(id, model);
    setSnapshot(next);
    setPolicy(SAMPLE_POLICY);
    setFilters({
      ...DEFAULT_FILTERS,
      locationId: next.locations.some((location) => location.id === 'karen') ? 'karen' : 'all',
    });
    setScenario('current');
    setTab('overview');
    setReportOpen(false);
    setEvidenceMetric(null);
    setOrigin(null);
    setNotice('Sample business changed. No live business configuration was updated.');
  }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = view.tabs.findIndex((item) => item.key === activeTab);
    const next =
      event.key === 'Home'
        ? view.tabs[0]
        : event.key === 'End'
          ? view.tabs[view.tabs.length - 1]
          : view.tabs[
              (index + (event.key === 'ArrowRight' ? 1 : -1) + view.tabs.length) % view.tabs.length
            ];
    if (next) {
      pushTab(next.key);
      document.getElementById(`insights-tab-${next.key}`)?.focus();
    }
  }

  const cardSet = (ids: string[]) => (
    <MetricCards
      metrics={metrics(ids)}
      previous={prior?.metrics}
      compare={compare}
      onDefinition={(item) => setPanel({ kind: 'definition', metric: item.id })}
      currency={view.currency}
      notes={view.metrics.missing_ready_promises?.value ? { order_ready_on_time: <button className="in-metric-note" onClick={() => openReport('RPT_ORDER_READINESS', 'missing_ready_promises')}>{number(view.metrics.missing_ready_promises.value)} without a ready promise <ArrowRight size={10} /></button> } : undefined}
    />
  );
  const recordColumns: ColumnDef<InsightRecord, unknown>[] = [
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => (
        <button
          type="button"
          className="in-text-button"
          onClick={() => setPanel({ kind: 'record', record: row.original })}
        >
          {row.original.reference}
        </button>
      ),
    },
    { accessorKey: 'label', header: 'Offering' },
    {
      accessorKey: 'requestedOn',
      header: 'Requested',
      cell: ({ row }) =>
        row.original.requestedOn
          ? dateLabel(row.original.requestedOn.slice(0, 10))
          : 'Not recorded',
    },
    {
      accessorKey: 'fulfilment',
      header: 'Fulfilment',
      cell: ({ row }) => row.original.fulfilment ?? MODEL_REPORTS[row.original.model].label,
    },
    {
      accessorKey: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => (
        <span
          className="in-state"
          data-status={
            row.original.outcome === 'open'
              ? 'partial'
              : row.original.outcome === 'cancelled'
                ? 'unavailable'
                : 'ready'
          }
        >
          {row.original.outcome.replaceAll('_', ' ')}
        </span>
      ),
    },
  ];
  const menuColumns: ColumnDef<MenuRow, unknown>[] = [
    { accessorKey: 'label', header: 'Item / offering' },
    { accessorKey: 'variant', header: 'Accepted variant' },
    {
      accessorKey: 'units',
      header: 'Units fulfilled',
      cell: ({ row }) => number(row.original.units),
    },
    { accessorKey: 'unit', header: 'Unit' },
    ...(resolvedPolicy.canReadFinance
      ? [
          {
            accessorKey: 'itemSalesMinor',
            header: 'Item sales before refunds',
            cell: ({ row }: { row: { original: MenuRow } }) =>
              moneyValue(row.original.itemSalesMinor),
          } as ColumnDef<MenuRow, unknown>,
        ]
      : []),
  ];
  const weekly = view.weekly.map((week) => ({
    label: `${dateLabel(week.from).replace(' 2026', '')}–${Number(week.to.slice(-2))}`,
    value: week.completed,
  }));
  const orderCards = ['work_requested', 'order_cohort_completed', 'order_cancelled', 'order_open'];
  const isOrder = view.models.length === 1 && view.models[0] === 'ORDER';
  const genericMetricIds = view.models.flatMap((id) => [MODEL_REPORTS[id].metricId]);
  const domainMetrics = [
    ...new Set(['work_requested', ...genericMetricIds, 'work_completed']),
  ].slice(0, 4);
  const offeringUnits = [...new Set(view.menuRows.map(row => row.unit))];
  const currentOfferingUnit = offeringUnits.includes(offeringUnit) ? offeringUnit : offeringUnits[0];
  const itemSalesSegments = view.menuRows.slice(0, 4).map(row => ({ label: row.label, value: row.itemSalesMinor == null ? null : row.itemSalesMinor / 100 }));
  if (view.menuRows.length > 4) itemSalesSegments.push({ label: 'Other items', value: view.menuRows.slice(4).some(row => row.itemSalesMinor == null) ? null : view.menuRows.slice(4).reduce((sum, row) => sum + (row.itemSalesMinor ?? 0), 0) / 100 });
  const majorAmount = (id: string) => { const value = view.metrics[id]?.value; return value == null ? null : value / 100; };
  const matchingReports = view.reports.filter((report) =>
    `${report.label} ${report.area}`.toLowerCase().includes(reportSearch.toLowerCase().trim()),
  );
  const collectionCount = libraryTab === 'library' ? matchingReports.length : libraryTab === 'saved' ? visibleSavedViews.length : exportHistory.length;
  const collectionPages = Math.max(1, Math.ceil(collectionCount / 5));
  const resolvedCollectionPage = Math.min(collectionPage, collectionPages - 1);
  const reportMetrics =
    selectedReport?.metricIds.filter(
      (id) => view.metrics[id] && view.metrics[id]!.status !== undefined,
    ) ?? [];
  const selectedMetricIds =
    selectedReport?.id === 'RPT_ORDER_OUTCOMES' ? orderCards : reportMetrics;
  function detailedReportContent(report: InsightReport) {
    return (
      <ReportEvidence
        view={view}
        report={report}
        evidenceMetric={evidenceMetric}
        onRecord={(record) => setPanel({ kind: 'record', record })}
      />
    );
  }

  function reportsContent() {
    return (
      <>
        <div className="in-view-heading">
          <div>
            <h2>{reportOpen && selectedReport ? selectedReport.label : 'Reports'}</h2>
            <p>
              {reportOpen
                ? `${BASIS[(evidenceMetric ? view.metrics[evidenceMetric]?.dateBasis : selectedReport?.dateBasis) ?? 'requested']} · ${dateLabel(filters.from)} to ${dateLabel(filters.to)}`
                : 'Find a report, inspect its evidence or reopen a saved view.'}
            </p>
          </div>
          {reportOpen && (
            <button type="button" className="in-button" onClick={returnToOrigin}>
              <ArrowLeft size={14} />
              {origin
                ? `Back to ${origin.tab === 'overview' ? 'Overview' : (view.tabs.find((item) => item.key === origin.tab)?.label ?? 'Library')}`
                : 'Back to library'}
            </button>
          )}
        </div>
        {reportOpen && selectedReport ? (
          <>
            {cardSet(evidenceMetric ? [evidenceMetric] : selectedMetricIds)}
            <div className="in-heading-actions">
              <button className="in-button" onClick={openSave}>
                <Bookmark size={15} />
                Save view
              </button>
              <button className="in-button" onClick={() => setPanel({ kind: 'coverage' })}>
                <Info size={15} />
                Source coverage
              </button>
              {evidenceMetric && (
                <button className="in-button" onClick={() => setEvidenceMetric(null)}>
                  Show full report
                </button>
              )}
            </div>
            {detailedReportContent(selectedReport)}
          </>
        ) : (
          <>
            <section className="in-panel in-report-collection">
              <div className="in-secondary-tabs" aria-label="Report collections">
                <button
                  type="button"
                  aria-pressed={libraryTab === 'library'}
                  onClick={() => setLibraryTab('library')}
                >
                  Library
                </button>
                <button
                  type="button"
                  aria-pressed={libraryTab === 'saved'}
                  onClick={() => setLibraryTab('saved')}
                >
                  Saved views ({visibleSavedViews.length})
                </button>
                <button
                  type="button"
                  aria-pressed={libraryTab === 'exports'}
                  onClick={() => setLibraryTab('exports')}
                >
                  Exports ({exportHistory.length})
                </button>
              </div>
              {libraryTab === 'library' ? (
                <div className="in-library">
                  <div>
                    <div className="in-library-tools">
                      <label className="sr-only" htmlFor="insights-search-reports">
                        Search reports
                      </label>
                      <input
                        id="insights-search-reports"
                        className="in-input"
                        placeholder="Search reports or areas…"
                        type="search"
                        value={reportSearch}
                        onChange={(event) => setReportSearch(event.target.value)}
                      />
                    </div>
                    <div className="in-library-list">
                      {matchingReports.slice(resolvedCollectionPage * 5, resolvedCollectionPage * 5 + 5).map((report) => (
                        <button
                          type="button"
                          key={report.id}
                          className="in-library-row"
                          aria-pressed={selectedReport?.id === report.id}
                          onClick={() => {
                            setReportId(report.id);
                            setEvidenceMetric(null);
                          }}
                        >
                          <span>
                            <strong>{report.label}</strong>
                            <small>
                              {report.area} · {BASIS[report.dateBasis]}
                            </small>
                          </span>
                          <span className="in-state" data-status={report.status}>
                            {report.status === 'ready'
                              ? 'Available'
                              : report.status === 'partial'
                                ? 'Partial'
                                : 'Unavailable'}
                          </span>
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      ))}
                      {matchingReports.length === 0 && (
                        <div className="in-empty-chart">No reports match this search.</div>
                      )}
                    </div>
                  </div>
                  <aside className="in-report-preview">
                    {selectedReport ? (
                      <>
                        <h2>{selectedReport.label}</h2>
                        <p>
                          {dateLabel(filters.from)} to {dateLabel(filters.to)} ·{' '}
                          {filters.locationId === 'all'
                            ? 'All permitted locations'
                            : snapshot.locations.find(
                                (location) => location.id === filters.locationId,
                              )?.label}{' '}
                          · {BASIS[selectedReport.dateBasis]}
                        </p>
                        {cardSet(selectedMetricIds.slice(0, 4))}
                        <div className="in-preview-actions">
                          <button
                            className="in-primary"
                            onClick={() => openReport(selectedReport.id)}
                          >
                            Open full report <ArrowRight size={14} />
                          </button>
                          <button className="in-button" onClick={openSave}>
                            <Bookmark size={14} />
                            Save view
                          </button>
                        </div>
                        <div className="in-preview-detail">
                          <button
                            className="in-text-button"
                            onClick={() => setPanel({ kind: 'coverage' })}
                          >
                            Review source coverage <ArrowRight size={14} />
                          </button>
                        </div>
                        <p>Operational changes are made in the owning workspace.</p>
                      </>
                    ) : (
                      <Unavailable message="No report is permitted for this scope. Contact your workspace owner if your access needs to change." />
                    )}
                  </aside>
                </div>
              ) : libraryTab === 'saved' ? (
                <div className="in-saved-list">
                  {visibleSavedViews.length === 0 ? (
                    <div className="in-empty-chart">
                      No saved views on this device. Choose a report in Library to save its filters.
                    </div>
                  ) : (
                    visibleSavedViews.slice(resolvedCollectionPage * 5, resolvedCollectionPage * 5 + 5).map((entry) => (
                      <div className="in-saved-row" key={entry.id}>
                        <div>
                          <strong>{entry.name}</strong>
                          <p>
                            {entry.filters.from} to {entry.filters.to} · Saved on this device
                          </p>
                        </div>
                        <div className="in-heading-actions">
                          <button className="in-button" onClick={() => loadSaved(entry)}>
                            Open view <ArrowRight size={14} />
                          </button>
                          <button
                            className="in-button"
                            aria-label={`Delete ${entry.name}`}
                            onClick={() => deleteView(entry.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="in-saved-list">
                  <p className="in-subtitle">
                    Files are prepared in your browser. This device history stores scope, not copies
                    of the downloaded files.
                  </p>
                  {exportHistory.length === 0 ? (
                    <div className="in-empty-chart">
                      No exports yet. Choose a report and preview its export scope.
                    </div>
                  ) : (
                    exportHistory.slice(resolvedCollectionPage * 5, resolvedCollectionPage * 5 + 5).map((entry) => (
                      <div className="in-saved-row" key={entry.id}>
                        <div>
                          <strong>{entry.name}</strong>
                          <p>
                            {entry.scope} · Prepared {asOfLabel(entry.createdAt)}
                          </p>
                        </div>
                        <button
                          className="in-button"
                          onClick={() => {
                            setReportId(entry.reportId);
                            setPanel({ kind: 'export' });
                          }}
                        >
                          Prepare from current data
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
              <div className="in-list-pagination">
                <span>{collectionCount ? resolvedCollectionPage * 5 + 1 : 0}–{Math.min(collectionCount, (resolvedCollectionPage + 1) * 5)} of {collectionCount}</span>
                <div className="in-heading-actions"><button className="in-button" disabled={resolvedCollectionPage === 0} onClick={() => setCollectionPage(resolvedCollectionPage - 1)}>Previous collection page</button><button className="in-button" disabled={resolvedCollectionPage >= collectionPages - 1} onClick={() => setCollectionPage(resolvedCollectionPage + 1)}>Next collection page</button></div>
              </div>
            </section>
          </>
        )}
      </>
    );
  }

  function content() {
    if (!resolvedPolicy.canRead)
      return (
        <Unavailable
          title="Report access is unavailable"
          message="Your current session does not have permission to read these reports. No previously loaded report data is displayed."
        />
      );
    if (activeTab === 'reports') return reportsContent();
    if (visibleSnapshot.status === 'unavailable')
      return (
        <Unavailable
          title="Reporting data is unavailable"
          message={
            visibleSnapshot.notice ||
            'The source could not be read. This is different from no business activity.'
          }
          action={
            <button
              className="in-text-button"
              onClick={() =>
                mode === 'sample' ? setScenario('current') : setRefresh((value) => value + 1)
              }
            >
              Retry source <RefreshCw size={14} />
            </button>
          }
        />
      );
    if (activeTab === 'overview')
      return (
        <>
          {cardSet(
            isOrder
              ? [
                  'order_completed',
                  ...(resolvedPolicy.canReadFinance
                    ? ['order_item_sales', 'order_average_item_sales']
                    : ['order_units']),
                  'order_ready_on_time',
                ]
              : domainMetrics,
          )}
          <div className="in-grid">
            <BarReport
              title={isOrder ? 'Completed orders by week' : 'Completed work by week'}
              description="Completion events in the selected period"
              data={weekly}
              unit={isOrder ? 'Orders' : 'Completed records'}
              vertical
              onReport={() =>
                openReport(
                  isOrder ? 'RPT_ORDER_OUTCOMES' : 'RPT_WORK_OUTCOMES',
                  isOrder ? 'order_completed' : 'work_completed',
                )
              }
            />
            {isOrder ? (
              <BarReport
                title="Completed orders by fulfilment"
                donut
                data={view.fulfilment}
                unit="Orders"
                onReport={() => openReport('RPT_ORDER_OUTCOMES', 'order_completed')}
              />
            ) : (
              <BarReport
                title="Actual activity outcomes"
                data={view.models.map((id) => ({
                  label: MODEL_REPORTS[id].label,
                  value: view.records.filter((record) => record.model === id).length,
                }))}
                unit="Request-cohort records"
                onReport={() => openReport('RPT_WORK_OUTCOMES')}
              />
            )}
          </div>
          {view.menuRows.length ? (
            <EvidenceTable
              title="Top menu items"
              description={`Top ${Math.min(5, view.menuRows.length)} of ${view.menuRows.length} matching items · each accepted unit retained`}
              columns={menuColumns}
              data={view.menuRows.slice(0, 5)}
              onReport={() => openReport('RPT_ORDER_VARIANTS')}
            />
          ) : (
            <EvidenceTable
              title="Recent activity"
              columns={recordColumns}
              data={view.records.slice(0, 8)}
              description={`Showing up to 8 of ${view.records.length} matching requests`}
              onReport={() => openReport(reportForTab(activeTab, view))}
            />
          )}
        </>
      );
    if (activeTab === 'orders')
      return (
        <>
          <ViewHeading
            title="Order outcomes"
            description={`Requests received in period, observed through ${asOfLabel(view.asOf)}. Refunds remain separate financial outcomes.`}
          />
          {cardSet(orderCards)}
          <div className="in-grid">
            <BarReport
              title="Request-cohort outcomes"
              data={['order_cohort_completed', 'order_cancelled', 'order_open'].map((id) => ({
                label: view.metrics[id]?.label ?? id,
                value: view.metrics[id]?.value ?? null,
              }))}
              unit="Requests"
              onReport={() => openReport('RPT_ORDER_OUTCOMES')}
            />
            <BarReport
              title="Completed orders by week"
              data={weekly}
              unit="Orders completed in period"
              vertical
              onReport={() => openReport('RPT_ORDER_OUTCOMES', 'order_completed')}
            />
          </div>
          <EvidenceTable
            title="Order evidence"
            columns={recordColumns}
            data={view.records}
            onReport={() => openReport('RPT_ORDER_OUTCOMES')}
          />
        </>
      );
    if (['menu', 'products', 'services', 'experiences', 'spaces', 'fleet'].includes(activeTab)) {
      if (activeTab === 'fleet' && !isOrder)
        return (
          <>
            <ViewHeading
              title="Fleet performance"
              description="Reserved and actual-used intervals retain the same usable-capacity denominator."
            />
            {cardSet(['asset_reserved_util', 'asset_used_util', 'rental_on_time_return'])}
            <BarReport
              title="Resource reservations"
              data={view.capacityRows.map((row) => ({ label: row.label, value: row.reserved }))}
              unit={view.capacityRows[0]?.unit ?? 'Declared capacity units'}
              onReport={() => openReport('RPT_ASSET_UTILIZATION')}
            />
            <EvidenceTable title="Asset work records" data={view.records} columns={recordColumns} />
          </>
        );
      return (
        <>
          <ViewHeading
            title={activeTab === 'menu' ? 'Menu performance' : 'Offering performance'}
            description="Accepted item, variant and unit evidence. Historical item amounts exclude delivery fees and tips."
          />
          {isOrder &&
            cardSet([
              'order_units',
              ...(resolvedPolicy.canReadFinance ? ['order_item_sales'] : []),
            ])}
          <div className="in-grid">
            <div className="in-content">
              {offeringUnits.length > 1 && <label className="in-unit-picker">Quantity unit <select value={currentOfferingUnit} onChange={event => setOfferingUnit(event.target.value)}>{offeringUnits.map(unit => <option key={unit}>{unit}</option>)}</select></label>}
              {offeringUnits.filter(unit => unit === currentOfferingUnit).map((unit) => (
                <BarReport
                  key={unit}
                  title={`Top items by fulfilled units · ${unit}`}
                  data={view.menuRows
                    .filter((row) => row.unit === unit)
                    .slice(0, 5)
                    .map((row) => ({ label: row.label, value: row.units }))}
                  unit={unit}
                  onReport={() => openReport('RPT_ORDER_VARIANTS')}
                />
              ))}
              {view.menuRows.length === 0 && (
                <Unavailable
                  title="Offering quantity evidence"
                  message={
                    view.metrics.order_units?.reason ||
                    'No matching quantity evidence for this scope.'
                  }
                />
              )}
            </div>
            {isOrder && resolvedPolicy.canReadFinance ? <BarReport title="Item sales by offering" data={itemSalesSegments} unit={view.currency} donut onReport={() => openReport('RPT_ORDER_VARIANTS')} /> : <ReportPanel title="What this report counts">
              <div className="in-report-preview">
                <p>
                  Actual accepted offerings and their selected variants. Each quantity retains its
                  declared unit. Unknown quantities are not counted as zero.
                </p>
                <button className="in-text-button" onClick={() => setPanel({ kind: 'coverage' })}>
                  View definitions and coverage <ArrowRight size={14} />
                </button>
              </div>
            </ReportPanel>}
          </div>
          {view.menuRows.length ? (
            <EvidenceTable
              title="Offering and variant evidence"
              columns={menuColumns}
              data={view.menuRows}
              onReport={() => openReport('RPT_ORDER_VARIANTS')}
            />
          ) : (
            <EvidenceTable
              title="Offering work evidence"
              columns={recordColumns}
              data={view.records}
            />
          )}
        </>
      );
    }
    if (activeTab === 'customers')
      return (
        <>
          <ViewHeading
            title="Customer activity"
            description="Customers with completed work in this period. First-time classification uses source-confirmed earlier history."
          />
          {cardSet([
            'identified_customers',
            'first_time_customers',
            'returning_customers',
            'returning_share',
          ])}
          <div className="in-grid">
            <BarReport
              title="Customer identities by cohort"
              data={['First time', 'Returning', 'Unknown'].map((cohort) => ({
                label: cohort,
                value:
                  view.metrics.identified_customers?.status === 'unavailable'
                    ? null
                    : view.customerRows.filter((row) => row.cohort === cohort).length,
              }))}
              unit="Permitted identities"
              onReport={() => openReport('RPT_REPEAT_ACTIVITY')}
            />
            <BarReport
              title="Completed work by customer cohort"
              donut
              data={['First time', 'Returning', 'Unknown'].map((cohort) => ({
                label: cohort,
                value:
                  view.metrics.identified_customers?.status === 'unavailable'
                    ? null
                    : view.customerRows
                        .filter((row) => row.cohort === cohort)
                        .reduce((total, row) => total + row.orders, 0),
              }))}
              unit="Completed records"
              onReport={() => openReport('RPT_REPEAT_ACTIVITY')}
            />
          </div>
          {detailedReportContent(
            view.reports.find((report) => report.id === 'RPT_REPEAT_ACTIVITY') ?? {
              id: '',
              label: '',
              area: '',
              models: '*',
              metricIds: [],
              dateBasis: 'completed',
              status: 'unavailable',
              reason: 'Customer identity reporting is not available.',
            },
          )}
        </>
      );
    if (activeTab === 'operations')
      return (
        <>
          <ViewHeading
            title={isOrder ? 'Preparation and promise timing' : 'Operational evidence'}
            description="Recorded milestones, accepted promises and exceptions. Missing evidence stays visible."
          />
          {cardSet(
            isOrder
              ? [
                  'order_ready_on_time',
                  'preparation_median',
                  'missing_ready_promises',
                  'order_cancelled',
                ]
              : domainMetrics,
          )}
          <div className="in-grid">
            <BarReport
              title="Recorded cancellation reasons"
              data={view.cancellationReasons}
              unit="Cancelled requests"
              onReport={() => openReport('RPT_WORK_OUTCOMES')}
            />
            <BarReport
              title={isOrder ? 'Readiness evidence' : 'Requests by actual activity'}
              data={
                isOrder
                  ? [
                      {
                        label: 'On time',
                        value: view.metrics.order_ready_on_time?.numerator ?? null,
                      },
                      {
                        label: 'Late',
                        value:
                          view.metrics.order_ready_on_time?.status === 'unavailable'
                            ? null
                            : view.operationRows.reduce((total, row) => total + row.late, 0),
                      },
                      {
                        label: 'Missing promise',
                        value: view.metrics.missing_ready_promises?.value ?? null,
                      },
                    ]
                  : view.models.map((id) => ({
                      label: MODEL_REPORTS[id].label,
                      value:
                        view.metrics.work_requested?.status === 'unavailable'
                          ? null
                          : view.records.filter((record) => record.model === id).length,
                    }))
              }
              unit={isOrder ? 'Completed orders' : 'Requested work records'}
              onReport={() => openReport(isOrder ? 'RPT_ORDER_READINESS' : 'RPT_WORK_OUTCOMES')}
            />
          </div>
          {isOrder ? (
            <EvidenceTable
              title="Readiness by fulfilment"
              columns={[
                { accessorKey: 'method', header: 'Method' },
                { accessorKey: 'eligible', header: 'Eligible' },
                { accessorKey: 'onTime', header: 'On time' },
                { accessorKey: 'late', header: 'Late' },
                { accessorKey: 'missingPromise', header: 'Missing promise' },
              ]}
              data={view.operationRows}
              onReport={() => openReport('RPT_ORDER_READINESS')}
            />
          ) : (
            <EvidenceTable
              title="Operational records"
              columns={recordColumns}
              data={view.records}
            />
          )}
        </>
      );
    if (activeTab === 'promotions')
      return (
        <>
          <ViewHeading
            title="Campaign performance"
            description="Qualified events and attributed accepted work are separate from revenue or additional sales."
          />
          {cardSet([
            'qualified_impressions',
            'qualified_taps',
            'tap_impression_ratio',
            'attributed_orders',
          ])}
          <div className="in-grid">
            <BarReport
              title="Measured campaign events"
              data={[
                { label: 'Impressions', value: view.metrics.qualified_impressions?.value ?? null },
                { label: 'Taps', value: view.metrics.qualified_taps?.value ?? null },
              ]}
              unit="Qualified events"
              onReport={() => openReport('RPT_CAMPAIGN_MEASUREMENT')}
            />
            <ReportPanel title="Attribution definition">
              <div className="in-report-preview">
                <p>
                  {view.campaignRows[0]?.windowMinutes != null
                    ? `${view.campaignRows[0].windowMinutes}-minute tap window. Only source-confirmed, deduplicated accepted orders in a complete observation window are included.`
                    : 'A defined attribution window and complete source observation are required.'}
                </p>
                <p>
                  Attributed value is unavailable. Value and refund measurement are not connected.
                </p>
                <button className="in-text-button" onClick={() => setPanel({ kind: 'coverage' })}>
                  Review campaign coverage <ArrowRight size={14} />
                </button>
              </div>
            </ReportPanel>
          </div>
          {detailedReportContent(
            view.reports.find((report) => report.id === 'RPT_CAMPAIGN_MEASUREMENT') ?? {
              id: '',
              label: '',
              area: '',
              models: '*',
              metricIds: [],
              dateBasis: 'occurred',
              status: 'unavailable',
            },
          )}
        </>
      );
    if (activeTab === 'finance')
      return (
        <>
          <ViewHeading
            title="Posted merchant activity"
            description={`${view.currency} · Posted in period · Statement basis. Payouts, holds and pending activity are separate.`}
          />
          {cardSet(['merchant_credits', 'refund_debits', 'fee_debits', 'net_posted_credit'])}
          <div className="in-grid">
            <BarReport title="Posted credits and net credit" description="Credits less refunds and fees. Net credit is not profit or a payout estimate." data={[{ label: 'Merchant credits', value: majorAmount('merchant_credits') }, { label: 'Net posted credit', value: majorAmount('net_posted_credit') }]} unit={view.currency} vertical onReport={() => openReport('RPT_POSTED_MERCHANT_ACTIVITY')} />
            <BarReport title="Posted movements by class" data={[{ label: 'Credits', value: majorAmount('merchant_credits') }, { label: 'Refunds', value: majorAmount('refund_debits') }, { label: 'Fees', value: majorAmount('fee_debits') }]} unit={view.currency} donut onReport={() => openReport('RPT_POSTED_MERCHANT_ACTIVITY')} />
          </div>
          {detailedReportContent(
            view.reports.find((report) => report.id === 'RPT_POSTED_MERCHANT_ACTIVITY') ?? {
              id: '',
              label: '',
              area: '',
              models: '*',
              metricIds: [],
              dateBasis: 'posted',
              status: 'unavailable',
            },
          )}
        </>
      );
    const model = view.models.find((id) => MODEL_REPORTS[id].tab === activeTab) ?? view.models[0];
    const report = model
      ? view.reports.find(
          (item) => item.id === view.metrics[MODEL_REPORTS[model].metricId]?.reportId,
        )
      : undefined;
    return (
      <>
        <ViewHeading
          title={view.tabs.find((item) => item.key === activeTab)?.label ?? 'Activity'}
          description={
            model
              ? MODEL_REPORTS[model].description
              : 'Choose an enabled activity to inspect its actual evidence.'
          }
        />
        {cardSet(domainMetrics)}
        {view.capacityRows.length > 0 && (
          <EvidenceTable
            title="Declared resource capacity"
            columns={[
              { accessorKey: 'label', header: 'Resource' },
              { accessorKey: 'model', header: 'Activity' },
              { accessorKey: 'usable', header: 'Usable' },
              { accessorKey: 'reserved', header: 'Reserved' },
              { accessorKey: 'used', header: 'Actual used' },
              { accessorKey: 'unit', header: 'Declared unit' },
            ]}
            data={view.capacityRows}
            onReport={() => report && openReport(report.id)}
          />
        )}
        <EvidenceTable
          title="Contributing activity"
          columns={recordColumns}
          data={view.records}
          onReport={() => report && openReport(report.id)}
        />
      </>
    );
  }

  const middleTabs = view.tabs.filter((item) => !['overview', 'reports'].includes(item.key));
  let consumedTabWidth = 165;
  let visibleTabCount = 0;
  for (const item of middleTabs) {
    const width = item.label.length * 7.5 + 34;
    const reserveMore = visibleTabCount < middleTabs.length - 1 ? 100 : 0;
    if (visibleTabCount >= 6 || consumedTabWidth + width + reserveMore > tabWidth) break;
    consumedTabWidth += width;
    visibleTabCount += 1;
  }
  const visibleTabs = middleTabs.slice(0, visibleTabCount),
    overflowTabs = middleTabs.slice(visibleTabCount);
  const currentPanelTitle =
    panel?.kind === 'definition'
      ? (metric?.label ?? 'Metric definition')
      : panel?.kind === 'record'
        ? (panelRecord?.reference ?? 'Record is no longer in scope')
        : panel?.kind === 'period'
          ? 'Reporting period'
          : panel?.kind === 'filters'
            ? 'Filter this report'
            : panel?.kind === 'coverage'
              ? 'Source coverage'
              : panel?.kind === 'export'
                ? 'Export report'
                : panel?.kind === 'save'
                  ? 'Save report view'
                  : 'Sample business and state';
  const panelBody = (
    <div
      className={styles.root}
      style={{ height: 'auto', background: 'transparent', overflow: 'visible' }}
    >
      <div className="in-form">
        {panel?.kind === 'definition' && metric && (
          <>
            <p className="in-subtitle">{metric.definition}</p>
            <DetailRow label="Date basis" value={BASIS[metric.dateBasis]} />
            <DetailRow label="Unit" value={metric.unit} />
            <DetailRow label="Period" value={`${filters.from} to ${filters.to}`} />
            <DetailRow label="Timezone" value="Africa/Nairobi" />
            <DetailRow label="Definition version" value={metric.version} />
            <DetailRow label="Value" value={formatInsightValue(metric, view.currency)} />
            {metric.numerator != null && (
              <DetailRow label="Numerator" value={number(metric.numerator)} />
            )}
            {metric.denominator != null && (
              <DetailRow label="Denominator" value={number(metric.denominator)} />
            )}
            <DetailRow label="Evidence state" value={metric.status} />
            {metric.reason && <p className="in-subtitle">{metric.reason}</p>}
            <button className="in-primary" onClick={() => openReport(metric.reportId, metric.id)}>
              View contributing evidence <ArrowRight size={14} />
            </button>
          </>
        )}
        {panel?.kind === 'record' && panelRecord && (
          <>
            <DetailRow label="Offering" value={panelRecord.label} />
            <DetailRow label="Activity" value={MODEL_REPORTS[panelRecord.model].label} />
            <DetailRow label="Recorded outcome" value={panelRecord.outcome} />
            <DetailRow
              label="Location"
              value={
                snapshot.locations.find((item) => item.id === panelRecord.locationId)?.label ??
                panelRecord.locationId
              }
            />
            <DetailRow label="Requested on" value={panelRecord.requestedOn} />
            <DetailRow label="Completed on" value={panelRecord.completedOn ?? 'Not recorded'} />
            {panelRecord.promiseAt && (
              <DetailRow label="Accepted ready promise" value={asOfLabel(panelRecord.promiseAt)} />
            )}
            {panelRecord.readyAt && (
              <DetailRow label="Actually ready" value={asOfLabel(panelRecord.readyAt)} />
            )}
            {panelRecord.cancellationReason && (
              <DetailRow label="Cancellation reason" value={panelRecord.cancellationReason} />
            )}
            {resolvedPolicy.canReadFinance && (
              <DetailRow label="Item amount" value={moneyValue(panelRecord.itemAmountMinor)} />
            )}
            <p className="in-subtitle">
              This is the exact record contributing to the report. Operational changes are handled
              in Work.
            </p>
            {mode === 'live' ? (
              <Link
                className="in-button"
                href={`/merchant/orders?reference=${encodeURIComponent(panelRecord.reference)}`}
              >
                Open Work <ArrowRight size={14} />
              </Link>
            ) : (
              <Link className="in-button" href={appendMerchantOnboardingDemoContext('/merchant-live-preview/work', activeDemo)}>
                Open sample Work workspace <ArrowRight size={14} />
              </Link>
            )}
          </>
        )}
        {panel?.kind === 'period' && (
          <>
            <p className="in-subtitle">
              Calendar dates use Africa/Nairobi. Both selected dates are included.
            </p>
            <label className="in-field">
              From
              <input
                className="in-input"
                type="date"
                value={periodDraft.from}
                onChange={(event) =>
                  setPeriodDraft((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <label className="in-field">
              Through
              <input
                className="in-input"
                type="date"
                value={periodDraft.to}
                onChange={(event) =>
                  setPeriodDraft((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
            <div className="in-heading-actions">
              <button
                className="in-button"
                onClick={() => {
                  const end = new Date(`${filters.to}T12:00:00Z`);
                  end.setUTCDate(end.getUTCDate() - 6);
                  setPeriodDraft({ from: end.toISOString().slice(0, 10), to: filters.to });
                }}
              >
                Last 7 days
              </button>
              <button
                className="in-button"
                onClick={() =>
                  setPeriodDraft(
                    mode === 'sample'
                      ? { from: DEFAULT_FILTERS.from, to: DEFAULT_FILTERS.to }
                      : currentRange(),
                  )
                }
              >
                Last 28 completed days
              </button>
            </div>
            {periodError && (
              <p className="in-notice" data-tone="error" role="alert">
                {periodError}
              </p>
            )}
            <button
              className="in-primary"
              onClick={() => {
                try {
                  const range = parseDateRange(periodDraft.from, periodDraft.to);
                  setFilters((current) => ({ ...current, ...range }));
                  setPeriodError('');
                  setPanel(null);
                } catch (cause) {
                  setPeriodError(
                    cause instanceof Error ? cause.message : 'Choose a valid date range.',
                  );
                }
              }}
            >
              Apply reporting period
            </button>
          </>
        )}
        {panel?.kind === 'filters' && (
          <>
            <label className="in-field">
              Search contributing records
              <input
                className="in-input"
                type="search"
                value={filters.keyword}
                placeholder="Reference, offering or recorded outcome"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, keyword: event.target.value }))
                }
              />
            </label>
            <p className="in-subtitle">
              This filter applies to the report and its export, not only the displayed page.
            </p>
            <button
              className="in-button"
              onClick={() => {
                setFilters((current) => ({
                  ...current,
                  keyword: '',
                  locationId: 'all',
                  activity: 'all',
                }));
                setNotice(
                  'Search, activity and location filters cleared. The reporting period is unchanged.',
                );
              }}
            >
              Clear filters
            </button>
            <button className="in-primary" onClick={() => setPanel(null)}>
              Show filtered reports
            </button>
          </>
        )}
        {panel?.kind === 'coverage' && (
          <>
            <p className="in-subtitle">
              Each source keeps its own coverage and update time. A missing source does not mean
              zero activity.
            </p>
            {view.coverage.length ? (
              view.coverage.map((row) => (
                <div key={row.id} className="in-preview-detail">
                  <strong className="text-sm">
                    {row.kind} · {MODEL_REPORTS[row.model].label}
                  </strong>
                  <p className="in-subtitle">
                    {row.from} to {row.to} · {row.status}
                    <br />
                    Updated {asOfLabel(row.asOf)} · Definition {row.definitionVersion}
                    {row.message && (
                      <>
                        <br />
                        {row.message}
                      </>
                    )}
                  </p>
                </div>
              ))
            ) : (
              <Unavailable message="The source did not provide authorized coverage information." />
            )}
            <Link
              className="in-button"
              href={mode === 'sample' ? appendMerchantOnboardingDemoContext('/merchant-live-preview/settings', activeDemo) : '/merchant/settings'}
            >
              Open connection settings <ArrowRight size={14} />
            </Link>
          </>
        )}
        {panel?.kind === 'export' && (
          <>
            <p className="in-subtitle">
              CSV includes the full matching evidence set for one report. It does not include hidden
              or unauthorized fields.
            </p>
            <label className="in-field">
              Report
              <select
                className="in-input"
                value={selectedReport?.id ?? ''}
                onChange={(event) => {
                  setReportId(event.target.value);
                  setEvidenceMetric(null);
                }}
              >
                {view.reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.label}
                    {report.status !== 'ready' ? ` · ${report.status}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <DetailRow label="Period" value={`${filters.from} to ${filters.to}`} />
            <DetailRow
              label="Date basis"
              value={
                BASIS[
                  (evidenceMetric && view.metrics[evidenceMetric]?.reportId === selectedReport?.id
                    ? view.metrics[evidenceMetric]?.dateBasis
                    : selectedReport?.dateBasis) ?? 'requested'
                ]
              }
            />
            <DetailRow label="Timezone" value="Africa/Nairobi" />
            <DetailRow
              label="Location"
              value={
                filters.locationId === 'all'
                  ? 'All permitted locations'
                  : (snapshot.locations.find((item) => item.id === filters.locationId)?.label ??
                    filters.locationId)
              }
            />
            <DetailRow label="Search filter" value={filters.keyword || 'None'} />
            <DetailRow
              label="Source"
              value={mode === 'sample' ? 'Fictional sample data' : 'Authenticated reporting source'}
            />
            <DetailRow label="Format" value="CSV · amounts in minor units with currency" />
            <DetailRow label="Definition version" value="1" />
            {selectedReport?.status !== 'ready' && (
              <p className="in-notice" data-tone="warning">
                {selectedReport?.reason ||
                  'This report is partial or unavailable for the selected scope.'}
              </p>
            )}
            <button
              className="in-primary"
              onClick={createExport}
              disabled={
                !view.canExport || !selectedReport || selectedReport.status === 'unavailable'
              }
            >
              <Download size={15} />
              Prepare CSV export
            </button>
          </>
        )}
        {panel?.kind === 'save' && (
          <>
            <p className="in-subtitle">
              Save this report and its filters on this device. The view will use current permissions
              and evidence when reopened.
            </p>
            <label className="in-field">
              View name
              <input
                className="in-input"
                value={viewName}
                maxLength={80}
                onChange={(event) => setViewName(event.target.value)}
              />
            </label>
            <label className="in-field">
              Report
              <select
                className="in-input"
                value={selectedReport?.id ?? ''}
                onChange={(event) => setReportId(event.target.value)}
              >
                {view.reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="in-primary"
              disabled={!storageReady || !viewName.trim() || !selectedReport}
              onClick={saveView}
            >
              <Bookmark size={14} />
              Save on this device
            </button>
          </>
        )}
        {panel?.kind === 'sample' && (
          <>
            <p className="in-subtitle">
              Explore an explicitly fictional business and its supported activity. This does not
              change a live merchant.
            </p>
            <label className="in-field">
              Sample specialty
              <select
                className="in-input"
                value={snapshot.subcategoryId}
                onChange={(event) => changeProfile(event.target.value)}
              >
                {[...new Set(profiles.map((profile) => profile.categoryName))].map((category) => (
                  <optgroup key={category} label={category}>
                    {profiles
                      .filter((profile) => profile.categoryName === category)
                      .map((profile) => (
                        <option key={profile.subcategoryId} value={profile.subcategoryId}>
                          {profile.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="in-field">
              Enabled sample activity
              <select
                className="in-input"
                value={snapshot.enabledModels[0] ?? ''}
                onChange={(event) =>
                  changeProfile(snapshot.subcategoryId, event.target.value as BookingModel)
                }
              >
                {(sampleProfile?.candidateModels ?? snapshot.enabledModels).map((model) => (
                  <option key={model} value={model}>
                    {MODEL_REPORTS[model]?.label ?? model}
                  </option>
                ))}
              </select>
            </label>
            <label className="in-field">
              Source state
              <select
                className="in-input"
                value={scenario}
                onChange={(event) => {
                  setScenario(event.target.value);
                  setCompare(false);
                }}
              >
                <option value="current">Current evidence</option>
                <option value="empty">Confirmed no activity</option>
                <option value="partial">Partial work evidence</option>
                <option value="unavailable">Source unavailable</option>
                <option value="restricted">Operational access only</option>
              </select>
            </label>
            <button className="in-primary" onClick={() => setPanel(null)}>
              Explore this sample
            </button>
          </>
        )}
        {notice && panel && (
          <p role="status" className="in-subtitle">
            {notice}
          </p>
        )}
      </div>
    </div>
  );

  const body = (
    <div
      className={styles.root}
      ref={scrollRef}
      data-insights-workspace
      data-profile={snapshot.subcategoryId}
      data-source={mode}
      data-active-tab={activeTab}
      aria-busy={busy || !storageReady}
      data-ready={storageReady ? 'true' : 'false'}
    >
      <main className="in-page">
        <fieldset
          disabled={!storageReady}
          className="in-ready-fieldset"
          aria-label="Insights controls"
        >
          <div className="in-page-heading">
            <div>
              <h1>Insights</h1>
              <p className="in-subtitle">
                {(activeDemo?.businessName ?? view.merchantName) || 'Your business'} · Understand your activity and the evidence
                behind it.
              </p>
            </div>
            <div className="in-heading-actions">
              <button
                type="button"
                className="in-button"
                onClick={() => setPanel({ kind: 'coverage' })}
              >
                <Info size={15} />
                Coverage
              </button>
              <button
                type="button"
                className="in-primary"
                onClick={openExport}
                disabled={!view.canExport}
              >
                <Download size={15} />
                Export report
              </button>
            </div>
          </div>
          <div className="in-scope">
            <button
              className="in-button"
              type="button"
              onClick={() => {
                setPeriodDraft({ from: filters.from, to: filters.to });
                setPeriodError('');
                setPanel({ kind: 'period' });
              }}
            >
              <CalendarDays size={15} />
              {dateLabel(filters.from)} – {dateLabel(filters.to)}
              <ChevronDown size={13} />
            </button>
            <label className="in-compare">
              <input
                type="checkbox"
                checked={compare}
                onChange={(event) => setCompare(event.target.checked)}
              />
              Compare previous period
            </label>
            <label className="sr-only" htmlFor="insights-activity">
              Activity
            </label>
            <select
              id="insights-activity"
              value={filters.activity}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  activity: event.target.value as BookingModel | 'all',
                  keyword: '',
                }));
                setTab('overview');
                setReportOpen(false);
              }}
            >
              <option value="all">All enabled activities</option>
              {snapshot.enabledModels
                .filter((id) => resolvedPolicy.allowedModels.includes(id))
                .map((id) => (
                  <option key={id} value={id}>
                    {MODEL_REPORTS[id].label}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="in-button"
              onClick={() => setPanel({ kind: 'filters' })}
            >
              <Filter size={14} />
              Filters{filters.keyword && ' · 1'}
            </button>
            <div className="in-freshness">
              <span>Africa/Nairobi · Updated {asOfLabel(view.asOf)}</span>
              <button
                type="button"
                className="in-text-button"
                aria-label="Refresh report evidence"
                onClick={() =>
                  mode === 'sample'
                    ? setNotice('Sample evidence refreshed. No live source was called.')
                    : setRefresh((value) => value + 1)
                }
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
          {filters.keyword && (
            <div className="in-active-filters">
              <span className="in-filter-chip">
                Search: {filters.keyword}
                <button
                  type="button"
                  aria-label="Clear evidence search"
                  onClick={() => setFilters((current) => ({ ...current, keyword: '' }))}
                >
                  ×
                </button>
              </span>
            </div>
          )}
          <div className="in-tabs" ref={tabsRef} role="tablist" aria-label="Insights views">
            <button
              className="in-tab"
              id="insights-tab-overview"
              type="button"
              role="tab"
              data-anchor="true"
              aria-selected={activeTab === 'overview'}
              tabIndex={activeTab === 'overview' ? 0 : -1}
              onKeyDown={tabKeys}
              onClick={() => pushTab('overview')}
            >
              Overview
            </button>
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                id={`insights-tab-${item.key}`}
                className="in-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === item.key}
                tabIndex={activeTab === item.key ? 0 : -1}
                onKeyDown={tabKeys}
                onClick={() => pushTab(item.key)}
              >
                {item.label}
              </button>
            ))}
            {overflowTabs.length > 0 && (
              <details className="in-more">
                <summary className="in-tab">
                  {overflowTabs.some((item) => item.key === activeTab)
                    ? `More: ${view.tabs.find((item) => item.key === activeTab)?.label}`
                    : 'More'}
                  <ChevronDown size={12} />
                </summary>
                <div className="in-more-menu">
                  {overflowTabs.map((item) => (
                    <button
                      key={item.key}
                      id={`insights-tab-${item.key}`}
                      type="button"
                      onClick={(event) => {
                        pushTab(item.key);
                        event.currentTarget.closest('details')?.removeAttribute('open');
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </details>
            )}
            <label className="in-mobile-area">
              <span className="sr-only">Business insight area</span>
              <select
                value={['overview', 'reports'].includes(activeTab) ? '' : activeTab}
                onChange={(event) => event.target.value && pushTab(event.target.value)}
              >
                <option value="">Business areas</option>
                {middleTabs.map((item) => (
                  <option value={item.key} key={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="in-tab"
              id="insights-tab-reports"
              type="button"
              role="tab"
              data-anchor="true"
              aria-selected={activeTab === 'reports'}
              tabIndex={activeTab === 'reports' ? 0 : -1}
              onKeyDown={tabKeys}
              onClick={() => pushTab('reports')}
            >
              Reports
            </button>
          </div>
          <div
            className="in-content"
            role="tabpanel"
            aria-label={`${view.tabs.find((item) => item.key === activeTab)?.label ?? activeTab} insights`}
          >
            {error && (
              <div className="in-notice" data-tone="error" role="alert">
                <Info size={16} />
                <span>
                  {error}{' '}
                  <button
                    className="in-text-button"
                    onClick={() => setRefresh((value) => value + 1)}
                  >
                    Retry
                  </button>
                </span>
              </div>
            )}
            {((view.notice && !(mode === 'sample' && visibleSnapshot.status === 'ready')) || visibleSnapshot.status === 'partial') && (
              <div className="in-notice" data-tone="warning">
                <Info size={16} />
                <span>
                  {view.notice ||
                    'Some source evidence is partial. Inspect the coverage before comparing values.'}{' '}
                  <button className="in-text-button" onClick={() => setPanel({ kind: 'coverage' })}>
                    Review coverage
                  </button>
                </span>
              </div>
            )}
            {notice && (
              <div className="in-notice" role="status">
                <Check size={15} />
                <span>{notice}</span>
              </div>
            )}
            {busy ? (
              <div className="in-unavailable" role="status">
                Refreshing the selected reporting period…
              </div>
            ) : (
              content()
            )}
          </div>
        </fieldset>
      </main>
      <DetailPanel
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
        title={currentPanelTitle}
        subtitle={
          mode === 'sample'
            ? 'Sample preview · Karibu/NEXG example evidence'
            : 'Authorized merchant report'
        }
        width={panel?.kind === 'coverage' ? 'lg' : 'md'}
      >
        {panelBody}
      </DetailPanel>
    </div>
  );

  const locationControl = (
    <label className="flex items-center gap-2">
      <span className="sr-only">Report location</span>
      <select
        className="border-border-strong bg-surface text-ink min-h-11 max-w-[12rem] rounded-lg border px-3 text-xs font-semibold"
        value={filters.locationId}
        disabled={!storageReady}
        onChange={(event) =>
          setFilters((current) => ({ ...current, locationId: event.target.value }))
        }
      >
        <option value="all">All permitted locations</option>
        {snapshot.locations
          .filter((location) => resolvedPolicy.allowedLocationIds.includes(location.id))
          .map((location) => (
            <option key={location.id} value={location.id}>
              {location.label}
            </option>
          ))}
      </select>
    </label>
  );
  return mode === 'sample' ? (
    <MerchantLivePreviewShell
      active="Insights"
      businessName={activeDemo?.businessName ?? snapshot.merchantName}
      accountInitials={activeDemo?.initials ?? snapshot.merchantName
        .split(' ')
        .slice(0, 2)
        .map((word) => word[0])
        .join('')}
      demoContext={activeDemo}
      locationControl={locationControl}
      sampleControl={
        <button
          type="button"
          className="text-gold-text inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold"
          disabled={!storageReady}
          onClick={() => setPanel({ kind: 'sample' })}
        >
          <Settings2 size={14} />
          Sample business
        </button>
      }
    >
      {body}
    </MerchantLivePreviewShell>
  ) : (
    <>
      <div className="border-border bg-surface border-b px-6 py-3">{locationControl}</div>
      {body}
    </>
  );
}

function ViewHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="in-view-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return <PrimitiveDetailRow label={label}>{value ?? 'Not recorded'}</PrimitiveDetailRow>;
}
