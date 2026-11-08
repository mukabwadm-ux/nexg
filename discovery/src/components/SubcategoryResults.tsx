import { useId } from 'react';
import { findCategory, findSubcategory } from '../data/taxonomy';
import type { DiscoveryProvider, DiscoveryQuery, MerchantResult, OfferingResult } from '../providers/DiscoveryProvider';
import { useProviderRead } from '../hooks/useProviderRead';
import { countLabel, windowMessage } from '../providers/readState';
import { observationFor } from '../observations/client';
import { ExperienceGrid, SavedNotice } from './ExperienceCard';
import { MerchantCard } from './MerchantCard';
import { StoreRow } from './MerchantInventoryRow';
import { CatalogSkeleton, CatalogState } from './CatalogState';
import { DiscoveryFilterBar } from './DiscoveryFilterBar';
import { Rail, RailHeading } from './Rail';
import { categoryTitle, offeringRoute } from './CategoryDiscovery';
import './discovery.css';

/** Page numbers around the current page, with the first and last always reachable: 1 … 4 5 6 … 12. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1]! > 1 ? ['gap' as const, page] : [page]));
}

/** The only L3 renderer, shared by every subcategory and nested option. */
export function SubcategoryResults({ query, provider, onChange, onOpen, onExperience, onTour }: {
  query: DiscoveryQuery;
  provider: DiscoveryProvider;
  onChange: (change: Partial<DiscoveryQuery>) => void;
  onOpen: (id: string, itemId?: string) => void;
  onExperience: (id: string, itemId?: string) => void;
  onTour: (id: string, itemId?: string) => void;
}) {
  const ids = useId();
  const category = findCategory(query.categoryId);
  const subcategory = findSubcategory(query.categoryId, query.subcategoryId);
  const option = subcategory?.options.find((entry) => entry.id === query.optionId);
  const tourResults = category?.id === 'travel-tours';
  const pageSize = query.engineRequest?.limit ?? (tourResults ? 12 : 24);
  const offeringResults = tourResults || (category?.id === 'experiences' && subcategory?.id !== 'experiences:photography');
  const catalog = useProviderRead<MerchantResult | OfferingResult>(JSON.stringify(query), (signal) => tourResults
    ? provider.getTourOfferings({ ...query, limit: pageSize }, signal) : offeringResults
    ? provider.getExperienceOfferings({ ...query, limit: pageSize }, signal)
    : provider.getMerchants({ ...query, limit: pageSize }, signal));
  // Offering pages show who runs them first: one plain merchant read for the same scope, on the first page only.
  const firstPage = !query.offset && !query.cursor;
  const hostScope: DiscoveryQuery = { categoryId: query.categoryId, subcategoryId: query.subcategoryId, optionId: query.optionId, search: query.search, area: query.area, openNow: query.openNow, sort: query.sort, limit: 24 };
  const showHosts = offeringResults && firstPage;
  const hosts = useProviderRead<MerchantResult | undefined>(showHosts ? `hosts:${JSON.stringify(hostScope)}` : 'hosts:none',
    (signal) => (showHosts ? provider.getMerchants(hostScope, signal) : Promise.resolve(undefined)));
  const merchants = catalog.value && 'merchants' in catalog.value ? catalog.value.merchants : undefined;
  const offerings = catalog.value && 'offerings' in catalog.value ? catalog.value.offerings : undefined;
  const scopeLabel = option?.label || subcategory?.label;
  const title = scopeLabel || (query.search ? `Results for “${query.search}”` : category ? categoryTitle(category) : 'All merchants');
  const hostsTitle = `${tourResults ? 'Operators' : 'Hosts'} ${scopeLabel ? `for ${scopeLabel}` : query.search ? `matching “${query.search}”` : category ? `in ${categoryTitle(category)}` : ''}`.trim();
  const [singular, plural] = tourResults ? ['trip', 'trips'] : offeringResults ? ['experience', 'experiences'] : ['merchant', 'merchants'];
  const count = catalog.loading ? 'Loading results…'
    : catalog.value?.mapping === 'unmapped' ? 'Nothing listed yet'
    : catalog.value ? `${countLabel(catalog.value, singular, plural)}${query.area ? ` in ${query.area}` : ''}`
    : catalog.error ? 'Count unavailable' : '';
  const page = catalog.value;
  const bounded = page?.semantics === 'bounded/v2';
  const next = page && (bounded ? Boolean(page.nextCursor) : page.hasMore);
  const currentPage = page ? Math.floor(page.offset / pageSize) + 1 : 1;
  const totalPages = page && page.semantics !== 'bounded/v2' ? Math.max(1, Math.ceil(page.total / pageSize)) : undefined;
  const restart = () => { provider.restart?.({ ...query, limit: pageSize }); onChange({ cursor: undefined, offset: 0 }); catalog.retry(); };
  const openOffering = (id: string, itemId?: string) => offeringRoute(offerings?.find((entry) => entry.merchant.id === id)?.merchant, { onTour, onExperience, onOpen })(id, itemId);
  const hostList = hosts.value?.merchants ?? [];
  const hostObservations = hosts.value?.semantics === 'bounded/v2' ? hosts.value.observations : undefined;

  return <section className="results-screen" aria-labelledby={`${ids}title`}>
    <header className="results-heading"><h1 id={`${ids}title`}>{title}</h1></header>
    <DiscoveryFilterBar query={query} provider={provider} onChange={onChange} />
    <div className="results-divider" />
    {showHosts && (hosts.loading || hostList.length > 0) && <section className="discovery-section results-hosts" aria-labelledby={`${ids}hosts`}>
      <RailHeading id={`${ids}hosts`} title={hostsTitle} />
      {hosts.loading ? <CatalogSkeleton layout="rail" shape="merchant" label={`Loading ${hostsTitle.toLocaleLowerCase('en-KE')}`} />
        : <Rail label={hostsTitle} className="rail--merchants rail--bleed">{hostList.map((merchant) => <MerchantCard key={merchant.id} merchant={merchant} mode="compact" onOpen={onOpen} observation={observationFor(provider, hostObservations, merchant.id)} />)}</Rail>}
    </section>}
    <div className="results-summary"><h2>Matching results</h2><p className="results-count" role="status" aria-live="polite">{count}</p></div>
    {offerings?.length ? <ExperienceGrid offerings={offerings} onOpen={openOffering} omitTag={scopeLabel} />
      : merchants?.length ? <div className="store-rows merchant-results-list">{merchants.map((merchant) => <StoreRow key={merchant.id} merchant={merchant}
        onOpen={(id, itemId) => (itemId ? offeringRoute(merchant, { onTour, onExperience, onOpen })(id, itemId) : onOpen(id))} observation={observationFor(provider, bounded ? page.observations : undefined, merchant.id)} />)}</div>
      : <CatalogState loading={catalog.loading} error={catalog.error} failure={catalog.failure} retry={catalog.retry} restart={restart}
        skeleton={offeringResults ? 'grid' : 'rows'} count={offeringResults ? 8 : 2} loadingLabel={`Loading ${title}`}
        emptyTitle={catalog.value?.mapping === 'unmapped' ? 'Nothing listed here yet' : bounded ? 'No matches found yet' : tourResults ? 'No trips found' : offeringResults ? 'No experiences found' : undefined}
        emptyText={catalog.value?.mapping === 'unmapped' ? 'Choose another type to keep exploring.' : bounded ? 'Try another search or filter. There may be more to find.' : undefined} />}
    {page && windowMessage(page) && <p className="status-message" role="status">{windowMessage(page)}</p>}
    {page && (page.offset > 0 || next) && <nav className="pagination" aria-label={tourResults ? 'Trip result pages' : offeringResults ? 'Experience result pages' : 'Merchant result pages'}>
      <button type="button" className="button" disabled={page.offset === 0} onClick={() => onChange({ cursor: bounded ? page.previousCursor : undefined, offset: Math.max(0, page.offset - pageSize) })}>Previous</button>
      {totalPages && totalPages > 1 ? <>
        <span className="pagination__pages">{pageWindow(currentPage, totalPages).map((entry, index) => entry === 'gap'
          ? <span key={`gap-${index}`} className="pagination__gap" aria-hidden="true">…</span>
          : <button type="button" key={entry} className="pagination__page" aria-current={entry === currentPage ? 'page' : undefined}
            aria-label={`Page ${entry}`} onClick={() => entry !== currentPage && onChange({ cursor: undefined, offset: (entry - 1) * pageSize })}>{entry}</button>)}</span>
        <span className="pagination__status">Page {currentPage} of {totalPages}</span>
      </> : <span>Page {currentPage}</span>}
      <button type="button" className="button" disabled={!next} onClick={() => onChange({ cursor: bounded ? page.nextCursor : undefined, offset: page.offset + pageSize })}>Next</button>
    </nav>}
    <SavedNotice />
  </section>;
}
