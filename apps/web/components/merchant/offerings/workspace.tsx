'use client';
import { TableViewport } from '@nexg/ui/table-viewport';

import * as Dialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Columns3,
  Download,
  Link2,
  Package,
  Plus,
  Search,
  Settings2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Label, OfferingEditor, PriceSummary, Status, type EditorTab } from './editor';
import {
  availableSchemas,
  capacityLabel,
  createOffering,
  priceLabel,
  extendOfferingProfiles,
  validateOffering,
  validateOfferingRelationships,
  type Catalogue,
  type Issue,
  type MerchantOfferingConfiguration,
  type Offering,
  type OfferingProfile,
} from './model';
import { catalogueCsv, localOfferingsSource, prepareImport, type OfferingsSource } from './source';
import { schemas } from './schemas';
import styles from './workspace.module.css';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import { browserUuid } from '@/lib/browser-uuid';

type Panel =
  | 'add'
  | 'import'
  | 'configuration'
  | 'connections'
  | 'sample'
  | 'columns'
  | 'unsaved'
  | 'archive'
  | null;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const emptyOfferings: Offering[] = [];
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.modal} ${styles.root}`}
          aria-describedby={description ? 'of-dialog-description' : undefined}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <header>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="of-dialog-description">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="of-icon" aria-label="Close dialog">
              <X size={19} />
            </Dialog.Close>
          </header>
          <div className={styles.modalBody}>{children}</div>
          {footer && <footer>{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The same screen accepts scoped onboarding configuration or an isolated 128-specialty preview. */
export function OfferingsWorkspace({
  source: suppliedSource,
  configuration: suppliedConfiguration,
  preview = true,
  additionalProfiles = [],
  initialProfileId,
  initialOfferingId,
  returnTo,
  setupEditor = false,
  onSetupClose,
  setupActivities,
  onSetupSaved,
  onSetupDirtyChange,
  onUploadImage,
  canEditDrafts = true,
  isExisting,
}: {
  source?: OfferingsSource;
  configuration?: MerchantOfferingConfiguration;
  preview?: boolean;
  additionalProfiles?: OfferingProfile[];
  initialProfileId?: string;
  initialOfferingId?: string;
  returnTo?: string;
  setupEditor?: boolean;
  onSetupClose?: () => void;
  setupActivities?: { id: string; name: string }[];
  onSetupSaved?: () => void;
  onSetupDirtyChange?: (dirty: boolean) => void;
  onUploadImage?: (item: Offering, file: File) => Promise<{ path: string; url: string }>;
  canEditDrafts?: boolean;
  isExisting?: (item: Offering) => boolean;
}) {
  const demoContext = useMerchantOnboardingDemoContext();
  const profiles = useMemo(() => extendOfferingProfiles(additionalProfiles), [additionalProfiles]);
  const initialId = suppliedConfiguration?.subcategoryId ?? initialProfileId ?? demoContext?.profileId ?? 'makeup';
  const [profileId, setProfileId] = useState(initialId);
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0]!;
  const demoProfileId = demoContext?.profileId;
  useEffect(() => {
    if (!suppliedConfiguration && !initialProfileId && demoProfileId && profiles.some((item) => item.id === demoProfileId))
      setProfileId(demoProfileId);
  }, [suppliedConfiguration, initialProfileId, demoProfileId, profiles]);
  const [source, setSource] = useState<OfferingsSource | null>(suppliedSource ?? null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [, refreshPriceTime] = useState(0);
  const [draft, setDraft] = useState<Offering | null>(null);
  const [baseline, setBaseline] = useState<Offering | null>(null);
  const [tab, setTab] = useState<EditorTab>('details');
  const [panel, setPanel] = useState<Panel>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState<'name' | 'updated'>('updated');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [columns, setColumns] = useState({
    price: true,
    publication: true,
    capacity: true,
    source: true,
  });
  const [csv, setCsv] = useState('');
  const [importRows, setImportRows] = useState<Offering[]>([]);
  const [panelError, setPanelError] = useState('');
  const [sampleId, setSampleId] = useState(initialId);
  const [configuredTypes, setConfiguredTypes] = useState<string[]>([]);
  const nextAction = useRef<(() => void) | null>(null);
  const loadVersion = useRef(0);
  const invalidateLoad = useCallback(() => {
    loadVersion.current++;
  }, []);
  const dirty = draft !== null && !same(draft, baseline);
  const liveCatalogue = !preview && !setupEditor;
  useEffect(() => { onSetupDirtyChange?.(dirty); }, [dirty, onSetupDirtyChange]);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (suppliedSource) setSource(suppliedSource);
    else if (preview)
      setSource(
        localOfferingsSource({
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
          removeItem: (key) => window.localStorage.removeItem(key),
        }),
      );
  }, [suppliedSource, preview]);
  useEffect(() => {
    if (!catalogue?.offerings.some((item) => item.discount?.enabled || item.visibility)) return;
    const timer = window.setInterval(() => refreshPriceTime((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, [catalogue]);
  const select = useCallback((item: Offering | null, mobile = true) => {
    setDraft(item ? structuredClone(item) : null);
    setBaseline(item ? structuredClone(item) : null);
    setTab('details');
    setIssues([]);
    setMobileEditor(mobile && !!item);
  }, []);
  const load = useCallback(async () => {
    if (!source) return;
    const version = ++loadVersion.current;
    const previousDraft = draftRef.current;
    setLoading(true);
    setCatalogue(null);
    setError('');
    setNotice('');
    select(null);
    try {
      let data = await source.load(profile);
      if (version !== loadVersion.current) return;
      if (suppliedConfiguration?.subcategoryId === profile.id) {
        const allowed = availableSchemas(profile);
        if (!suppliedConfiguration.enabledSchemas.every((s) => allowed.includes(s)))
          throw new Error('This merchant configuration needs a supported offering type.');
        data = { ...data, configuration: suppliedConfiguration };
        await source.replace(profile, data);
      }
      setCatalogue(data);
      if (setupEditor) {
        const existing = data.offerings.find((o) => o.id === (initialOfferingId ?? previousDraft?.id) && o.profileId === profile.id);
        select(existing ?? createOffering(profile, data.configuration.enabledSchemas[0] ?? profile.schema, browserUuid()), false);
      } else {
        select(
          data.offerings.find((o) => o.id === initialOfferingId) ??
            data.offerings.find((o) => o.publication !== 'archived') ??
            null,
          false,
        );
      }
      if (!setupEditor && initialOfferingId && data.offerings.some((o) => o.id === initialOfferingId))
        setTab('availability');
      if (!setupEditor && initialOfferingId && !data.offerings.some((o) => o.id === initialOfferingId))
        setNotice('The linked offering no longer exists. Choose a current listing.');
    } catch (e) {
      if (version === loadVersion.current)
        setError(e instanceof Error ? e.message : 'Offerings could not be loaded. Try again.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [source, profile, select, suppliedConfiguration, initialOfferingId, setupEditor]);
  useEffect(() => {
    void load();
    return invalidateLoad;
  }, [load, invalidateLoad]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  // Preserve active edits on same-document navigation too, including the shared sidebar.
  useEffect(() => {
    if (!dirty) return;
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (
        !anchor ||
        anchor.target === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.href === window.location.href
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      nextAction.current = () => window.location.assign(anchor.href);
      setPanel('unsaved');
    };
    document.addEventListener('click', navigate, true);
    return () => document.removeEventListener('click', navigate, true);
  }, [dirty]);
  function guard(action: () => void) {
    if (busy) return;
    if (dirty) {
      nextAction.current = action;
      setPanel('unsaved');
    } else action();
  }
  function openPanel(value: Panel) {
    if (!preview && value && ['sample', 'archive', 'import', 'configuration', 'connections'].includes(value))
      return;
    setPanelError('');
    setPanel(value);
  }
  const offerings = catalogue?.offerings ?? emptyOfferings;
  const configuration = catalogue?.configuration;
  const enabled = configuration?.enabledSchemas ?? [profile.schema];
  const canWriteDrafts = canEditDrafts && catalogue?.writable !== false;
  const readOnlyDraft = !canWriteDrafts || Boolean(draft && isExisting?.(draft));
  const filtered = useMemo(
    () =>
      offerings
        .filter(
          (o) =>
            (type === 'all' || o.schemaId === type) &&
            (status === 'all' ? o.publication !== 'archived' : o.publication === status) &&
            (sourceFilter === 'all' ||
              (sourceFilter === 'external'
                ? Object.values(o.sources).includes('external')
                : Object.values(o.sources).every((s) => s === 'nexg'))) &&
            `${o.name} ${o.description} ${o.fields.sku ?? ''}`
              .toLowerCase()
              .includes(search.toLowerCase().trim()),
        )
        .sort((a, b) =>
          sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [offerings, type, status, sourceFilter, search, sort],
  );
  const allSelected = filtered.length > 0 && filtered.every((o) => selectedIds.includes(o.id));

  async function save(publication?: Offering['publication']) {
    if (!draft || !source || !catalogue || busy || readOnlyDraft) return;
    const found = validateOffering(
      draft,
      (publication ?? draft.publication) === 'published',
      profile,
    );
    found.push(
      ...validateOfferingRelationships(
        draft,
        offerings,
        (publication ?? draft.publication) === 'published',
      ),
    );
    if (found.length) {
      setIssues(found);
      setTab(found[0]!.tab);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await source.save(profile, draft, publication);
      setCatalogue((data) =>
        data
          ? {
              ...data,
              offerings: data.offerings.some((o) => o.id === saved.id)
                ? data.offerings.map((o) => (o.id === saved.id ? saved : o))
                : [...data.offerings, saved],
            }
          : data,
      );
      setDraft(saved);
      setBaseline(structuredClone(saved));
      setIssues([]);
      setNotice(preview ? (
        publication === 'published'
          ? 'Offering published in this browser preview.'
          : publication === 'draft'
            ? 'Offering unpublished in this browser preview.'
            : 'Changes saved in this browser.'
      ) : 'Offering saved as a draft.');
      if (!preview) onSetupSaved?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Changes could not be saved. Your edits remain open.',
      );
    } finally {
      setBusy(false);
    }
  }
  function create(schemaId: string, copy?: Offering) {
    if (!canWriteDrafts) return;
    guard(() => {
      const item = createOffering(profile, schemaId, browserUuid());
      if (copy) {
        item.name = `${copy.name} (copy)`;
        item.description = copy.description;
        item.section = copy.section;
        item.tags = copy.tags;
        item.quantityRules = copy.quantityRules;
        item.optionGroups = structuredClone(copy.optionGroups);
        item.bundleItems = structuredClone(copy.bundleItems);
        item.priceMode = copy.priceMode;
        item.price = copy.price;
        item.unit = copy.unit;
        item.fields = structuredClone(copy.fields);
        item.attributes = structuredClone(copy.attributes);
        if (preview) { item.image = copy.image; item.imageAlt = copy.imageAlt; }
        item.variants = copy.variants.map((v) => ({
          ...v,
          id: browserUuid(),
          stock: undefined,
        }));
      }
      setDraft(item);
      setBaseline(null);
      setTab('details');
      setIssues([]);
      setMobileEditor(true);
      setPanel(null);
    });
  }
  async function persistCatalogue(next: Catalogue, message: string) {
    if (!source || busy) return;
    setBusy(true);
    setPanelError('');
    try {
      await source.replace(profile, next);
      setCatalogue(next);
      setNotice(message);
      setPanel(null);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'The preview could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!catalogue || !source) return;
    setBusy(true);
    setPanelError('');
    try {
      const current = await source.load(profile);
      const ids = selectedIds.length ? selectedIds : draft ? [draft.id] : [];
      if (
        ids.some(
          (id) =>
            !current.offerings.some((o) => o.id === id) ||
            current.offerings.find((o) => o.id === id)?.version !==
              offerings.find((o) => o.id === id)?.version,
        )
      )
        throw new Error('An offering changed in another tab. Reload before archiving.');
      const at = new Date().toISOString();
      const next = {
        ...current,
        offerings: current.offerings.map((o) =>
          ids.includes(o.id)
            ? {
                ...o,
                publication: 'archived' as const,
                version: o.version + 1,
                updatedAt: at,
                history: [
                  { at, action: 'Archived in preview', version: o.version + 1 },
                  ...o.history,
                ],
              }
            : o,
        ),
      };
      await source.replace(profile, next);
      setCatalogue(next);
      select(null);
      setSelectedIds([]);
      setPanel(null);
      setNotice(`${ids.length} offering${ids.length === 1 ? '' : 's'} archived in preview.`);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Archiving failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  function switchProfile(id: string) {
    setProfileId(id);
    setSearch('');
    setStatus('all');
    setSourceFilter('all');
    setType('all');
    setSelectedIds([]);
    setPanel(null);
  }
  function importPreview() {
    try {
      setImportRows(prepareImport(csv, profile, enabled, offerings));
      setPanelError('');
    } catch (e) {
      setImportRows([]);
      setPanelError(e instanceof Error ? e.message : 'The file could not be read.');
    }
  }
  return (
    <div
      className={`${styles.root} ${styles.workspace}`}
      data-offerings-workspace
      data-profile={profile.id}
      aria-busy={loading || catalogue?.configuration.subcategoryId !== profile.id}
    >
      {!setupEditor && <>
      <div className="of-page-heading">
        <div>
          <h1>Offerings</h1>
          <p>
            {enabled
              .map(
                (id) =>
                  `${offerings.filter((o) => o.schemaId === id && o.publication !== 'archived').length} ${schemas[id]!.plural.toLowerCase()}`,
              )
              .join(' · ')}
          </p>
        </div>
        <div className="of-heading-actions">
          {(returnTo?.startsWith('/merchant-live-preview/availability?') ||
            returnTo?.startsWith('/merchant-live-preview/money?')) && (
            <a className="of-button" href={returnTo}>
              Back to{' '}
              {returnTo.startsWith('/merchant-live-preview/money?') ? 'Money' : 'Availability'}
            </a>
          )}
          {preview && (
            <button
              type="button"
              className="of-sample"
              onClick={() =>
                guard(() => {
                  setSampleId(profile.id);
                  openPanel('sample');
                })
              }
            >
              {profile.id === 'makeup' ? 'Zuri Studio' : profile.name}
              <Settings2 size={14} />
              <span className="sr-only">Choose sample specialty</span>
            </button>
          )}
          {liveCatalogue && setupActivities && setupActivities.length > 1 && (
            <label className="of-setup-activity">
              <span>Business activity</span>
              <select value={profile.id} onChange={(event) => {
                const activity = event.target.value;
                guard(() => setProfileId(activity));
              }}>
                {setupActivities.map((activity) => (
                  <option key={activity.id} value={activity.id}>{activity.name}</option>
                ))}
              </select>
            </label>
          )}
          {preview && <button
            type="button"
            className="of-link of-connections-link"
            onClick={() => guard(() => openPanel('connections'))}
          >
            Manage connections
          </button>}
          {preview && <button
            type="button"
            className="of-button"
            onClick={() =>
              guard(() => {
                setCsv('');
                setImportRows([]);
                openPanel('import');
              })
            }
          >
            <Upload size={16} />
            <span>Import</span>
          </button>}
          {canWriteDrafts && <button
            type="button"
            className="of-button of-primary"
            disabled={loading || (!!error && !catalogue)}
            onClick={() =>
              enabled.length === 1 ? create(enabled[0]!) : guard(() => openPanel('add'))
            }
          >
            <Plus size={17} />
            Add offering
          </button>}
        </div>
      </div>
      <div className="of-announcement" aria-live="polite">
        {notice && (
          <span>
            <Check size={14} />
            {notice}
            <button
              type="button"
              className="of-icon"
              aria-label="Dismiss message"
              onClick={() => setNotice('')}
            >
              <X size={13} />
            </button>
          </span>
        )}
      </div>
      {error && catalogue && (
        <div className="of-error" role="alert">
          {error}
          <button type="button" className="of-link" onClick={() => guard(() => void load())}>
            Reload saved catalogue
          </button>
        </div>
      )}
      <div
        className={`of-content ${mobileEditor ? 'of-show-editor' : ''} ${draft ? '' : 'of-full-catalogue'}`}
      >
        <section className="of-catalogue" aria-label="Offerings catalogue">
          <div className="of-type-tabs" aria-label="Filter offering type">
            {['all', ...enabled].map((id) => (
              <button type="button" aria-pressed={type === id} key={id} onClick={() => setType(id)}>
                {id === 'all' ? 'All offerings' : schemas[id]!.plural}
                <span>
                  {
                    offerings.filter(
                      (o) => (id === 'all' || o.schemaId === id) && o.publication !== 'archived',
                    ).length
                  }
                </span>
              </button>
            ))}
            {preview && <button
              className="of-icon of-configure"
              type="button"
              aria-label="Configure offering types"
              onClick={() =>
                guard(() => {
                  setConfiguredTypes([...enabled]);
                  openPanel('configuration');
                })
              }
            >
              <Settings2 size={16} />
            </button>}
          </div>
          <div className="of-toolbar">
            <label className="of-search">
              <Search size={17} />
              <span className="sr-only">Search offerings</span>
              <input
                placeholder="Search offerings…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Publication filter</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Status: All</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Source filter</span>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">Source: All</option>
                <option value="nexg">NEXG only</option>
                <option value="external">Connected source</option>
              </select>
            </label>
            <button
              type="button"
              className="of-button of-columns-button"
              onClick={() => openPanel('columns')}
            >
              <Columns3 size={16} />
              <span>Columns</span>
            </button>
          </div>
          {selectedIds.length > 0 && (
            <div className="of-bulk">
              <span>{selectedIds.length} selected</span>
              <button
                type="button"
                className="of-link"
                onClick={() =>
                  download(
                    'offerings-selected.csv',
                    catalogueCsv(offerings.filter((o) => selectedIds.includes(o.id))),
                  )
                }
              >
                Export
              </button>
              {preview && <button
                type="button"
                className="of-link"
                onClick={() => guard(() => openPanel('archive'))}
              >
                Archive
              </button>}
              <button
                type="button"
                className="of-icon"
                aria-label="Clear selection"
                onClick={() => setSelectedIds([])}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <TableViewport className="of-table-scroll" label="Scrollable offering list">
            {loading ? (
              <div className="of-empty" role="status">
                <Package size={26} />
                <h2>Loading offerings…</h2>
                <p>Preparing your catalogue and configuration.</p>
              </div>
            ) : error && !catalogue ? (
              <div className="of-empty" role="alert">
                <h2>Offerings could not be loaded</h2>
                <p>{error}</p>
                <button type="button" className="of-button" onClick={() => void load()}>
                  Try again
                </button>
                {preview && (
                  <button
                    type="button"
                    className="of-link"
                    onClick={async () => {
                      if (source) {
                        try {
                          const data = await source.reset(profile);
                          setCatalogue(data);
                          setError('');
                          select(data.offerings[0] ?? null, false);
                        } catch {
                          setError(
                            'This browser cannot access preview storage. Allow site storage, then try again.',
                          );
                        }
                      }
                    }}
                  >
                    Reset this specialty’s sample
                  </button>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="of-empty">
                <Package size={28} />
                <h2>{offerings.length ? 'No matching offerings' : 'Add your first offering'}</h2>
                <p>
                  {offerings.length
                    ? 'Try another search, type, status or source.'
                    : `Create a ${schemas[enabled[0]!]!.label.toLowerCase()}, or import a catalogue as drafts.`}
                </p>
                <button
                  type="button"
                  className="of-button"
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                    setType('all');
                    setSourceFilter('all');
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <table className="of-table">
                <thead>
                  <tr>
                    <th className="of-select-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all visible offerings"
                        checked={allSelected}
                        onChange={(e) =>
                          setSelectedIds(
                            e.target.checked
                              ? [...new Set([...selectedIds, ...filtered.map((o) => o.id)])]
                              : selectedIds.filter((id) => !filtered.some((o) => o.id === id)),
                          )
                        }
                      />
                    </th>
                    <th>
                      <button
                        type="button"
                        className="of-sort"
                        onClick={() => setSort(sort === 'name' ? 'updated' : 'name')}
                      >
                        Offering
                        <ArrowUpDown size={12} />
                        <span className="sr-only">
                          Sort by {sort === 'name' ? 'last updated' : 'name'}
                        </span>
                      </button>
                    </th>
                    {columns.price && <th>Price</th>}
                    {columns.publication && <th>Publication</th>}
                    {columns.capacity && <th>Capacity / stock</th>}
                    {columns.source && <th>Source</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} data-selected={draft?.id === item.id}>
                      <td className="of-select-cell">
                        <input
                          aria-label={`Select ${item.name}`}
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(e) =>
                            setSelectedIds(
                              e.target.checked
                                ? [...selectedIds, item.id]
                                : selectedIds.filter((id) => id !== item.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="of-row-name"
                          id={`of-row-${item.id}`}
                          aria-label={`${canWriteDrafts && !isExisting?.(item) ? 'Edit' : 'View'} ${item.name}`}
                          aria-pressed={draft?.id === item.id}
                          onClick={() => guard(() => select(item))}
                        >
                          <span className="of-thumbnail">
                            {item.image ? (
                              <Image unoptimized width={480} height={320} src={item.image} alt="" />
                            ) : preview && profile.id === 'makeup' &&
                              schemas[item.schemaId]?.capacity === 'calendar' ? (
                              <Image
                                width={96}
                                height={104}
                                src="/images/categories/beauty.jpg"
                                alt=""
                              />
                            ) : (
                              <Package size={22} />
                            )}
                          </span>
                          <span>
                            <strong>{item.name}</strong>
                            <small>
                              {isExisting?.(item) ? 'Existing catalogue entry' : schemas[item.schemaId]!.label}
                              {!isExisting?.(item) && (item.fields.duration_minutes
                                ? ` · ${item.fields.duration_minutes} min`
                                : ` · ${item.unit}`)}
                            </small>
                          </span>
                        </button>
                      </td>
                      {columns.price && (
                        <td>
                          <PriceSummary item={item} />
                        </td>
                      )}
                      {columns.publication && (
                        <td>
                          <Status value={isExisting?.(item)
                            ? item.publication === 'published' ? 'Available' : 'Unavailable'
                            : item.publication} />
                        </td>
                      )}
                      {columns.capacity && (
                        <td>
                          {capacityLabel(item)}
                          {item.stockAsOf && item.availabilityLinked && item.sync === 'current' && (
                            <small>
                              As of{' '}
                              {new Intl.DateTimeFormat('en-KE', {
                                timeStyle: 'short',
                                timeZone: 'Africa/Nairobi',
                              }).format(new Date(item.stockAsOf))}{' '}
                              EAT
                            </small>
                          )}
                        </td>
                      )}
                      {columns.source && (
                        <td>
                          {item.sources.details === 'external' ? 'Connected system' : 'NEXG'}
                          {item.sources.availability === 'external' && (
                            <small>Stock / capacity: connected</small>
                          )}
                          {item.sync !== 'current' && (
                            <small>
                              {item.sync === 'offline'
                                ? 'Connection unavailable'
                                : item.sync === 'stale'
                                  ? 'Refresh needed'
                                  : 'Awaiting source'}
                            </small>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableViewport>
          <div className="of-catalogue-footer">
            <span>
              {filtered.length} shown · {preview ? 'Saved in this browser only' : 'Catalogue'}
            </span>
            <button
              type="button"
              className="of-link"
              onClick={() => download('offerings.csv', catalogueCsv(filtered))}
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </section>
        <div className="of-detail-slot">
          {draft && isExisting?.(draft) ? (
            <div className="of-editor-placeholder">
              <button
                type="button"
                className="of-mobile-back"
                onClick={() => setMobileEditor(false)}
              >
                <ArrowLeft size={16} />
                Back to catalogue
              </button>
              <h2>{draft.name}</h2>
              {draft.description && <p>{draft.description}</p>}
              <PriceSummary item={draft} />
              <Status value={draft.publication === 'published' ? 'Available' : 'Unavailable'} />
              <p>Existing catalogue entry.</p>
            </div>
          ) : draft && configuration ? (
            <>
              <button
                type="button"
                className="of-mobile-back"
                onClick={() => setMobileEditor(false)}
              >
                <ArrowLeft size={16} />
                Back to catalogue{dirty ? ' · unsaved draft kept' : ''}
              </button>
              <OfferingEditor
                item={draft}
                profile={profile}
                catalogue={offerings}
                configuration={configuration}
                tab={tab}
                setTab={setTab}
                change={(next) => {
                  if (readOnlyDraft) return;
                  setDraft(next);
                  setError('');
                  setIssues([]);
                }}
                issues={issues}
                busy={busy}
                dirty={dirty}
                onSave={(publication) => void save(publication)}
                onClose={() =>
                  guard(() => {
                    const id = draft.id;
                    select(null);
                    window.requestAnimationFrame(() =>
                      document.getElementById(`of-row-${id}`)?.focus(),
                    );
                  })
                }
                onAdd={() =>
                  enabled.length === 1 ? create(enabled[0]!) : guard(() => openPanel('add'))
                }
                onDuplicate={() => create(draft.schemaId, draft)}
                onConnections={() => guard(() => openPanel('connections'))}
                onReload={() => guard(() => void load())}
                setupDraftOnly={liveCatalogue}
                readOnly={readOnlyDraft}
                onUploadImage={onUploadImage}
              />
            </>
          ) : (
            <div className="of-editor-placeholder">
              <Package size={28} />
              <h2>Select an offering</h2>
              <p>Choose a listing to view its details, pricing and availability.</p>
            </div>
          )}
        </div>
      </div>
      </>}
      {setupEditor && (
        <div className="of-setup-editor">
          {(setupActivities ?? demoContext?.subcategories ?? []).length > 1 && (
            <label className="of-setup-activity">
              <span>Business activity</span>
              <select value={profile.id} onChange={(event) => {
                const selected = event.target.value;
                guard(() => setProfileId(selected));
              }}>
                {(setupActivities ?? demoContext?.subcategories ?? []).filter((activity) => profiles.some((item) => item.id === activity.id)).map((activity) => (
                  <option key={activity.id} value={activity.id}>{activity.name}</option>
                ))}
              </select>
            </label>
          )}
          {!preview && offerings.length > 0 && <label className="of-setup-activity">
            <span>Saved drafts</span>
            <select value={draft && offerings.some((item) => item.id === draft.id) ? draft.id : ''} onChange={(event) => {
              const item = offerings.find((entry) => entry.id === event.target.value);
              if (item) guard(() => select(item, false));
              else create(enabled[0] ?? profile.schema);
            }}>
              <option value="">New offering</option>
              {offerings.map((item) => <option key={item.id} value={item.id}>{item.name || 'Untitled offering'}</option>)}
            </select>
          </label>}
          <p className="of-setup-note">{preview ? 'Demo · Changes are saved in this browser only.' : 'Offerings are saved as drafts while your business is being set up.'}</p>
          {notice && <p className="of-setup-notice" role="status">{notice}</p>}
          {error && <p className="of-error" role="alert">{error}</p>}
          {draft && configuration ? (
            <OfferingEditor
              item={draft} profile={profile} catalogue={offerings} configuration={configuration}
              tab={tab} setTab={setTab}
              change={(next) => { setDraft(next); setError(''); setIssues([]); }}
              issues={issues} busy={busy} dirty={dirty}
              onSave={(publication) => void save(publication)}
              onClose={() => guard(() => onSetupClose?.())}
              onAdd={() => enabled.length === 1 ? create(enabled[0]!) : guard(() => openPanel('add'))}
              onDuplicate={() => create(draft.schemaId, draft)}
              onConnections={() => guard(() => openPanel('connections'))}
              onReload={() => guard(() => void load())}
              setupDraftOnly={!preview}
              onUploadImage={onUploadImage}
            />
          ) : loading ? <p>Loading offering editor…</p> : <button type="button" onClick={onSetupClose}>Close</button>}
        </div>
      )}
      <Modal
        open={panel === 'add'}
        title="Add an offering"
        description="Choose a type already configured for this merchant."
        onClose={() => setPanel(null)}
      >
        <div className="of-fields">
          {enabled.map((id) => (
            <button type="button" className="of-add-type" key={id} onClick={() => create(id)}>
              <Plus size={18} />
              <span>
                <strong>{schemas[id]!.label}</strong>
                <small>{schemas[id]!.guidance}</small>
              </span>
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={panel === 'sample'}
        title="Preview a merchant specialty"
        description="Test the same screen across all 128 subcategories. Each specialty keeps its own browser-only catalogue."
        onClose={() => setPanel(null)}
        footer={
          <button
            type="button"
            className="of-button of-primary"
            onClick={() => switchProfile(sampleId)}
          >
            Open specialty
          </button>
        }
      >
        <div className="of-fields">
          <Label title="Sample specialty">
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              {[...new Set(profiles.map((p) => p.categoryId))].map((category) => (
                <optgroup key={category} label={category.replaceAll('_', ' ')}>
                  {profiles
                    .filter((p) => p.categoryId === category)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Label>
          <p className="of-muted">
            In the finished portal, scoped onboarding configuration supplies this automatically.
            This selector is only for testing the frontend.
          </p>
          <button
            type="button"
            className="of-button"
            onClick={async () => {
              if (source) {
                try {
                  const data = await source.reset(profile);
                  setCatalogue(data);
                  select(data.offerings[0] ?? null, false);
                  setPanel(null);
                  setNotice('This specialty’s sample was reset.');
                } catch {
                  setPanelError('This browser could not reset the sample.');
                }
              }
            }}
          >
            Reset current specialty’s sample
          </button>
          {panelError && (
            <p className="of-error" role="alert">
              {panelError}
            </p>
          )}
        </div>
      </Modal>
      <Modal
        open={panel === 'configuration'}
        title="Offering types"
        description="Enable only the activities this merchant actually provides. Candidate types do not become active automatically."
        onClose={() => setPanel(null)}
        footer={
          <button
            type="button"
            className="of-button of-primary"
            disabled={busy || configuredTypes.length === 0}
            onClick={() => {
              if (catalogue)
                void persistCatalogue(
                  {
                    ...catalogue,
                    configuration: { ...catalogue.configuration, enabledSchemas: configuredTypes },
                  },
                  'Offering types updated in this browser.',
                );
            }}
          >
            Save configuration
          </button>
        }
      >
        <div className="of-fields">
          {availableSchemas(profile).map((id) => {
            const inUse = offerings.some((o) => o.schemaId === id);
            return (
              <label className="of-check" key={id}>
                <input
                  type="checkbox"
                  checked={configuredTypes.includes(id)}
                  disabled={inUse}
                  onChange={(e) =>
                    setConfiguredTypes(
                      e.target.checked
                        ? [...configuredTypes, id]
                        : configuredTypes.filter((s) => s !== id),
                    )
                  }
                />
                <span>
                  {schemas[id]!.plural}
                  {inUse && <small>Contains listings · keep enabled</small>}
                </span>
              </label>
            );
          })}
          {panelError && (
            <p role="alert" className="of-error">
              {panelError}
            </p>
          )}
          <p className="of-muted">
            A new category can bind these same registered types. A genuinely new workflow needs its
            own typed contract before activation.
          </p>
        </div>
      </Modal>
      <Modal open={panel === 'columns'} title="Catalogue columns" onClose={() => setPanel(null)}>
        <div className="of-fields">
          {Object.entries(columns).map(([id, enabledColumn]) => (
            <label className="of-check" key={id}>
              <input
                type="checkbox"
                checked={enabledColumn}
                onChange={(e) => setColumns({ ...columns, [id]: e.target.checked })}
              />
              {
                {
                  price: 'Price',
                  publication: 'Publication',
                  capacity: 'Capacity / stock',
                  source: 'Source',
                }[id]
              }
            </label>
          ))}
        </div>
      </Modal>
      <Modal
        open={panel === 'connections'}
        title="Source ownership"
        description="Frontend simulation only. No ERP, API or webhook is being connected or changed."
        onClose={() => setPanel(null)}
      >
        <div className="of-fields">
          <p className="of-note">
            <Link2 size={17} />
            The listing description, prices and stock can have different owners. External fields
            stay read-only.
          </p>
          {draft ? (
            <>
              <h3>{draft.name}</h3>
              {(['details', 'price', 'availability'] as const).map((area) => (
                <Label
                  key={area}
                  title={`${area.charAt(0).toUpperCase() + area.slice(1)} managed by`}
                >
                  <select
                    value={draft.sources[area]}
                    disabled={busy}
                    onChange={async (e) => {
                      if (!catalogue || !source) return;
                      const next = {
                        ...draft,
                        sources: {
                          ...draft.sources,
                          [area]: e.target.value as 'nexg' | 'external',
                        },
                      };
                      const nextCatalogue = {
                        ...catalogue,
                        offerings: catalogue.offerings.map((o) => (o.id === next.id ? next : o)),
                      };
                      try {
                        await source.replace(profile, nextCatalogue);
                        setCatalogue(nextCatalogue);
                        select(next, mobileEditor);
                      } catch {
                        setPanelError('Source settings could not be saved.');
                      }
                    }}
                  >
                    <option value="nexg">NEXG · local preview</option>
                    <option value="external">Connected system · simulated</option>
                  </select>
                </Label>
              ))}
              <Label title="Simulated connection state">
                <select
                  value={draft.sync}
                  onChange={async (e) => {
                    if (!catalogue || !source) return;
                    const next: Offering = { ...draft, sync: e.target.value as Offering['sync'] };
                    try {
                      const nextCatalogue = {
                        ...catalogue,
                        offerings: catalogue.offerings.map((o) => (o.id === next.id ? next : o)),
                      };
                      await source.replace(profile, nextCatalogue);
                      setCatalogue(nextCatalogue);
                      select(next, mobileEditor);
                    } catch {
                      setPanelError('Connection state could not be saved.');
                    }
                  }}
                >
                  <option value="current">Current source confirmation</option>
                  <option value="stale">Stale / needs refresh</option>
                  <option value="offline">Connection unavailable</option>
                  <option value="pending">Awaiting source confirmation</option>
                </select>
              </Label>
            </>
          ) : (
            <p>Select a saved offering to inspect its field ownership.</p>
          )}
          {panelError && (
            <p className="of-error" role="alert">
              {panelError}
            </p>
          )}
          <p className="of-muted">
            An unavailable or pending source never turns into a manual order-acceptance queue.
            Future integrations must confirm stock or capacity themselves.
          </p>
        </div>
      </Modal>
      <Modal
        open={panel === 'import'}
        title="Import offerings"
        description="Review the file first. Imported offerings stay drafts until their specialist details and availability are complete."
        onClose={() => setPanel(null)}
        footer={
          <>
            <button type="button" className="of-button" onClick={importPreview}>
              Check import
            </button>
            <button
              type="button"
              className="of-button of-primary"
              disabled={!importRows.length || busy}
              onClick={() => {
                if (catalogue)
                  void persistCatalogue(
                    { ...catalogue, offerings: [...catalogue.offerings, ...importRows] },
                    `${importRows.length} offerings imported as drafts.`,
                  );
              }}
            >
              Import {importRows.length || ''} drafts
            </button>
          </>
        }
      >
        <div className="of-fields">
          <button
            type="button"
            className="of-link"
            onClick={() =>
              download(
                'offerings-template.csv',
                `name,description,type,price_mode,price_kes,unit\r\nNew offering,Describe the offering,${enabled[0]},${schemas[enabled[0]!]!.priceModes[0]},2500,${schemas[enabled[0]!]!.unit}`,
              )
            }
          >
            <Download size={15} />
            Download template
          </button>
          <Label title="CSV file" hint="Up to 200 rows · 1 MB">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1_000_000) {
                  setPanelError('Use a CSV smaller than 1 MB.');
                  return;
                }
                try {
                  setCsv(await file.text());
                  setImportRows([]);
                  setPanelError('');
                } catch {
                  setPanelError('The file could not be read. Choose it again.');
                }
              }}
            />
          </Label>
          <Label title="Or paste CSV">
            <textarea
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setImportRows([]);
              }}
            />
          </Label>
          {panelError && (
            <p className="of-error" role="alert">
              {panelError}
            </p>
          )}
          {importRows.length > 0 && (
            <div role="status">
              <strong>{importRows.length} valid drafts ready</strong>
              <ul>
                {importRows.slice(0, 8).map((o) => (
                  <li key={o.id}>
                    {o.name} · {priceLabel(o)}
                  </li>
                ))}
              </ul>
              {importRows.length > 8 && <p>And {importRows.length - 8} more.</p>}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={panel === 'unsaved'}
        title="Keep your unsaved changes?"
        description="Save the draft before leaving, or discard these edits to continue."
        onClose={() => {
          setPanel(null);
          nextAction.current = null;
        }}
        footer={
          <>
            <button
              type="button"
              className="of-button"
              onClick={() => {
                setPanel(null);
                nextAction.current = null;
              }}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="of-button"
              onClick={() => {
                const action = nextAction.current;
                nextAction.current = null;
                setPanel(null);
                action?.();
              }}
            >
              Discard and continue
            </button>
            <button
              type="button"
              className="of-button of-primary"
              disabled={busy}
              onClick={async () => {
                if (!draft || !source) return;
                const found = validateOffering(draft, draft.publication === 'published', profile);
                if (found.length) {
                  setIssues(found);
                  setTab(found[0]!.tab);
                  setPanel(null);
                  return;
                }
                setBusy(true);
                try {
                  const saved = await source.save(profile, draft);
                  setCatalogue((data) =>
                    data
                      ? {
                          ...data,
                          offerings: data.offerings.some((o) => o.id === saved.id)
                            ? data.offerings.map((o) => (o.id === saved.id ? saved : o))
                            : [...data.offerings, saved],
                        }
                      : data,
                  );
                  setDraft(saved);
                  setBaseline(saved);
                  const action = nextAction.current;
                  nextAction.current = null;
                  setPanel(null);
                  action?.();
                } catch (e) {
                  setPanelError(e instanceof Error ? e.message : 'Save failed.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save and continue
            </button>
          </>
        }
      >
        {panelError && (
          <p className="of-error" role="alert">
            {panelError}
          </p>
        )}
        <p>Changes to {draft?.name || 'this new offering'} have not been saved.</p>
      </Modal>
      <Modal
        open={panel === 'archive'}
        title="Archive selected offerings?"
        description="Archived listings are removed from the active catalogue. Existing bookings and historical records stay separate."
        onClose={() => setPanel(null)}
        footer={
          <>
            <button type="button" className="of-button" onClick={() => setPanel(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="of-button of-primary"
              disabled={busy}
              onClick={() => void archive()}
            >
              Archive {selectedIds.length || 1} offering{selectedIds.length > 1 ? 's' : ''}
            </button>
          </>
        }
      >
        {panelError && (
          <p className="of-error" role="alert">
            {panelError}
          </p>
        )}
        <p>
          Find archived listings using the status filter. Restore one as a draft after reviewing its
          current requirements.
        </p>
      </Modal>
    </div>
  );
}
