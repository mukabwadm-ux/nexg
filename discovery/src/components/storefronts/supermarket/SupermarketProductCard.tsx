import { memo } from 'react';
import type { CatalogItem } from '../../../providers/DiscoveryProvider';
import { cartable } from '../../cart/useStoreCart';
import { OfferingCard } from '../../cards/OfferingCard';

const noop = () => {};

/**
 * A grocery product in the card family's compact card (OfferingCard variant "compact", cards.css): a square
 * photo tile with the + on its corner, then the price and the name. The + adds one to the NexG cart in place
 * and opens into a − n + pill; a tap anywhere else opens the product. A product the cart can't take (no
 * listed price, or unavailable and not in the cart) offers a + that opens the product instead. Memoised, so
 * a change to one product's quantity redraws only that card in a store of thousands.
 */
export const SupermarketProductCard = memo(function SupermarketProductCard({ item, quantity, onOpen, onAdd, onRemove }: {
  item: CatalogItem;
  /** How many are in the cart; 0 when none. */
  quantity: number;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
  onRemove: (item: CatalogItem) => void;
}) {
  const steps = cartable(item) || quantity > 0;
  return <OfferingCard item={item} kind="product" variant="compact" saved={false} onSave={noop} onOpen={onOpen} quantity={quantity}
    {...(steps ? { onAdd, onRemove } : {})} />;
});
