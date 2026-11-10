import { useEffect, useRef, useState } from 'react';
import { findCategory } from './data/taxonomy';
import type { DiscoveryQuery } from './providers/DiscoveryProvider';
import { createDiscoveryProvider } from './providers/providerFactory';
import { lazyEngineProvider } from './providers/lazyEngineProvider';
import { applyQueryChange, parseRoute, routeDepartment, routeUrl, type RouteState } from './routing/discoveryRoute';
import { platformMerchantProvider } from './providers/platformMerchantProvider';
import { useProviderRead } from './hooks/useProviderRead';
import { DiscoveryHomepage } from './components/DiscoveryHomepage';
import { CategoryDiscovery } from './components/CategoryDiscovery';
import { SubcategoryResults } from './components/SubcategoryResults';
import { Storefront } from './components/Storefront';
import { DiscoveryHeader } from './components/DiscoveryHeader';
import { ExperienceDetail } from './components/ExperienceDetail';
import { TourDetail } from './components/TourDetail';

const provider = createDiscoveryProvider(import.meta.env.VITE_DISCOVERY_PROVIDER, { platform: platformMerchantProvider, engine: lazyEngineProvider });
const readRoute = () => parseRoute(location.search, history.state);

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState(route.search ?? '');
  const scrollPositions = useRef(new Map<string, number>());
  const pendingScroll = useRef<number | undefined>(undefined);
  const routeKey = useRef(routeUrl(route));
  
  const areas = useProviderRead('header-areas', (signal) => provider.getAreas(signal));
  const category = findCategory(route.categoryId);
  const isResults = route.view === 'results' || Boolean(route.search) || Boolean(route.categoryId && !category);
  const isCategoryDiscovery = Boolean(category) && !isResults && !route.merchantId;

  useEffect(() => {
    history.replaceState({ ...history.state, discovery: true }, '', routeUrl(route));
    const restore = () => {
      scrollPositions.current.set(routeKey.current, window.scrollY);
      const next = readRoute();
      routeKey.current = routeUrl(next);
      pendingScroll.current = scrollPositions.current.get(routeKey.current) ?? 0;
      setRoute(next);
      setSearch(next.search ?? '');
      window.scrollTo(0, pendingScroll.current);
    };
    const contentReady = () => {
      if (pendingScroll.current !== undefined) {
        window.scrollTo(0, pendingScroll.current);
        pendingScroll.current = undefined;
      }
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('discovery:content-ready', contentReady);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('discovery:content-ready', contentReady); };
  }, []);

  const navigate = (next: RouteState, replace = false, preserveScroll = false) => {
    scrollPositions.current.set(routeKey.current, window.scrollY);
    const url = routeUrl(next);
    const entryState = { discovery: true, fromDiscovery: true, discoveryRequest: next.engineRequest };
    if (replace) history.replaceState({ ...history.state, ...entryState }, '', url);
    else history.pushState(entryState, '', url);
    routeKey.current = url;
    pendingScroll.current = undefined;
    setRoute(next);
    setSearch(next.search ?? '');
    if (!preserveScroll) window.scrollTo(0, 0);
  };
  const openMerchant = (merchantId: string, itemId?: string) => navigate({ ...route, view: (route.view === 'experience' || route.view === 'tour') ? (route.subcategoryId || route.search ? 'results' : undefined) : route.view, merchantId, itemId, operatorSearch: route.merchantId === merchantId ? route.operatorSearch : undefined, operatorOffset: route.merchantId === merchantId ? route.operatorOffset : undefined });
  const openExperience = (merchantId: string, itemId?: string, replace = false) => itemId ? navigate({ ...route, categoryId: 'experiences', subcategoryId: route.categoryId === 'experiences' ? route.subcategoryId : undefined, optionId: route.categoryId === 'experiences' ? route.optionId : undefined, merchantId, itemId, view: 'experience' }, replace) : openMerchant(merchantId);
  const openTour = (merchantId: string, itemId?: string, replace = false) => itemId ? navigate({ ...route, categoryId: 'travel-tours', subcategoryId: route.categoryId === 'travel-tours' ? route.subcategoryId : undefined, optionId: route.categoryId === 'travel-tours' ? route.optionId : undefined, merchantId, itemId, operatorSearch: route.merchantId === merchantId ? route.operatorSearch : undefined, operatorOffset: route.merchantId === merchantId ? route.operatorOffset : undefined, view: 'tour' }, replace) : openMerchant(merchantId);
  const changeFilters = (change: Partial<DiscoveryQuery>) => navigate({ ...applyQueryChange(route, change), view: 'results', merchantId: undefined, itemId: undefined, operatorSearch: undefined, operatorOffset: undefined });
  const changeCategoryFilters = (change: Partial<DiscoveryQuery>) => {
    const hasSubcategory = Boolean(change.subcategoryId);
    const hasSearch = Boolean(change.search?.trim());
    navigate({
      ...applyQueryChange(route, change),
      view: hasSubcategory || hasSearch ? 'results' : undefined,
      offset: 0,
      merchantId: undefined,
      itemId: undefined,
      operatorSearch: undefined,
      operatorOffset: undefined,
    });
  };
  const backFromMerchant = () => {
    if (history.state?.fromDiscovery) history.back();
    else navigate({ ...route, view: (route.view === 'experience' || route.view === 'tour') ? (route.subcategoryId || route.search ? 'results' : undefined) : route.view, merchantId: undefined, itemId: undefined, operatorSearch: undefined, operatorOffset: undefined });
  };

  return <div className={`discovery-app${category?.id === 'travel-tours' ? ' discovery-app--tours' : ''}`}>
    <DiscoveryHeader tourSearch={category?.id === 'travel-tours'} experienceSearch={category?.id === 'experiences' && route.subcategoryId !== 'experiences:photography'} search={search} area={route.area} areas={areas.value ?? []} areasUnavailable={areas.loading || areas.error} onHome={() => navigate({ area: route.area })} onSearchChange={setSearch} onSearch={() => navigate({ ...applyQueryChange(route, { search: search.trim() || undefined }), view: 'results', merchantId: undefined, itemId: undefined, operatorSearch: undefined, operatorOffset: undefined })} onAreaChange={(area) => navigate({ ...applyQueryChange(route, { area }) })} />
    <main className={`discovery-main${isCategoryDiscovery ? ' discovery-main--category' : ''}`}>
      {route.view === 'tour' && route.merchantId && route.itemId ? <TourDetail key={`${route.merchantId}:${route.itemId}`} merchantId={route.merchantId} itemId={route.itemId} provider={provider} onBack={backFromMerchant} onOperator={openMerchant} onOpen={openTour} /> : route.view === 'experience' && route.merchantId && route.itemId ? <ExperienceDetail key={`${route.merchantId}:${route.itemId}`} merchantId={route.merchantId} itemId={route.itemId} provider={provider} onBack={backFromMerchant} onMerchant={openMerchant} onOpen={openExperience} /> : route.merchantId ? <Storefront onHome={() => navigate({ area: route.area })} operatorSearch={route.operatorSearch} operatorOffset={route.operatorOffset} onOperatorChange={(operatorSearch, operatorOffset) => navigate({ ...route, operatorSearch: operatorSearch || undefined, operatorOffset }, true, true)} onTour={openTour} onExperience={openExperience} merchantId={route.merchantId} itemId={route.itemId} categoryId={route.categoryId} provider={provider} onBack={backFromMerchant} department={routeDepartment(route)} onDepartment={(id) => navigate({ ...route, department: id && route.merchantId ? { merchantId: route.merchantId, id } : undefined }, false, true)} /> : isResults ? <SubcategoryResults query={route} provider={provider} onChange={changeFilters} onOpen={openMerchant} onExperience={openExperience} onTour={openTour} /> : category ? <CategoryDiscovery onViewAll={(query) => navigate({ ...query, view: 'results' })} onTour={openTour} onExperience={openExperience} category={category} provider={provider} query={route} onChange={changeCategoryFilters} onSubcategory={(subcategoryId) => navigate({ ...applyQueryChange(route, { subcategoryId, optionId: undefined }), view: 'results' })} onOpen={openMerchant} /> : <DiscoveryHomepage area={route.area} provider={provider} onCategory={(categoryId) => navigate({ categoryId, area: route.area })} onOpen={openMerchant} onViewAll={() => navigate({ area: route.area, view: 'results' })} />}
    </main>
    <footer className="discovery-footer">Discovery</footer>
  </div>;
}
