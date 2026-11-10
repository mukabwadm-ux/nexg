import { useId } from 'react';
import { Check, ChevronDown, Info, X } from 'lucide-react';
import type { TripDetails } from '../../providers/DiscoveryProvider';
import { ImageWithFallback } from '../ImageWithFallback';
import { listJoin } from './tripFormat';

/** One wide photo, or a big photo with up to two smaller ones. No lightbox yet. */
export function TripPhotos({ photos, name }: { photos: (string | undefined)[]; name: string }) {
  const shown = [...new Set(photos.filter((photo): photo is string => Boolean(photo)))].slice(0, 3);
  if (shown.length < 2) return <div className="trip-photos trip-photos--single">
    <ImageWithFallback src={shown[0]} alt={name} width={1280} height={560} className="trip-photos__image" referrerPolicy="no-referrer" />
  </div>;
  return <div className={`trip-photos trip-photos--${shown.length}`}>
    {shown.map((src, index) => <ImageWithFallback key={src} src={src} alt={index === 0 ? name : ''} width={index ? 480 : 1100} height={index ? 420 : 560}
      className="trip-photos__image" loading={index ? 'lazy' : undefined} referrerPolicy="no-referrer" />)}
  </div>;
}

export function TripOverview({ text, highlights }: { text?: string; highlights?: string[] }) {
  const titleId = useId();
  if (!text && !highlights?.length) return null;
  return <section className="trip-section" aria-labelledby={titleId}>
    <h2 id={titleId}>Overview</h2>
    {text && <p className="trip-section__text">{text}</p>}
    {highlights?.length ? <ul className="trip-chips" aria-label="Highlights">{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
  </section>;
}

/** Numbered day cards: three across on desktop, stacked on phones. */
export function TripItinerary({ days }: { days?: TripDetails['itinerary'] }) {
  const titleId = useId();
  if (!days?.length) return null;
  return <section className="trip-section" aria-labelledby={titleId}>
    <h2 id={titleId}>{days.length}-day itinerary</h2>
    <ol className="trip-days">
      {days.map((day, index) => <li key={`${index}:${day.title}`} className="trip-day">
        <span className="trip-day__number" aria-hidden="true">{index + 1}</span>
        <div className="trip-day__body">
          <p className="trip-day__label">Day {index + 1}</p>
          <h3>{day.title}</h3>
          {day.description && <p className="trip-day__text">{day.description}</p>}
        </div>
      </li>)}
    </ol>
  </section>;
}

/** "What's included" folds away; the optional add-ons line sits beside it. */
export function TripIncluded({ included, excluded, addOns }: { included?: string[]; excluded?: string[]; addOns?: string[] }) {
  const lists = Boolean(included?.length || excluded?.length);
  if (!lists && !addOns?.length) return null;
  return <div className="trip-included-row">
    {lists && <details className="trip-included">
      <summary>What’s included<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" /></summary>
      <div className="trip-included__lists">
        {included?.length ? <div><h3>Included</h3><ul>{included.map((entry) => <li key={entry}><Check size={16} strokeWidth={2} aria-hidden="true" />{entry}</li>)}</ul></div> : null}
        {excluded?.length ? <div><h3>Not included</h3><ul className="is-excluded">{excluded.map((entry) => <li key={entry}><X size={16} strokeWidth={2} aria-hidden="true" />{entry}</li>)}</ul></div> : null}
      </div>
    </details>}
    {addOns?.length ? <p className="trip-addons">Optional add-ons · {listJoin(addOns)}</p> : null}
  </div>;
}

export function TripNote({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="trip-note"><Info size={18} strokeWidth={1.5} aria-hidden="true" /><span>{text}</span></p>;
}
