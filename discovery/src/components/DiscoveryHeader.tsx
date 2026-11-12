import { MapPin, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { Suggestion } from '../data/searchSuggestions';
import { useSearchSuggestions, type SuggestFetch } from './SearchSuggestions';
import { headerCollapseOf, isCompactHeader, PHONE_QUERY } from './storefronts/SectionNav';

interface Props {
  search: string;
  area?: string;
  areas: string[];
  areasUnavailable: boolean;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onAreaChange: (value?: string) => void;
  experienceSearch?: boolean;
  tourSearch?: boolean;
  productSearch?: string;
  wellnessSearch?: string;
  /** Stores and items for the suggestion box; without it the box shows matching categories only. */
  suggest?: SuggestFetch;
  /** Opens a chosen suggestion; without it there is no suggestion box. */
  onSuggestion?: (suggestion: Exclude<Suggestion, { kind: 'search' }>) => void;
}


/**
 * Phones (owner, 9 Nov 2026): the location row scrolls away with the page (styles.css), and once it has the bar is
 * compact: only the search shows, pinned under the page's header. The full bar returns at the top of the page.
 * Wider screens keep the bar as it is.
 */
function useCompactHeader(header: RefObject<HTMLElement | null>) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const phone = window.matchMedia(PHONE_QUERY);
    let collapse = 0;
    let frame = 0;
    const measure = () => { collapse = headerCollapseOf(element); };
    const update = () => { frame = 0; setCompact(isCompactHeader(phone.matches, collapse, window.scrollY)); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const remeasure = () => { measure(); schedule(); };
    measure();
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    phone.addEventListener('change', remeasure);
    return () => {
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', remeasure); phone.removeEventListener('change', remeasure);
      cancelAnimationFrame(frame);
    };
  }, [header]);
  return compact;
}

/**
 * Discovery's bar: the catalog area and the general search. On the NexG website it sits under the site's own
 * header, which carries the logo, Deliver to and the menu, and no account icon on this page (owner, 12 Nov 2026).
 * In a store on a phone the bar steps aside while the store's own search is docked at the top (SectionNav sets
 * html[data-store-docked]), so one search shows at a time.
 */
export function DiscoveryHeader({ search, area, areas, areasUnavailable, onSearchChange, onSearch, onAreaChange, experienceSearch, tourSearch, productSearch, wellnessSearch, suggest, onSuggestion }: Props) {
  const header = useRef<HTMLDivElement>(null);
  const compact = useCompactHeader(header);
  const input = useRef<HTMLInputElement>(null);
  // A store's own search (products, treatments) filters that store; the site-wide search gets the suggestion box.
  const suggestions = useSearchSuggestions({ search, suggest, listId: useId(), enabled: Boolean(onSuggestion) && !productSearch && !wellnessSearch,
    onChoose: (choice) => { input.current?.blur(); if (choice.kind === 'search') onSearch(); else onSuggestion?.(choice); } });
  // A plain block, not a <header>: the page's header (the site's, on the website) is the one banner landmark.
  return <div ref={header} className={`discovery-header${compact ? ' is-compact' : ''}`}>
    <div className="header-area"><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{areasUnavailable ? <span className="header-location-status">{area || 'No location enabled'}</span> : <select aria-label="Catalog area" title="Choose a catalog area" value={area ?? ''} onChange={(event) => onAreaChange(event.target.value || undefined)}><option value="">{area || 'No location enabled'}</option>{area && !areas.includes(area) && <option value={area}>{area}</option>}{areas.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>}</div>
    <form className="header-search" role="search" onSubmit={(event) => { event.preventDefault(); suggestions.close(); onSearch(); }}><Search size={18} strokeWidth={1.75} aria-hidden="true" /><input ref={input} {...suggestions.inputProps} aria-label={wellnessSearch ? `Search treatments in ${wellnessSearch}` : productSearch ? `Search products in ${productSearch}` : tourSearch ? 'Search safaris, tours or operators' : experienceSearch ? 'Search experiences or hosts' : 'Search merchants'} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={wellnessSearch ? 'Search for massage treatments and services…' : productSearch ? `Search in ${productSearch}… milk, eggs, bread…` : tourSearch ? 'Search safaris, tours or operators...' : experienceSearch ? 'Search experiences, events or hosts...' : 'Search merchants'} maxLength={200} enterKeyHint="search" /><button type="submit" aria-label={wellnessSearch ? 'Find treatments' : productSearch ? 'Find products' : tourSearch ? 'Find trips' : experienceSearch ? 'Find experiences' : 'Find merchants'}><Search size={18} strokeWidth={1.75} aria-hidden="true" /></button>{suggestions.box}</form>
  </div>;
}
