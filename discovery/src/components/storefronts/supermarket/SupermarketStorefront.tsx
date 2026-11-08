import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bike, Clock3, Flame, Info, MapPin, Percent, Search, ShoppingBasket, Sparkles, Star } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { catalogNaming, catalogSections, searchSections, sectionAnchor, type CatalogNaming, type CatalogSection } from '../../../data/catalogSections';
import { subcategoryOf } from '../../../data/offeringKinds';
import { listEntries, listSummary, MAX_LIST_QUANTITY, readGroceryList, setListQuantity, writeGroceryList, type SupermarketListLine } from '../../../data/supermarketPresentation';
import { formatPrice } from '../../../lib/formatPrice';
import { SectionNav } from '../SectionNav';
import { StoreHero } from '../StoreHero';
import { SupermarketItemDialog } from './SupermarketItemDialog';
import { SupermarketProductCard } from './SupermarketProductCard';
import { SupermarketShoppingList } from './SupermarketShoppingList';
import './supermarket.css';

interface SupermarketStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  itemMissing: boolean;
  onBack: () => void;
  /** Kept for callers. The store now sits under the site header, whose wordmark goes home. */
  onHome: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
}

const lower = (text: string) => text.toLocaleLowerCase('en-KE');
const itemCount = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;
const matchLine = (naming: CatalogNaming, matches: number, term: string) =>
  matches ? `${naming.count(matches)} ${matches === 1 ? 'matches' : 'match'} “${term}”` : `No ${naming.items} match “${term}”`;

/** One aisle, or a history section such as "Frequently ordered" with its small gold mark. */
function Aisle({ section, naming, quantities, onOpen, onQuantity }: {
  section: CatalogSection;
  naming: CatalogNaming;
  quantities: ReadonlyMap<string, number>;
  onOpen: (item: CatalogItem) => void;
  onQuantity: (item: CatalogItem, quantity: number) => void;
}) {
  const anchor = sectionAnchor(section);
  const history = section.source === 'history';
  const Mark = section.id.endsWith(':new') ? Sparkles : Flame;
  return <section id={anchor} tabIndex={-1} className={`store-section supermarket-aisle${history ? ' supermarket-aisle--history' : ''}`} aria-labelledby={`${anchor}-title`}>
    <div className="store-section__heading">
      {history && <span className="supermarket-aisle__mark" aria-hidden="true"><Mark size={16} strokeWidth={2} /></span>}
      <h2 id={`${anchor}-title`}>{section.title}</h2>
      <span>{naming.count(section.items.length)}</span>
    </div>
    <div className="supermarket-grid">
      {section.items.map((item) => <SupermarketProductCard key={item.id} item={item} quantity={quantities.get(item.id) ?? 0} onOpen={onOpen} onQuantity={onQuantity} />)}
    </div>
  </section>;
}

/**
 * The grocery storefront for every Groceries And Essentials shop (owner, 8 Nov 2026). The shared store
 * hero, then the shop's aisles from catalogSections under the sticky, Wolt-style section bar with search.
 * "Frequently ordered" and "New" lead only when real history exists. The + on each product fills the
 * shopper's list, kept on this device and opened from the floating basket. No checkout and no payment.
 */
export function SupermarketStorefront({ merchant, activeItem, itemMissing, onBack, onSelectItem, onCloseItem }: SupermarketStorefrontProps) {
  const products = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, products), [merchant, products]);
  const [search, setSearch] = useState('');
  const term = search.trim();
  const shown = useMemo(() => searchSections(sections, term), [sections, term]);
  const matches = shown.reduce((sum, section) => sum + section.items.length, 0);
  const [lines, setLines] = useState<SupermarketListLine[]>(() => readGroceryList(merchant));
  const [listOpen, setListOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const results = useRef<HTMLDivElement>(null);
  const listWasOpen = useRef(false);

  useEffect(() => { writeGroceryList(merchant.id, lines); }, [merchant.id, lines]);
  // Closing the list hands focus back to the basket pill. After "Clear list" the pill is gone, so focus
  // returns to the aisles instead of falling to the top of the page.
  useEffect(() => {
    if (listOpen) { listWasOpen.current = true; return; }
    if (!listWasOpen.current) return;
    listWasOpen.current = false;
    if (!document.activeElement || document.activeElement === document.body) results.current?.focus({ preventScroll: true });
  }, [listOpen]);
  // Screen readers hear the search result once the shopper pauses, not on every key.
  useEffect(() => {
    if (!term) return;
    const timer = window.setTimeout(() => setAnnouncement(`${matchLine(naming, matches, term)}.`), 600);
    return () => window.clearTimeout(timer);
  }, [term, matches, naming]);

  const quantities = useMemo(() => new Map(lines.map((line) => [line.itemId, line.quantity])), [lines]);
  const summary = listSummary(useMemo(() => listEntries(products, lines), [products, lines]));
  // The aisle each product sits in, for the product sheet (history sections repeat items, so they don't count).
  const aisles = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) {
      if (section.source === 'history' || section.id.endsWith(':more')) continue;
      for (const item of section.items) if (!map.has(item.id)) map.set(item.id, section.title);
    }
    return map;
  }, [sections]);
  const open = activeItem && activeItem.merchantId === merchant.id && products.some((item) => item.id === activeItem.id) ? activeItem : undefined;

  const changeQuantity = (item: CatalogItem, quantity: number) => {
    if (item.merchantId !== merchant.id || !products.some((entry) => entry.id === item.id)) return;
    const next = Math.max(0, Math.min(MAX_LIST_QUANTITY, Math.trunc(quantity)));
    if (item.isAvailable === false && next > (quantities.get(item.id) ?? 0)) return;
    setLines((current) => setListQuantity(current, item.id, next));
    setAnnouncement(next ? `${item.name}: ${next} on your list.` : `${item.name} taken off your list.`);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    // Searching from further down the store brings the first results back into view under the bars.
    const element = results.current;
    if (!element) return;
    const header = document.querySelector<HTMLElement>('.discovery-header')?.offsetHeight ?? 0;
    const bar = document.querySelector<HTMLElement>('.supermarket-store .section-nav')?.offsetHeight ?? 0;
    const top = Math.max(0, element.getBoundingClientRect().top + window.scrollY - header - bar - 8);
    if (window.scrollY > top) window.scrollTo({ top });
  };

  // Only facts the catalogue confirms: the area, the count, and display facts when the source sends them.
  const facts = merchant.displayFacts;
  const rating = facts?.rating && Number.isFinite(facts.rating.value) && facts.rating.value >= 0 && facts.rating.value <= 5 ? facts.rating : undefined;
  const deliveryFee = facts?.deliveryFee ? formatPrice(facts.deliveryFee, 'code') : undefined;
  const place = merchant.area || merchant.address;
  const heroFacts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    products.length > 0 && <><ShoppingBasket size={16} strokeWidth={1.75} aria-hidden="true" />{naming.count(products.length)}</>,
    facts?.deliveryTime && <><Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />{facts.deliveryTime}</>,
    deliveryFee && <><Bike size={16} strokeWidth={1.75} aria-hidden="true" />Delivery {deliveryFee}</>,
    rating && <><Star size={16} strokeWidth={1.75} aria-hidden="true" />{rating.value.toFixed(1)}{rating.count ? ` (${rating.count.toLocaleString('en-KE')} ratings)` : ''}</>,
    facts?.promotion && <><Percent size={16} strokeWidth={1.75} aria-hidden="true" />{facts.promotion}</>,
  ];
  // The pill stays while the list is open (the drawer covers it), so closing the list can hand focus back to it.
  const basket = summary.quantity > 0;

  return <section className={`supermarket-store${basket ? ' has-basket' : ''}`} aria-label={`${merchant.name} storefront`}>
    <StoreHero merchant={merchant} eyebrow={subcategoryOf(merchant)?.subcategory.label ?? (merchant.subcategory || merchant.category)} facts={heroFacts} onBack={onBack} />
    {products.length > 0 && <SectionNav label={naming.list} sections={shown.map((section) => ({ anchor: sectionAnchor(section), title: section.title, count: section.items.length }))}
      search={{ value: search, onChange: changeSearch, placeholder: `Search the ${lower(naming.list)}`, label: `Search ${merchant.name}` }} />}
    {itemMissing && <p className="supermarket-notice" role="status"><Info size={18} strokeWidth={1.75} aria-hidden="true" />That {naming.item} isn’t listed at {merchant.name} right now. Here’s what is.</p>}
    {products.length > 0
      ? <div ref={results} className="supermarket-results" tabIndex={-1}>
        {term && matches > 0 && <p className="supermarket-results__status">{matchLine(naming, matches, term)}</p>}
        {shown.length > 0
          ? <div className="store-sections">
            {shown.map((section) => <Aisle key={section.id} section={section} naming={naming} quantities={quantities} onOpen={onSelectItem} onQuantity={changeQuantity} />)}
          </div>
          : <div className="store-empty">
            <Search size={26} strokeWidth={1.5} aria-hidden="true" />
            <h2>No {naming.items} match “{term}”</h2>
            <p>Try a shorter word, or browse the {lower(naming.list)}.</p>
            <button type="button" onClick={() => changeSearch('')}>Clear search</button>
          </div>}
      </div>
      : <div className="store-empty">
        <ShoppingBasket size={26} strokeWidth={1.5} aria-hidden="true" />
        <h2>No {naming.items} listed yet</h2>
        <p>{merchant.name} hasn’t added {naming.items} to NexG yet.</p>
      </div>}

    {basket && <button type="button" className="store-basket supermarket-basket" aria-haspopup="dialog" onClick={() => setListOpen(true)}>
      <ShoppingBasket size={18} strokeWidth={2} aria-hidden="true" />
      <strong>{itemCount(summary.quantity)}</strong>
      {summary.total && <span className="supermarket-basket__total">{summary.total}</span>}
      <span className="supermarket-basket__cta">View list</span>
    </button>}

    {open && <SupermarketItemDialog key={open.id} merchant={merchant} item={open} aisle={aisles.get(open.id)}
      listed={quantities.get(open.id) ?? 0} onQuantity={changeQuantity} onClose={onCloseItem} />}
    {listOpen && <SupermarketShoppingList merchant={merchant} products={products} lines={lines} onQuantity={changeQuantity} onReplace={setLines} onClose={() => setListOpen(false)} />}
    <p className="sr-only" role="status">{announcement}</p>
  </section>;
}
