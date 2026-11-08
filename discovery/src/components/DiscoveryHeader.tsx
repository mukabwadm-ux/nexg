import { MapPin, Search } from 'lucide-react';
import logo from '../../assets/brand/nexg-wordmark-dark.svg?url';
import type { ReactNode } from 'react';

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
}

export function DiscoveryHeader({ search, area, areas, areasUnavailable, onHome, onSearchChange, onSearch, onAreaChange, experienceSearch, tourSearch, productSearch, wellnessSearch, trailingContent }: Props) {
  return <header className="discovery-header">
    <button type="button" className="wordmark" aria-label="NexG Discovery homepage" onClick={onHome}><img src={logo} width={156} alt="NexG" /></button>
    <div className="header-area"><MapPin size={16} aria-hidden="true" />{areasUnavailable ? <span className="header-location-status">{area || 'No location enabled'}</span> : <select aria-label="Catalog area" title="Choose a catalog area" value={area ?? ''} onChange={(event) => onAreaChange(event.target.value || undefined)}><option value="">{area || 'No location enabled'}</option>{area && !areas.includes(area) && <option value={area}>{area}</option>}{areas.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>}</div>
    <form className="header-search" role="search" onSubmit={(event) => { event.preventDefault(); onSearch(); }}><Search size={18} aria-hidden="true" /><input aria-label={wellnessSearch ? `Search treatments in ${wellnessSearch}` : productSearch ? `Search products in ${productSearch}` : tourSearch ? 'Search safaris, tours or operators' : experienceSearch ? 'Search experiences or hosts' : 'Search merchants'} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={wellnessSearch ? 'Search for massage treatments and services…' : productSearch ? `Search in ${productSearch}… milk, eggs, bread…` : tourSearch ? 'Search safaris, tours or operators...' : experienceSearch ? 'Search experiences, events or hosts...' : 'Search merchants'} maxLength={200} /><button type="submit" aria-label={wellnessSearch ? 'Find treatments' : productSearch ? 'Find products' : tourSearch ? 'Find trips' : experienceSearch ? 'Find experiences' : 'Find merchants'}><Search size={18} aria-hidden="true" /></button></form>
    <nav className="header-auth" aria-label="Account">{trailingContent}<a className="header-login" href="nexg://sign-in">Sign in</a><a className="header-signup" href="nexg://sign-up">Sign up</a></nav>
  </header>;
}
