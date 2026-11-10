import { useId, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CatalogItem, Merchant, ObservationBinding } from '../providers/DiscoveryProvider';
import { useResultObservation } from '../hooks/useResultObservation';
import { isListKind, kindPresentation, offeringKind, transferCardAction, vehicleJourney } from '../data/offeringKinds';
import { catalogNaming, catalogSections } from '../data/catalogSections';
import { detailPage } from '../data/itemSheet';
import { cartBlock } from '../data/restaurantPresentation';
import { isRetailStore } from '../data/supermarketPresentation';
import { OfferingCard } from './cards/OfferingCard';
import { OfferingSheet } from './cards/OfferingSheet';
import { CartSwitchDialog } from './cart/CartSheet';
import { MAX_CART_QUANTITY, useStoreCart, type CartOutcome } from './cart/useStoreCart';
import { Rail, RailMore } from './Rail';
import { MerchantLogo, MerchantMeta, merchantFacts } from './MerchantCard';
import { useSavedItems } from './ExperienceCard';
import './discovery.css';

/** How many of a store's items its row shows before the "See all" tile. */
const ROW_ITEMS = 12;

interface StoreRowProps {
  merchant: Merchant;
  /** Opens the store (with an item: the item in the store, or a trip's or event's own page). */
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
 * One store on a discovery page, as Wolt sets its store rows: the logo, the name with a small chevron (the whole
 * header opens the store), one muted line of type, place and confirmed facts, then a rail of the store's own
 * items in the one card family. Tapping an item opens the one item sheet right here, with "Order from" the store;
 * a product's or dish's + fills the NexG cart in place, as it does in the store. A store without listed items
 * keeps a single quiet line.
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
  const list = isListKind(kind);
  // Every product store's row uses the compact card its store uses (owner, 9 Nov 2026): a square photo, the price, then the name.
  const compact = isRetailStore(merchant);
  const cart = useStoreCart(merchant);
  const [selected, setSelected] = useState<CatalogItem>();
  const [said, setSaid] = useState('');
  const inCart = (item: CatalogItem) => cart.quantities.get(item.id) ?? 0;

  const openStore = (itemId?: string) => { observed.detailOpened(); onOpen(merchant.id, itemId); };
  const openItem = (item: CatalogItem) => { observed.detailOpened(); setSelected(item); };
  // Events and trips have pages of their own; the sheet's main button goes there.
  const openDetail = kind === 'activity' && detailPage(merchant) && selected ? () => onOpen(merchant.id, selected.id) : undefined;

  /** Where an add went, said once; "Start a new cart?" speaks for itself while an add waits on it. */
  const tell = (item: CatalogItem, outcome: CartOutcome, quantity: number) => {
    if (outcome !== 'waiting') setSaid(outcome === 'refused' ? `${item.name} couldn’t go in your cart.` : `${item.name}: ${quantity} in your cart.`);
  };
  const addOne = (item: CatalogItem) => tell(item, cart.add(item, undefined, 'card'), Math.min(MAX_CART_QUANTITY, inCart(item) + 1));
  const removeOne = (item: CatalogItem) => {
    const next = Math.max(0, inCart(item) - 1);
    cart.set(item.id, next);
    setSaid(next ? `${item.name}: ${next} in your cart.` : `${item.name} taken out of your cart.`);
  };
  const changeQuantity = (item: CatalogItem, quantity: number): CartOutcome | undefined => {
    if (quantity <= 0) { cart.set(item.id, 0); setSaid(`${item.name} taken out of your cart.`); return undefined; }
    const outcome = cart.add(item, quantity, 'sheet');
    tell(item, outcome, Math.min(MAX_CART_QUANTITY, quantity));
    return outcome;
  };
  const startNewCart = () => {
    const waiting = cart.pending;
    const outcome = cart.startNewCart();
    if (!waiting) return;
    tell(waiting.item, outcome, Math.min(MAX_CART_QUANTITY, waiting.quantity ?? 1));
    if (waiting.source === 'sheet' && outcome === 'added') setSelected(undefined);
  };

  const card = (item: CatalogItem) => {
    // Only an item the cart can take gets a + that adds; one it can't (no price, a required choice) opens instead:
    // in words on a standard card, from its + on a compact one, as in the store.
    const block = list ? cartBlock(item) : undefined;
    const viewOnly = block !== undefined && block !== 'unavailable';
    return <OfferingCard key={item.id} item={item} kind={kind} saved={saved.has(item.id)} onSave={toggle} onOpen={openItem} tag={tags.get(item.id)}
      actionLabel={viewOnly && !compact ? kindPresentation[kind].cardAction : actionLabel} variant={compact ? 'compact' : 'standard'}
      {...(list && !viewOnly ? { quantity: inCart(item), onAdd: addOne, onRemove: removeOne } : {})} />;
  };

  return <article ref={observed.ref} className="store-row" aria-labelledby={headingId} data-store-row={merchant.id}>
    <header className="store-row__header">
      <MerchantLogo merchant={merchant} className="store-row__logo" />
      <div className="store-row__identity">
        <h3 id={headingId} className="store-row__name">
          <button type="button" className="store-row__open" onClick={() => openStore()}>
            <span className="store-row__title">{merchant.name}</span><ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </h3>
        {(merchant.subcategory || merchant.category || merchant.area || merchant.address || facts.length > 0 || promotion) && <p className="store-row__meta">
          <MerchantMeta merchant={merchant} />
          {facts.map((fact) => <span key={fact.key} className="store-row__fact">{fact.content}</span>)}
          {promotion && <span className="store-row__promotion">{promotion}</span>}
        </p>}
      </div>
    </header>
    {items.length > 0
      ? <Rail label={`${merchant.name}: ${naming.items}`} className={`store-row__rail${compact ? ' store-row__rail--compact' : ''} rail--bleed`}>
        {items.slice(0, ROW_ITEMS).map(card)}
        {items.length > ROW_ITEMS && <RailMore label={`See all ${naming.items}`} onClick={() => openStore()} />}
      </Rail>
      : <p className="store-row__empty">No {naming.items} listed yet.</p>}

    {selected && <OfferingSheet key={selected.id} context="discovery" merchant={merchant} item={selected} kind={kind} saved={saved.has(selected.id)} onSave={toggle}
      onClose={() => setSelected(undefined)} onOpenStore={openStore} onOpenDetail={openDetail}
      {...(list ? { listed: inCart(selected), onList: changeQuantity } : {})} />}
    {cart.pending && <CartSwitchDialog current={cart.otherStore ?? 'another store'} onKeep={cart.keepCurrentCart} onStart={startNewCart} />}
    <p className="sr-only" role="status">{said}</p>
  </article>;
}

/** The earlier name, kept so existing imports keep working. */
export const MerchantInventoryRow = StoreRow;
