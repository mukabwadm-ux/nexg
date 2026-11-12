import { CircleUserRound, MapPin, Search } from 'lucide-react';
import logo from '../../assets/brand/nexg-wordmark-dark.svg?url';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Suggestion } from '../data/searchSuggestions';
import { useSearchSuggestions, type SuggestFetch } from './SearchSuggestions';
import { isCompactHeader, PHONE_QUERY } from './storefronts/SectionNav';

interface Props {
  search: string;
  area?: string;
  areas: string[];
  areasUnavailable: boolean;
  onHome: () => void;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onAreaChange: (value?: string) => void;
  experienceSearch?: boolean;
  tourSearch?: boolean;
  productSearch?: string;
  wellnessSearch?: string;
  trailingContent?: ReactNode;
  /** Stores and items for the suggestion box; without it the box shows matching categories only. */
  suggest?: SuggestFetch;
  /** Opens a chosen suggestion; without it there is no suggestion box. */
  onSuggestion?: (suggestion: Exclude<Suggestion, { kind: 'search' }>) => void;
}


/**
 * Phones (owner, 9 Nov 2026): the account and location rows scroll away with the page (a negative sticky `top`
 * in styles.css). Once they have, the header settles into one row, logo, search and account, and the full
 * layout returns at the top of the page. Wider screens keep the header as it is.
 */
function useCompactHeader(header: RefObject<HTMLElement | null>) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const phone = window.matchMedia(PHONE_QUERY);
    let collapse = 0;
    let frame = 0;
    const measure = () => { collapse = Math.max(0, -Number.parseFloat(getComputedStyle(element).top) || 0); };
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
 * The site header: logo, location, the general search and account. In a store on a phone it steps aside while the
 * store's own search is docked at the top (SectionNav sets html[data-store-docked]), so one search shows at a time.
 */
/**
 * Account links. Inside the NexG website (VITE_NEXG_SIGN_IN_URL, for example "/sign-in"), they open the site's own
 * sign-in page and bring the shopper back to this exact page afterwards; elsewhere they open the NexG app.
 */
function accountHref(kind: 'sign-in' | 'sign-up'): string {
  const page = (import.meta.env?.VITE_NEXG_SIGN_IN_URL as string | undefined)?.trim();
  if (!page) return `nexg://${kind}`;
  // The website opens account creation on its sign-in page with ?tab=create.
  const tab = kind === 'sign-up' ? 'tab=create&' : '';
  return `${page}?${tab}next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
}

export function DiscoveryHeader({ search, area, areas, areasUnavailable, onHome, onSearchChange, onSearch, onAreaChange, experienceSearch, tourSearch, productSearch, wellnessSearch, trailingContent, suggest, onSuggestion }: Props) {
  const header = useRef<HTMLElement>(null);
  const compact = useCompactHeader(header);
  const input = useRef<HTMLInputElement>(null);
  // A store's own search (products, treatments) filters that store; the site-wide search gets the suggestion box.
  const suggestions = useSearchSuggestions({ search, suggest, listId: useId(), enabled: Boolean(onSuggestion) && !productSearch && !wellnessSearch,
    onChoose: (choice) => { input.current?.blur(); if (choice.kind === 'search') onSearch(); else onSuggestion?.(choice); } });
  return <header ref={header} className={`discovery-header${compact ? ' is-compact' : ''}`}>
    <button type="button" className="wordmark" aria-label="Discovery home" onClick={onHome}><img src={logo} width={156} alt="NexG" /></button>
    <div className="header-area"><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{areasUnavailable ? <span className="header-location-status">{area || 'No location enabled'}</span> : <select aria-label="Catalog area" title="Choose a catalog area" value={area ?? ''} onChange={(event) => onAreaChange(event.target.value || undefined)}><option value="">{area || 'No location enabled'}</option>{area && !areas.includes(area) && <option value={area}>{area}</option>}{areas.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>}</div>
    <form className="header-search" role="search" onSubmit={(event) => { event.preventDefault(); suggestions.close(); onSearch(); }}><Search size={18} strokeWidth={1.75} aria-hidden="true" /><input ref={input} {...suggestions.inputProps} aria-label={wellnessSearch ? `Search treatments in ${wellnessSearch}` : productSearch ? `Search products in ${productSearch}` : tourSearch ? 'Search safaris, tours or operators' : experienceSearch ? 'Search experiences or hosts' : 'Search merchants'} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={wellnessSearch ? 'Search for massage treatments and services…' : productSearch ? `Search in ${productSearch}… milk, eggs, bread…` : tourSearch ? 'Search safaris, tours or operators...' : experienceSearch ? 'Search experiences, events or hosts...' : 'Search merchants'} maxLength={200} enterKeyHint="search" /><button type="submit" aria-label={wellnessSearch ? 'Find treatments' : productSearch ? 'Find products' : tourSearch ? 'Find trips' : experienceSearch ? 'Find experiences' : 'Find merchants'}><Search size={18} strokeWidth={1.75} aria-hidden="true" /></button>{suggestions.box}</form>
    <nav className="header-auth" aria-label="Account">{trailingContent}<a className="header-login" href={accountHref('sign-in')} onClick={(event) => { event.currentTarget.href = accountHref('sign-in'); }}><CircleUserRound className="header-login__icon" size={20} strokeWidth={1.75} aria-hidden="true" /><span className="header-login__label">Sign in</span></a><a className="header-signup" href={accountHref('sign-up')} onClick={(event) => { event.currentTarget.href = accountHref('sign-up'); }}>Sign up</a></nav>
  </header>;
}
