import { useId } from 'react';
import type { DiscoveryCategory } from '../data/taxonomy';
import type { DiscoveryCollection, DiscoveryProvider, DiscoveryQuery, Merchant, ResultObservation } from '../providers/DiscoveryProvider';
import { useProviderRead } from '../hooks/useProviderRead';
import { isDirectExperienceMerchant } from '../data/experiencePresentation';
import { isTourOperator } from '../data/tourPresentation';
import { observationFor } from '../observations/client';
import { CategoryRail } from './CategoryRail';
import { CatalogSkeleton, CatalogState } from './CatalogState';
import { DiscoveryFilterBar } from './DiscoveryFilterBar';
import { ExperienceGrid, SavedNotice, interleaveOfferings } from './ExperienceCard';
import { MerchantCard } from './MerchantCard';
import { StoreRow } from './MerchantInventoryRow';
import { Rail, RailHeading } from './Rail';
import { TransferSearch } from './transfers/TransferSearch';
import './discovery.css';

/** A category's page title, worded the way its tile on the home page says it ("Restaurants & Food"). */
export function categoryTitle(category: Pick<DiscoveryCategory, 'id' | 'label'>): string {
  if (category.id === 'travel-tours') return 'Safaris & Tours';
  if (category.id === 'experiences') return 'Experiences & Events';
  if (category.id === 'tech-electronics') return 'Electronics';
  return category.label.replace(/\s+and\s+/gi, ' & ');
}

/** Route an offering to its own page: a trip, a ticketed experience, or the merchant's store. */
export function offeringRoute(merchant: Merchant | undefined, handlers: {
  onTour: (id: string, itemId?: string) => void; onExperience: (id: string, itemId?: string) => void; onOpen: (id: string, itemId?: string) => void;
}): (id: string, itemId?: string) => void {
  if (merchant && isTourOperator(merchant)) return handlers.onTour;
  if (merchant && isDirectExperienceMerchant(merchant)) return handlers.onExperience;
  return handlers.onOpen;
}

/**
 * Who runs the trips or hosts the experiences: every merchant in the collections once, taking one from each
 * collection in turn so the first screen shows several kinds.
 */
function hostsOf(collections: readonly DiscoveryCollection[]): { merchant: Merchant; observations?: ResultObservation[] }[] {
  const seen = new Set<string>();
  const hosts: { merchant: Merchant; observations?: ResultObservation[] }[] = [];
  const longest = Math.max(0, ...collections.map((collection) => collection.merchants.length));
  for (let index = 0; index < longest; index += 1) {
    for (const collection of collections) {
      const merchant = collection.merchants[index];
      if (merchant && !seen.has(merchant.id)) { seen.add(merchant.id); hosts.push({ merchant, observations: collection.observations }); }
    }
  }
  return hosts;
}

/**
 * L2: a category's types, then its merchants. Shops show each store with its own items in a rail; Safaris &
 * Tours and Experiences show their operators or hosts first, then each collection as a rail of trips or
 * experiences.
 */
type CategoryDiscoveryProps = {
  category: DiscoveryCategory; provider: DiscoveryProvider; query: DiscoveryQuery;
  onChange: (change: Partial<DiscoveryQuery>) => void;
  onExperience: (id: string, itemId?: string) => void;
  onTour: (id: string, itemId?: string) => void;
  onSubcategory: (id: string) => void; onOpen: (id: string, itemId?: string) => void;
  onViewAll: (query: DiscoveryQuery) => void;
};

export function CategoryDiscovery(props: CategoryDiscoveryProps) {
  const { category, query, provider, onOpen } = props;
  // Airport transfers are trip first (owner, 8 Nov 2026): the ride, then matching vehicles across operators.
  // The choice is made here, before any hooks, so switching between the two pages swaps whole components.
  if (category.id === 'airport-transfers' && !query.subcategoryId && !query.optionId && !query.search?.trim()) return <TransferSearch title={categoryTitle(category)} provider={provider} onOpen={onOpen} />;
  return <CategoryDiscoveryPage {...props} />;
}

function CategoryDiscoveryPage({ category, provider, query, onChange, onSubcategory, onOpen, onExperience, onTour, onViewAll }: CategoryDiscoveryProps) {
  const ids = useId();
  const catalog = useProviderRead(`category:${category.id}:${query.area ?? ''}:${query.sort ?? 'recommended'}:${query.openNow ? 'open' : 'all'}`, (signal) => provider.getCollections(category.id, { area: query.area, sort: query.sort, openNow: query.openNow }, signal));
  const tours = category.id === 'travel-tours';
  const offeringCategory = tours || category.id === 'experiences';
  const title = categoryTitle(category);
  const hostsTitle = tours ? 'Tour operators' : 'Hosts & organisers';
  const collections = catalog.value?.collections ?? [];
  const hosts = offeringCategory ? hostsOf(collections) : [];
  const merchantsById = new Map(collections.flatMap((collection) => collection.merchants.map((merchant) => [merchant.id, merchant] as const)));
  const openOffering = (id: string, itemId?: string) => offeringRoute(merchantsById.get(id), { onTour, onExperience, onOpen })(id, itemId);
  const viewAll = (collection: DiscoveryCollection) => {
    if (collection.viewAllQuery) onViewAll(collection.viewAllQuery);
    else if (collection.subcategoryId) onSubcategory(collection.subcategoryId);
  };

  return <div className={`category-page${offeringCategory ? ' category-page--offerings' : ''}`}>
    <header className="category-page-heading"><h1>{title}</h1></header>
    <div className="category-discovery__filters"><DiscoveryFilterBar query={query} provider={provider} onChange={onChange} scope="category" /></div>
    <section className="discovery-types" aria-labelledby={`${ids}types`}>
      <h2 id={`${ids}types`} className="discovery-types__title">Browse by type</h2>
      <CategoryRail items={category.subcategories} label={`${title} types`} onSelect={onSubcategory} />
    </section>

    {catalog.loading ? <>
      {offeringCategory && <section className="discovery-section" aria-label={hostsTitle}><RailHeading title={hostsTitle} /><CatalogSkeleton layout="rail" shape="merchant" label={`Loading ${hostsTitle.toLocaleLowerCase('en-KE')}`} /></section>}
      <section className="discovery-section" aria-label={`Loading ${title}`}><CatalogSkeleton layout={offeringCategory ? 'rail' : 'rows'} label={`Loading ${title}`} /></section>
    </> : catalog.error ? <CatalogState error={catalog.error} failure={catalog.failure} retry={catalog.retry} />
    : !collections.length ? <CatalogState emptyTitle="No stores here yet" emptyText={`${title} stores will show here as they join NexG.`} />
    : <>
      {hosts.length > 0 && <section className="discovery-section discovery-section--hosts" aria-labelledby={`${ids}hosts`}>
        <RailHeading id={`${ids}hosts`} title={hostsTitle} />
        <Rail label={hostsTitle} className="rail--merchants rail--bleed">
          {hosts.map(({ merchant, observations }) => <MerchantCard key={merchant.id} merchant={merchant} mode="compact" onOpen={onOpen} observation={observationFor(provider, observations, merchant.id)} />)}
        </Rail>
      </section>}
      {collections.map((collection, index) => {
        const headingId = `${ids}collection-${index}`;
        const offerings = offeringCategory ? interleaveOfferings(collection.merchants) : [];
        return <section key={collection.id} className="discovery-section" aria-labelledby={headingId}>
          <RailHeading id={headingId} title={collection.title} action={{ label: 'View all', onClick: () => viewAll(collection) }} />
          {!offeringCategory
            ? <div className="store-rows">{collection.merchants.map((merchant) => <StoreRow key={merchant.id} merchant={merchant} onOpen={onOpen} observation={observationFor(provider, collection.observations, merchant.id)} />)}</div>
            : offerings.length
              ? <ExperienceGrid layout="rail" offerings={offerings} preview previewCount={12} onOpen={openOffering} label={collection.title} railClassName="rail--bleed" omitTag={collection.title} />
              : <Rail label={collection.title} className="rail--merchants rail--bleed">{collection.merchants.map((merchant) => <MerchantCard key={merchant.id} merchant={merchant} mode="compact" onOpen={onOpen} />)}</Rail>}
        </section>;
      })}
    </>}
    {catalog.value?.partial && <p className="status-message" role="status">{catalog.value.reasonCodes?.includes('COLLECTION_DISABLED') ? 'Some lists aren’t published yet. Browse by type above to see everyone listed.' : 'Some lists couldn’t load just now. Browse by type above to see the rest.'}</p>}
    <SavedNotice />
  </div>;
}
