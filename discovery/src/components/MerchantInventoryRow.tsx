import { useId, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { CatalogItem, Merchant, ObservationBinding } from '../providers/DiscoveryProvider';
import { useResultObservation } from '../hooks/useResultObservation';
import { offeringKind, transferCardAction, vehicleJourney } from '../data/offeringKinds';
import { catalogNaming, catalogSections } from '../data/catalogSections';
import { OfferingCard } from './cards/OfferingCard';
import { Rail, RailMore } from './Rail';
import { MerchantLogo, MerchantMeta, merchantFacts } from './MerchantCard';
import { useSavedItems } from './ExperienceCard';
import './discovery.css';

/** How many of a store's items its row shows before the "See all" tile. */
const ROW_ITEMS = 12;

interface StoreRowProps {
  merchant: Merchant;
  onOpen: (merchantId: string, itemId?: string) => void;
  observation?: ObservationBinding;
  /** @deprecated The row names a store's list in its own words (catalogNaming). Ignored. */
  inventoryLabel?: 'menu items' | 'catalog items';
  /** @deprecated Every store row shares one layout. Ignored. */
  cardMode?: 'food' | 'compact';
}

/**
 * Items in the row's order. Real order or booking history goes first and keeps its label ("Frequently
 * ordered", "Most booked", "New"), as Wolt does; without history the catalogue's own order stands.
 */
function rowItems(merchant: Merchant): { items: CatalogItem[]; tags: Map<string, string> } {
  const own = merchant.items.filter((item) => item.merchantId === merchant.id);
  const tags = new Map<string, string>();
  const first: CatalogItem[] = [];
  for (const section of catalogSections(merchant, own)) {
    if (section.source !== 'history') break;
    for (const item of section.items) if (!tags.has(item.id)) { tags.set(item.id, section.title); first.push(item); }
  }
  return { items: [...first, ...own.filter((item) => !tags.has(item.id))], tags };
}

/**
 * One store on a discovery page: its identity first (logo, name, type and place, "View store"), then a rail
 * of its own items in the one card family. A store without listed items keeps a single quiet line.
 */
export function StoreRow({ merchant, onOpen, observation }: StoreRowProps) {
  const observed = useResultObservation(observation);
  const { saved, toggle } = useSavedItems();
  const headingId = useId();
  const kind = offeringKind(merchant);
  const naming = catalogNaming(merchant);
  const { items, tags } = useMemo(() => rowItems(merchant), [merchant]);
  const facts = merchantFacts(merchant);
  const promotion = merchant.displayFacts?.promotion;
  const actionLabel = kind === 'vehicle' && vehicleJourney(merchant) === 'transfer' ? transferCardAction : undefined;
  const open = (itemId?: string) => { observed.detailOpened(); onOpen(merchant.id, itemId); };

  return <article ref={observed.ref} className="store-row" aria-labelledby={headingId} data-store-row={merchant.id}>
    <header className="store-row__header">
      <MerchantLogo merchant={merchant} className="store-row__logo" />
      <div className="store-row__identity">
        <h3 id={headingId} className="store-row__name">{merchant.name}</h3>
        {(merchant.subcategory || merchant.category || merchant.area || merchant.address || facts.length > 0 || promotion) && <p className="store-row__meta">
          <MerchantMeta merchant={merchant} />
          {facts.map((fact) => <span key={fact.key} className="store-row__fact">{fact.content}</span>)}
          {promotion && <span className="store-row__promotion">{promotion}</span>}
        </p>}
      </div>
      <button type="button" className="store-row__open" onClick={() => open()}>
        <span className="store-row__pill"><span className="store-row__label">View store</span><span className="sr-only">: {merchant.name}</span><ArrowRight size={16} strokeWidth={2} aria-hidden="true" /></span>
      </button>
    </header>
    {items.length > 0
      ? <Rail label={`${merchant.name}: ${naming.items}`} className="store-row__rail rail--bleed">
        {items.slice(0, ROW_ITEMS).map((item) => <OfferingCard key={item.id} item={item} kind={kind} saved={saved.has(item.id)} onSave={toggle}
          onOpen={(entry) => open(entry.id)} tag={tags.get(item.id)} actionLabel={actionLabel} />)}
        {items.length > ROW_ITEMS && <RailMore label={`See all ${naming.items}`} onClick={() => open()} />}
      </Rail>
      : <p className="store-row__empty">No {naming.items} listed yet.</p>}
  </article>;
}

/** The earlier name, kept so existing imports keep working. */
export const MerchantInventoryRow = StoreRow;
