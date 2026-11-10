import type { CatalogItem } from '../../../providers/DiscoveryProvider';
import { kindPresentation, type OfferingKind } from '../../../data/offeringKinds';
import { cartBlock } from '../../../data/restaurantPresentation';
import { OfferingCard } from '../../cards/OfferingCard';

/**
 * One dish on the menu: the card family's small card (cards.css) with the restaurant's rules. The + adds one
 * to the cart and grows into a stepper in place; it never opens a sheet. A dish the cart can't take (no menu
 * price, or a choice the cart can't hold yet) offers "View dish" instead of a +.
 */
export function RestaurantMenuItemCard({ item, kind, saved, quantity, onSave, onOpen, onAdd, onRemove }: {
  item: CatalogItem;
  kind: OfferingKind;
  saved: boolean;
  /** How many are in the cart already. */
  quantity: number;
  onSave: (id: string) => void;
  onOpen: (item: CatalogItem) => void;
  onAdd: (item: CatalogItem) => void;
  onRemove: (item: CatalogItem) => void;
}) {
  const block = cartBlock(item);
  // An unavailable dish keeps its + (disabled by the card) so a dish already in the cart can still come out.
  const view = block !== undefined && block !== 'unavailable';
  return <OfferingCard item={item} kind={kind} saved={saved} onSave={onSave} onOpen={onOpen} quantity={quantity}
    {...(view ? { actionLabel: kindPresentation[kind].cardAction } : { onAdd, onRemove })} />;
}
