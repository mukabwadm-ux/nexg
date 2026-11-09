import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Bike, ChevronRight, Clock3, Info, MapPin, Percent, Search, ShoppingBasket, Star, Timer } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { catalogDepartments, catalogNaming, catalogSections, searchSections, sectionAnchor, type CatalogDepartment, type CatalogNaming, type CatalogSection } from '../../../data/catalogSections';
import { offeringKind, subcategoryOf } from '../../../data/offeringKinds';
import { readSavedProducts, writeSavedProducts } from '../../../data/supermarketPresentation';
import { formatPrice } from '../../../lib/formatPrice';
import { readNexgCart } from '../../../cart/nexgCart';
import { CartPill } from '../../cart/CartPill';
import { CartSheet, CartSwitchDialog } from '../../cart/CartSheet';
import { useStoreCart, type CartOutcome } from '../../cart/useStoreCart';
import { OfferingSheet } from '../../cards/OfferingSheet';
import { headerReachOf, SectionNav, showStoreBar } from '../SectionNav';
import { StoreHero } from '../StoreHero';
import { DISCOVER, GroceryDepartments } from './GroceryDepartments';
import { GroceryAisle, GroceryRail, HistoryMark } from './GroceryShelves';
import { SupermarketProductCard } from './SupermarketProductCard';
import './supermarket.css';

interface SupermarketStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  /** A linked product this shop no longer lists. */
  itemMissing?: boolean;
  /** The hero's back pill. */
  onBack: () => void;
  /** Kept for callers. The store now sits under the site header, whose wordmark goes home. */
  onHome?: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
  /**
   * The open department, from the page address (`&department=`). With `onDepartment` the address leads, so Back
   * walks through the departments the shopper opened; an id the store doesn't have shows Discover.
   */
  department?: string;
  /** Opens a department (undefined: Discover) as a new step in the page's history. */
  onDepartment?: (id?: string) => void;
}

/** A rail on the store's home shows this many products; "See all" opens the department. */
export const RAIL_LIMIT = 12;

const matchLine = (naming: CatalogNaming, matches: number, term: string) =>
  matches ? `${naming.count(matches)} ${matches === 1 ? 'matches' : 'match'} “${term}”` : `No ${naming.items} match “${term}”`;
const railAnchor = (department: Pick<CatalogDepartment, 'id'>) => `rail-${department.id.replace(/[^a-z0-9]+/gi, '-')}`;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The sticky site header's height, so the sticky sidebar sits under it. */
function useHeaderHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.discovery-header');
    if (!header) return;
    const measure = () => setHeight(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

/**
 * The grocery storefront for every Groceries And Essentials shop (owner, 9 Nov 2026: Bolt Food's sidebar and
 * aisle chips, Wolt Market's look and phone layout). Under the shared store hero, a store with two or more
 * departments gets the department sidebar (a row of round tiles on phones) beside its main column: the home
 * ("Discover") with one rail per department, or one department with a breadcrumb and its aisles under the
 * sticky section bar. Smaller shops (most butcheries, fishmongers and greengrocers) show their aisles
 * straight away. Search covers the whole store, grouped by aisle. The + on each product fills the NexG cart
 * in place; the "View cart" pill opens it. Only one department draws at a time, rails stop at a dozen
 * products and images load lazily, so a store of thousands stays quick.
 */
export function SupermarketStorefront({ merchant, activeItem, itemMissing = false, onBack, onSelectItem, onCloseItem, department: routed, onDepartment }: SupermarketStorefrontProps) {
  const products = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const kind = useMemo(() => offeringKind(merchant), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, products), [merchant, products]);
  const departments = useMemo(() => catalogDepartments(merchant, products, sections), [merchant, products, sections]);
  const history = useMemo(() => sections.filter((section) => section.source === 'history'), [sections]);
  const grouped = departments.length >= 2;
  // Every aisle once, in department order: the order search results follow.
  const aisles = useMemo(() => (grouped ? departments.flatMap((department) => department.sections) : sections.filter((section) => section.source !== 'history')), [grouped, departments, sections]);
  const departmentOf = useMemo(() => new Map(departments.flatMap((department) => department.sections.map((section) => [section.id, department.title] as const))), [departments]);
  const aisleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of aisles) {
      if (section.id.endsWith(':more')) continue;
      for (const item of section.items) if (!map.has(item.id)) map.set(item.id, section.title);
    }
    return map;
  }, [aisles]);

  // Without a page address to follow (tests, embeds), the store keeps its own place.
  const [ownView, setOwnView] = useState<string>(DISCOVER);
  const view = onDepartment ? routed ?? DISCOVER : ownView;
  const [search, setSearch] = useState('');
  const term = search.trim();
  const [saved, setSaved] = useState<string[]>(() => readSavedProducts(merchant));
  const [cartOpen, setCartOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const main = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const top = useHeaderHeight();
  const cart = useStoreCart(merchant);
  const savedIds = useMemo(() => new Set(saved), [saved]);

  // Another store opens on its home with an empty search.
  useEffect(() => { setOwnView(DISCOVER); setSearch(''); setSaved(readSavedProducts(merchant)); }, [merchant.id]);
  const department = grouped ? departments.find((entry) => entry.id === view) : undefined;

  // The whole store when searching; otherwise one department, the flat aisles, or (on the home) none.
  const shown = useMemo(() => {
    if (term) return searchSections(aisles, term);
    if (!grouped) return searchSections(sections, '');
    return department ? department.sections : [];
  }, [term, aisles, grouped, sections, department]);
  const matches = term ? shown.reduce((sum, section) => sum + section.items.length, 0) : 0;
  // Screen readers hear the search result once the shopper pauses, not on every key.
  useEffect(() => {
    if (!term) return;
    const timer = window.setTimeout(() => setAnnouncement(`${matchLine(naming, matches, term)}.`), 600);
    return () => window.clearTimeout(timer);
  }, [term, matches, naming]);

  /** Brings the top of the main column (a department's breadcrumb) up under the site header when the shopper is further down. */
  const showMain = () => {
    const element = main.current;
    const header = document.querySelector<HTMLElement>('.discovery-header');
    if (!element) return;
    const reach = header ? headerReachOf(header.offsetHeight, Number.parseFloat(getComputedStyle(header).top)) : 0;
    const target = Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY - reach - 8));
    if (window.scrollY > target) window.scrollTo({ top: target });
  };
  const openView = (next: string) => {
    if (onDepartment) onDepartment(next === DISCOVER ? undefined : next);
    else setOwnView(next);
    setSearch('');
    requestAnimationFrame(() => {
      showMain();
      (next === DISCOVER ? main.current : heading.current)?.focus({ preventScroll: true });
    });
  };
  const showHistory = (section: CatalogSection) => {
    const element = document.getElementById(sectionAnchor(section));
    if (!element) return;
    const bar = main.current?.querySelector<HTMLElement>('.section-nav')?.offsetHeight ?? 0;
    window.scrollTo({ top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - top - bar - 12), behavior: reducedMotion() ? 'auto' : 'smooth' });
    element.focus({ preventScroll: true });
  };
  // Searching from further down the store brings the first results back under the bar.
  const changeSearch = (value: string) => { setSearch(value); requestAnimationFrame(() => showStoreBar(main.current, { onlyWhenPast: true })); };

  // Stable handlers, so a change to one product's quantity redraws only that card.
  const latest = useRef({ cart, setAnnouncement });
  latest.current = { cart, setAnnouncement };
  const addOne = useCallback((item: CatalogItem) => {
    const { cart: current } = latest.current;
    if (current.add(item, undefined, 'card') === 'refused') latest.current.setAnnouncement(`${item.name} couldn’t go in your cart.`);
  }, []);
  const removeOne = useCallback((item: CatalogItem) => {
    // The cart as it is now, so two quick taps take two away even before the page redraws.
    const now = readNexgCart();
    const quantity = now.merchantId === item.merchantId ? now.lines.find((entry) => entry.id === item.id)?.quantity ?? 0 : 0;
    if (quantity > 0) latest.current.cart.set(item.id, quantity - 1);
  }, []);
  /** From the product sheet: a chosen quantity; 0 takes it out. The outcome tells the sheet whether to close. */
  const changeQuantity = (item: CatalogItem, quantity: number): CartOutcome | undefined => {
    if (quantity <= 0) { cart.set(item.id, 0); setAnnouncement(`${item.name} removed from cart.`); return undefined; }
    const outcome = cart.add(item, quantity, 'sheet');
    if (outcome === 'added') setAnnouncement(`${item.name}: ${quantity} in cart.`);
    else if (outcome === 'refused') setAnnouncement(`${item.name} couldn’t go in your cart.`);
    return outcome;
  };
  const startNewCart = () => {
    const waiting = cart.pending;
    const outcome = cart.startNewCart();
    if (!waiting) return;
    if (outcome === 'refused') setAnnouncement(`${waiting.item.name} couldn’t go in your cart.`);
    else if (waiting.source === 'sheet') { setAnnouncement(`New cart started: ${waiting.item.name}, ${waiting.quantity ?? 1} in cart.`); onCloseItem(); }
  };
  const closeCart = () => {
    setCartOpen(false);
    // After "Clear cart" the pill is gone, so focus returns to the aisles instead of the top of the page.
    requestAnimationFrame(() => { if (document.activeElement === document.body) main.current?.focus({ preventScroll: true }); });
  };
  const toggleSaved = (id: string) => setSaved((current) => {
    const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    writeSavedProducts(merchant.id, next);
    return next;
  });

  const card = (item: CatalogItem) => <SupermarketProductCard key={item.id} item={item} quantity={cart.quantities.get(item.id) ?? 0}
    onOpen={onSelectItem} onAdd={addOne} onRemove={removeOne} />;
  const open = activeItem && activeItem.merchantId === merchant.id && products.some((item) => item.id === activeItem.id) ? activeItem : undefined;

  // Only facts the catalogue confirms: the area, the count, the open state when known, and display facts the source sends.
  const facts = merchant.displayFacts;
  const rating = facts?.rating && Number.isFinite(facts.rating.value) && facts.rating.value >= 0 && facts.rating.value <= 5 ? facts.rating : undefined;
  const deliveryFee = facts?.deliveryFee ? formatPrice(facts.deliveryFee, 'code') : undefined;
  const place = merchant.area || merchant.address;
  const heroFacts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    products.length > 0 && <><ShoppingBasket size={16} strokeWidth={1.75} aria-hidden="true" />{naming.count(products.length)}</>,
    typeof merchant.isOpen === 'boolean' && <><Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />{merchant.isOpen ? 'Open now' : 'Closed now'}</>,
    facts?.deliveryTime && <><Timer size={16} strokeWidth={1.75} aria-hidden="true" />{facts.deliveryTime}</>,
    deliveryFee && <><Bike size={16} strokeWidth={1.75} aria-hidden="true" />Delivery {deliveryFee}</>,
    rating && <><Star size={16} strokeWidth={1.75} aria-hidden="true" />{rating.value.toFixed(1)}{rating.count ? ` (${rating.count.toLocaleString('en-KE')} ratings)` : ''}</>,
    facts?.promotion && <><Percent size={16} strokeWidth={1.75} aria-hidden="true" />{facts.promotion}</>,
  ];

  const noResults = <div className="store-empty" role="status">
    <Search size={26} strokeWidth={1.5} aria-hidden="true" />
    <h2>No {naming.items} match “{term}”</h2>
    <p>Try a shorter word, or browse the {naming.list.toLocaleLowerCase('en-KE')}.</p>
    <button type="button" onClick={() => changeSearch('')}>Clear search</button>
  </div>;
  const results = <>
    {matches > 0 && <p className="store-intro">{matchLine(naming, matches, term)}</p>}
    {shown.length > 0
      ? <div className="store-sections">{shown.map((section) => <GroceryAisle key={section.id} section={section} naming={naming} heading="h2"
        note={grouped ? departmentOf.get(section.id) : undefined} renderCard={card} />)}</div>
      : noResults}
  </>;
  const home = <div className="store-sections grocery-home">
    {history.map((section) => <GroceryRail key={section.id} id={sectionAnchor(section)} title={section.title} mark={<HistoryMark section={section} />}
      count={naming.count(section.items.length)} items={section.items.slice(0, RAIL_LIMIT)} renderCard={card} />)}
    {departments.map((entry) => <GroceryRail key={entry.id} id={railAnchor(entry)} title={entry.title} count={naming.count(entry.count)}
      items={entry.sections.flatMap((section) => section.items).slice(0, RAIL_LIMIT)} renderCard={card}
      seeAll={{ label: `See all ${entry.title}`, onClick: () => openView(entry.id) }} />)}
  </div>;
  const bar = <SectionNav label={naming.list} sections={shown.map((section) => ({ anchor: sectionAnchor(section), title: section.title, count: section.items.length }))}
    search={{ value: search, onChange: changeSearch, placeholder: `Search ${merchant.name}`, label: `Search ${merchant.name}` }} />;

  const basket = cart.count > 0;
  return <section className={`supermarket-store${basket ? ' has-basket' : ''}`} aria-label={`${merchant.name} storefront`}>
    <StoreHero merchant={merchant} eyebrow={subcategoryOf(merchant)?.subcategory.label ?? (merchant.subcategory || merchant.category)} facts={heroFacts} onBack={onBack} />
    {itemMissing && <p className="store-notice" role="status"><Info size={18} strokeWidth={1.75} aria-hidden="true" />That {naming.item} isn’t listed at {merchant.name} any more. Here’s what is.</p>}
    {products.length === 0
      ? <div className="store-empty">
        <ShoppingBasket size={26} strokeWidth={1.5} aria-hidden="true" />
        <h2>No {naming.items} listed yet</h2>
        <p>{merchant.name} hasn’t added {naming.items} to NexG yet.</p>
      </div>
      : grouped
        ? <div className="grocery-layout" style={{ '--grocery-top': `${top}px` } as CSSProperties}>
          <GroceryDepartments departments={departments} history={history} active={department ? department.id : DISCOVER} naming={naming}
            onSelect={openView} onHistory={showHistory} />
          <div ref={main} className="grocery-main" tabIndex={-1}>
            {department && !term && <header className="grocery-head">
              <nav aria-label="Breadcrumb">
                <ol className="grocery-crumbs">
                  <li><button type="button" onClick={() => openView(DISCOVER)}>{merchant.name}</button></li>
                  <li><ChevronRight size={16} strokeWidth={2} aria-hidden="true" /><span aria-current="page">{department.title}</span></li>
                </ol>
              </nav>
              <h2 ref={heading} tabIndex={-1}>{department.title}</h2>
            </header>}
            {bar}
            {term ? results : department
              ? <div className="store-sections">{department.sections.map((section) => <GroceryAisle key={section.id} section={section} naming={naming} renderCard={card} />)}</div>
              : home}
          </div>
        </div>
        : <div ref={main} className="grocery-main grocery-main--flat" tabIndex={-1}>
          {bar}
          {term ? results
            : <div className="store-sections">{shown.map((section) => <GroceryAisle key={section.id} section={section} naming={naming} heading="h2" renderCard={card} />)}</div>}
        </div>}

    <CartPill count={cart.count} subtotalKes={cart.subtotalKes} onOpen={() => setCartOpen(true)} />
    {open && <OfferingSheet key={open.id} context="store" merchant={merchant} item={open} kind={kind} eyebrow={aisleOf.get(open.id)} saved={savedIds.has(open.id)}
      onSave={toggleSaved} onClose={onCloseItem} listed={cart.quantities.get(open.id) ?? 0} onList={changeQuantity} />}
    {cartOpen && <CartSheet merchant={merchant} cart={cart} items={products} onClose={closeCart} />}
    {cart.pending && cart.otherStore && <CartSwitchDialog current={cart.otherStore} onKeep={cart.keepCurrentCart} onStart={startNewCart} />}
    <p className="sr-only" role="status">{announcement}</p>
  </section>;
}
