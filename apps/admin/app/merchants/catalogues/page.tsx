import {
  AlertTriangle,
  BadgeCheck,
  BedDouble,
  CalendarClock,
  CircleCheck,
  Eye,
  Layers,
  LayoutGrid,
  ListTree,
  MapPin,
  MoreHorizontal,
  Package,
  Pencil,
  RefreshCw,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Ticket,
  Utensils,
  Wrench,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import {
  AddProductButton,
  BulkImportButton,
  CatalogueMenu,
  PublishChanges,
  ViewToggle,
} from '@/components/catalogues/catalogue-actions';
import {
  categoryIcon,
  CategoryChip,
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  HeaderButton,
  MerchantCell,
  Pagination,
  StatusChip,
} from '@/components/portal/dash';
import { PaneButton, PillTabs } from '@/components/portal/dash-detail';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  CATALOGUE_STATES,
  catalogueChip,
  isCataloguePane,
  isCatalogueState,
  parseCatalogueDetail,
  parseCatalogueList,
  parseCatalogueOverview,
  publicSiteOrigin,
  syncLabel,
  type CatalogueDetail,
  type CataloguePane,
  type CatalogueState,
} from '@/lib/catalogues';
import {
  groupKeys,
  isCategoryGroup,
  merchantPhotoUrl,
  shortCategory,
  type CategoryGroup,
} from '@/lib/merchant-categories';
import { hrefWith } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchant Catalogues' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GROUPS: { key: CategoryGroup; label: string; icon: typeof Layers }[] = [
  { key: 'all', label: 'All Catalogues', icon: LayoutGrid },
  { key: 'food', label: 'Food & Beverages', icon: Utensils },
  { key: 'stays', label: 'Stays', icon: BedDouble },
  { key: 'experiences', label: 'Experiences', icon: Ticket },
  { key: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { key: 'apparel', label: 'Apparel', icon: Shirt },
  { key: 'services', label: 'Services', icon: Wrench },
  { key: 'more', label: 'More', icon: MoreHorizontal },
];

const PANES: { key: CataloguePane; label: string; icon: typeof Layers }[] = [
  { key: 'catalogue', label: 'Catalogue', icon: Package },
  { key: 'products', label: 'Products', icon: ShoppingBasket },
  { key: 'categories', label: 'Categories', icon: ListTree },
  { key: 'modifiers', label: 'Modifiers', icon: SlidersHorizontal },
];

const updated = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});
const dayOnly = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'Africa/Nairobi',
});
const clockOnly = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});
const count = (n: number | null) => (n == null ? null : n.toLocaleString('en-KE'));
const ksh = (n: number | null) => (n == null ? '—' : `KES ${n.toLocaleString('en-KE')}`);

/**
 * Merchants → Catalogues: every merchant's catalogue, filtered by the
 * design's category groups, with one catalogue open beside the list.
 * Figures and rows come from rpc_merchant_catalogue_*.
 */
export default async function CataloguesPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    status?: string;
    q?: string;
    category?: string;
    view?: string;
    page?: string;
    selected?: string;
    pane?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');

  const group: CategoryGroup = isCategoryGroup(searchParams?.tab) ? searchParams!.tab : 'all';
  const status: CatalogueState | 'all' = isCatalogueState(searchParams?.status)
    ? searchParams!.status
    : 'all';
  const q = (searchParams?.q ?? '').trim().slice(0, 80);
  const category = (searchParams?.category ?? 'all').slice(0, 60);
  const view: 'list' | 'grid' = searchParams?.view === 'grid' ? 'grid' : 'list';
  const size = view === 'grid' ? 6 : 5;
  const page = Math.max(1, Math.min(10_000, Number(searchParams?.page) || 1));
  const pane: CataloguePane = isCataloguePane(searchParams?.pane)
    ? searchParams!.pane
    : 'catalogue';

  const groupList = groupKeys(group);
  const keys = category !== 'all' ? [category] : groupList;

  const supabase = createClient();
  const [overviewRes, listRes] = await Promise.all([
    supabase.rpc('rpc_merchant_catalogue_overview', { p_keys: groupList ?? undefined }),
    supabase.rpc('rpc_merchant_catalogue_list', {
      p_keys: keys ?? undefined,
      p_status: status === 'all' ? undefined : status,
      p_q: q || undefined,
      p_limit: size,
      p_offset: (page - 1) * size,
    }),
  ]);
  const overview = parseCatalogueOverview(overviewRes.data);
  const { total, rows } = parseCatalogueList(listRes.data);
  const failed = overviewRes.error ?? listRes.error;
  const k = overview.kpis;

  const selectedId =
    searchParams?.selected && UUID.test(searchParams.selected)
      ? searchParams.selected
      : (rows[0]?.merchant_id ?? null);
  const detailRes = selectedId
    ? await supabase.rpc('rpc_merchant_catalogue_detail', { p_merchant_id: selectedId })
    : null;
  const detail = detailRes ? parseCatalogueDetail(detailRes.data) : null;

  const keep = {
    tab: group === 'all' ? null : group,
    status: status === 'all' ? null : status,
    q: q || null,
    category: category === 'all' ? null : category,
    view: view === 'list' ? null : view,
  };
  const href = (extra: Record<string, string | null>) =>
    hrefWith('/merchants/catalogues', {
      ...keep,
      page: page === 1 ? null : String(page),
      ...extra,
    });
  const selectHref = (id: string) =>
    href({ selected: id, pane: pane === 'catalogue' ? null : pane });
  const preview = (id: string, state: string) =>
    state === 'published' ? `${publicSiteOrigin()}/discover?merchant=${id}` : null;
  const lastSync = syncLabel(k.last_sync);

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Merchant Catalogues"
        subtitle="Create, manage and publish merchant catalogues (products, services, stays, experiences and more)."
        actions={
          <>
            <BulkImportButton
              imports={(detail?.imports ?? []).map((i) => ({
                merchant: detail!.merchant.name,
                source: i.source,
                status: i.status,
                when: i.created_at ? updated.format(new Date(i.created_at)) : '',
              }))}
            />
            <HeaderButton icon={Layers} href="/categories">
              Catalogue Templates
            </HeaderButton>
            <AddProductButton
              merchant={
                detail
                  ? {
                      id: detail.merchant.merchant_id,
                      name: detail.merchant.name,
                      canEdit: detail.can_edit,
                      sections: detail.sections.map((s) => ({ id: s.id, name: s.name })),
                    }
                  : null
              }
            />
          </>
        }
      />

      <DashCanvas>
        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Catalogues could not be loaded in full: {failed.message}
          </p>
        )}

        <DashKpiGrid>
          <DashKpi
            featured
            icon={Layers}
            label="Active Catalogues"
            value={count(k.active)}
            explain="Merchants that are live, shown in Discovery and have at least one item available. Nothing records how many there were before, so no change is shown."
          />
          <DashKpi
            icon={ShoppingBasket}
            label="Total Products / Items"
            value={count(k.items)}
            explain="Items in the catalogues listed, available or not. Deleted items leave no history, so no change is shown."
          />
          <DashKpi
            icon={Tag}
            label="Pending Review"
            value={count(k.pending_review)}
            explain="Changes merchants asked for that wait for staff to publish or turn down."
          />
          <DashKpi
            icon={AlertTriangle}
            label="Items Requiring Action"
            value={count(k.needs_action)}
            explain="Items with no price or no photo, open price drift flags and photo shoots not done."
          />
          <DashKpi
            icon={RefreshCw}
            label="Last Sync"
            value={null}
            explain="The last time a partner's own system changed an item through the NexG API."
          >
            <span className="mt-1 flex items-center gap-1.5 text-[0.875rem] font-bold">
              {lastSync ? (
                <>
                  <CircleCheck aria-hidden="true" className="h-4 w-4 fill-[#1E9E45] text-white" />
                  <span className="text-[#1E7B34]">{lastSync}</span>
                </>
              ) : (
                <span className="text-muted">No syncs yet</span>
              )}
            </span>
          </DashKpi>
        </DashKpiGrid>

        <GoldTabs
          label="Catalogue categories"
          active={group}
          tabs={GROUPS.map((g) => ({
            key: g.key,
            label: g.label,
            icon: g.icon,
            href: hrefWith('/merchants/catalogues', {
              tab: g.key === 'all' ? null : g.key,
              view: keep.view,
            }),
          }))}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:items-start">
          <DashCard
            title={`Merchant Catalogues (${count(overview.total) ?? 0})`}
            aside={
              <ViewToggle
                view={view}
                listHref={href({ view: null, page: null })}
                gridHref={href({ view: 'grid', page: null })}
              />
            }
          >
            {group === 'stays' ? (
              <p className="text-muted py-12 text-center font-semibold">
                Stays are not merchant catalogues. Rooms and units are listed under{' '}
                <Link href="/hotels" className="text-[#B57A00] underline underline-offset-4">
                  NEXG Stays
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(8rem,1fr))_auto]">
                  <DashSearch
                    value={q}
                    label="Search catalogues"
                    placeholder="Search by merchant or product…"
                    className="col-span-2 sm:col-span-1"
                  />
                  <DashSelect
                    label="Category"
                    param="category"
                    value={category}
                    options={overview.categories.map((c) => ({
                      value: c.key,
                      label: shortCategory(c.key, c.label),
                    }))}
                    className="min-w-0"
                  />
                  <DashSelect
                    label="Status"
                    param="status"
                    value={status}
                    options={CATALOGUE_STATES.map((s) => ({ value: s.key, label: s.label }))}
                    className="min-w-0"
                  />
                  <DashClear params={['q', 'category', 'status']} />
                </div>

                {view === 'list' ? (
                  <div className="relative mt-4 overflow-x-auto">
                    <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-left text-[0.875rem]">
                      <caption className="sr-only">Merchant catalogues</caption>
                      <thead>
                        <tr className="text-ink text-[0.8125rem] font-bold">
                          <th scope="col" className="bg-bg rounded-l-lg px-3 py-3">
                            Merchant / Outlet
                          </th>
                          <th scope="col" className="bg-bg px-2 py-3">
                            Category
                          </th>
                          <th scope="col" className="bg-bg px-2 py-3 text-right">
                            Products
                          </th>
                          <th scope="col" className="bg-bg px-2 py-3">
                            Status
                          </th>
                          <th scope="col" className="bg-bg px-2 py-3">
                            Last Updated
                          </th>
                          <th scope="col" className="bg-bg rounded-r-lg px-2 py-3 text-center">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="text-muted px-3 py-10 text-center font-semibold"
                            >
                              {q || category !== 'all' || status !== 'all'
                                ? 'Nothing matches these filters.'
                                : 'No catalogues here yet.'}
                            </td>
                          </tr>
                        ) : (
                          rows.map((r) => {
                            const on = r.merchant_id === selectedId;
                            const chip = catalogueChip(r.state);
                            const cell = `border-border border-b px-2 py-2.5 ${on ? 'bg-[#FFF8E6]' : ''}`;
                            return (
                              <tr key={r.merchant_id} aria-current={on ? 'true' : undefined}>
                                <td className={`${cell} w-full max-w-0 pl-3`}>
                                  <MerchantCell
                                    name={r.name}
                                    place={r.area}
                                    photoUrl={merchantPhotoUrl(r.photo_path)}
                                    href={selectHref(r.merchant_id)}
                                  />
                                </td>
                                <td className={cell}>
                                  <CategoryChip
                                    label={shortCategory(r.category_key, r.category_label)}
                                    icon={categoryIcon(r.category_key)}
                                  />
                                </td>
                                <td className={`${cell} text-right font-bold tabular-nums`}>
                                  {r.items.toLocaleString('en-KE')}
                                </td>
                                <td className={cell}>
                                  <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                                </td>
                                <td className={`${cell} whitespace-nowrap tabular-nums`}>
                                  {r.updated_at ? (
                                    <time
                                      dateTime={r.updated_at}
                                      title={updated.format(new Date(r.updated_at))}
                                    >
                                      {dayOnly.format(new Date(r.updated_at))}
                                      <span className="hidden min-[1600px]:inline">
                                        , {clockOnly.format(new Date(r.updated_at))}
                                      </span>
                                    </time>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className={cell}>
                                  <span className="flex items-center justify-center gap-2">
                                    <Link
                                      href={`/merchants/${r.merchant_id}`}
                                      aria-label={`Edit ${r.name} on its record`}
                                      title="Edit on the merchant record"
                                      className="text-ink rounded-md p-1 hover:text-[#B57A00]"
                                    >
                                      <Pencil
                                        aria-hidden="true"
                                        className="h-[1.05rem] w-[1.05rem]"
                                      />
                                    </Link>
                                    <CatalogueMenu
                                      merchantId={r.merchant_id}
                                      name={r.name}
                                      reviewHref={selectHref(r.merchant_id)}
                                      previewHref={preview(r.merchant_id, r.state)}
                                    />
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2 min-[1600px]:grid-cols-3">
                    {rows.length === 0 && (
                      <li className="text-muted col-span-full py-10 text-center font-semibold">
                        Nothing matches these filters.
                      </li>
                    )}
                    {rows.map((r) => {
                      const on = r.merchant_id === selectedId;
                      const chip = catalogueChip(r.state);
                      return (
                        <li
                          key={r.merchant_id}
                          className={`rounded-xl border p-3 ${on ? 'border-[#E5A800] bg-[#FFF8E6]' : 'border-border'}`}
                        >
                          <MerchantCell
                            name={r.name}
                            place={r.area}
                            photoUrl={merchantPhotoUrl(r.photo_path)}
                            href={selectHref(r.merchant_id)}
                          />
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <CategoryChip
                              label={shortCategory(r.category_key, r.category_label)}
                              icon={categoryIcon(r.category_key)}
                            />
                            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                          </div>
                          <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                            {r.items.toLocaleString('en-KE')} products · updated{' '}
                            {r.updated_at ? updated.format(new Date(r.updated_at)) : '—'}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Pagination
                  page={page}
                  size={size}
                  total={total}
                  noun="catalogues"
                  href={(p) => href({ page: p === 1 ? null : String(p), selected: selectedId })}
                />
                <p className="text-muted mt-3 text-[0.8125rem] font-semibold">
                  Price drift, photo shoots and imports across all merchants:{' '}
                  <Link
                    href="/merchants?tab=catalogue"
                    className="text-[#B57A00] underline underline-offset-4"
                  >
                    catalogue operations
                  </Link>
                  .
                </p>
              </>
            )}
          </DashCard>

          {detail ? (
            <CataloguePaneView
              detail={detail}
              pane={pane}
              paneHref={(p) =>
                href({ selected: detail.merchant.merchant_id, pane: p === 'catalogue' ? null : p })
              }
              previewHref={preview(detail.merchant.merchant_id, detail.merchant.state)}
            />
          ) : (
            <DashCard>
              <p className="text-muted py-16 text-center font-semibold">
                {detailRes?.error?.message ?? 'Choose a catalogue to see it here.'}
              </p>
            </DashCard>
          )}
        </div>
      </DashCanvas>
    </ConsoleShell>
  );
}

async function CataloguePaneView({
  detail,
  pane,
  paneHref,
  previewHref,
}: {
  detail: CatalogueDetail;
  pane: CataloguePane;
  paneHref: (pane: CataloguePane) => string;
  previewHref: string | null;
}) {
  const m = detail.merchant;
  const chip = catalogueChip(m.state);
  const photo = merchantPhotoUrl(m.photo_path);
  const CategoryIcon = categoryIcon(m.category_key);
  const visible = m.items > 0 ? Math.round((m.available / m.items) * 100) : null;

  /* Featured: the items marked popular, else the first with a photo. Photos are private; sign four. */
  const withPhoto = detail.items.filter((i) => i.photo_path);
  const featured = (
    detail.items.some((i) => i.highlighted) ? detail.items.filter((i) => i.highlighted) : withPhoto
  ).slice(0, 4);
  const paths = featured.map((i) => i.photo_path).filter((p): p is string => Boolean(p));
  const signed =
    paths.length > 0
      ? ((await createClient().storage.from('catalogue-images').createSignedUrls(paths, 300))
          .data ?? [])
      : [];
  const urlFor = new Map(
    signed.filter((s) => s.signedUrl && s.path).map((s) => [s.path!, s.signedUrl]),
  );

  return (
    <DashCard>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 items-start gap-4">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the merchant's own image address
            <img
              src={photo}
              alt=""
              referrerPolicy="no-referrer"
              className="h-[5.5rem] w-[6.75rem] shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-[5.5rem] w-[6.75rem] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFE9A8] to-[#F5C842] text-[1.5rem] font-extrabold text-[#5E4300]"
            >
              {m.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join('')}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-ink flex items-center gap-2 text-[1.375rem] font-extrabold leading-tight">
              <span className="truncate">{m.name}</span>
              {m.merchant_status === 'live' && (
                <BadgeCheck
                  aria-label="Live merchant"
                  className="h-6 w-6 shrink-0 fill-[#1E9E45] text-white"
                />
              )}
            </h2>
            <p className="text-muted mt-1.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold">
              <CategoryIcon aria-hidden="true" className="h-4 w-4 text-[#B57A00]" />
              {m.category_label}
            </p>
            <p className="text-muted mt-1 flex items-center gap-1.5 text-[0.8125rem] font-semibold">
              <MapPin aria-hidden="true" className="h-4 w-4" />
              {m.area ?? 'No branch yet'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip tone={chip.tone} className="px-3 py-1.5 text-[0.875rem]">
            {chip.label}
          </StatusChip>
          <CatalogueMenu merchantId={m.merchant_id} name={m.name} previewHref={previewHref} />
        </div>
      </div>

      <div className="mt-5">
        <PillTabs
          label="Catalogue"
          active={pane}
          tabs={PANES.map((p) => ({
            key: p.key,
            label: p.label,
            icon: p.icon,
            href: paneHref(p.key),
            count: p.key === 'products' ? m.items : null,
          }))}
        />
      </div>

      <div className="mt-4">
        {pane === 'catalogue' && (
          <div className="space-y-5">
            <section aria-labelledby="overview-title">
              <h3 id="overview-title" className="text-ink text-[0.9375rem] font-extrabold">
                Catalogue Overview
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Package, label: 'Products', value: m.items.toLocaleString('en-KE') },
                  { icon: Layers, label: 'Categories', value: m.sections.toLocaleString('en-KE') },
                  {
                    icon: SlidersHorizontal,
                    label: 'Modifiers',
                    value: detail.modifiers.toLocaleString('en-KE'),
                  },
                  { icon: Eye, label: 'Visible', value: visible == null ? '—' : `${visible}%` },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="border-border flex items-center gap-2.5 rounded-xl border p-3"
                  >
                    <s.icon
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 text-[#E5A800]"
                      strokeWidth={1.7}
                    />
                    <div>
                      <dd className="text-ink text-[1.25rem] font-extrabold tabular-nums leading-none">
                        {s.value}
                      </dd>
                      <dt className="text-muted mt-1 text-[0.75rem] font-semibold">{s.label}</dt>
                    </div>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="featured-title">
              <div className="flex items-center justify-between gap-3">
                <h3 id="featured-title" className="text-ink text-[0.9375rem] font-extrabold">
                  Featured Items
                </h3>
                <Link
                  href={paneHref('products')}
                  scroll={false}
                  className="text-[0.875rem] font-bold text-[#B57A00] underline underline-offset-4"
                >
                  Manage Items <span aria-hidden="true">→</span>
                </Link>
              </div>
              {featured.length === 0 ? (
                <p className="text-muted mt-2 text-[0.875rem] font-semibold">
                  No items are marked popular and none has a photo yet.
                </p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {featured.map((i) => {
                    const url = i.photo_path ? urlFor.get(i.photo_path) : null;
                    return (
                      <li key={i.id}>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- five-minute signed storage link
                          <img
                            src={url}
                            alt=""
                            className="aspect-[4/3] w-full rounded-xl object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="bg-bg text-muted flex aspect-[4/3] w-full items-center justify-center rounded-xl"
                          >
                            <Package className="h-6 w-6" />
                          </span>
                        )}
                        <p className="text-ink mt-1 truncate text-[0.8125rem] font-bold">
                          {i.name}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {(m.needs_fix > 0 || detail.price_flags.length > 0 || detail.photo_tasks > 0) && (
              <section aria-labelledby="attention-title" className="rounded-xl bg-[#FFF8E6] p-3">
                <h3 id="attention-title" className="text-ink text-[0.875rem] font-extrabold">
                  Needs attention
                </h3>
                <ul className="text-ink mt-1 space-y-0.5 text-[0.8125rem] font-semibold">
                  {m.needs_fix > 0 && (
                    <li>{m.needs_fix.toLocaleString('en-KE')} items with no price or no photo</li>
                  )}
                  {detail.price_flags.map((f) => (
                    <li key={f.id}>
                      Price drift on {f.item ?? 'an item'}: {ksh(f.app_price_kes)} here,{' '}
                      {ksh(f.observed_price_kes)} seen
                      {f.drift_pct != null ? ` (${f.drift_pct}%)` : ''}
                    </li>
                  ))}
                  {detail.photo_tasks > 0 && <li>{detail.photo_tasks} photo shoots not done</li>}
                </ul>
              </section>
            )}
          </div>
        )}

        {pane === 'products' && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-[0.875rem]">
              <caption className="sr-only">Products</caption>
              <thead>
                <tr className="text-muted text-[0.75rem] font-bold uppercase tracking-wide">
                  <th scope="col" className="py-2 pr-2">
                    Product
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Section
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Price
                  </th>
                  <th scope="col" className="py-2 pl-2">
                    Shown
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted py-6 text-center font-semibold">
                      No products yet.
                    </td>
                  </tr>
                ) : (
                  detail.items.map((i) => (
                    <tr key={i.id} className="border-border border-t">
                      <td className="py-2 pr-2 font-semibold">
                        {i.name}
                        {i.highlighted && (
                          <span className="ml-1.5 rounded bg-[#FFF1C7] px-1.5 py-0.5 text-[0.6875rem] font-bold text-[#9A6700]">
                            Popular
                          </span>
                        )}
                      </td>
                      <td className="text-muted px-2 py-2">{i.section ?? '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{ksh(i.price_kes)}</td>
                      <td className="py-2 pl-2">{i.available ? 'Yes' : 'Hidden'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {m.items > detail.items.length && (
              <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                Showing the first {detail.items.length} of {m.items.toLocaleString('en-KE')}.
              </p>
            )}
          </div>
        )}

        {pane === 'categories' && (
          <ul>
            {detail.sections.length === 0 && (
              <li className="text-muted py-3 font-semibold">No sections yet.</li>
            )}
            {detail.sections.map((s) => (
              <li
                key={s.id}
                className="border-border flex justify-between gap-3 border-b py-2.5 text-[0.875rem] last:border-b-0"
              >
                <span className="font-bold">{s.name}</span>
                <span className="text-muted font-semibold tabular-nums">
                  {s.items} items · {s.available} shown
                </span>
              </li>
            ))}
          </ul>
        )}

        {pane === 'modifiers' && (
          <ul>
            {detail.modifier_groups.length === 0 && (
              <li className="text-muted py-3 font-semibold">
                No modifiers. Merchants cannot set up choices and add-ons yet.
              </li>
            )}
            {detail.modifier_groups.map((g) => (
              <li
                key={g.name}
                className="border-border flex justify-between gap-3 border-b py-2.5 text-[0.875rem] last:border-b-0"
              >
                <span className="font-bold">{g.name}</span>
                <span className="text-muted font-semibold">
                  {g.options} options{g.required ? ' · required' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <PaneButton
          icon={Eye}
          href={previewHref ?? undefined}
          external
          disabled={!previewHref}
          title={
            previewHref
              ? 'Opens the catalogue as customers see it'
              : 'Only a published catalogue can be previewed on the site.'
          }
        >
          Preview Catalogue
        </PaneButton>
        <PaneButton
          icon={CalendarClock}
          disabled
          title="Scheduling catalogue changes is not built yet."
        >
          Schedule Update
        </PaneButton>
        <PublishChanges
          edits={detail.pending_edits.map((e) => ({
            id: e.id,
            kind: e.kind,
            item: e.item,
            price: e.price_kes,
            created: e.created_at ? updated.format(new Date(e.created_at)) : '',
          }))}
        />
      </div>
    </DashCard>
  );
}
