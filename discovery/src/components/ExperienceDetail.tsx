import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, Trash2 } from 'lucide-react';
import type { CatalogItem, DiscoveryProvider, Merchant } from '../providers/DiscoveryProvider';
import { useProviderRead } from '../hooks/useProviderRead';
import { formatPrice } from '../lib/formatPrice';
import { shortDate } from '../lib/calendar';
import { localDateKey } from '../data/massagePresentation';
import {
  experienceBooking, experienceDescription, experienceFacts, experienceLabel, hostConfirms, isDirectExperienceMerchant, listedDates, listedTotal,
  MAX_EXPERIENCE_COUNT, readExperienceRequest, writeExperienceRequest, type ExperienceBooking, type ExperienceRequest,
} from '../data/experiencePresentation';
import { CatalogState } from './CatalogState';
import { DatePicker } from './DatePicker';
import { ExperienceGrid } from './ExperienceCard';
import { MerchantLogo } from './MerchantCard';
import { RailHeading } from './Rail';
import { Stepper } from './cards/OfferingSheet';
import { TripFacts } from './tours/TripFacts';
import { TripOverview, TripPhotos } from './tours/TripSections';
import { departureLabel, tripPrice, type TripDeparture } from './tours/tripFormat';
import './tours/trip.css';
import './experiences.css';

/** Height of the sticky site header, so the booking card sticks just below it. */
function useHeaderHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.discovery-header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const measure = () => setHeight(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

function deviceStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface EventChoice { date?: string; count: number }

/**
 * The booking card: a date (one the listing names, or the shopper's preferred date), a ticket or guest
 * count and the listed total. The primary action keeps the request on this device and the status line says
 * nothing has been sent; any change turns the button back. Styles: trip.css (.trip-booking) and experiences.css.
 */
export function EventBooking({ host, item, booking, dates, today, choice, onChange, onRequest, onRemove, saved = false, kept = false, status = '', tone }: {
  host: string; item: CatalogItem; booking: ExperienceBooking; dates: TripDeparture[]; today: string;
  choice: EventChoice; onChange: (choice: EventChoice) => void; onRequest: () => void; onRemove?: () => void;
  /** The current choice is the request kept on this device. */
  saved?: boolean;
  /** A request for this item is kept on this device. */
  kept?: boolean;
  status?: string; tone?: 'saved' | 'error';
}) {
  const titleId = useId();
  const group = useId();
  const unit = formatPrice(item, 'code');
  const total = listedTotal(item, choice.count);
  return <section className="trip-booking event-booking" aria-labelledby={titleId}>
    <h2 id={titleId} className="trip-booking__price">{tripPrice(item)}</h2>
    <p className="trip-booking__lead">{hostConfirms(host, dates.length > 0)}</p>

    {dates.length ? <fieldset className="trip-booking__departures">
      <legend className="trip-booking__label">Date</legend>
      {dates.map((date) => <label key={date.start} className="trip-booking__departure">
        <input type="radio" name={group} checked={choice.date === date.start} onChange={() => onChange({ ...choice, date: date.start })} />
        <CalendarDays size={20} strokeWidth={1.5} aria-hidden="true" /><span>{departureLabel(date)}</span>
      </label>)}
    </fieldset> : <div className="trip-booking__dates">
      <DatePicker label="Preferred date" mode="single" min={today} value={{ from: choice.date }} onChange={(range) => onChange({ ...choice, date: range.from })} />
    </div>}

    <div className="event-booking__count">
      <Stepper label={booking.countLabel} value={choice.count} min={1} max={MAX_EXPERIENCE_COUNT} onChange={(count) => onChange({ ...choice, count })} />
    </div>
    {total && unit && <p className="event-booking__total">
      <span><span className="event-booking__total-label">Listed total</span>{booking.count(choice.count)} × {unit}</span>
      <strong>{total}</strong>
    </p>}

    <div className="trip-booking__actions">
      <button type="button" className="trip-booking__primary" disabled={item.isAvailable === false} onClick={onRequest}>
        {saved ? <>Request saved<Check size={18} strokeWidth={2} aria-hidden="true" /></> : booking.action}
      </button>
    </div>
    <p role="status" className={`trip-booking__status${tone === 'error' ? ' is-error' : tone === 'saved' ? ' is-saved' : ''}`}>{status}</p>
    {kept && onRemove && <button type="button" className="event-booking__remove" onClick={onRemove}><Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />Remove saved request</button>}
  </section>;
}

/**
 * One event, workshop, class or activity, always read from its host's catalogue, on the trip page's frame:
 * title and host, photo, known facts, overview, and a booking card (sticky on desktop; on phones a bottom
 * bar stands in while the card is off screen). Then more from the same host. Nothing is booked or paid here.
 */
export function ExperienceDetail({ merchantId, itemId, provider, onBack, onMerchant, onOpen }: {
  merchantId: string; itemId: string; provider: DiscoveryProvider; onBack: () => void;
  onMerchant: (id: string) => void; onOpen: (id: string, itemId?: string) => void;
}) {
  const catalog = useProviderRead(`experience:${merchantId}:${itemId}`, (signal) => provider.getMerchant(merchantId, signal));
  const merchant = catalog.value;
  const item = merchant && isDirectExperienceMerchant(merchant) ? merchant.items.find((entry) => entry.id === itemId && entry.merchantId === merchantId) : undefined;
  const headerHeight = useHeaderHeight();
  return <section className="trip-page event-page" aria-busy={catalog.loading} style={{ '--trip-sticky-top': `${headerHeight}px` } as CSSProperties}>
    <button type="button" className="back-button trip-page__back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />Back</button>
    {catalog.loading || catalog.error ? <CatalogState loading={catalog.loading} error={catalog.error} failure={catalog.failure} retry={catalog.retry} />
      : !merchant || !item ? <div className="empty-state" role="status">
        <h1>Experience not found</h1>
        <p>This link doesn’t match an experience listed on NexG right now.</p>
        {merchant && <button type="button" className="button" onClick={() => onMerchant(merchant.id)}>View {merchant.name}</button>}
      </div>
      : <EventPage key={item.id} merchant={merchant} item={item} headerHeight={headerHeight} onMerchant={onMerchant} onOpen={onOpen} />}
  </section>;
}

function EventPage({ merchant, item, headerHeight, onMerchant, onOpen }: {
  merchant: Merchant; item: CatalogItem; headerHeight: number; onMerchant: (id: string) => void; onOpen: (id: string, itemId?: string) => void;
}) {
  const today = localDateKey();
  const booking = experienceBooking(merchant);
  const label = experienceLabel(merchant);
  const dates = listedDates(item, today);
  const { summary, overview } = experienceDescription(item);
  const others = merchant.items.filter((entry) => entry.id !== item.id && entry.merchantId === merchant.id).slice(0, 8);
  const moreId = useId();
  const card = useRef<HTMLElement>(null);
  const [kept, setKept] = useState<ExperienceRequest | undefined>(() => readExperienceRequest(deviceStorage(), merchant.id, item.id, today));
  const [choice, setChoice] = useState<EventChoice>(() => ({
    date: kept && (!dates.length || dates.some((date) => date.start === kept.date)) ? kept.date : undefined,
    count: kept?.count ?? 1,
  }));
  const [visitOnly, setVisitOnly] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cardInView, setCardInView] = useState(true);
  const unavailable = item.isAvailable === false;
  const saved = Boolean(kept && kept.date === choice.date && kept.count === choice.count);
  const price = tripPrice(item);
  const total = listedTotal(item, choice.count);

  // Phones: the bottom bar shows while the booking card is off screen (under the header or below the bar).
  useEffect(() => {
    const element = card.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setCardInView(Boolean(entry?.isIntersecting)), { rootMargin: `-${headerHeight}px 0px -96px 0px` });
    observer.observe(element);
    return () => observer.disconnect();
  }, [headerHeight]);

  /** Opens the card's calendar (or focuses the first listed date), the one thing a request still needs. */
  const openDate = () => {
    const element = card.current;
    const trigger = element?.querySelector<HTMLButtonElement>('.date-picker__trigger');
    const radio = element?.querySelector<HTMLInputElement>('input[type="radio"]');
    if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    (radio ?? trigger)?.focus({ preventScroll: true });
  };
  const change = (next: EventChoice) => { setError(''); setNotice(''); setChoice(next); };
  const request = () => {
    if (unavailable) return;
    if (!choice.date) { setNotice(''); setError('Choose a date first.'); openDate(); return; }
    const next: ExperienceRequest = { date: choice.date, count: choice.count, savedAt: new Date().toISOString() };
    setVisitOnly(!writeExperienceRequest(deviceStorage(), merchant.id, item.id, next));
    setKept(next); setError(''); setNotice('');
  };
  const remove = () => {
    writeExperienceRequest(deviceStorage(), merchant.id, item.id);
    setKept(undefined); setVisitOnly(false); setNotice('Removed from this device.');
  };
  /** Brings the booking card up under the header; "Choose a date" also opens its calendar. */
  const showCard = (withDate: boolean) => {
    const element = card.current;
    if (!element) return;
    if (withDate) openDate();
    requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - headerHeight - 12), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  };

  const status = unavailable ? 'Currently unavailable'
    : error || (saved ? `${visitOnly ? 'Saved for this visit only' : 'Saved on this device'}. Nothing has been sent to ${merchant.name} yet.` : notice);
  const bar = saved ? { title: 'Request saved', detail: 'On this device, not sent yet', action: 'Review', run: () => showCard(false) }
    : choice.date ? { title: total ?? price, detail: `${booking.count(choice.count)} · ${shortDate(choice.date)}`, action: booking.action, run: request }
    : { title: price, detail: dates.length ? 'Choose one of the listed dates' : 'Choose your preferred date', action: 'Choose a date', run: () => showCard(true) };

  return <>
    <header className="trip-page__header event-page__header">
      {label && <p className="event-page__eyebrow">{label}</p>}
      <h1>{item.name}</h1>
      <button type="button" className="event-page__host" onClick={() => onMerchant(merchant.id)}>
        <MerchantLogo merchant={merchant} />
        <span>By <strong>{merchant.name}</strong></span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {summary && <p className="trip-page__summary">{summary}</p>}
    </header>
    <div className="trip-page__layout">
      <TripPhotos photos={[item.image]} name={item.name} />
      <TripFacts facts={experienceFacts(item, merchant)} label="Experience facts" />
      <aside ref={card} className="trip-page__booking" aria-label={booking.action}>
        <EventBooking host={merchant.name} item={item} booking={booking} dates={dates} today={today} choice={choice} onChange={change}
          onRequest={request} onRemove={remove} saved={saved} kept={Boolean(kept)} status={status} tone={error || unavailable ? 'error' : saved ? 'saved' : undefined} />
      </aside>
      {overview && <div className="trip-page__details"><TripOverview text={overview} /></div>}
    </div>
    {others.length > 0 && <section className="event-page__more" aria-labelledby={moreId}>
      <RailHeading id={moreId} title={`More from ${merchant.name}`} action={{ label: 'View all', onClick: () => onMerchant(merchant.id) }} />
      <ExperienceGrid layout="rail" label={`More from ${merchant.name}`} merchantContext omitTag={label} offerings={others.map((entry) => ({ merchant, item: entry }))} onOpen={onOpen} />
    </section>}
    {!unavailable && <div className={`event-bar${cardInView ? '' : ' is-shown'}`} aria-hidden={cardInView} inert={cardInView}>
      <p className="event-bar__text"><strong>{bar.title}</strong><span>{bar.detail}</span></p>
      <button type="button" className="event-bar__action" onClick={bar.run}>{bar.action}</button>
    </div>}
  </>;
}
