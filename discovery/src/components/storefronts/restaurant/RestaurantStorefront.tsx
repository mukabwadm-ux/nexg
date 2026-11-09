import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bike, Clock3, Flame, Info, MapPin, Percent, Search, Sparkles, Star, Timer, UtensilsCrossed } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { catalogNaming, catalogSections, searchSections, sectionAnchor } from '../../../data/catalogSections';
import { isListKind, offeringKind, subcategoryOf } from '../../../data/offeringKinds';
import { readSavedProducts, writeSavedProducts } from '../../../data/supermarketPresentation';
import { formatPrice } from '../../../lib/formatPrice';
import { OfferingSheet } from '../../cards/OfferingSheet';
import { CartPill } from '../../cart/CartPill';
import { CartSheet, CartSwitchDialog } from '../../cart/CartSheet';
import { MAX_CART_QUANTITY, useStoreCart, type CartOutcome } from '../../cart/useStoreCart';
import { GenericStorefront } from '../GenericStorefront';
import { SectionNav, showStoreBar } from '../SectionNav';
import { StoreHero } from '../StoreHero';
import { RestaurantMenuItemCard } from './RestaurantMenuItemCard';

interface RestaurantStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  /** A linked dish this restaurant no longer lists. */
  itemMissing?: boolean;
  /** The hero's back pill. */
  onBack: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
}

/**
 * The storefront for every restaurants-food store: restaurants, fast food, cafés, bakeries, desserts and juice
 * bars. Catering takes requests rather than orders (its journey is a service), so it keeps the shared request
 * storefront.
 */
export function RestaurantStorefront(props: RestaurantStorefrontProps) {
  return isListKind(offeringKind(props.merchant)) ? <RestaurantMenu {...props} /> : <GenericStorefront {...props} />;
}

/**
 * The store hero, then the menu in sections under the sticky, Wolt-style section bar with search, then the
 * "View cart" pill. "Frequently ordered" and "New" lead only when real history exists. The + on each dish
 * adds it to the NexG cart in place; only the pill opens the cart.
 */
function RestaurantMenu({ merchant, activeItem, itemMissing = false, onBack, onSelectItem, onCloseItem }: RestaurantStorefrontProps) {
  const kind = useMemo(() => offeringKind(merchant), [merchant]);
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const items = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, items), [merchant, items]);
  const [search, setSearch] = useState('');
  const term = search.trim();
  const shown = useMemo(() => searchSections(sections, term), [sections, term]);
  const matches = shown.reduce((sum, section) => sum + section.items.length, 0);
  const catalog = useRef<HTMLDivElement>(null);
  // The NexG cart, through the cart pieces every store shares (one store per cart, "Start a new cart?" first).
  const cart = useStoreCart(merchant);
  const [cartOpen, setCartOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => readSavedProducts(merchant));
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => { writeSavedProducts(merchant.id, saved); }, [merchant.id, saved]);
  const savedIds = useMemo(() => new Set(saved), [saved]);
  const inCart = (item: CatalogItem) => cart.quantities.get(item.id) ?? 0;

  const open = activeItem && activeItem.merchantId === merchant.id && items.some((item) => item.id === activeItem.id) ? activeItem : undefined;

  // Searching from further down the menu lands the results under the docked section bar.
  const changeSearch = (value: string) => { setSearch(value); requestAnimationFrame(() => showStoreBar(catalog.current, { onlyWhenPast: true })); };

  /** Where a dish went, said once for screen readers; "Start a new cart?" speaks for itself while an add waits on it. */
  const said = (item: CatalogItem, outcome: CartOutcome, quantity: number) => {
    if (outcome !== 'waiting') setAnnouncement(outcome === 'refused' ? `${item.name} couldn’t go in your cart.` : `${item.name}: ${quantity} in your cart.`);
  };
  const addOne = (item: CatalogItem) => said(item, cart.add(item, undefined, 'card'), Math.min(MAX_CART_QUANTITY, inCart(item) + 1));
  const removeOne = (item: CatalogItem) => {
    const next = Math.max(0, inCart(item) - 1);
    cart.set(item.id, next);
    setAnnouncement(next ? `${item.name}: ${next} in your cart.` : `${item.name} taken out of your cart.`);
  };
  /** From the dish sheet: a chosen quantity; 0 takes it out. The outcome tells the sheet whether to close. */
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
    // The dish sheet waited under "Start a new cart?"; once the new cart starts it has done its job.
    if (waiting.source === 'sheet' && outcome === 'added') onCloseItem();
  };
  const toggleSaved = (id: string) => setSaved((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const closeCart = () => {
    setCartOpen(false);
    // After "Clear cart" the pill is gone, so focus returns to the menu instead of the top of the page.
    requestAnimationFrame(() => { if (document.activeElement === document.body) catalog.current?.focus({ preventScroll: true }); });
  };

  // Only facts the catalogue confirms: the place, the count, the open state when known, and display facts the source sends.
  const facts = merchant.displayFacts;
  const rating = facts?.rating && Number.isFinite(facts.rating.value) && facts.rating.value >= 0 && facts.rating.value <= 5 ? facts.rating : undefined;
  const deliveryFee = facts?.deliveryFee ? formatPrice(facts.deliveryFee, 'code') : undefined;
  const place = merchant.area || merchant.address;
  const heroFacts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    items.length > 0 && <><UtensilsCrossed size={16} strokeWidth={1.75} aria-hidden="true" />{naming.count(items.length)}</>,
    typeof merchant.isOpen === 'boolean' && <><Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />{merchant.isOpen ? 'Open now' : 'Closed now'}</>,
    facts?.deliveryTime && <><Timer size={16} strokeWidth={1.75} aria-hidden="true" />{facts.deliveryTime}</>,
    deliveryFee && <><Bike size={16} strokeWidth={1.75} aria-hidden="true" />Delivery {deliveryFee}</>,
    rating && <><Star size={16} strokeWidth={1.75} aria-hidden="true" />{rating.value.toFixed(1)}{rating.count ? ` (${rating.count.toLocaleString('en-KE')} ratings)` : ''}</>,
    facts?.promotion && <><Percent size={16} strokeWidth={1.75} aria-hidden="true" />{facts.promotion}</>,
  ];
  const listName = naming.list.toLocaleLowerCase('en-KE');
  const basket = cart.count > 0;

  return <div className={`restaurant-menu${basket ? ' has-basket' : ''}`}>
    <StoreHero merchant={merchant} eyebrow={subcategoryOf(merchant)?.subcategory.label ?? merchant.subcategory ?? merchant.category} facts={heroFacts} onBack={onBack} />

    {itemMissing && <p className="store-notice" role="status"><Info size={18} strokeWidth={1.75} aria-hidden="true" />That {naming.item} isn’t listed at {merchant.name} any more. Here’s what is.</p>}

    {items.length > 0 ? <div ref={catalog} tabIndex={-1} className="restaurant-menu__catalog">
      <SectionNav label={naming.list} sections={shown.map((section) => ({ anchor: sectionAnchor(section), title: section.title, count: section.items.length }))}
        search={{ value: search, onChange: changeSearch, placeholder: `Search ${merchant.name}`, label: `Search ${merchant.name}` }} />
      {term && matches > 0 && <p className="store-intro" role="status">{naming.count(matches)} {matches === 1 ? 'matches' : 'match'} “{term}”</p>}
      {shown.length > 0
        ? <div className="store-sections">{shown.map((section) => {
          const anchor = sectionAnchor(section);
          const history = section.source === 'history';
          const Mark = section.id.endsWith(':new') ? Sparkles : Flame;
          return <section key={section.id} id={anchor} tabIndex={-1} aria-labelledby={`${anchor}-title`} className={`store-section${history ? ' store-section--history' : ''}`}>
            <div className="store-section__heading"><h2 id={`${anchor}-title`}>{history && <Mark size={20} strokeWidth={2} aria-hidden="true" />}{section.title}</h2><span>{naming.count(section.items.length)}</span></div>
            <div className="offering-grid">{section.items.map((item) => <RestaurantMenuItemCard key={item.id} item={item} kind={kind} saved={savedIds.has(item.id)}
              quantity={inCart(item)} onSave={toggleSaved} onOpen={onSelectItem} onAdd={addOne} onRemove={removeOne} />)}</div>
          </section>;
        })}</div>
        : <div className="store-empty" role="status">
          <Search size={26} strokeWidth={1.5} aria-hidden="true" />
          <h2>No {naming.items} match “{term}”</h2>
          <p>Try a shorter word, or browse the {listName}.</p>
          <button type="button" onClick={() => changeSearch('')}>Clear search</button>
        </div>}
    </div> : <div className="store-empty">
      <UtensilsCrossed size={26} strokeWidth={1.5} aria-hidden="true" />
      <h2>No {naming.items} listed yet</h2>
      <p>{merchant.name} hasn’t added {naming.items} to NexG yet.</p>
    </div>}

    {/* The pill stays mounted behind an open sheet, so closing the sheet hands focus back to it. */}
    <CartPill count={cart.count} subtotalKes={cart.subtotalKes} onOpen={() => setCartOpen(true)} />

    {open && <OfferingSheet key={open.id} context="store" merchant={merchant} item={open} kind={kind} saved={savedIds.has(open.id)} onSave={toggleSaved}
      onClose={onCloseItem} listed={inCart(open)} onList={changeQuantity} />}
    {cartOpen && <CartSheet merchant={merchant} cart={cart} items={items} onClose={closeCart} />}
    {cart.pending && <CartSwitchDialog current={cart.otherStore ?? 'another store'} onKeep={cart.keepCurrentCart} onStart={startNewCart} />}
    <p className="sr-only" role="status">{announcement}</p>
  </div>;
}
