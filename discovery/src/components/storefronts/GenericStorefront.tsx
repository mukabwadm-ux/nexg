import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Bike, CalendarCheck, Car, ClipboardCheck, ClipboardList, Clock3, Flame, Info, MapPin, Package, PackageOpen, Percent, Search, Sparkles, Star, Ticket, Timer } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../providers/DiscoveryProvider';
import { catalogNaming, catalogSections, searchSections, sectionAnchor } from '../../data/catalogSections';
import { isBikeHire, isListKind, offeringKind, subcategoryOf, transferCardAction, transferDirection, vehicleJourney } from '../../data/offeringKinds';
import { localDateKey } from '../../data/massagePresentation';
import { formatPrice } from '../../lib/formatPrice';
import { OfferingCard } from '../cards/OfferingCard';
import { OfferingSheet, type KeptRequest, type OfferingAnswers } from '../cards/OfferingSheet';
import { cleanAnswers } from '../../data/itemSheet';
import { CartPill } from '../cart/CartPill';
import { CartSheet, CartSwitchDialog } from '../cart/CartSheet';
import { cartable, MAX_CART_QUANTITY, useStoreCart, type CartOutcome } from '../cart/useStoreCart';
import { RentalTripPanel, TransferTripPanel, emptyRentalTrip, emptyTransferTrip, transferReady, transferSummary, tripReady, tripSummary } from '../cards/RentalTripPanel';
import { SectionNav, showStoreBar } from './SectionNav';
import { StoreHero } from './StoreHero';

interface GenericStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  /** A linked item this store no longer lists. */
  itemMissing?: boolean;
  /** The hero's back pill. */
  onBack: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
}

/*
 * What a shopper keeps for one store on this device: saved hearts and requests. The website can't send
 * requests yet, so they stay here and the page says so. Products and dishes go in the NexG cart instead
 * (src/components/cart, "nexg.cart.v1"): one store per cart, the same cart the website checks out.
 */
interface Shelf { saved: string[]; requests: Record<string, KeptRequest> }
const shelfKey = (merchantId: string) => `nexg.discovery.shelf.v1:${merchantId}`;

function deviceStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

// Stored answers are read with the item sheet's own cleaner (itemSheet.ts), the one every request shares.
function readShelf(merchant: Merchant, today: string): Shelf {
  const shelf: Shelf = { saved: [], requests: {} };
  try {
    const raw = deviceStorage()?.getItem(shelfKey(merchant.id));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (!parsed || typeof parsed !== 'object') return shelf;
    const listed = new Set(merchant.items.filter((item) => item.merchantId === merchant.id).map((item) => item.id));
    const { saved, requests } = parsed as Record<string, unknown>;
    if (Array.isArray(saved)) shelf.saved = [...new Set(saved.filter((id): id is string => typeof id === 'string' && listed.has(id)))];
    if (requests && typeof requests === 'object') {
      for (const [id, value] of Object.entries(requests as Record<string, unknown>)) {
        if (!listed.has(id) || !value || typeof value !== 'object') continue;
        const stored = value as Record<string, unknown>;
        const answers = cleanAnswers(stored.answers);
        // A request for a day that has passed is no longer a request.
        if (answers.date && answers.date < today) continue;
        shelf.requests[id] = { answers, savedAt: typeof stored.savedAt === 'string' ? stored.savedAt : '' };
      }
    }
  } catch {
    // Blocked or unreadable storage starts the store empty.
  }
  return shelf;
}

function writeShelf(merchantId: string, shelf: Shelf) {
  try {
    const storage = deviceStorage();
    if (!storage) return;
    if (shelf.saved.length || Object.keys(shelf.requests).length) storage.setItem(shelfKey(merchantId), JSON.stringify(shelf));
    else storage.removeItem(shelfKey(merchantId));
  } catch {
    // Full or blocked storage keeps the shelf for this visit only.
  }
}

const kindIcon = { product: Package, dish: Package, service: ClipboardList, activity: Ticket, task: ClipboardList, vehicle: Car } as const;

/**
 * The shared L4 for every store without its own designed storefront: electronics, fashion, flowers, drinks,
 * pharmacy, laundry, concierge, car hire, transfers and more. The store hero, then (for car hire and
 * transfers) the trip first, then the store's own list in sections under a sticky, Wolt-style section bar
 * with search. Products and dishes go in the NexG cart ("View cart"); services, tasks, vehicles and activities are
 * requests kept on this device, since they aren't purchases. Only catalogue facts are shown; nothing is paid for here.
 */
export function GenericStorefront({ merchant, activeItem, itemMissing = false, onBack, onSelectItem, onCloseItem }: GenericStorefrontProps) {
  const kind = useMemo(() => offeringKind(merchant), [merchant]);
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const items = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, items), [merchant, items]);
  const [search, setSearch] = useState('');
  const term = search.trim();
  const shown = useMemo(() => searchSections(sections, term), [sections, term]);
  const matches = shown.reduce((sum, section) => sum + section.items.length, 0);
  const catalog = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');

  // Products and dishes: Derrick NexG's web cart, one store at a time.
  const list = isListKind(kind);
  const cart = useStoreCart(merchant);
  const [cartOpen, setCartOpen] = useState(false);

  // Everything else: saved hearts and requests, kept on this device.
  const [shelf, setShelf] = useState<Shelf>(() => readShelf(merchant, localDateKey()));
  const savedIds = useMemo(() => new Set(shelf.saved), [shelf.saved]);
  const updateShelf = (change: (current: Shelf) => Shelf) => setShelf((current) => { const next = change(current); writeShelf(merchant.id, next); return next; });

  // Car and bike hire, and transfers, put the trip first (owner, 8 Nov 2026).
  const journey = kind === 'vehicle' ? vehicleJourney(merchant) : undefined;
  const rental = journey === 'rental';
  const transfer = journey === 'transfer';
  const bike = isBikeHire(merchant);
  const [trip, setTrip] = useState(emptyRentalTrip);
  const [ride, setRide] = useState(emptyTransferTrip);
  const [planned, setPlanned] = useState(false);
  const tripPlanned = planned && (rental ? tripReady(trip) : transfer ? transferReady(ride) : false);
  const tripStarted = rental && Boolean(trip.pickupPlace.trim() || trip.dates.from);
  const rideStarted = transfer && Boolean(ride.pickup.trim() || ride.dropoff.trim() || ride.date || ride.time);

  const open = activeItem && activeItem.merchantId === merchant.id && items.some((item) => item.id === activeItem.id) ? activeItem : undefined;
  const requested = items.filter((item) => shelf.requests[item.id])
    .sort((a, b) => shelf.requests[b.id]!.savedAt.localeCompare(shelf.requests[a.id]!.savedAt));
  const basket = list ? cart.count > 0 : requested.length > 0;

  /** Brings the top of the list (the section bar) up to where it pins: under the site header, or docked on phones. */
  const showCatalog = (onlyWhenPast: boolean) => showStoreBar(catalog.current, { onlyWhenPast, smooth: !onlyWhenPast });
  const changeSearch = (value: string) => { setSearch(value); showCatalog(true); };
  const showVehicles = () => { setPlanned(true); requestAnimationFrame(() => showCatalog(false)); };

  /** Says where an add went; "Start a new cart?" speaks for itself while an add waits on it. */
  const said = (item: CatalogItem, outcome: CartOutcome, quantity: number) => {
    if (outcome !== 'waiting') setAnnouncement(outcome === 'refused' ? `${item.name} can’t go in the cart.` : `${item.name}: ${quantity} in your cart.`);
  };
  const inCart = (item: CatalogItem) => cart.quantities.get(item.id) ?? 0;
  const addOne = (item: CatalogItem) => {
    // Without a price in shillings an item can't go in the cart, so its + opens it instead.
    if (!cartable(item)) { onSelectItem(item); return; }
    said(item, cart.add(item), Math.min(MAX_CART_QUANTITY, inCart(item) + 1));
  };
  const removeOne = (item: CatalogItem) => {
    const next = Math.max(0, inCart(item) - 1);
    cart.set(item.id, next);
    setAnnouncement(next ? `${item.name}: ${next} in your cart.` : `${item.name} taken out of your cart.`);
  };
  /** From the item sheet: a chosen quantity; 0 takes it out. The outcome tells the sheet whether to close. */
  const changeQuantity = (item: CatalogItem, quantity: number): CartOutcome | undefined => {
    if (quantity <= 0) { cart.set(item.id, 0); setAnnouncement(`${item.name} taken out of your cart.`); return undefined; }
    const outcome = cart.add(item, quantity, 'sheet');
    said(item, outcome, Math.min(MAX_CART_QUANTITY, quantity));
    return outcome;
  };
  const startNewCart = () => {
    const waiting = cart.pending;
    const outcome = cart.startNewCart();
    if (!waiting) return;
    said(waiting.item, outcome, Math.min(MAX_CART_QUANTITY, waiting.quantity ?? 1));
    // The sheet waited under "Start a new cart?"; once the new cart starts it has done its job.
    if (waiting.source === 'sheet' && outcome === 'added') onCloseItem();
  };
  const toggleSaved = (id: string) => updateShelf((current) => ({ ...current, saved: current.saved.includes(id) ? current.saved.filter((entry) => entry !== id) : [...current.saved, id] }));
  const keepRequest = (item: CatalogItem, answers: OfferingAnswers) => {
    updateShelf((current) => ({ ...current, requests: { ...current.requests, [item.id]: { answers, savedAt: new Date().toISOString() } } }));
    setAnnouncement(`${item.name}: request saved on this device.`);
  };
  const forgetRequest = (item: CatalogItem) => {
    updateShelf((current) => { const requests = { ...current.requests }; delete requests[item.id]; return { ...current, requests }; });
    setAnnouncement(`${item.name}: request removed from this device.`);
  };

  // Only facts the catalogue confirms: the place, the count, the open state when known, and display facts the source sends.
  const facts = merchant.displayFacts;
  const rating = facts?.rating && Number.isFinite(facts.rating.value) && facts.rating.value >= 0 && facts.rating.value <= 5 ? facts.rating : undefined;
  const deliveryFee = facts?.deliveryFee ? formatPrice(facts.deliveryFee, 'code') : undefined;
  const CountIcon = kind === 'vehicle' && bike ? Bike : kindIcon[kind];
  const place = merchant.area || merchant.address;
  const heroFacts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    items.length > 0 && <><CountIcon size={16} strokeWidth={1.75} aria-hidden="true" />{naming.count(items.length)}</>,
    typeof merchant.isOpen === 'boolean' && <><Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />{merchant.isOpen ? 'Open now' : 'Closed now'}</>,
    facts?.deliveryTime && <><Timer size={16} strokeWidth={1.75} aria-hidden="true" />{facts.deliveryTime}</>,
    deliveryFee && <><Bike size={16} strokeWidth={1.75} aria-hidden="true" />Delivery {deliveryFee}</>,
    rating && <><Star size={16} strokeWidth={1.75} aria-hidden="true" />{rating.value.toFixed(1)}{rating.count ? ` (${rating.count.toLocaleString('en-KE')} ratings)` : ''}</>,
    facts?.promotion && <><Percent size={16} strokeWidth={1.75} aria-hidden="true" />{facts.promotion}</>,
  ];
  const listName = naming.list.toLocaleLowerCase('en-KE');
  const selectAction = transfer || (rental && tripPlanned) ? transferCardAction : undefined;

  const card = (item: CatalogItem) => {
    const kept = Boolean(shelf.requests[item.id]);
    return <OfferingCard key={item.id} item={item} kind={kind} saved={savedIds.has(item.id)} onSave={toggleSaved} onOpen={onSelectItem}
      tag={kept ? 'Request saved' : undefined} actionLabel={kept ? 'View request' : selectAction}
      {...(list ? { quantity: inCart(item), onAdd: addOne, onRemove: removeOne } : {})} />;
  };

  return <div className={`generic-store${basket ? ' has-basket' : ''}`}>
    <StoreHero merchant={merchant} eyebrow={subcategoryOf(merchant)?.subcategory.label ?? merchant.subcategory ?? merchant.category} facts={heroFacts} onBack={onBack} />

    {rental && <RentalTripPanel trip={trip} vehicle={bike ? 'bike' : 'car'} onChange={(next) => { setTrip(next); if (!tripReady(next)) setPlanned(false); }} onShow={showVehicles} />}
    {transfer && <TransferTripPanel trip={ride} direction={transferDirection(merchant)} onChange={(next) => { setRide(next); if (!transferReady(next)) setPlanned(false); }} onShow={showVehicles} />}

    {itemMissing && <p className="store-notice" role="status"><Info size={18} strokeWidth={1.75} aria-hidden="true" />That {naming.item} isn’t listed at {merchant.name} any more. Here’s what is.</p>}

    {items.length > 0 ? <div ref={catalog} className="generic-store__catalog">
      <SectionNav label={`${naming.list} sections`} sections={shown.map((section) => ({ anchor: sectionAnchor(section), title: section.title, count: section.items.length }))}
        search={{ value: search, onChange: changeSearch, placeholder: `Search ${merchant.name}`, label: `Search ${merchant.name}` }} />
      {tripPlanned && <p className="store-intro store-intro--trip"><CalendarCheck size={17} strokeWidth={1.75} aria-hidden="true" />
        <span>For your {rental ? 'trip' : 'ride'}: {rental ? tripSummary(trip) : transferSummary(ride)}. {merchant.name} confirms availability and the final price.</span></p>}
      {term && matches > 0 && <p className="store-intro" role="status">{naming.count(matches)} {matches === 1 ? 'matches' : 'match'} “{term}”</p>}
      {shown.length > 0
        ? <div className="store-sections">{shown.map((section) => {
          const anchor = sectionAnchor(section);
          const history = section.source === 'history';
          const Mark = section.id.endsWith(':new') ? Sparkles : Flame;
          return <section key={section.id} id={anchor} tabIndex={-1} aria-labelledby={`${anchor}-title`} className={`store-section${history ? ' store-section--history' : ''}`}>
            <div className="store-section__heading"><h2 id={`${anchor}-title`}>{history && <Mark size={20} strokeWidth={1.75} aria-hidden="true" />}{section.title}</h2><span>{naming.count(section.items.length)}</span></div>
            <div className={`offering-grid${list ? '' : ' offering-grid--roomy'}`}>{section.items.map(card)}</div>
          </section>;
        })}</div>
        : <div className="store-empty" role="status">
          <Search size={26} strokeWidth={1.5} aria-hidden="true" />
          <h2>No {naming.items} match “{term}”</h2>
          <p>Try a shorter word, or browse the {listName}.</p>
          <button type="button" onClick={() => changeSearch('')}>Clear search</button>
        </div>}
    </div> : <div className="store-empty">
      <PackageOpen size={26} strokeWidth={1.5} aria-hidden="true" />
      <h2>No {naming.items} listed yet</h2>
      <p>{merchant.name} hasn’t added {naming.items} to NexG yet.</p>
    </div>}

    {/* The pill stays mounted behind an open sheet, so closing the sheet hands focus back to it. */}
    {basket && (list
      ? <CartPill count={cart.count} subtotalKes={cart.subtotalKes} onOpen={() => setCartOpen(true)} />
      : <div className="store-basket generic-store__basket">
        <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden="true" />
        <div className="store-basket__text"><strong>{requested.length === 1 ? '1 request' : `${requested.length} requests`} on this device</strong><span>Not sent to {merchant.name} yet</span></div>
        <button type="button" onClick={() => onSelectItem(requested[0]!)}>Review</button>
      </div>)}

    {open && <OfferingSheet key={open.id} context="store" merchant={merchant} item={open} kind={kind} saved={savedIds.has(open.id)} onSave={toggleSaved} onClose={onCloseItem}
      trip={tripStarted ? trip : undefined} ride={rideStarted ? ride : undefined}
      {...(list ? { listed: inCart(open), onList: changeQuantity } : { request: shelf.requests[open.id], onKeep: keepRequest, onForget: forgetRequest })} />}
    {cartOpen && <CartSheet merchant={merchant} cart={cart} items={items} onClose={() => setCartOpen(false)} />}
    {cart.pending && <CartSwitchDialog current={cart.otherStore ?? 'another store'} onKeep={cart.keepCurrentCart} onStart={startNewCart} />}
    <p className="sr-only" role="status">{announcement}</p>
  </div>;
}
