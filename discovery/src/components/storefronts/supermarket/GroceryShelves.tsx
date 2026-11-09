import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Flame, Sparkles } from 'lucide-react';
import type { CatalogItem } from '../../../providers/DiscoveryProvider';
import { sectionAnchor, type CatalogNaming, type CatalogSection } from '../../../data/catalogSections';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The gold mark history sections carry: a flame for "Frequently ordered", a sparkle for "New". */
export const HistoryMark = ({ section }: { section: Pick<CatalogSection, 'id'> }) => {
  const Mark = section.id.endsWith(':new') ? Sparkles : Flame;
  return <Mark size={20} strokeWidth={2} aria-hidden="true" />;
};

/**
 * One horizontal rail on the store's home (Wolt and Uber Eats): a heading with its count and "See all", then
 * up to a dozen compact cards. On phones the rail runs to the screen's edge so the next card peeks; mouse
 * users also get arrows (supermarket.css). Keyboard users tab through the cards and the rail follows.
 */
export function GroceryRail({ id, title, mark, count, items, renderCard, seeAll }: {
  id: string;
  title: string;
  mark?: ReactNode;
  /** "12 products". */
  count: string;
  items: readonly CatalogItem[];
  renderCard: (item: CatalogItem) => ReactNode;
  seeAll?: { label: string; onClick: () => void };
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => setEdges({ start: element.scrollLeft <= 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { element.removeEventListener('scroll', measure); observer.disconnect(); };
  }, [items.length]);
  const nudge = (direction: number) => {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  return <section id={id} tabIndex={-1} className="store-section grocery-rail" aria-labelledby={`${id}-title`}>
    <div className="grocery-rail__head">
      <h2 id={`${id}-title`}>{mark}{title}</h2>
      <span className="grocery-rail__count">{count}</span>
      <div className="grocery-rail__tools">
        {seeAll && <button type="button" className="grocery-rail__all" aria-label={seeAll.label} onClick={seeAll.onClick}>See all</button>}
        {!(edges.start && edges.end) && <>
          <button type="button" className="grocery-rail__arrow" tabIndex={-1} aria-label={`Earlier in ${title}`} disabled={edges.start} onClick={() => nudge(-1)}><ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /></button>
          <button type="button" className="grocery-rail__arrow" tabIndex={-1} aria-label={`More in ${title}`} disabled={edges.end} onClick={() => nudge(1)}><ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></button>
        </>}
      </div>
    </div>
    <div ref={track} className="grocery-rail__track" data-start={edges.start} data-end={edges.end}>
      {items.map(renderCard)}
    </div>
  </section>;
}

/** How many products an aisle shows before "Show all", so an aisle of hundreds draws quickly. */
export const AISLE_LIMIT = 48;

/**
 * One aisle: its heading and count, then its products in the compact grid (five across on a laptop, two on
 * phones, three from 481px). A long aisle shows its first products and a "Show all" button.
 */
export function GroceryAisle({ section, naming, heading: Heading = 'h3', note, renderCard }: {
  section: CatalogSection;
  naming: CatalogNaming;
  heading?: 'h2' | 'h3';
  /** A short line beside the count, such as the department in search results. */
  note?: string;
  renderCard: (item: CatalogItem) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const anchor = sectionAnchor(section);
  const history = section.source === 'history';
  const shown = all ? section.items : section.items.slice(0, AISLE_LIMIT);
  const showAll = () => {
    setAll(true);
    // The button leaves, so focus moves to the first product it revealed.
    requestAnimationFrame(() => grid.current?.querySelectorAll<HTMLButtonElement>('.offering-card__title button')[AISLE_LIMIT]?.focus());
  };
  return <section id={anchor} tabIndex={-1} className={`store-section grocery-aisle${history ? ' store-section--history' : ''}`} aria-labelledby={`${anchor}-title`}>
    <div className="store-section__heading">
      <Heading id={`${anchor}-title`}>{history && <HistoryMark section={section} />}{section.title}</Heading>
      <span>{note ? `${note} · ${naming.count(section.items.length)}` : naming.count(section.items.length)}</span>
    </div>
    <div ref={grid} className="offering-grid offering-grid--compact">{shown.map(renderCard)}</div>
    {shown.length < section.items.length && <button type="button" className="grocery-aisle__more" onClick={showAll}>Show all {naming.count(section.items.length)}</button>}
  </section>;
}
