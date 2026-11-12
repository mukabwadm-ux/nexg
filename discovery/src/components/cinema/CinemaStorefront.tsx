import { useMemo, useState, type ReactNode } from 'react';
import { CalendarX2, Clapperboard, Clock3, MapPin, Ticket } from 'lucide-react';
import type { Merchant } from '../../providers/DiscoveryProvider';
import { filmFacts, filmsOnDay, formatMoney, fromPrice, nairobiDay, onSale, showingDays, type CinemaConnector, type Showing } from '../../data/cinema/cinema';
import { cinemaConnector } from '../../data/cinema/connector';
import { readTicketRequests } from '../../data/cinema/ticketRequests';
import { useProviderRead } from '../../hooks/useProviderRead';
import { CatalogState } from '../CatalogState';
import { StoreHero } from '../storefronts/StoreHero';
import { DayTabs, FilmPoster, ShowtimeChips } from './CinemaParts';
import { SeatSheet } from './SeatSheet';
import './cinema.css';

const configured = cinemaConnector();

/**
 * A cinema's own page (cinema first): the shared store header, day tabs, then each film showing that day with its
 * times. A time opens the seat sheet. A film's title opens its film page, with every cinema showing it.
 */
export function CinemaStorefront({ merchant, onBack, onFilm, connector = configured, now: fixedNow }: {
  merchant: Merchant;
  onBack: () => void;
  onFilm: (filmId: string) => void;
  connector?: CinemaConnector;
  /** For tests: the moment the page treats as now. */
  now?: Date;
}) {
  const [now] = useState(() => fixedNow ?? new Date());
  const today = nairobiDay(now);
  const programme = useProviderRead(`cinema:${connector?.id ?? 'none'}:${merchant.id}:${today}`,
    (signal) => connector ? connector.getProgramme({ merchantId: merchant.id, from: now, days: 7 }, signal) : Promise.resolve(undefined));
  const showings = useMemo(() => programme.value ? onSale(programme.value.showings, now) : [], [programme.value, now]);
  const days = useMemo(() => showingDays(showings), [showings]);
  const [chosenDay, setChosenDay] = useState<string>();
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : days[0];
  const films = useMemo(() => programme.value && day ? filmsOnDay({ ...programme.value, showings }, day) : [], [programme.value, showings, day]);
  const [open, setOpen] = useState<Showing>();
  const [requests, setRequests] = useState(() => readTicketRequests(merchant.id, now));
  const listed = requests.filter((request) => showings.some((showing) => showing.id === request.showingId));
  const openFilm = open && programme.value?.films.find((film) => film.id === open.filmId);

  const place = merchant.area || merchant.address;
  const facts: ReactNode[] = [
    place && <><MapPin size={16} strokeWidth={1.75} aria-hidden="true" />{place}</>,
    programme.value && programme.value.films.length > 0 && <><Clapperboard size={16} strokeWidth={1.75} aria-hidden="true" />{programme.value.films.length === 1 ? '1 film' : `${programme.value.films.length} films`} this week</>,
    typeof merchant.isOpen === 'boolean' && <><Clock3 size={16} strokeWidth={1.75} aria-hidden="true" />{merchant.isOpen ? 'Open now' : 'Closed now'}</>,
  ];

  return <div className={`cinema-store${listed.length ? ' has-basket' : ''}`}>
    <StoreHero merchant={merchant} eyebrow="Cinema" facts={facts} onBack={onBack} />

    {!connector ? <div className="store-empty">
      <CalendarX2 size={26} strokeWidth={1.5} aria-hidden="true" />
      <h2>Showtimes aren’t on NexG yet</h2>
      <p>{merchant.name} hasn’t connected its showtimes to NexG yet.</p>
    </div> : programme.loading || programme.failure ? <CatalogState loading={programme.loading} failure={programme.failure} retry={programme.retry} skeleton="rows" loadingLabel="Loading showtimes…" />
      : !day ? <div className="store-empty">
        <CalendarX2 size={26} strokeWidth={1.5} aria-hidden="true" />
        <h2>No showtimes this week</h2>
        <p>{merchant.name} hasn’t listed any showings for the next seven days.</p>
      </div> : <>
        <DayTabs days={days} today={today} selected={day} onSelect={setChosenDay} />
        <ul className="cinema-films">
          {films.map(({ film, showings: times }) => {
            const from = fromPrice(times);
            return <li key={film.id} className="cinema-film">
              <button type="button" className="cinema-film__poster" onClick={() => onFilm(film.id)} aria-label={`About ${film.title}`}><FilmPoster film={film} /></button>
              <div className="cinema-film__text">
                <h2><button type="button" onClick={() => onFilm(film.id)}>{film.title}</button></h2>
                <p className="cinema-film__facts">{[...filmFacts(film), film.genres[0]].filter(Boolean).join(' · ')}</p>
                {from && <p className="cinema-film__price">From {formatMoney(from.amount, from.currency)}</p>}
                <ShowtimeChips showings={times} label={`Times for ${film.title}`} onOpen={setOpen} />
              </div>
            </li>;
          })}
        </ul>
      </>}

    {listed.length > 0 && !open && <div className="store-basket cinema-store__basket">
      <Ticket size={18} strokeWidth={2} aria-hidden="true" />
      <div className="store-basket__text"><strong>{listed.length === 1 ? '1 ticket request' : `${listed.length} ticket requests`} on this device</strong><span>Not sent to {merchant.name} yet</span></div>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(showings.find((showing) => showing.id === listed[0]!.showingId))}>Review</button>
    </div>}

    {open && openFilm && connector && <SeatSheet merchant={merchant} film={openFilm} showing={open} connector={connector}
      showings={showings.filter((showing) => showing.filmId === open.filmId && nairobiDay(showing.startsAt) === nairobiDay(open.startsAt))}
      onSwitch={setOpen} onClose={() => setOpen(undefined)} onKept={setRequests} />}
  </div>;
}
