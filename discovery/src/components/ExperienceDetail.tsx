import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Ticket } from 'lucide-react';
import type { DiscoveryProvider } from '../providers/DiscoveryProvider';
import { useProviderRead } from '../hooks/useProviderRead';
import { formatPrice } from '../lib/formatPrice';
import { CatalogState } from './CatalogState';
import { ImageWithFallback } from './ImageWithFallback';
import { MerchantCard } from './MerchantCard';
import { ExperienceCard } from './ExperienceCard';
import './experiences.css';
import { experienceLabel, isDirectExperienceMerchant } from '../data/experiencePresentation';

/** Direct item destination, with the owning merchant alongside the experience. */
export function ExperienceDetail({ merchantId, itemId, provider, onBack, onMerchant, onOpen }: {
  merchantId: string; itemId: string; provider: DiscoveryProvider; onBack: () => void;
  onMerchant: (id: string) => void; onOpen: (id: string, itemId?: string) => void;
}) {
  const catalog = useProviderRead(`experience:${merchantId}:${itemId}`, (signal) => provider.getMerchant(merchantId, signal));
  const merchant = catalog.value;
  const item = merchant && isDirectExperienceMerchant(merchant) ? merchant.items.find((entry) => entry.id === itemId && entry.merchantId === merchantId) : undefined;
  const price = item && formatPrice(item);
  const goToSection = (id: string) => {
    const section = document.getElementById(id);
    if (!section) return;
    const headerHeight = document.querySelector('.discovery-header')?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - headerHeight - 24 });
    section?.focus({ preventScroll: true });
  };
  return <section className="experience-detail" aria-busy={catalog.loading}>
    <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Back to experiences</button>
    {catalog.loading || catalog.error ? <CatalogState loading={catalog.loading} error={catalog.error} failure={catalog.failure} retry={catalog.retry} /> : !merchant || !item ? <div className="empty-state" role="status"><h1>Experience not found</h1><p>This link does not identify a supported experience.</p>{merchant && <button type="button" className="button" onClick={() => onMerchant(merchant.id)}>View {merchant.name} storefront</button>}</div> : <>
      <div className="experience-detail__hero">
        <ImageWithFallback src={item.image} alt={item.name} width={1000} height={640} className="experience-detail__image" referrerPolicy="no-referrer" />
        <header className="experience-detail__intro">
          <span className="experience-card__tag">{experienceLabel(merchant)}</span>
          <h1>{item.name}</h1><button type="button" className="text-button" onClick={() => onMerchant(merchant.id)}>By {merchant.name}<ArrowRight size={16} aria-hidden="true" /></button>
          <p>{item.description || 'The host has not provided a description for this experience yet.'}</p>
          <div className="experience-detail__facts"><span><CalendarDays size={20} aria-hidden="true" />Date and time not provided</span><span><MapPin size={20} aria-hidden="true" />Event venue not provided</span></div>
        </header>
      </div>
      <nav className="experience-detail__nav" aria-label="Experience sections"><button type="button" onClick={() => goToSection('experience-overview')}>Overview</button><button type="button" onClick={() => goToSection('experience-host')}>Host</button><button type="button" onClick={() => goToSection('experience-booking')}>Booking information</button></nav>
      <div className="experience-detail__layout">
        <div className="experience-detail__content">
          <section id="experience-overview" tabIndex={-1} className="experience-detail__section"><h2>About this experience</h2><p>{item.description || 'More details have not been supplied by the host.'}</p><div className="experience-detail__schedule"><CalendarDays size={24} aria-hidden="true" /><div><h3>Schedule & venue</h3><p>The host has not supplied event dates, a schedule or a confirmed venue. Check these details before making plans.</p></div></div></section>
          <section id="experience-host" tabIndex={-1} className="experience-detail__section"><h2>Host / organiser</h2><div className="experience-detail__host"><MerchantCard merchant={merchant} mode="host" onOpen={onMerchant} /><p>This experience is listed by {merchant.name}.{merchant.area ? ` The host is based in ${merchant.area}.` : ''} Visit their storefront to explore their other offerings.</p></div></section>
          {merchant.items.some((entry) => entry.id !== item.id && entry.merchantId === merchant.id) && <section className="experience-detail__section"><h2>More from {merchant.name}</h2><div className="experience-grid">{merchant.items.filter((entry) => entry.id !== item.id && entry.merchantId === merchant.id).slice(0, 4).map((entry) => <ExperienceCard key={entry.id} item={entry} merchant={merchant} onOpen={onOpen} />)}</div></section>}
        </div>
        <aside id="experience-booking" tabIndex={-1} className="experience-booking"><Ticket size={26} aria-hidden="true" /><h2>Your experience</h2><p>{item.name}</p><div className="experience-booking__price"><span>Listed price</span><strong>{price ?? 'Not provided'}</strong></div>{item.isAvailable === false && <p className="experience-booking__notice">This offering is currently unavailable.</p>}<button type="button" className="button button--primary" disabled>Booking unavailable</button><p className="experience-booking__notice">Dates, ticket options and booking are not available yet. No reservation or payment can be made here.</p></aside>
      </div>
    </>}
  </section>;
}
