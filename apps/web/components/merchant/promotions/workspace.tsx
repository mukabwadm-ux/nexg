'use client';
/* eslint-disable @next/next/no-img-element -- sample media may be a local data URL */

import { MERCHANT_TAXONOMY } from '@nexg/contracts';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Eye,
  Gift,
  Megaphone,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  Truck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MerchantLivePreviewShell } from '../live-preview-shell';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';
import { money, profiles } from '../offerings/model';
import {
  benefitLabel,
  campaignState,
  contextFor,
  emptyCampaign,
  isHistory,
  localInstant,
  publicSnapshot,
  storefrontSnapshot,
  validateCampaign,
  type Campaign,
  type DisplayState,
  type PromotionCatalogue,
  type PromotionData,
  type PublicSnapshot,
} from './model';
import {
  localPromotionSource,
  newCampaignId,
  type PromotionAction,
  type PromotionSource,
} from './source';
import { PromotionsFrame, PromotionStatus, PromotionTable, PromotionTabs } from './presentation';

type Mode = 'list' | 'edit' | 'review' | 'preview';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'The promotion could not be saved. Try again.';
const formatMinor = (value: number) => money((value / 100).toFixed(2));
const tone = (state: DisplayState) =>
  state === 'Active'
    ? 'green'
    : state === 'Scheduled'
      ? 'blue'
      : state === 'Needs attention' || state === 'Awaiting confirmation'
        ? 'amber'
        : state === 'Cancelled' || state === 'Rejected'
          ? 'red'
          : 'grey';
const dateLabel = (value: string) => (value ? value.replace('T', ' ') + ' EAT' : 'Not set');
const shortDate = (value: string) => {
  const time = Date.parse(value.includes('T') && !value.endsWith('Z') ? `${value}+03:00` : value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Nairobi',
      })
    : 'Not set';
};
const periodLabel = (campaign: Campaign) =>
  campaign.rule.startsAt || campaign.rule.endsAt
    ? `${campaign.rule.startsAt ? shortDate(campaign.rule.startsAt) : 'Now'} – ${campaign.rule.endsAt ? shortDate(campaign.rule.endsAt) : 'No end date'}`
    : shortDate(campaign.updatedAt);
const localNow = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16);

function State({ value, badge = false }: { value: DisplayState; badge?: boolean }) {
  return <PromotionStatus label={value} tone={tone(value)} badge={badge} />;
}
function CampaignIcon({
  campaign,
  item,
}: {
  campaign: Campaign;
  item?: PromotionCatalogue['offerings'][number];
}) {
  const Icon = campaign.name.toLowerCase().includes('delivery')
    ? Truck
    : campaign.kind === 'featured'
      ? Megaphone
      : campaign.name.toLowerCase().includes('gift')
        ? Gift
        : item && contextFor(item).model === 'APPOINTMENT'
          ? CalendarDays
          : ShoppingBag;
  return (
    <span className="pm-campaign-icon">
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}
function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pm-pair">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Thumb({ snapshot }: { snapshot: PublicSnapshot }) {
  return (
    <div className="pm-thumb">
      {snapshot.image ? (
        <img src={snapshot.image} alt="" />
      ) : (
        <Package size={28} aria-hidden="true" />
      )}
    </div>
  );
}
function Price({ snapshot }: { snapshot: PublicSnapshot }) {
  if (snapshot.isStorefront) return null;
  if (snapshot.baseMinor === null || snapshot.priceMinor === null)
    return <strong>Price on request</strong>;
  return (
    <div>
      {snapshot.priceMinor < snapshot.baseMinor && (
        <div className="pm-muted">
          <s>{formatMinor(snapshot.baseMinor)}</s>
        </div>
      )}
      <strong className="pm-price">{formatMinor(snapshot.priceMinor)}</strong>
      {snapshot.unit && !['item', 'set'].includes(snapshot.unit) && (
        <span className="pm-muted"> / {snapshot.unit}</span>
      )}
      {snapshot.priceMinor < snapshot.baseMinor && (
        <span className="pm-saving">
          Save {formatMinor(snapshot.baseMinor - snapshot.priceMinor)}
        </span>
      )}
    </div>
  );
}
function PreviewCard({
  snapshot,
  onPreview,
  disabled,
}: {
  snapshot: PublicSnapshot | null;
  onPreview?: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="pm-preview-card">
      <header>
        <h3>Customer preview</h3>
        {onPreview && (
          <button className="pm-link" type="button" onClick={onPreview} disabled={disabled}>
            <Eye size={15} /> Preview in app
          </button>
        )}
      </header>
      {snapshot ? (
        <div className="pm-preview-body">
          <Thumb snapshot={snapshot} />
          <div>
            <strong>{snapshot.name}</strong>
            <Price snapshot={snapshot} />
          </div>
        </div>
      ) : (
        <p className="pm-muted">A saved customer preview is not available for this selection.</p>
      )}
      {snapshot && (
        <p className="pm-terms">
          <strong>Terms</strong>
          <span>
            {snapshot.benefit} · {snapshot.terms}
          </span>
        </p>
      )}
    </section>
  );
}

export function PromotionsWorkspace({
  initialProfileId,
  source: suppliedSource,
  demoContext,
}: {
  initialProfileId?: string;
  source?: PromotionSource;
  demoContext?: MerchantOnboardingDemoContext | null;
}) {
  const inheritedDemo = useMerchantOnboardingDemoContext();
  const activeDemo = demoContext ?? inheritedDemo;
  const [profileId, setProfileId] = useState(
    profiles.some((p) => p.id === (initialProfileId ?? demoContext?.profileId))
      ? (initialProfileId ?? demoContext!.profileId)
      : 'makeup',
  );
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0]!;
  const demoProfileId = activeDemo?.profileId;
  useEffect(() => {
    if (!initialProfileId && demoProfileId && profiles.some((item) => item.id === demoProfileId))
      setProfileId(demoProfileId);
  }, [initialProfileId, demoProfileId]);
  const [source, setSource] = useState<PromotionSource | null>(suppliedSource ?? null);
  const [catalogue, setCatalogue] = useState<PromotionCatalogue | null>(null);
  const [data, setData] = useState<PromotionData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<'Campaigns' | 'History'>('Campaigns');
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('all');
  const [historyPeriod, setHistoryPeriod] = useState('all');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('list');
  const [previewReturn, setPreviewReturn] = useState<'list' | 'edit'>('list');
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [baseline, setBaseline] = useState('');
  const [previewDate, setPreviewDate] = useState(localNow);
  const [previewLocation, setPreviewLocation] = useState('Westlands');
  const [variantId, setVariantId] = useState('');
  const [previewNotice, setPreviewNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!suppliedSource) {
      try {
        setSource(localPromotionSource(window.localStorage));
      } catch {
        setLoading(false);
        setError('This browser cannot access sample storage. Enable site storage and try again.');
      }
    }
  }, [suppliedSource]);
  useEffect(() => {
    if (!source) return;
    let current = true;
    setLoading(true);
    setError('');
    setCatalogue(null);
    setData(null);
    setSelectedId('');
    source
      .load(profile)
      .then((result) => {
        if (!current) return;
        setCatalogue(result.catalogue);
        setData(result.data);
        setSelectedId(result.data.campaigns[0]?.id ?? '');
      })
      .catch((e) => {
        if (current) setError(errorText(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [source, profile, reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const itemFor = useCallback(
    (campaign: Campaign) => catalogue?.offerings.find((o) => o.id === campaign.offeringId),
    [catalogue],
  );
  const previewFor = useCallback(
    (
      campaign: Campaign,
      item: PromotionCatalogue['offerings'][number] | undefined,
      at = Date.now(),
      variant?: string,
    ) =>
      publicSnapshot(campaign, item, at, variant) ??
      (campaign.kind === 'featured' && !campaign.offeringId ? storefrontSnapshot(profile) : null),
    [profile],
  );
  const records = useMemo(
    () =>
      (data?.campaigns ?? []).map((campaign) => ({
        campaign,
        item: itemFor(campaign),
        state: campaignState(campaign, itemFor(campaign), now),
      })),
    [data, itemFor, now],
  );
  const visible = records.filter(
    ({ campaign, item, state }) =>
      (tab === 'History' ? isHistory(state) : !isHistory(state)) &&
      (status === 'All' || state === status) &&
      (type === 'all' || campaign.kind === type) &&
      (tab !== 'History' ||
        historyPeriod === 'all' ||
        now - Date.parse(campaign.updatedAt) <= Number(historyPeriod) * 86_400_000) &&
      `${campaign.name} ${item?.name ?? ''} ${benefitLabel(campaign)}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const selected = visible.find((record) => record.campaign.id === selectedId) ?? visible[0];
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const guard = (run: () => void) => {
    if (!dirty || window.confirm('Discard your unsaved promotion changes?')) run();
  };
  const selectProfile = (id: string) =>
    guard(() => {
      setProfileId(id);
      setMode('list');
      setDraft(null);
      setTab('Campaigns');
      setSearch('');
      setType('all');
      setStatus('All');
      setNotice('');
    });
  const beginEdit = (campaign: Campaign) => {
    const copy = structuredClone(campaign);
    setDraft(copy);
    setBaseline(JSON.stringify(copy));
    setMode('edit');
    setError('');
    setNotice('');
  };
  const newOffer = () =>
    beginEdit(
      emptyCampaign(
        profile,
        catalogue?.offerings.find((o) => o.publication === 'published')?.id ?? '',
        newCampaignId(),
      ),
    );
  const save = async (action: PromotionAction, campaign: Campaign) => {
    if (!source || !data || !catalogue || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const item = catalogue.offerings.find((o) => o.id === campaign.offeringId);
      const result = await source.change(profile, {
        campaign,
        action,
        expectedRevision: data.revision,
        expectedOfferingVersion: item?.version,
      });
      setCatalogue(result.catalogue);
      setData(result.data);
      setSelectedId(result.campaign.id);
      setStatus('All');
      setNotice(
        action === 'request'
          ? 'Sample request saved. No placement has been booked or charged.'
          : action === 'duplicate'
            ? 'A new sample draft was created.'
            : 'Changes saved in this browser sample.',
      );
      setDraft(null);
      setBaseline('');
      if (action === 'duplicate') {
        setTab('Campaigns');
        beginEdit(result.campaign);
      } else {
        setTab(action === 'end' || action === 'withdraw' ? 'History' : 'Campaigns');
        setMode('list');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const openPreview = (campaign: Campaign) => {
    setDraft(campaign);
    setBaseline(JSON.stringify(campaign));
    setVariantId('');
    setPreviewDate(localNow());
    setPreviewNotice('');
    setPreviewReturn('list');
    setMode('preview');
  };
  const changeTab = (next: 'Campaigns' | 'History') => {
    setTab(next);
    setStatus('All');
    setSearch('');
    setType('all');
    setSelectedId('');
  };
  const sampleControl = (
    <details>
      <summary className="text-gold-text cursor-pointer text-xs font-bold underline underline-offset-2">
        Choose sample state
      </summary>
      <label className="absolute z-40 mt-2 rounded-lg border bg-white p-3 text-xs shadow-lg">
        Sample specialty
        <select
          aria-label="Sample specialty"
          value={profileId}
          onChange={(event) => {
            selectProfile(event.target.value);
            event.currentTarget.closest('details')?.removeAttribute('open');
          }}
          className="mt-1 max-w-64 rounded border p-2"
        >
          {MERCHANT_TAXONOMY.map((category) => (
            <optgroup label={category.name} key={category.id}>
              {profiles
                .filter((p) => p.categoryId === category.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
    </details>
  );
  const editingItem = draft ? itemFor(draft) : undefined;
  const previewAt = localInstant(previewDate);
  const snapshot = draft
    ? isHistory(campaignState(draft, editingItem, now))
      ? (draft.archivedPreview ?? null)
      : previewFor(
          draft,
          editingItem,
          Number.isFinite(previewAt) && previewAt !== null ? previewAt : now,
          variantId,
        )
    : null;
  const liveEdit = !!draft && ['running', 'paused'].includes(draft.phase);
  const isLoading =
    loading || (!!catalogue && catalogue.configuration.subcategoryId !== profile.id);

  return (
    <MerchantLivePreviewShell active="Promotions" businessName={activeDemo?.businessName} accountInitials={activeDemo?.initials} demoContext={activeDemo} sampleControl={sampleControl}>
      <PromotionsFrame
        title={mode === 'edit' || mode === 'review'
          ? (liveEdit ? 'Edit promotion' : 'Create promotion')
          : 'Promotions'}
        businessName={activeDemo?.businessName ?? (profile.id === 'makeup' ? 'Nairobi Collective' : profile.name)}
        profileId={profile.id}
        busy={isLoading}
        action={mode === 'list' && (
          <button
            type="button"
            className="pm-button pm-primary"
            onClick={newOffer}
            disabled={!catalogue || isLoading}
          >
            <Plus size={16} /> Create promotion
          </button>
        )}
      >
        {error && (
          <div className="pm-note pm-error" role="alert">
            <AlertCircle size={16} />
            <span>
              {error}
              {/another tab|Reload|changed|removed/.test(error) && (
                <button
                  type="button"
                  className="pm-link"
                  onClick={() => {
                    setDraft(null);
                    setMode('list');
                    setReload((n) => n + 1);
                  }}
                >
                  Reload saved data
                </button>
              )}
            </span>
          </div>
        )}
        {notice && (
          <div className="pm-notice-toast" role="status">
            {notice}
          </div>
        )}
        {isLoading ? (
          <div className="pm-panel pm-empty">Loading promotions…</div>
        ) : !catalogue || !data ? (
          <div className="pm-panel pm-empty">
            <h2>Promotions could not be loaded</h2>
            <p>Your existing data has not been replaced.</p>
            <button className="pm-button" type="button" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : mode === 'list' ? (
          <>
            <PromotionTabs active={tab} onSelect={changeTab} />
            <div
              className="pm-grid"
              role="tabpanel"
              id={`pm-panel-${tab}`}
              aria-labelledby={`pm-tab-${tab}`}
            >
              <section className="pm-panel">
                <h2>{tab === 'Campaigns' ? 'Your campaigns' : 'Promotion history'}</h2>
                <p className="pm-lead">
                  {tab === 'Campaigns'
                    ? 'Create and manage promotions to attract more customers.'
                    : 'View and manage past promotions.'}
                </p>
                <div className={`pm-filters ${tab === 'History' ? 'pm-filters-history' : ''}`}>
                  <label className="pm-search">
                    <span className="sr-only">Search promotions</span>
                    <Search size={16} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={
                        tab === 'History' ? 'Search past promotions...' : 'Search campaigns...'
                      }
                    />
                  </label>
                  {tab === 'History' && (
                    <label>
                      <span className="sr-only">History period</span>
                      <select
                        aria-label="History period"
                        value={historyPeriod}
                        onChange={(event) => setHistoryPeriod(event.target.value)}
                      >
                        <option value="all">All dates</option>
                        <option value="30">Last 30 days</option>
                        <option value="7">Last 7 days</option>
                      </select>
                    </label>
                  )}
                  <label>
                    <span className="sr-only">Campaign type</span>
                    <select value={type} onChange={(event) => setType(event.target.value)}>
                      <option value="all">Type: All types</option>
                      <option value="offer">Automatic offer</option>
                      <option value="featured">Featured placement</option>
                    </select>
                  </label>
                </div>
                <div className="pm-chips" aria-label="Filter by status">
                  {(tab === 'Campaigns'
                    ? [
                        'All',
                        'Active',
                        'Scheduled',
                        'Draft',
                        'Paused',
                        'Needs attention',
                        'Awaiting confirmation',
                      ]
                    : ['All', 'Ended', 'Cancelled', 'Rejected']
                  ).map((filter) => {
                    const count = records.filter(
                      ({ state }) =>
                        (tab === 'History' ? isHistory(state) : !isHistory(state)) &&
                        (filter === 'All' || state === filter),
                    ).length;
                    if (
                      tab === 'Campaigns' &&
                      ['Paused', 'Awaiting confirmation'].includes(filter) &&
                      count === 0
                    )
                      return null;
                    return (
                      <button
                        className="pm-chip"
                        type="button"
                        key={filter}
                        aria-pressed={status === filter}
                        onClick={() => setStatus(filter)}
                      >
                        {filter}
                        {tab === 'Campaigns' && count > 0 ? ` (${count})` : ''}
                      </button>
                    );
                  })}
                </div>
                {visible.length ? (
                  <PromotionTable tab={tab}>
                        {visible.map(({ campaign, item, state }) => (
                          <tr
                            key={campaign.id}
                            data-selected={selected?.campaign.id === campaign.id}
                          >
                            <td>
                              <div className="pm-campaign-cell">
                                <CampaignIcon campaign={campaign} item={item} />
                                <button
                                  type="button"
                                  className="pm-row-button"
                                  aria-label={`Open ${campaign.name}`}
                                  onClick={() => setSelectedId(campaign.id)}
                                >
                                  {campaign.name}
                                </button>
                              </div>
                            </td>
                            <td>
                              {tab === 'History'
                                ? campaign.kind === 'featured'
                                  ? 'Featured placement'
                                  : 'Automatic offer'
                                : benefitLabel(campaign)}
                            </td>
                            <td className="pm-desktop-column">
                              {tab === 'History'
                                ? periodLabel(campaign)
                                : (item?.name ??
                                  (campaign.kind === 'featured' ? 'Business' : 'Not selected'))}
                            </td>
                            <td>
                              <State value={state} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="pm-icon"
                                aria-label={`Open ${campaign.name}`}
                                onClick={() => setSelectedId(campaign.id)}
                              >
                                <ChevronRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                  </PromotionTable>
                ) : (
                  <div className="pm-empty">
                    <strong>No matching promotions</strong>
                    <p>Change your filters or create a promotion.</p>
                  </div>
                )}
                {records.some((r) => r.state === 'Needs attention') && tab === 'Campaigns' && (
                  <div className="pm-note pm-warning">
                    <AlertCircle size={16} />{' '}
                    <span>A promotion needs attention. Some selected items are unavailable.</span>
                    <button
                      type="button"
                      className="pm-link pm-end"
                      onClick={() => setStatus('Needs attention')}
                    >
                      Review items
                    </button>
                  </div>
                )}
                {tab === 'History' && (
                  <div className="pm-note pm-warning">
                    <AlertCircle size={16} /> Past records retain their agreed terms. Duplicating
                    creates a new draft.
                  </div>
                )}
              </section>
              {selected && (
                <section className="pm-panel" aria-label="Selected promotion">
                  <div className="pm-detail-head">
                    <div>
                      <div className="pm-heading-line">
                        <h2>{selected.campaign.name}</h2>
                        <State value={selected.state} badge />
                      </div>
                      <p className="pm-muted">
                        {isHistory(selected.state)
                          ? 'Archived record'
                          : benefitLabel(selected.campaign)}
                      </p>
                    </div>
                    {!isHistory(selected.state) &&
                      selected.state !== 'Needs attention' &&
                      selected.state !== 'Awaiting confirmation' && (
                        <details className="pm-more">
                          <summary aria-label="More promotion actions">
                            <MoreHorizontal size={18} />
                          </summary>
                          <button
                            type="button"
                            className="pm-link"
                            disabled={busy}
                            onClick={() => void save('end', selected.campaign)}
                          >
                            End promotion
                          </button>
                        </details>
                      )}
                  </div>
                  <dl className="pm-pairs">
                    {isHistory(selected.state) ? (
                      <>
                        <Pair label="Period">{periodLabel(selected.campaign)}</Pair>
                        <Pair label="Saved revision">{selected.campaign.version}</Pair>
                        <Pair label="Benefit">{benefitLabel(selected.campaign)}</Pair>
                        <Pair label="Minimum spend">No minimum</Pair>
                        <Pair label="Maximum saving">No cap</Pair>
                        <Pair label="Locations">
                          {profile.id === 'makeup'
                            ? 'Westlands and Kilimani'
                            : 'All sample locations'}
                        </Pair>
                      </>
                    ) : (
                      <>
                        <Pair label="Applies to">
                          {selected.item?.name ??
                            (selected.campaign.kind === 'featured' ? 'Business' : 'Not selected')}
                        </Pair>
                        <Pair label="Locations">
                          {profile.id === 'makeup'
                            ? 'Westlands and Kilimani'
                            : 'All sample locations'}
                        </Pair>
                        <Pair label="Dates">{periodLabel(selected.campaign)}</Pair>
                        {selected.item && contextFor(selected.item).model !== 'ORDER' && (
                          <>
                            <Pair label={contextFor(selected.item).qualifier}>
                              {contextFor(selected.item).label} · {contextFor(selected.item).unit}
                            </Pair>
                            {(publicSnapshot(selected.campaign, selected.item, now)?.details ?? [])
                              .slice(0, 2)
                              .map((detail, index) => (
                                <Pair key={`${detail.label}-${index}`} label={detail.label}>
                                  {detail.value}
                                </Pair>
                              ))}
                          </>
                        )}
                        {selected.campaign.kind === 'offer' && (
                          <>
                            <Pair label="Minimum spend">No minimum</Pair>
                            <Pair label="Maximum saving">No cap</Pair>
                            <Pair label="Funded by">Merchant</Pair>
                            <Pair label="Other offers">Not combined</Pair>
                          </>
                        )}
                        {selected.campaign.kind === 'featured' && (
                          <>
                            <Pair label="Placement">
                              {selected.campaign.placement?.surface === 'category'
                                ? 'Top of category'
                                : selected.campaign.placement?.surface === 'popular'
                                  ? 'Popular requests'
                                  : 'Homepage'}
                            </Pair>
                            <Pair label="Start">
                              {selected.campaign.placement?.startsOn || 'Not set'}
                            </Pair>
                            <Pair label="Duration">
                              {selected.campaign.placement?.weeks ?? 1} week(s)
                            </Pair>
                          </>
                        )}
                      </>
                    )}
                  </dl>
                  {!isHistory(selected.state) ? (
                    <PreviewCard
                      snapshot={
                        isHistory(selected.state)
                          ? (selected.campaign.archivedPreview ?? null)
                          : previewFor(selected.campaign, selected.item, now)
                      }
                      onPreview={() => openPreview(selected.campaign)}
                      disabled={
                        selected.state === 'Needs attention' ||
                        (isHistory(selected.state) && !selected.campaign.archivedPreview) ||
                        (!selected.item &&
                          !(selected.campaign.kind === 'featured' && !selected.campaign.offeringId))
                      }
                    />
                  ) : (
                    <section className="pm-history-card">
                      <h3>Change history</h3>
                      <ol className="pm-history">
                        {[...selected.campaign.history].reverse().map((entry) => (
                          <li key={`${entry.at}-${entry.version}`}>
                            <strong>{shortDate(entry.at)}</strong>
                            <p>{entry.action}</p>
                          </li>
                        ))}
                      </ol>
                      <small className="pm-muted">Preview uses the saved customer view.</small>
                    </section>
                  )}
                  {selected.item &&
                    !isHistory(selected.state) &&
                    contextFor(selected.item).model !== 'ORDER' && (
                      <p className="pm-muted">{contextFor(selected.item).use}</p>
                    )}
                  {selected.state === 'Needs attention' && (
                    <div className="pm-note pm-warning">
                      The offering, availability or discount changed.{' '}
                      <a
                        className="pm-link"
                        href={appendMerchantOnboardingDemoContext(`/merchant-live-preview/offerings?profile=${encodeURIComponent(profile.id)}&offering=${encodeURIComponent(selected.campaign.offeringId)}`, activeDemo)}
                      >
                        Review in Offerings
                      </a>
                    </div>
                  )}
                  {isHistory(selected.state) && !selected.campaign.archivedPreview && (
                    <p className="pm-muted">
                      A saved customer view is unavailable for this record.
                    </p>
                  )}
                  <div className="pm-actions">
                    {isHistory(selected.state) ? (
                      <>
                        <button
                          className="pm-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void save('duplicate', selected.campaign)}
                        >
                          Duplicate as draft
                        </button>
                        <button
                          className="pm-button pm-primary"
                          type="button"
                          disabled={!selected.campaign.archivedPreview}
                          onClick={() => openPreview(selected.campaign)}
                        >
                          <Eye size={15} /> Preview in app
                        </button>
                      </>
                    ) : selected.state === 'Awaiting confirmation' ? (
                      <button
                        className="pm-button"
                        type="button"
                        disabled={busy}
                        onClick={() => void save('withdraw', selected.campaign)}
                      >
                        Withdraw sample request
                      </button>
                    ) : (
                      <>
                        {selected.campaign.phase === 'running' &&
                          selected.state !== 'Needs attention' && (
                            <button
                              className="pm-button"
                              type="button"
                              disabled={busy}
                              onClick={() => void save('pause', selected.campaign)}
                            >
                              Pause promotion
                            </button>
                          )}
                        {selected.campaign.phase === 'paused' &&
                          selected.state !== 'Needs attention' && (
                            <button
                              className="pm-button"
                              type="button"
                              disabled={busy}
                              onClick={() => void save('resume', selected.campaign)}
                            >
                              Resume promotion
                            </button>
                          )}
                        {selected.state !== 'Needs attention' && (
                          <button
                            className="pm-button pm-primary"
                            type="button"
                            onClick={() => beginEdit(selected.campaign)}
                          >
                            Edit promotion
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (mode === 'edit' || mode === 'review') && draft ? (
          <>
            <button
              className="pm-link pm-back"
              type="button"
              onClick={() =>
                guard(() => {
                  setMode('list');
                  setDraft(null);
                  setBaseline('');
                  setError('');
                })
              }
            >
              <ArrowLeft size={16} /> Back to campaigns
            </button>
            <div className="pm-grid">
              <section className="pm-panel">
                <h2>{mode === 'review' ? 'Review promotion' : 'Promotion details'}</h2>
                <p className="pm-lead">
                  {mode === 'review'
                    ? 'Check the offering, benefit and timing before continuing.'
                    : 'Choose a type and the offering it applies to.'}
                </p>
                {mode === 'edit' ? (
                  <div className="pm-fields">
                    <label>
                      Promotion name
                      <input
                        value={draft.name}
                        maxLength={120}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    </label>
                    <label>
                      Promotion type
                      <select
                        aria-label="Promotion type"
                        value={draft.kind}
                        disabled={liveEdit}
                        onChange={(e) =>
                          setDraft({ ...draft, kind: e.target.value as Campaign['kind'] })
                        }
                      >
                        <option value="offer">Automatic offer</option>
                        <option value="featured">Featured placement</option>
                      </select>
                    </label>
                    <label>
                      Offering
                      <select
                        aria-label="Offering"
                        value={draft.offeringId}
                        disabled={liveEdit}
                        onChange={(e) => setDraft({ ...draft, offeringId: e.target.value })}
                      >
                        <option value="">
                          {draft.kind === 'featured' ? 'Business storefront' : 'Choose an offering'}
                        </option>
                        {catalogue.offerings
                          .filter((o) => o.publication !== 'archived' || o.id === draft.offeringId)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} · {o.publication}
                            </option>
                          ))}
                      </select>
                    </label>
                    {editingItem && (
                      <div className="pm-note">
                        <Tag size={16} />
                        <div>
                          <strong>
                            {contextFor(editingItem).qualifier}: {contextFor(editingItem).label}
                          </strong>
                          <br />
                          {contextFor(editingItem).use}
                        </div>
                      </div>
                    )}
                    {draft.kind === 'offer' ? (
                      <>
                        <div className="pm-two">
                          <label>
                            Discount type
                            <select
                              aria-label="Discount type"
                              value={draft.rule.kind}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  rule: {
                                    ...draft.rule,
                                    kind: e.target.value as 'percentage' | 'amount',
                                  },
                                })
                              }
                            >
                              <option value="percentage">Percentage off</option>
                              <option value="amount">Fixed KES off per unit</option>
                            </select>
                          </label>
                          <label>
                            Discount {draft.rule.kind === 'percentage' ? '(%)' : '(KES)'}
                            <input
                              inputMode="decimal"
                              value={draft.rule.value}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  rule: { ...draft.rule, value: e.target.value },
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="pm-two">
                          <label>
                            Offer starts (EAT)
                            <input
                              type="datetime-local"
                              value={draft.rule.startsAt}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  rule: { ...draft.rule, startsAt: e.target.value },
                                })
                              }
                            />
                            <small>Optional</small>
                          </label>
                          <label>
                            Offer ends (EAT)
                            <input
                              type="datetime-local"
                              value={draft.rule.endsAt}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  rule: { ...draft.rule, endsAt: e.target.value },
                                })
                              }
                            />
                            <small>Optional</small>
                          </label>
                        </div>
                        <p className="pm-muted">
                          This sample uses the offering’s existing discount. Minimum spend, saving
                          caps and service-use restrictions are not available in this rule.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="pm-two">
                          <label>
                            Placement
                            <select
                              aria-label="Placement"
                              value={draft.placement?.surface ?? 'homepage'}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  placement: {
                                    ...(draft.placement ?? emptyCampaign(profile).placement!),
                                    surface: event.target.value as
                                      | 'homepage'
                                      | 'category'
                                      | 'popular',
                                  },
                                })
                              }
                            >
                              <option value="homepage">Homepage</option>
                              <option value="category">Top of category</option>
                              <option value="popular">Popular requests</option>
                            </select>
                          </label>
                          <label>
                            Start date
                            <input
                              aria-label="Placement start date"
                              type="date"
                              value={draft.placement?.startsOn ?? ''}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  placement: {
                                    ...(draft.placement ?? emptyCampaign(profile).placement!),
                                    startsOn: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <label>
                          Duration
                          <select
                            aria-label="Placement duration"
                            value={draft.placement?.weeks ?? 1}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                placement: {
                                  ...(draft.placement ?? emptyCampaign(profile).placement!),
                                  weeks: Number(event.target.value),
                                },
                              })
                            }
                          >
                            {[1, 2, 4, 8, 12].map((weeks) => (
                              <option key={weeks} value={weeks}>
                                {weeks} {weeks === 1 ? 'week' : 'weeks'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="pm-note">
                          This sample request does not book or charge for a placement.
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <dl className="pm-pairs">
                    <Pair label="Name">{draft.name || 'Not set'}</Pair>
                    <Pair label="Type">
                      {draft.kind === 'featured' ? 'Featured placement' : 'Automatic offer'}
                    </Pair>
                    <Pair label="Offering">
                      {editingItem?.name ??
                        (draft.kind === 'featured' ? 'Business storefront' : 'Not selected')}
                    </Pair>
                    {draft.kind === 'offer' && (
                      <>
                        <Pair label="Benefit">{benefitLabel(draft)}</Pair>
                        <Pair label="Starts">{dateLabel(draft.rule.startsAt)}</Pair>
                        <Pair label="Ends">{dateLabel(draft.rule.endsAt)}</Pair>
                        <Pair label="Funding">Merchant in this sample</Pair>
                      </>
                    )}
                    {draft.kind === 'featured' && (
                      <>
                        <Pair label="Placement">
                          {draft.placement?.surface === 'category'
                            ? 'Top of category'
                            : draft.placement?.surface === 'popular'
                              ? 'Popular requests'
                              : 'Homepage'}
                        </Pair>
                        <Pair label="Start date">{draft.placement?.startsOn ?? 'Not set'}</Pair>
                        <Pair label="Duration">{draft.placement?.weeks ?? 1} week(s)</Pair>
                      </>
                    )}
                  </dl>
                )}
                <div className="pm-actions">
                  {mode === 'review' ? (
                    <>
                      <button type="button" className="pm-button" onClick={() => setMode('edit')}>
                        Back to details
                      </button>
                      <button
                        type="button"
                        className="pm-button pm-primary"
                        disabled={busy}
                        onClick={() =>
                          void save(
                            liveEdit ? 'edit' : draft.kind === 'featured' ? 'request' : 'activate',
                            draft,
                          )
                        }
                      >
                        {busy
                          ? 'Saving…'
                          : liveEdit
                            ? 'Save changes'
                            : draft.kind === 'featured'
                              ? 'Submit sample request'
                              : 'Activate in sample'}
                      </button>
                    </>
                  ) : (
                    <>
                      {!liveEdit && (
                        <button
                          type="button"
                          className="pm-button"
                          disabled={busy}
                          onClick={() => void save('save', draft)}
                        >
                          Save draft
                        </button>
                      )}
                      <button
                        type="button"
                        className="pm-button pm-primary"
                        onClick={() => {
                          const issues = validateCampaign(draft, editingItem, true);
                          if (issues.length) setError(issues[0]!);
                          else {
                            setError('');
                            setMode('review');
                          }
                        }}
                      >
                        Review promotion
                      </button>
                    </>
                  )}
                </div>
              </section>
              <section className="pm-panel">
                <h2>Customer preview</h2>
                <p className="pm-lead">Check the selected offering and its example price.</p>
                <PreviewCard
                  snapshot={previewFor(draft, editingItem, now)}
                  onPreview={() => {
                    setPreviewReturn('edit');
                    setPreviewDate(localNow());
                    setMode('preview');
                  }}
                  disabled={!editingItem && !(draft.kind === 'featured' && !draft.offeringId)}
                />
                {editingItem && <p className="pm-muted">{contextFor(editingItem).use}</p>}
              </section>
            </div>
          </>
        ) : mode === 'preview' && draft ? (
          <>
            <button
              className="pm-link pm-back"
              type="button"
              onClick={() => {
                setPreviewNotice('');
                if (previewReturn === 'edit') setMode('edit');
                else {
                  setMode('list');
                  setDraft(null);
                  setBaseline('');
                }
              }}
            >
              <ArrowLeft size={16} /> Back to {previewReturn === 'edit' ? 'promotion' : tab}
            </button>
            <div className="pm-preview-heading">
              <h2>Preview in app</h2>
              <p>{draft.name}</p>
            </div>
            <section className="pm-panel pm-context-panel">
              <div className="pm-context">
                <label>
                  App
                  <select aria-label="App" defaultValue="Mobile app">
                    <option>Mobile app</option>
                  </select>
                </label>
                <label>
                  Location
                  <select
                    aria-label="Preview location"
                    value={previewLocation}
                    onChange={(event) => setPreviewLocation(event.target.value)}
                  >
                    <option>Westlands</option>
                    <option>Kilimani</option>
                    <option>All locations</option>
                  </select>
                </label>
                <label>
                  Preview date (EAT)
                  <input
                    type="datetime-local"
                    value={previewDate}
                    disabled={isHistory(campaignState(draft, editingItem, now))}
                    onChange={(e) => setPreviewDate(e.target.value)}
                  />
                </label>
                <label>
                  Placement revision
                  <input
                    aria-label="Version"
                    readOnly
                    value={`${draft.version || 'Draft'} · ${isHistory(campaignState(draft, editingItem, now)) ? 'Archived' : draft.phase === 'draft' ? 'Draft' : 'Sample'}`}
                  />
                </label>
                <label>
                  Mode
                  <input
                    readOnly
                    value={
                      isHistory(campaignState(draft, editingItem, now))
                        ? 'Archived content'
                        : draft.phase === 'draft'
                          ? 'Draft content'
                          : 'Sample content'
                    }
                  />
                </label>
              </div>
              {editingItem &&
                editingItem.variants.length > 0 &&
                !isHistory(campaignState(draft, editingItem, now)) && (
                  <label>
                    Variant
                    <select
                      aria-label="Variant"
                      value={variantId}
                      onChange={(e) => setVariantId(e.target.value)}
                    >
                      {editingItem.variants.map((v) => (
                        <option value={v.id} key={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
            </section>
            <section className="pm-panel pm-app-preview">
              {!snapshot ? (
                <div className="pm-empty">This saved customer preview is unavailable.</div>
              ) : (
                <div className="pm-phone-grid">
                  {(['Discovery', 'Offering details'] as const).map((screen) => (
                    <div className="pm-phone-column" key={screen}>
                      <h3>{screen}</h3>
                      <div className="pm-phone">
                        <div className="pm-phone-head">
                          <span>NEXG</span>
                          <small className="pm-muted">
                            {screen === 'Discovery' ? previewLocation : 'Offering details'}
                          </small>
                        </div>
                        {screen === 'Discovery' && (
                          <>
                            <div className="pm-app-search">
                              <Search size={15} /> Search NEXG
                            </div>
                            <div className="pm-app-categories">
                              <span>All</span>
                              <span>{profile.name}</span>
                              <span>Nearby</span>
                            </div>
                            <div className="pm-inline">
                              <h3>
                                {draft.kind === 'featured'
                                  ? 'Featured near you'
                                  : 'Offers near you'}
                              </h3>
                              <span className="pm-end pm-muted">See all</span>
                            </div>
                          </>
                        )}
                        <div
                          className={`pm-phone-card ${screen === 'Discovery' ? 'pm-discovery-card' : ''}`}
                        >
                          <div className="pm-visual">
                            {draft.kind === 'featured' && (
                              <small className="pm-sponsored">Sponsored</small>
                            )}
                            {snapshot.image ? (
                              <img src={snapshot.image} alt="" />
                            ) : (
                              <Package size={40} aria-hidden="true" />
                            )}
                          </div>
                          <div className="pm-app-content">
                            <h3>{snapshot.name}</h3>
                            <p className="pm-muted">
                              {activeDemo?.businessName ?? (profile.id === 'makeup' ? 'Nairobi Collective' : profile.name)} ·{' '}
                              {previewLocation}
                            </p>
                            {screen === 'Offering details' && (
                              <p className="pm-muted pm-app-description">{snapshot.description}</p>
                            )}
                            {snapshot.details?.find(
                              (detail) => detail.label === 'Selected option',
                            ) && (
                              <p className="pm-muted">
                                Option:{' '}
                                {
                                  snapshot.details.find(
                                    (detail) => detail.label === 'Selected option',
                                  )?.value
                                }
                              </p>
                            )}
                            <Price snapshot={snapshot} />
                            <p>{snapshot.benefit}</p>
                            <small className="pm-muted">{snapshot.terms}</small>
                            {screen === 'Offering details' && !!snapshot.details?.length && (
                              <dl className="pm-pairs">
                                {snapshot.details.map((detail, index) => (
                                  <Pair key={`${detail.label}-${index}`} label={detail.label}>
                                    {detail.value}
                                  </Pair>
                                ))}
                              </dl>
                            )}
                          </div>
                          <button
                            type="button"
                            className="pm-button pm-primary"
                            onClick={() =>
                              setPreviewNotice('Preview only. No order or booking was placed.')
                            }
                          >
                            {screen === 'Discovery' ? 'View offer' : snapshot.action}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="pm-note" role="status">
                {previewNotice ||
                  'Preview only. No order or booking will be placed. Availability may change.'}
              </div>
            </section>
          </>
        ) : null}
      </PromotionsFrame>
    </MerchantLivePreviewShell>
  );
}
