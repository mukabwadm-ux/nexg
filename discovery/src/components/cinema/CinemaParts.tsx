import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { dayTab, showtimeClock, type Film, type Showing } from '../../data/cinema/cinema';
import { ImageWithFallback } from '../ImageWithFallback';

/** Day tabs, as District's: "Today / Wed 12 Nov", "Tomorrow / Thu 13 Nov", then "Fri / 14 Nov". 40px or taller. */
export function DayTabs({ days, today, selected, onSelect }: { days: string[]; today: string; selected?: string; onSelect: (day: string) => void }) {
  return <div className="cinema-days" role="group" aria-label="Choose a day">
    {days.map((day) => {
      const tab = dayTab(day, today);
      return <button key={day} type="button" className="cinema-day" aria-pressed={day === selected} onClick={() => onSelect(day)}>
        <span>{tab.label}</span><small>{tab.detail}</small>
      </button>;
    })}
  </div>;
}

/** One chip per showing: the time, then its format. Opens the seat sheet. */
export function ShowtimeChips({ showings, label, onOpen, current }: { showings: Showing[]; label: string; onOpen: (showing: Showing) => void; current?: string }) {
  return <ul className="showtimes" aria-label={label}>
    {showings.map((showing) => <li key={showing.id}>
      <button type="button" className="showtime" aria-pressed={current ? showing.id === current : undefined} onClick={() => onOpen(showing)}
        aria-label={`${showtimeClock(showing.startsAt)}, ${showing.format}, ${showing.screenName}`}>
        <strong>{showtimeClock(showing.startsAt)}</strong><span>{showing.format}</span>
      </button>
    </li>)}
  </ul>;
}

/** A film's poster, or its title on a quiet panel when the source sends none. */
export function FilmPoster({ film, className = '' }: { film: Film; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (film.poster && !failed) return <ImageWithFallback src={film.poster} alt="" className={`film-poster ${className}`.trim()} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return <span className={`film-poster film-poster--plain ${className}`.trim()} aria-hidden="true"><Clapperboard size={22} strokeWidth={1.5} /><span>{film.title}</span></span>;
}
