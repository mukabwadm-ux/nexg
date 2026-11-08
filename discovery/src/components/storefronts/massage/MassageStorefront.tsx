import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarX2, Flame, Info, MapPin, Search, Sparkles, Star, Tag } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { catalogNaming, catalogSections, searchSections, sectionAnchor, type CatalogSection } from '../../../data/catalogSections';
import { offeringKind, subcategoryOf } from '../../../data/offeringKinds';
import { readShelf, serviceProfile, writeShelf, type AppointmentRequest, type AppointmentShelf } from '../../../data/massagePresentation';
import { SectionNav } from '../SectionNav';
import { StoreHero } from '../StoreHero';
import { MassageBookingDialog } from './MassageBookingDialog';
import { MassageServiceCard } from './MassageServiceCard';
import './massage.css';

interface MassageStorefrontProps {
  merchant: Merchant;
  activeItem?: CatalogItem;
  itemMissing: boolean;
  onBack: () => void;
  /** Kept for callers; the site header carries the way home now. */
  onHome?: () => void;
  onSelectItem: (item: CatalogItem) => void;
  onCloseItem: () => void;
}

const formatCount = (value: number) => value.toLocaleString('en-KE');

/** History sections ("Most booked", "New") get a gold mark, as Wolt marks "Most ordered". */
function SectionTitle({ section, id }: { section: CatalogSection; id: string }) {
  if (section.source !== 'history') return <h2 id={id}>{section.title}</h2>;
  const Mark = section.id.endsWith(':new') ? Sparkles : Flame;
  return <h2 id={id}><Mark size={20} strokeWidth={2} aria-hidden="true" />{section.title}</h2>;
}

/**
 * The appointment storefront for massage, spa, gym, personal training, salon & barber and nails & beauty:
 * the shared store hero, the sticky section bar, and the store's own list in sections ("Massages",
 * "Facials", "Memberships & passes"…), named the way the store would ("Treatments", "Memberships & classes",
 * "Services"). Only catalogue facts are shown. Saved services and booking requests stay on this device.
 */
export function MassageStorefront({ merchant, activeItem, itemMissing, onBack, onSelectItem, onCloseItem }: MassageStorefrontProps) {
  const profile = useMemo(() => serviceProfile(merchant), [merchant]);
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const kind = useMemo(() => offeringKind(merchant), [merchant]);
  const items = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, items), [merchant, items]);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => searchSections(sections, search), [sections, search]);
  const [shelf, setShelf] = useState<AppointmentShelf>(() => readShelf(merchant.id));

  const keep = (next: AppointmentShelf) => { setShelf(next); writeShelf(merchant.id, next); };
  const toggleSaved = (id: string) => keep({ ...shelf, saved: shelf.saved.includes(id) ? shelf.saved.filter((entry) => entry !== id) : [...shelf.saved, id] });
  const saveRequest = (id: string, request: AppointmentRequest) => keep({ ...shelf, requests: { ...shelf.requests, [id]: request } });
  const removeRequest = (id: string) => { const requests = { ...shelf.requests }; delete requests[id]; keep({ ...shelf, requests }); };

  const savedIds = useMemo(() => new Set(shelf.saved), [shelf.saved]);
  // Requests count only while their service is still listed.
  const requested = items.filter((item) => shelf.requests[item.id])
    .sort((a, b) => (shelf.requests[b.id]!.savedAt).localeCompare(shelf.requests[a.id]!.savedAt));
  const latest = requested[0];
  const open = activeItem && activeItem.merchantId === merchant.id && items.some((item) => item.id === activeItem.id) ? activeItem : undefined;

  const list = naming.list.toLocaleLowerCase('en-KE');
  const place = merchant.area || merchant.address;
  const rating = merchant.displayFacts?.rating;
  const promotion = merchant.displayFacts?.promotion;
  const facts = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    items.length > 0 && <span className="appointment-store__count">{naming.count(items.length)}</span>,
    rating && <><Star size={16} strokeWidth={1.75} aria-hidden="true" /><span className="appointment-store__count">{rating.value.toLocaleString('en-KE', { maximumFractionDigits: 1 })}{rating.count !== undefined && ` (${formatCount(rating.count)} ${rating.count === 1 ? 'review' : 'reviews'})`}</span></>,
    promotion && <><Tag size={16} strokeWidth={1.75} aria-hidden="true" />{promotion}</>,
  ];

  return <div className={`appointment-store${latest && !open ? ' has-requests' : ''}`}>
    <StoreHero merchant={merchant} eyebrow={subcategoryOf(merchant)?.subcategory.label ?? merchant.subcategory} facts={facts} onBack={onBack} />

    {items.length > 0 && <SectionNav label={naming.list}
      sections={shown.map((section) => ({ anchor: sectionAnchor(section), title: section.title, count: section.items.length }))}
      search={{ value: search, onChange: setSearch, placeholder: `Search ${list}`, label: `Search ${list} at ${merchant.name}` }} />}

    {itemMissing && <p className="appointment-store__notice" role="status"><Info size={18} strokeWidth={1.75} aria-hidden="true" />That {naming.item} isn’t listed at {merchant.name} right now. Here’s what is.</p>}

    {shown.length > 0
      ? <div className="store-sections">{shown.map((section) => {
        const anchor = sectionAnchor(section);
        return <section key={section.id} id={anchor} tabIndex={-1} aria-labelledby={`${anchor}-title`}
          className={`store-section${section.source === 'history' ? ' store-section--history' : ''}`}>
          <div className="store-section__heading"><SectionTitle section={section} id={`${anchor}-title`} /><span>{formatCount(section.items.length)}</span></div>
          <div className="offering-grid">{section.items.map((item) => <MassageServiceCard key={item.id} item={item} merchant={merchant} kind={kind}
            saved={savedIds.has(item.id)} requested={Boolean(shelf.requests[item.id])} onSave={toggleSaved} onOpen={onSelectItem} />)}</div>
        </section>;
      })}</div>
      : items.length > 0
        ? <div className="store-empty" role="status"><Search size={26} strokeWidth={1.75} aria-hidden="true" /><p>No {naming.items} match “{search.trim()}”.</p>
          <button type="button" onClick={() => setSearch('')}>Clear search</button></div>
        : <div className="store-empty"><CalendarX2 size={26} strokeWidth={1.75} aria-hidden="true" /><p>{merchant.name} hasn’t listed any {naming.items} yet.</p></div>}

    {latest && !open && <div className="store-basket appointment-store__requests">
      <CalendarCheck size={18} strokeWidth={2} aria-hidden="true" />
      <div className="appointment-store__requests-text">
        <strong>{requested.length === 1 ? '1 request' : `${formatCount(requested.length)} requests`} on this device</strong>
        <span>Not sent to {merchant.name} yet</span>
      </div>
      <button type="button" onClick={() => onSelectItem(latest)}>Review</button>
    </div>}

    {open && <MassageBookingDialog key={open.id} merchant={merchant} item={open} profile={profile} naming={naming} saved={savedIds.has(open.id)} request={shelf.requests[open.id]}
      onSave={toggleSaved} onSaveRequest={saveRequest} onRemoveRequest={removeRequest} onClose={onCloseItem} />}
  </div>;
}
