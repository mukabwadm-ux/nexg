import { Plus } from 'lucide-react';
import type { CatalogItem } from '../../../providers/DiscoveryProvider';
import { formatPrice } from '../../../lib/formatPrice';
import { ImageWithFallback } from '../../ImageWithFallback';

interface RestaurantMenuItemCardProps {
  item: CatalogItem;
  onOpen: (item: CatalogItem) => void;
}

export function RestaurantMenuItemCard({ item, onOpen }: RestaurantMenuItemCardProps) {
  const price = formatPrice(item);
  return <article className="restaurant-dish-card" data-discovery-item={item.id}>
    <button type="button" className="restaurant-dish-card__main" onClick={() => onOpen(item)} aria-label={`View ${item.name} details`}>
      <ImageWithFallback src={item.image} alt="" width={420} height={280} className="restaurant-dish-card__image" loading="lazy" referrerPolicy="no-referrer" />
      <span className="restaurant-dish-card__body">
        <span className="restaurant-dish-card__name">{item.name}</span>
        {item.description && <span className="restaurant-dish-card__description">{item.description}</span>}
        {price && <span className="restaurant-dish-card__price">{price}</span>}
        {item.isAvailable === false && <span className="restaurant-dish-card__unavailable">Unavailable</span>}
      </span>
    </button>
    <button type="button" className="restaurant-dish-card__open" onClick={() => onOpen(item)} aria-label={`View ${item.name} details`} disabled={item.isAvailable === false}>
      <Plus size={20} aria-hidden="true" />
    </button>
  </article>;
}
