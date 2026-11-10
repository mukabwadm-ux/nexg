import type { CatalogItem } from '../providers/DiscoveryProvider';
import type { OfferingKind } from '../data/offeringKinds';
import { OfferingCard } from './cards/OfferingCard';
import { useSavedItems } from './ExperienceCard';

interface InventoryItemCardProps {
  item: CatalogItem;
  onOpen: (merchantId: string, itemId?: string) => void;
  /** The card kind from the merchant's journey (offeringKind). Products by default. */
  kind?: OfferingKind;
  /** @deprecated Item cards show only facts the item itself carries. Ignored. */
  deliveryTime?: string;
}

/**
 * An item from a merchant's inventory, drawn by the one card family (OfferingCard). Kept for existing imports;
 * new code uses OfferingCard directly.
 */
export function InventoryItemCard({ item, onOpen, kind = 'product' }: InventoryItemCardProps) {
  const { saved, toggle } = useSavedItems();
  return <OfferingCard item={item} kind={kind} saved={saved.has(item.id)} onSave={toggle} onOpen={(entry) => onOpen(entry.merchantId, entry.id)} />;
}
