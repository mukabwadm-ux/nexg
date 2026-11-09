import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarCheck, Compass, MapPin, PackageOpen, Search } from 'lucide-react';
import type { Merchant } from '../../providers/DiscoveryProvider';
import { catalogNaming, catalogSections, searchSections, sectionAnchor } from '../../data/catalogSections';
import { tourLabel } from '../../data/tourPresentation';
import { ExperienceGrid } from '../ExperienceCard';
import { SectionNav, showStoreBar } from './SectionNav';
import { StoreHero } from './StoreHero';
import '../tours.css';

/**
 * A tour operator's storefront (safaris, city, cultural and adventure tours, travel packages): the shared store
 * hero, then the operator's trips in sections under the sticky section bar with search, then what the operator
 * confirms. Only this operator's own listings; each trip opens its trip page. Nothing is booked here.
 */
export function TourOperatorStorefront({ merchant, onOpen, onBack, search = '', onChange }: {
  merchant: Merchant;
  onOpen: (merchantId: string, itemId?: string) => void;
  onBack: () => void;
  /** The trip search, kept in the page address so it survives a visit to a trip page. */
  search?: string;
  /** No longer used: sections replaced the 12-trip pages. Kept so existing links still open the store. */
  offset?: number;
  onChange?: (search: string, offset: number) => void;
}) {
  const naming = useMemo(() => catalogNaming(merchant), [merchant]);
  const items = useMemo(() => merchant.items.filter((item) => item.merchantId === merchant.id), [merchant]);
  const sections = useMemo(() => catalogSections(merchant, items), [merchant, items]);
  const [query, setQuery] = useState(search);
  // Back and forward can change the address's search while the store stays open.
  useEffect(() => { setQuery(search); }, [search]);
  const term = query.trim();
  const shown = useMemo(() => searchSections(sections, term), [sections, term]);
  const matches = shown.reduce((sum, section) => sum + section.items.length, 0);
  const catalog = useRef<HTMLDivElement>(null);
  const label = tourLabel(merchant);
  const place = merchant.area || merchant.address;

  /** Lands the results under the docked section bar once the shopper has scrolled past it. */
  const showCatalog = () => requestAnimationFrame(() => showStoreBar(catalog.current, { onlyWhenPast: true }));
  const changeSearch = (value: string) => { setQuery(value); onChange?.(value, 0); showCatalog(); };
  // The "Clear search" button leaves with the empty state, so focus moves to the first section.
  const clearSearch = () => {
    changeSearch('');
    requestAnimationFrame(() => catalog.current?.querySelector<HTMLElement>('.store-section')?.focus({ preventScroll: true }));
  };

  const heroFacts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />Based in {place}</>,
    items.length > 0 && <><Compass size={16} strokeWidth={1.75} aria-hidden="true" />{naming.count(items.length)}</>,
  ];

  const about = <section className="store-section tour-store__about" aria-labelledby="tour-store-about">
    <div className="store-section__heading"><h2 id="tour-store-about">About the operator</h2></div>
    <dl className="tour-store__facts">
      {merchant.address && <div><dt><MapPin size={18} strokeWidth={1.75} aria-hidden="true" />Address</dt><dd>{merchant.address}</dd></div>}
      <div><dt><CalendarCheck size={18} strokeWidth={1.75} aria-hidden="true" />Bookings</dt><dd>{merchant.name} confirms dates, prices, availability and pickup for every trip.</dd></div>
    </dl>
  </section>;

  // An operator without its own cover photo shows one of its own trip photos.
  const cover = merchant.heroImage ? undefined : items.find((item) => item.image)?.image;

  return <div className="tour-store">
    <StoreHero merchant={merchant} cover={cover} eyebrow={label} facts={heroFacts} onBack={onBack} />

    {items.length > 0 ? <div ref={catalog} className="tour-store__catalog">
      <SectionNav label={naming.list} sections={shown.map((section) => ({ anchor: sectionAnchor(section), title: section.title, count: section.items.length }))}
        search={{ value: query, onChange: changeSearch, placeholder: `Search ${merchant.name}`, label: `Search ${merchant.name}` }} />
      {term && matches > 0 && <p className="store-intro" role="status">{naming.count(matches)} {matches === 1 ? 'matches' : 'match'} “{term}”</p>}
      <div className="store-sections">
        {shown.length > 0 ? shown.map((section) => {
          const anchor = sectionAnchor(section);
          return <section key={section.id} id={anchor} tabIndex={-1} aria-labelledby={`${anchor}-title`} className="store-section">
            <div className="store-section__heading"><h2 id={`${anchor}-title`}>{section.title}</h2><span>{naming.count(section.items.length)}</span></div>
            <div className="tour-store__grid">
              <ExperienceGrid merchantContext omitTag={label} offerings={section.items.map((item) => ({ merchant, item }))} onOpen={onOpen} />
            </div>
          </section>;
        }) : <div className="store-empty" role="status">
          <Search size={26} strokeWidth={1.5} aria-hidden="true" />
          <h2>No {naming.items} match “{term}”</h2>
          <p>Try a shorter word, or browse all of {merchant.name}’s {naming.items}.</p>
          <button type="button" onClick={clearSearch}>Clear search</button>
        </div>}
        {about}
      </div>
    </div> : <div className="store-sections">
      <div className="store-empty">
        <PackageOpen size={26} strokeWidth={1.5} aria-hidden="true" />
        <h2>No {naming.items} listed yet</h2>
        <p>{merchant.name} hasn’t added {naming.items} to NexG yet.</p>
      </div>
      {about}
    </div>}
  </div>;
}
