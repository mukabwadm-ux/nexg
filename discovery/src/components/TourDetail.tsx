import { useState, type CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DiscoveryProvider } from '../providers/DiscoveryProvider';
import { isTourOperator, tourLabel } from '../data/tourPresentation';
import { localDateKey } from '../data/massagePresentation';
import { useProviderRead } from '../hooks/useProviderRead';
import { CatalogState } from './CatalogState';
import { useHeaderHeight } from './storefronts/SectionNav';
import { ExperienceGrid } from './ExperienceCard';
import { initialTripPlan, TourPlanner } from './tours/TourPlanner';
import { TripBooking, type TripChoice } from './tours/TripBooking';
import { TripFacts } from './tours/TripFacts';
import { TripIncluded, TripItinerary, TripNote, TripOverview, TripPhotos } from './tours/TripSections';
import { missingDetailsNote, splitDescription, tripFacts, tripPrice, upcomingDepartures } from './tours/tripFormat';
import './experiences.css';
import './tours.css';
import './cards/cards.css';
import './tours/trip.css';

/**
 * One trip, always read from its operator's catalogue. Each part shows only when the listing has it:
 * demo trips carry a name, a price, one photo and a short description, so the page stays honest and short.
 */
export function TourDetail({ merchantId, itemId, provider, onBack, onOperator, onOpen }: {
  merchantId: string; itemId: string; provider: DiscoveryProvider; onBack: () => void;
  onOperator: (id: string) => void; onOpen: (id: string, itemId?: string) => void;
}) {
  const catalog = useProviderRead(`tour:${merchantId}:${itemId}`, (signal) => provider.getMerchant(merchantId, signal));
  const merchant = catalog.value;
  const item = merchant && isTourOperator(merchant) ? merchant.items.find((entry) => entry.id === itemId && entry.merchantId === merchantId) : undefined;
  const [planning, setPlanning] = useState(false);
  // One plan feeds both the booking card and "Customise this tour", so nothing is lost between them.
  const [plan, setPlan] = useState(initialTripPlan);
  const headerHeight = useHeaderHeight();
  const today = localDateKey();

  if (planning && merchant && item) return <TourPlanner merchant={merchant} item={item} plan={plan} onChange={setPlan} onClose={() => { setPlanning(false); window.scrollTo(0, 0); }} />;

  const choice: TripChoice = { dates: { from: plan.dates.start, to: plan.dates.end }, travellers: plan.adults + plan.children + plan.infants };
  const choose = (next: TripChoice) => setPlan({
    ...plan,
    dates: { start: next.dates.from, end: next.dates.to },
    adults: Math.max(1, next.travellers - plan.children - plan.infants),
  });
  const customise = () => { setPlanning(true); window.scrollTo(0, 0); };
  const trip = item?.trip;
  const { summary, overview } = splitDescription(item?.description);
  const others = merchant && item ? merchant.items.filter((entry) => entry.id !== item.id && entry.merchantId === merchant.id).slice(0, 4) : [];

  return <section className="trip-page" aria-busy={catalog.loading} style={{ '--trip-sticky-top': `${headerHeight}px` } as CSSProperties}>
    <button type="button" className="back-button trip-page__back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Back to Safaris & Tours</button>
    {catalog.loading || catalog.error ? <CatalogState loading={catalog.loading} error={catalog.error} failure={catalog.failure} retry={catalog.retry} /> : !merchant || !item ? <div className="empty-state" role="status">
      <h1>Trip not found</h1><p>This link does not identify a trip in the operator's current catalog.</p>
      {merchant && <button type="button" className="button" onClick={() => onOperator(merchant.id)}>View {merchant.name} storefront</button>}
    </div> : <>
      <header className="trip-page__header">
        <h1>{item.name}</h1>
        <p className="trip-page__operator">Operated by <button type="button" onClick={() => onOperator(merchant.id)}>{merchant.name}</button></p>
        {summary && <p className="trip-page__summary">{summary}</p>}
      </header>
      <div className="trip-page__layout">
        <TripPhotos photos={[item.image, ...(trip?.photos ?? [])]} name={item.name} />
        <TripFacts facts={tripFacts(item, merchant, tourLabel(merchant))} />
        <aside className="trip-page__booking" aria-label="Request this trip">
          <TripBooking operator={merchant.name} price={tripPrice(item)} departures={upcomingDepartures(trip, today)} choice={choice} onChange={choose}
            today={today} onCustomise={customise} minTravellers={plan.children + plan.infants + 1} unavailable={item.isAvailable === false} />
        </aside>
        <div className="trip-page__details">
          <TripOverview text={overview} highlights={trip?.highlights} />
          <TripItinerary days={trip?.itinerary} />
          <TripIncluded included={trip?.included} excluded={trip?.excluded} addOns={trip?.addOns} />
          <TripNote text={missingDetailsNote(trip, merchant.name)} />
        </div>
      </div>
      {others.length > 0 && <section className="trip-page__more" aria-label={`More trips from ${merchant.name}`}>
        <h2>More trips from {merchant.name}</h2>
        <ExperienceGrid merchantContext offerings={others.map((entry) => ({ merchant, item: entry }))} onOpen={onOpen} />
      </section>}
    </>}
  </section>;
}
