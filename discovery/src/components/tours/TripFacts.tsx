import { Banknote, Building2, Clock3, Compass, MapPin, Sun, Users, type LucideIcon } from 'lucide-react';
import type { TripFact, TripFactKey } from './tripFormat';

const icons: Record<TripFactKey, LucideIcon> = { duration: Clock3, location: MapPin, style: Users, season: Sun, type: Compass, base: Building2, price: Banknote };

/** One row of trip facts: icon, small label, value. Styles live in trip.css. */
export function TripFacts({ facts }: { facts: TripFact[] }) {
  if (!facts.length) return null;
  return <ul className="trip-facts" aria-label="Trip facts">
    {facts.map(({ key, label, value }) => {
      const Icon = icons[key];
      return <li key={key} className="trip-facts__item">
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
        <span className="trip-facts__label">{label}</span>
        <strong className="trip-facts__value">{value}</strong>
      </li>;
    })}
  </ul>;
}
