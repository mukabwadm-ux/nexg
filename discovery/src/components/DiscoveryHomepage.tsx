import { Clapperboard } from 'lucide-react';
import { homepageCategories } from '../data/taxonomy';
import type { DiscoveryProvider } from '../providers/DiscoveryProvider';
import { useProviderRead } from '../hooks/useProviderRead';
import { countLabel } from '../providers/readState';
import { CategoryRail } from './CategoryRail';
import { HomepageFeatureCarousel } from './HomepageFeatureCarousel';
import { MerchantCard } from './MerchantCard';
import { CatalogState } from './CatalogState';
import { Rail, RailHeading } from './Rail';
import './discovery.css';

/** L1: the categories, the featured ideas, then merchants to explore in one rail. */
export function DiscoveryHomepage({ area, provider, onCategory, onMovies, onOpen, onViewAll }: {
  area?: string; provider: DiscoveryProvider;
  onCategory: (id: string) => void;
  onMovies: () => void;
  onOpen: (id: string, itemId?: string) => void;
  onViewAll: () => void;
}) {
  const catalog = useProviderRead(`homepage-merchants:${area ?? ''}`, (signal) => provider.getMerchants({ area, limit: 12, sort: 'recommended' }, signal));
  const merchants = catalog.value?.merchants ?? [];
  const total = catalog.value && merchants.length ? `${countLabel(catalog.value)}${area ? ` in ${area}` : ''}` : undefined;

  return <div className="home-page">
    {/* The page is called Discovery on the website, where it sits next to Explore in the menu. */}
    <header className="category-page-heading discovery-home-heading">
      <h1>Discovery</h1>
      <button type="button" className="rail-heading__action home-movies-link" onClick={onMovies}><Clapperboard size={18} aria-hidden="true" />Movies</button>
    </header>
    <div className="home-categories"><CategoryRail items={homepageCategories} label="Main categories" onSelect={onCategory} /></div>
    <HomepageFeatureCarousel onCategory={onCategory} />
    <section className="discovery-section home-merchants" aria-labelledby="homepage-merchants-title">
      <RailHeading id="homepage-merchants-title" title="Merchants to explore" meta={total} action={{ label: 'View all', onClick: onViewAll }} />
      {merchants.length
        ? <Rail label="Merchants to explore" className="rail--merchants rail--bleed">{merchants.map((merchant) => <MerchantCard key={merchant.id} merchant={merchant} onOpen={onOpen} mode="compact" />)}</Rail>
        : <CatalogState loading={catalog.loading} error={catalog.error} failure={catalog.failure} retry={catalog.retry} skeleton="rail" shape="merchant" loadingLabel="Loading merchants"
          emptyTitle="No merchants here yet" emptyText={area ? `No merchants are listed in ${area} yet. Try another area.` : 'No merchants are listed yet. Check back soon.'} />}
    </section>
  </div>;
}
