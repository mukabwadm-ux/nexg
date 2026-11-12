import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarX2, ExternalLink, MapPin, Pause, Play } from 'lucide-react';
import type { DiscoveryProvider, Merchant } from '../../providers/DiscoveryProvider';
import { cinemasOnDay, filmFacts, formatMoney, fromPrice, nairobiDay, onSale, showingDays, type CinemaConnector, type Film, type Showing } from '../../data/cinema/cinema';
import { cinemaConnector } from '../../data/cinema/connector';
import { useProviderRead } from '../../hooks/useProviderRead';
import { CatalogState } from '../CatalogState';
import { MerchantLogo } from '../MerchantCard';
import { DayTabs, FilmPoster, ShowtimeChips } from './CinemaParts';
import { SeatSheet } from './SeatSheet';
import './cinema.css';

const configured = cinemaConnector();

/** Moving pictures only for people who haven't asked for less motion or less data. */
function prefersCalm(): boolean {
  if (typeof window === 'undefined') return true;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return saveData || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** The film's short silent preview, playing in place with a pause button; its poster when there's no clip or motion is off. */
function FilmMedia({ film }: { film: Film }) {
  const video = useRef<HTMLVideoElement>(null);
  const [calm] = useState(prefersCalm);
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) { void element.play().catch(() => setPaused(true)); setPaused(false); } else { element.pause(); setPaused(true); }
  };
  if (film.preview && !calm) return <div className="film-hero__media">
    <video ref={video} src={film.preview.video} poster={film.preview.poster ?? film.poster} muted loop playsInline autoPlay preload="metadata" aria-label={`Preview of ${film.title}`} />
    <button type="button" className="film-hero__pause" onClick={toggle} aria-label={paused ? 'Play preview' : 'Pause preview'}>
      {paused ? <Play size={18} strokeWidth={2} aria-hidden="true" /> : <Pause size={18} strokeWidth={2} aria-hidden="true" />}
    </button>
  </div>;
  return <div className="film-hero__media film-hero__media--still"><FilmPoster film={film.preview?.poster ? { ...film, poster: film.preview.poster } : film} /></div>;
}

/**
 * A film's page (film first, as District's): the preview, its facts and story, then day tabs and every cinema
 * showing it that day, each with its "from" price and times. Cinemas appear only once their store has loaded, so
 * the page never lists a cinema NexG can't show.
 */
export function FilmPage({ filmId, provider, onBack, onCinema, connector = configured, now: fixedNow }: {
  filmId: string;
  provider: Pick<DiscoveryProvider, 'getMerchant'>;
  onBack: () => void;
  onCinema: (merchantId: string) => void;
  connector?: CinemaConnector;
  now?: Date;
}) {
  const [now] = useState(() => fixedNow ?? new Date());
  const today = nairobiDay(now);
  const programme = useProviderRead(`cinema-film:${connector?.id ?? 'none'}:${filmId}:${today}`,
    (signal) => connector ? connector.getProgramme({ filmId, from: now, days: 7 }, signal) : Promise.resolve(undefined));
  const film = programme.value?.films.find((entry) => entry.id === filmId);
  const showings = useMemo(() => programme.value ? onSale(programme.value.showings.filter((showing) => showing.filmId === filmId), now) : [], [programme.value, filmId, now]);
  const days = useMemo(() => showingDays(showings), [showings]);
  const [chosenDay, setChosenDay] = useState<string>();
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : days[0];
  const cinemas = useMemo(() => day ? cinemasOnDay(showings, day) : [], [showings, day]);
  const [open, setOpen] = useState<{ showing: Showing; merchant: Merchant }>();
  const [more, setMore] = useState(false);

  const back = <button type="button" className="store-back film-page__back" onClick={onBack}><ArrowLeft size={17} strokeWidth={2} aria-hidden="true" />Back</button>;
  if (!connector || (!programme.loading && !programme.failure && !film)) return <section className="film-page">
    {back}
    <div className="store-empty">
      <CalendarX2 size={26} strokeWidth={1.5} aria-hidden="true" />
      <h2>This film isn’t showing on NexG</h2>
      <p>No cinema on NexG lists it for the next seven days.</p>
    </div>
  </section>;
  if (!film) return <section className="film-page">{back}<CatalogState loading={programme.loading} failure={programme.failure} retry={programme.retry} skeleton="rows" loadingLabel="Loading the film…" /></section>;

  const facts = filmFacts(film);
  return <article className="film-page" aria-labelledby="film-title">
    <header className="film-hero">
      <FilmMedia film={film} />
      {back}
      <div className="film-hero__text">
        <h1 id="film-title">{film.title}</h1>
        {facts.length > 0 && <p className="film-hero__facts">{facts.join(' · ')}</p>}
        {film.genres.length > 0 && <ul className="film-hero__genres" aria-label="Genres">{film.genres.map((genre) => <li key={genre}>{genre}</li>)}</ul>}
        {film.synopsis && <p className={`film-hero__synopsis${more ? ' is-open' : ''}`}>{film.synopsis}</p>}
        <div className="film-hero__links">
          {film.synopsis && film.synopsis.length > 160 && <button type="button" onClick={() => setMore((value) => !value)} aria-expanded={more}>{more ? 'Show less' : 'Read more'}</button>}
          {film.trailerUrl && <a href={film.trailerUrl} target="_blank" rel="noopener noreferrer">Watch the trailer<ExternalLink size={14} strokeWidth={2} aria-hidden="true" /></a>}
        </div>
      </div>
    </header>

    <section className="film-page__showtimes" aria-labelledby="film-showtimes">
      <h2 id="film-showtimes">Showtimes</h2>
      {day ? <>
        <DayTabs days={days} today={today} selected={day} onSelect={setChosenDay} />
        <ul className="film-cinemas">
          {cinemas.map((entry) => <CinemaRow key={entry.merchantId} merchantId={entry.merchantId} showings={entry.showings} film={film} provider={provider}
            onCinema={onCinema} onOpen={(showing, merchant) => setOpen({ showing, merchant })} />)}
        </ul>
      </> : <p className="film-page__none">No showings left this week.</p>}
    </section>

    {open && <SeatSheet merchant={open.merchant} film={film} showing={open.showing} connector={connector}
      showings={showings.filter((showing) => showing.merchantId === open.showing.merchantId && nairobiDay(showing.startsAt) === nairobiDay(open.showing.startsAt))}
      onSwitch={(showing) => setOpen({ showing, merchant: open.merchant })} onClose={() => setOpen(undefined)} onKept={() => undefined} />}
  </article>;
}

function CinemaRow({ merchantId, showings, film, provider, onCinema, onOpen }: {
  merchantId: string; showings: Showing[]; film: Film; provider: Pick<DiscoveryProvider, 'getMerchant'>;
  onCinema: (merchantId: string) => void; onOpen: (showing: Showing, merchant: Merchant) => void;
}) {
  const store = useProviderRead(`merchant:${merchantId}`, (signal) => provider.getMerchant(merchantId, signal));
  if (store.loading) return <li className="film-cinema film-cinema--loading" aria-hidden="true"><span /><span /></li>;
  const merchant = store.value;
  if (!merchant) return null;
  const from = fromPrice(showings);
  const place = merchant.area || merchant.address;
  return <li className="film-cinema">
    <div className="film-cinema__head">
      <MerchantLogo merchant={merchant} className="film-cinema__logo" />
      <div>
        <h3><button type="button" onClick={() => onCinema(merchant.id)}>{merchant.name}</button></h3>
        <p>{place && <><MapPin size={14} strokeWidth={1.75} aria-hidden="true" />{place}</>}{from && <span>From {formatMoney(from.amount, from.currency)}</span>}</p>
      </div>
    </div>
    <ShowtimeChips showings={showings} label={`Times for ${film.title} at ${merchant.name}`} onOpen={(showing) => onOpen(showing, merchant)} />
  </li>;
}
