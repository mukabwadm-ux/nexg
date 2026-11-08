import { useId, useState } from 'react';
import { ArrowLeft, MapPin, Search, X } from 'lucide-react';
import type { Merchant } from '../../providers/DiscoveryProvider';
import { tourLabel } from '../../data/tourPresentation';
import { ExperienceGrid } from '../ExperienceCard';
import { ImageWithFallback } from '../ImageWithFallback';
import { MerchantCard } from '../MerchantCard';
import { OperatorMapPreview } from '../tours/OperatorMapPreview';
import '../experiences.css';
import '../tours.css';

/** The operator storefront uses only this merchant's source inventory. */
export function TourOperatorStorefront({ merchant, onOpen, onBack, search = '', offset = 0, onChange }: {
  merchant: Merchant; onOpen: (id: string, itemId?: string) => void; onBack?: () => void;
  search?: string; offset?: number; onChange: (search: string, offset: number) => void;
}) {
  const [heroFailed, setHeroFailed] = useState(false);
  const [view, setView] = useState<'trips' | 'profile'>('trips');
  const searchId = useId();
  const items = merchant.items.filter((item) => item.merchantId === merchant.id && item.name.toLocaleLowerCase('en-KE').includes(search.trim().toLocaleLowerCase('en-KE')));
  const page = items.slice(offset, offset + 12);
  const inventoryImage = merchant.items.find((item) => item.merchantId === merchant.id && item.image)?.image;
  const changeSearch = (value: string) => onChange(value, 0);
  const changePage = (next: number) => {
    setView('trips');
    onChange(search, next);
    const section = document.getElementById(`${searchId}-catalog`);
    if (section) {
      const headerHeight = document.querySelector('.discovery-header')?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - headerHeight - 24 });
      section.focus({ preventScroll: true });
    }
  };
  return <div className="tour-operator">
    {onBack && <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Back to discovery</button>}
    <header className="tour-operator__hero"><ImageWithFallback src={heroFailed ? inventoryImage : merchant.heroImage || inventoryImage} alt="" width={1440} height={400} className="tour-operator__image" referrerPolicy="no-referrer" onError={() => setHeroFailed(true)} />
      <div className="tour-operator__identity">{merchant.logoUrl && <ImageWithFallback src={merchant.logoUrl} alt="" width={88} height={88} className="tour-operator__logo" referrerPolicy="no-referrer" />}<div><span className="experience-card__tag">{tourLabel(merchant)}</span><h1>{merchant.name}</h1>{merchant.area && <p><MapPin size={16} aria-hidden="true" />Operator in {merchant.area}</p>}</div></div>
    </header>
    <div className="tour-operator__sections" role="group" aria-label="Operator sections"><button type="button" aria-pressed={view === 'trips'} onClick={() => setView('trips')}>Trips & packages</button><button type="button" aria-pressed={view === 'profile'} onClick={() => setView('profile')}>Operator details</button></div>
    <section className="tour-operator__catalog" id={`${searchId}-catalog`} tabIndex={-1} aria-labelledby={`${searchId}-title`}>
      {view === 'trips' ? <>
      <div className="tour-operator__catalog-heading"><div><h2 id={`${searchId}-title`}>Trips & packages</h2><p role="status" aria-live="polite">{items.length} {items.length === 1 ? 'offering' : 'offerings'} from {merchant.name}</p></div>
        <div className="tour-operator__search"><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>Search {merchant.name} trips</label><input id={searchId} type="search" placeholder="Search this operator's trips..." value={search} onChange={(event) => changeSearch(event.target.value)} maxLength={200} />{search && <button type="button" aria-label="Clear operator search" onClick={() => changeSearch('')}><X size={18} aria-hidden="true" /></button>}</div>
      </div>
      {page.length ? <ExperienceGrid merchantContext offerings={page.map((item) => ({ merchant, item }))} onOpen={onOpen} /> : <div className="empty-state"><h3>{items.length ? 'This page has no trips' : search ? 'No matching trips' : 'No trips listed yet'}</h3><p>{items.length ? 'Return to the first page to browse this operator’s trips.' : search ? 'Try another trip name or clear your search.' : 'This operator has no current offerings in the catalog.'}</p>{items.length > 0 && <button type="button" className="button" onClick={() => changePage(0)}>Go to first page</button>}</div>}
      {(offset > 0 || items.length > offset + 12) && <nav className="pagination" aria-label="Operator trip pages"><button type="button" className="button" disabled={offset === 0} onClick={() => changePage(Math.max(0, offset - 12))}>Previous</button><span>Page {Math.floor(offset / 12) + 1}</span><button type="button" className="button" disabled={offset + 12 >= items.length} onClick={() => changePage(offset + 12)}>Next</button></nav>}
      </> : <section className="tour-operator__profile"><div><h2 id={`${searchId}-title`}>About the operator</h2><MerchantCard merchant={merchant} mode="host" onOpen={() => changePage(0)} /><p>{merchant.address ? `Operator address: ${merchant.address}. ` : ''}Departure dates, itineraries, inclusions and booking terms have not been supplied for these listings. The operator's address is not a confirmed pickup point.</p></div><OperatorMapPreview merchant={merchant} /></section>}
    </section>
  </div>;
}
