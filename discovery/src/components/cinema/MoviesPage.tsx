import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { filmFacts, filmsOnDay, formatMoney, fromPrice, nairobiDay, onSale, showingDays, type CinemaConnector } from '../../data/cinema/cinema';
import { cinemaConnector } from '../../data/cinema/connector';
import { useProviderRead } from '../../hooks/useProviderRead';
import { CatalogState } from '../CatalogState';
import { DayTabs, FilmPoster } from './CinemaParts';
import './cinema.css';

const configured = cinemaConnector();

export function MoviesPage({ onBack, onFilm, connector = configured }: {
  onBack: () => void;
  onFilm: (filmId: string) => void;
  connector?: CinemaConnector;
}) {
  const [now] = useState(() => new Date());
  const [chosenDay, setChosenDay] = useState<string>();
  const today = nairobiDay(now);
  const programme = useProviderRead(`cinema-movies:${connector?.id ?? 'none'}:${today}`,
    (signal) => connector ? connector.getProgramme({ from: now, days: 7 }, signal) : Promise.resolve(undefined));
  const showings = onSale(programme.value?.showings ?? [], now);
  const days = showingDays(showings);
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : days[0];
  const movies = programme.value && day ? filmsOnDay({ ...programme.value, showings }, day) : [];

  return <section className="film-page" aria-labelledby="movies-title">
    <button type="button" className="store-back film-page__back" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />Back</button>
    <header className="category-page-heading"><h1 id="movies-title">Movies</h1></header>
    {movies.length > 0 ? <>
      <DayTabs days={days} today={today} selected={day} onSelect={setChosenDay} />
      <ul className="cinema-films">
        {movies.map(({ film, showings: times }) => {
          const facts = filmFacts(film);
          const from = fromPrice(times);
          return <li key={film.id} className="cinema-film">
            <button type="button" className="cinema-film__poster" onClick={() => onFilm(film.id)} aria-label={`About ${film.title}`}><FilmPoster film={film} /></button>
            <div className="cinema-film__text">
              <h2><button type="button" onClick={() => onFilm(film.id)}>{film.title}</button></h2>
              {facts.length > 0 && <p className="cinema-film__facts">{facts.join(' · ')}</p>}
              {from && <p className="cinema-film__price">From {formatMoney(from.amount, from.currency)}</p>}
            </div>
          </li>;
        })}
      </ul>
    </> : <CatalogState loading={Boolean(connector && programme.loading)} failure={programme.failure} retry={programme.retry}
      skeleton="rows" loadingLabel="Loading showtimes" emptyTitle="No showtimes here yet"
      emptyText="Showtimes will appear here when cinemas publish them on NexG." />}
  </section>;
}
