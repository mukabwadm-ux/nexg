import { ArrowDown, ArrowLeft, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { formatPrice } from '../../../lib/formatPrice';
import { ImageWithFallback } from '../../ImageWithFallback';
import { MotorcycleIcon } from '../../icons/MotorcycleIcon';
import { RestaurantItemDetailDialog } from './RestaurantItemDetailDialog';
import { RestaurantMenuItemCard } from './RestaurantMenuItemCard';
import type { RestaurantDemoBasketLine } from './types';

interface RestaurantStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  itemMissing: boolean;
  onBack: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
}

/** Restaurant L4 presentation. Menu content stays grounded in the merchant API response. */
export function RestaurantStorefront({ merchant, activeItem, itemMissing, onBack, onSelectItem, onCloseItem }: RestaurantStorefrontProps) {
  const [search, setSearch] = useState('');
  const [previewBasket, setPreviewBasket] = useState<RestaurantDemoBasketLine[]>([]);
  const previewBasketCount = previewBasket.reduce((count, line) => count + line.quantity, 0);
  const previewBasketCurrency = previewBasket[0]?.currency ?? 'KES';
  const previewBasketTotal = previewBasket
    .filter((line) => line.currency === previewBasketCurrency)
    .reduce((total, line) => total + line.unitTotal * line.quantity, 0);
  const chickenBanner = merchant.items.find((item) => item.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ') === 'signature grilled chicken' && item.image);
  const deliveryEstimate = merchant.displayFacts?.deliveryTime
    ? { label: merchant.displayFacts.deliveryTime, demo: false }
    : merchant.deliveryTimeMin !== undefined
      ? {
        label: merchant.deliveryTimeMax !== undefined
          ? `${merchant.deliveryTimeMin}–${merchant.deliveryTimeMax} min`
          : `From ${merchant.deliveryTimeMin} min`,
        demo: true,
      }
      : undefined;
  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return merchant.items;
    return merchant.items.filter((item) => `${item.name} ${item.description ?? ''}`.toLocaleLowerCase().includes(query));
  }, [merchant.items, search]);

  return <section className="restaurant-store">
    <header className="restaurant-store__hero">
      <ImageWithFallback src={chickenBanner?.image ?? merchant.heroImage} alt="" width={1800} height={600} className="restaurant-store__hero-image" referrerPolicy="no-referrer" />
      <div className="restaurant-store__hero-shade" />
      <button type="button" className="restaurant-store__back" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> Back to discovery
      </button>
      <div className="restaurant-store__identity">
        {merchant.logoUrl && <ImageWithFallback src={merchant.logoUrl} alt="" width={112} height={112} className="restaurant-store__logo" referrerPolicy="no-referrer" />}
        <div className="restaurant-store__identity-copy">
          {(merchant.subcategory || merchant.category) && <p className="restaurant-store__category">{merchant.subcategory || merchant.category}</p>}
          <h1>{merchant.name}</h1>
          {merchant.address || merchant.area ? <p className="restaurant-store__location"><MapPin size={16} aria-hidden="true" />{merchant.address || merchant.area}</p> : null}
          {deliveryEstimate && <p className="restaurant-store__delivery" aria-label={`Delivery estimate ${deliveryEstimate.label}${deliveryEstimate.demo ? ', demo data' : ''}`}>
            <MotorcycleIcon width={20} height={20} />
            <span><strong>{deliveryEstimate.label}</strong><small>{deliveryEstimate.demo ? 'Demo estimate' : 'Delivery estimate'}</small></span>
          </p>}
        </div>
        <a className="restaurant-store__menu-cta" href="#restaurant-menu">Explore menu <ArrowDown size={17} aria-hidden="true" /></a>
      </div>
    </header>

    <div className="restaurant-store__menu-tools">
      <a className="restaurant-store__menu-link" href="#restaurant-menu" aria-current="page">Menu</a>
      <p className="restaurant-store__basket" aria-live="polite">
        {previewBasketCount > 0
          ? `Demo basket · ${previewBasketCount} ${previewBasketCount === 1 ? 'item' : 'items'} · ${formatPrice({ price: previewBasketTotal, currency: previewBasketCurrency })}`
          : 'Demo preview · no order will be submitted'}
      </p>
      <label className="restaurant-store__search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Search this menu</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search in ${merchant.name}…`} />
      </label>
    </div>

    {itemMissing && <p className="status-message" role="status">This item is no longer in the merchant’s current menu.</p>}

    <section className="restaurant-store__menu" id="restaurant-menu" aria-labelledby="restaurant-menu-title">
      <div className="restaurant-store__section-heading">
        <div>
          <h2 id="restaurant-menu-title">Menu</h2>
          <p>{search ? `${items.length} matching ${items.length === 1 ? 'item' : 'items'}` : `${merchant.items.length} ${merchant.items.length === 1 ? 'menu item' : 'menu items'}`}</p>
        </div>
      </div>
      {items.length > 0 ? <div className="restaurant-store__items">
        {items.map((item) => <RestaurantMenuItemCard key={item.id} item={item} onOpen={onSelectItem} />)}
      </div> : <div className="restaurant-store__empty" role="status">
        <Search size={22} aria-hidden="true" />
        <p>{search ? 'No menu items match your search.' : 'This merchant has no listed menu items.'}</p>
      </div>}
    </section>

    <RestaurantItemDetailDialog
      item={activeItem}
      merchant={merchant}
      onClose={onCloseItem}
      onAddToDemoBasket={(line) => setPreviewBasket((basket) => [...basket, line])}
    />
  </section>;
}
