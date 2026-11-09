import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { CatalogItem, DiscoveryProvider, Merchant } from '../providers/DiscoveryProvider';
import { GenericStorefront } from './storefronts/GenericStorefront';
import { RestaurantStorefront } from './storefronts/restaurant/RestaurantStorefront';
import './storefronts/restaurant/storefront.css';
import { isDirectExperienceMerchant } from '../data/experiencePresentation';
import { isTourOperator } from '../data/tourPresentation';
import { TourOperatorStorefront } from './storefronts/TourOperatorStorefront';
import { isRetailStore } from '../data/supermarketPresentation';
import { SupermarketStorefront } from './storefronts/supermarket/SupermarketStorefront';
import { isAppointmentProvider } from '../data/massagePresentation';
import { MassageStorefront } from './storefronts/massage/MassageStorefront';
import { CatalogState } from './CatalogState';
import { failureFrom, type ReadFailure } from '../providers/readState';

interface StorefrontProps {
  merchantId: string;
  provider: DiscoveryProvider;
  onBack: () => void;
  onHome: () => void;
  itemId?: string;
  categoryId?: string;
  onExperience: (merchantId: string, itemId?: string, replace?: boolean) => void;
  onTour: (merchantId: string, itemId?: string, replace?: boolean) => void;
  operatorSearch?: string;
  operatorOffset?: number;
  onOperatorChange: (search: string, offset: number) => void;
  /** A retail store's open department, from the page address. */
  department?: string;
  /** Opens a retail store's department (undefined: the store's home) as a new step in the page's history. */
  onDepartment?: (id?: string) => void;
}

/** L4 reads a platform merchant by its original identity and selects a category presentation. */
export function Storefront({ merchantId, provider, onBack, onHome, itemId, categoryId, onExperience, onTour, operatorSearch, operatorOffset, onOperatorChange, department, onDepartment }: StorefrontProps) {
  const [merchant, setMerchant] = useState<Merchant>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<ReadFailure>();
  const [retry, setRetry] = useState(0);
  const [activeItem, setActiveItem] = useState<CatalogItem>();
  const [itemMissing, setItemMissing] = useState(false);
  const experienceNavigation = useRef(onExperience);
  experienceNavigation.current = onExperience;
  const tourNavigation = useRef(onTour);
  tourNavigation.current = onTour;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(undefined);
    setMerchant(undefined);
    setActiveItem(undefined);
    setItemMissing(false);
    provider.getMerchant(merchantId, controller.signal)
      .then((record) => {
        if (controller.signal.aborted) return;
        if (itemId && isTourOperator(record)) {
          tourNavigation.current(record.id, itemId, true);
          return;
        }
        if (itemId && isDirectExperienceMerchant(record)) {
          experienceNavigation.current(record.id, itemId, true);
          return;
        }
        setMerchant(record);
        if (itemId) {
          const item = record.items.find((entry) => entry.id === itemId);
          setActiveItem(item);
          setItemMissing(!item);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(failureFrom(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [merchantId, provider, retry, itemId]);

  useEffect(() => {
    if (!loading) window.dispatchEvent(new Event('discovery:content-ready'));
  }, [loading, merchant]);

  const isRestaurant = Boolean(
    categoryId === 'restaurants-food'
    || merchant?.categoryId === 'restaurants-food'
    || merchant?.subcategoryId?.startsWith('restaurants-food_')
    || merchant?.category?.toLocaleLowerCase().includes('restaurant'),
  );
  const closeItem = () => setActiveItem(undefined);
  const selectItem = (item: CatalogItem) => { setItemMissing(false); setActiveItem(item); };
  // Every product store (groceries, electronics, pharmacy, fashion, drinks…) uses the retail storefront (owner, 9 Nov 2026).
  const retail = merchant && isRetailStore(merchant);
  const massage = merchant && isAppointmentProvider(merchant);

  // Every storefront draws its own back pill in its hero; only a store that failed to load needs one here.
  return <section className="storefront" aria-busy={loading}>
    {loading && <div className="store-loading" role="status">
      <div className="store-hero store-hero--loading" aria-hidden="true" />
      <div className="loading-grid" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index} />)}</div>
      <span className="sr-only">Loading the store…</span>
    </div>}
    {failed && <>
      <button type="button" className="store-back" onClick={onBack}><ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />Back</button>
      <CatalogState failure={failed} retry={() => setRetry(value => value + 1)} />
    </>}
    {merchant && (massage ? <MassageStorefront key={merchant.id} merchant={merchant} activeItem={activeItem} itemMissing={itemMissing} onBack={onBack} onHome={onHome} onSelectItem={selectItem} onCloseItem={closeItem} /> : retail ? <SupermarketStorefront key={merchant.id} merchant={merchant} activeItem={activeItem} itemMissing={itemMissing} onBack={onBack} onHome={onHome} onSelectItem={selectItem} onCloseItem={closeItem} department={department} onDepartment={onDepartment} /> : isTourOperator(merchant) ? <TourOperatorStorefront key={merchant.id} merchant={merchant} onBack={onBack} onOpen={onTour} search={operatorSearch} offset={operatorOffset} onChange={onOperatorChange} /> : isRestaurant
      ? <RestaurantStorefront
        key={merchant.id}
        merchant={merchant}
        activeItem={activeItem}
        itemMissing={itemMissing}
        onBack={onBack}
        onSelectItem={selectItem}
        onCloseItem={closeItem}
      />
      : <GenericStorefront key={merchant.id} merchant={merchant} activeItem={activeItem} itemMissing={itemMissing} onBack={onBack}
        onSelectItem={(item) => isDirectExperienceMerchant(merchant) ? onExperience(merchant.id, item.id) : selectItem(item)} onCloseItem={closeItem} />)}
  </section>;
}
