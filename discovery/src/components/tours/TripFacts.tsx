import { Banknote, Building2, Clock3, Compass, GraduationCap, MapPin, Sun, Ticket, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { TripFact, TripFactKey } from './tripFormat';

const icons: Record<TripFactKey, LucideIcon> = {
  duration: Clock3, location: MapPin, style: Users, season: Sun, type: Compass, base: Building2, price: Banknote,
  event: Ticket, class: GraduationCap, sport: Trophy,
};

/** One row of facts: icon, small label, value. The trip page and the experience page share it. Styles live in trip.css. */
export function TripFacts({ facts, label = 'Trip facts' }: { facts: TripFact[]; label?: string }) {
  if (!facts.length) return null;
  return <ul className="trip-facts" aria-label={label}>
    {facts.map(({ key, label: name, value }) => {
      const Icon = icons[key];
      return <li key={key} className="trip-facts__item">
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
        <span className="trip-facts__label">{name}</span>
        <strong className="trip-facts__value">{value}</strong>
      </li>;
    })}
  </ul>;
}
