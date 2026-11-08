import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import type { OfferingKind } from '../../../data/offeringKinds';
import { ownDescription } from '../../../data/massagePresentation';
import { OfferingCard } from '../../cards/OfferingCard';

/**
 * One service in the appointment storefront: the card family's small card (cards.css) with the appointment
 * rules. The price shows only as the catalogue lists it, no duration or slot is ever implied, a description
 * shows only when the merchant wrote one, and a request kept on this device marks the card.
 */
export function MassageServiceCard({ item, merchant, kind, saved, requested, onSave, onOpen }: {
  item: CatalogItem;
  merchant: Pick<Merchant, 'name'>;
  kind: OfferingKind;
  saved: boolean;
  /** A booking request for this service is kept on this device. */
  requested: boolean;
  onSave: (id: string) => void;
  onOpen: (item: CatalogItem) => void;
}) {
  return <OfferingCard item={item} kind={kind} saved={saved} onSave={onSave} onOpen={onOpen}
    describe={Boolean(ownDescription(item, merchant))}
    tag={requested ? 'Request saved' : undefined}
    actionLabel={requested ? 'View request' : undefined} />;
}
