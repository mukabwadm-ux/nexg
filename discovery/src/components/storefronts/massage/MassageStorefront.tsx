import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarCheck, CalendarX2, ClipboardList, Clock3, Dumbbell, Flame, Flower2, HandHeart, Info, MapPin, Percent, Scissors, Search, Sparkles, Star, type LucideIcon } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { catalogNaming, catalogSections, searchSections, sectionAnchor } from '../../../data/catalogSections';
import { offeringKind, subcategoryOf } from '../../../data/offeringKinds';
import { readShelf, writeShelf, type AppointmentRequest, type AppointmentShelf } from '../../../data/massagePresentation';
import { appointmentFromKept, keptFromAppointment, type OfferingAnswers } from '../../../data/itemSheet';
import { OfferingSheet } from '../../cards/OfferingSheet';
import { SectionNav, showStoreBar } from '../SectionNav';
import { StoreHero } from '../StoreHero';
import { MassageServiceCard } from './MassageServiceCard';
import './massage.css';

interface MassageStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  /** A linked service this store no longer lists. */
  itemMissing?: boolean;
  /** The hero's back pill. */
  onBack: () => void;
  /** Kept for callers; the site header carries the way home now. */
  onHome?: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
}

/** The hero's count carries the store type's own mark. */
const countIcons: Record<string, LucideIcon> = {
  'beauty-wellness:massage': HandHeart,
  'beauty-wellness:spa': Flower2,
  'beauty-wellness:gym': Dumbbell,
  'beauty-wellness:personal-training': Dumbbell,
  'beauty-wellness:salon-barber': Scissors,
  'beauty-wellness:nails-beauty-services': Sparkles,
};

/**
 * The appointment storefront for massage, spa, gym, personal training, salon & barber and nails & beauty
 * (owner, 8 Nov 2026), built like GenericStorefront: the shared store hero, the sticky section bar with
 * search, and the store's own list in sections ("Massages", "Facials", "Memberships & passes"…), named the
 * way the store would ("Treatments", "Memberships & classes", "Training"). Each service opens the one item
 * sheet with its request step (the store type's own questions come from serviceProfile). Only catalogue facts are shown; saved services and requests stay on this device, and the
 * requests pill says they haven't been sent.
 */
export function MassageStorefront({ merchant, activeItem, itemMissing = false, onBack, onSelectItem, onCloseItem }: MassageStorefrontProps) {
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const kind = useMemo(() => offeringKind(merchant), [merchant]);
  const subcategory = useMemo(() => subcategoryOf(merchant)?.subcategory, [merchant]);
  const items = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, items), [merchant, items]);
  const [search, setSearch] = useState('');
  const term = search.trim();
  const shown = useMemo(() => searchSections(sections, term), [sections, term]);
  const matches = shown.reduce((sum, section) => sum + section.items.length, 0);
  const catalog = useRef<HTMLDivElement>(null);

  // Saved services and booking requests, kept on this device until booking is connected.
  const [shelf, setShelf] = useState<AppointmentShelf>(() => readShelf(merchant.id));
  const updateShelf = (change: (current: AppointmentShelf) => AppointmentShelf) => setShelf((current) => { const next = change(current); writeShelf(merchant.id, next); return next; });
  const savedIds = useMemo(() => new Set(shelf.saved), [shelf.saved]);
  const listed = (item: CatalogItem) => item.merchantId === merchant.id && items.some((entry) => entry.id === item.id);
  // Requests count only while their service is still listed, newest first.
  const requested = items.filter((item) => shelf.requests[item.id])
    .sort((a, b) => shelf.requests[b.id]!.savedAt.localeCompare(shelf.requests[a.id]!.savedAt));
  const open = activeItem && listed(activeItem) ? activeItem : undefined;

  /** Searching from further down the store lands the results under the docked section bar. */
  const changeSearch = (value: string) => { setSearch(value); requestAnimationFrame(() => showStoreBar(catalog.current, { onlyWhenPast: true })); };
  const toggleSaved = (id: string) => updateShelf((current) => ({ ...current, saved: current.saved.includes(id) ? current.saved.filter((entry) => entry !== id) : [...current.saved, id] }));
  const keepRequest = (item: CatalogItem, request: AppointmentRequest) => {
    if (listed(item)) updateShelf((current) => ({ ...current, requests: { ...current.requests, [item.id]: request } }));
  };
  /** The sheet's answers, kept in the appointment shelf's own format so requests saved before the sheet still read. */
  const keepAnswers = (item: CatalogItem, answers: OfferingAnswers) => {
    const booking = appointmentFromKept({ answers, savedAt: new Date().toISOString() });
    if (booking) keepRequest(item, booking);
  };
  const forgetRequest = (item: CatalogItem) => updateShelf((current) => {
    const requests = { ...current.requests };
    delete requests[item.id];
    return { ...current, requests };
  });

  // Only facts the catalogue confirms: the place, the count, the open state when known, and display facts the source sends.
  const facts = merchant.displayFacts;
  const rating = facts?.rating && Number.isFinite(facts.rating.value) && facts.rating.value >= 0 && facts.rating.value <= 5 ? facts.rating : undefined;
  const CountIcon = (subcategory && countIcons[subcategory.id]) ?? ClipboardList;
  const place = merchant.area || merchant.address;
  const heroFacts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    items.length > 0 && <><CountIcon size={16} strokeWidth={1.75} aria-hidden="true" />{naming.count(items.length)}</>,
    typeof merchant.isOpen === 'boolean' && <><Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />{merchant.isOpen ? 'Open now' : 'Closed now'}</>,
    rating && <><Star size={16} strokeWidth={1.75} aria-hidden="true" />{rating.value.toFixed(1)}{rating.count ? ` (${rating.count.toLocaleString('en-KE')} ratings)` : ''}</>,
    facts?.promotion && <><Percent size={16} strokeWidth={1.75} aria-hidden="true" />{facts.promotion}</>,
  ];

  return <div className={`appointment-store${requested.length ? ' has-basket' : ''}`}>
    <StoreHero merchant={merchant} eyebrow={subcategory?.label ?? merchant.subcategory ?? merchant.category} facts={heroFacts} onBack={onBack} />

    {itemMissing && <p className="store-notice" role="status"><Info size={18} strokeWidth={1.75} aria-hidden="true" />That {naming.item} isn’t listed at {merchant.name} any more. Here’s what is.</p>}

    {items.length > 0 ? <div ref={catalog} className="appointment-store__catalog">
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
            <div className="offering-grid offering-grid--roomy">{section.items.map((item) => <MassageServiceCard key={item.id} item={item} merchant={merchant} kind={kind}
              saved={savedIds.has(item.id)} requested={Boolean(shelf.requests[item.id])} onSave={toggleSaved} onOpen={onSelectItem} />)}</div>
          </section>;
        })}</div>
        : <div className="store-empty" role="status">
          <Search size={26} strokeWidth={1.5} aria-hidden="true" />
          <h2>No {naming.items} match “{term}”</h2>
          <p>Try a shorter word, or browse all {naming.items}.</p>
          <button type="button" onClick={() => changeSearch('')}>Clear search</button>
        </div>}
    </div> : <div className="store-empty">
      <CalendarX2 size={26} strokeWidth={1.5} aria-hidden="true" />
      <h2>No {naming.items} listed yet</h2>
      <p>{merchant.name} hasn’t added {naming.items} to NexG yet.</p>
    </div>}

    {/* The pill stays mounted behind an open request, so closing it hands focus back to the pill. */}
    {requested.length > 0 && <div className="store-basket appointment-store__basket">
      <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
      <div className="store-basket__text"><strong>{requested.length === 1 ? '1 request' : `${requested.length} requests`} on this device</strong><span>Not sent to {merchant.name} yet</span></div>
      <button type="button" aria-haspopup="dialog" onClick={() => onSelectItem(requested[0]!)}>Review</button>
    </div>}

    {open && <OfferingSheet key={open.id} context="store" merchant={merchant} item={open} kind={kind} saved={savedIds.has(open.id)} onSave={toggleSaved} onClose={onCloseItem}
      request={shelf.requests[open.id] ? keptFromAppointment(shelf.requests[open.id]!) : undefined} onKeep={keepAnswers} onForget={forgetRequest} />}
  </div>;
}
