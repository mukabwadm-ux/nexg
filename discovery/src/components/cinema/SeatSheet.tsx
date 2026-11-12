import { useMemo, useState } from 'react';
import { Check, Info, X } from 'lucide-react';
import type { Merchant } from '../../providers/DiscoveryProvider';
import {
  MAX_SEATS, dayName, endsAround, formatMoney, nairobiDay, seatIndex, seatList, seatTypeLabel, showtimeClock, strandedSeats, ticketSummary, toggleSeat,
  type CinemaConnector, type Film, type Seat, type Showing,
} from '../../data/cinema/cinema';
import { forgetTicketRequest, keepTicketRequest, readTicketRequests, type TicketRequest } from '../../data/cinema/ticketRequests';
import { useModalDialog } from '../cart/useModalDialog';
import { useProviderRead } from '../../hooks/useProviderRead';
import { SeatMap } from './SeatMap';
import { ShowtimeChips } from './CinemaParts';

/**
 * The seat sheet: the film, the cinema and the time (other times that day switch it in place), the seat map, then a
 * pinned footer with the seats and the total. A bottom sheet on phones, a centred panel on wider screens. The cinema's
 * system owns the seats, so the map is a snapshot with its time, and a choice is kept on this device as a request
 * until NexG can ask the cinema to hold seats (CinemaConnector.holds).
 */
export function SeatSheet({ merchant, film, showing, showings, connector, onSwitch, onClose, onKept }: {
  merchant: Pick<Merchant, 'id' | 'name'>;
  film: Film;
  showing: Showing;
  /** This film's other showings at this cinema on the same day. */
  showings: Showing[];
  connector: CinemaConnector;
  onSwitch: (showing: Showing) => void;
  onClose: () => void;
  onKept: (requests: TicketRequest[]) => void;
}) {
  const dialog = useModalDialog(onClose);
  const seats = useProviderRead(`cinema-seats:${connector.id}:${showing.id}`, (signal) => connector.getSeats(showing, signal));
  const keptSeats = (id: string) => readTicketRequests(merchant.id).find((request) => request.showingId === id)?.seats ?? [];
  const [forShowing, setForShowing] = useState(showing.id);
  const [selected, setSelected] = useState<string[]>(() => keptSeats(showing.id));
  const [kept, setKept] = useState(() => keptSeats(showing.id).length > 0);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string>();
  if (forShowing !== showing.id) {
    setForShowing(showing.id);
    const previous = keptSeats(showing.id);
    setSelected(previous); setKept(previous.length > 0); setSaved(false); setNotice(undefined);
  }

  const snapshot = seats.value;
  const index = useMemo(() => snapshot ? seatIndex(snapshot.plan) : new Map<string, Seat>(), [snapshot]);
  const taken = useMemo(() => new Set(snapshot?.taken ?? []), [snapshot]);
  // Seats chosen earlier that the cinema now shows as taken drop out of the choice.
  const chosen = snapshot ? selected.filter((id) => index.has(id) && !taken.has(id)) : selected;
  const chosenSet = new Set(chosen);
  const summary = ticketSummary(showing, index, chosen);
  const stranded = snapshot ? strandedSeats(snapshot.plan, taken, chosenSet) : [];
  const ends = endsAround(showing, film);
  const day = nairobiDay(showing.startsAt);

  // Works from the latest choice, so quick taps never drop a seat.
  const toggle = (seat: Seat) => {
    const full = !chosen.includes(seat.id) && chosen.length >= MAX_SEATS;
    setSaved(false);
    setNotice(taken.has(seat.id) ? 'That seat is taken.' : full ? `You can choose up to ${MAX_SEATS} seats at a time.` : undefined);
    setSelected((current) => toggleSeat(current.filter((id) => index.has(id) && !taken.has(id)), seat.id, index, taken).selected);
  };
  const save = () => {
    if (!chosen.length) return;
    onKept(keepTicketRequest({
      showingId: showing.id, merchantId: merchant.id, filmId: film.id, filmTitle: film.title, screenName: showing.screenName, startsAt: showing.startsAt,
      format: showing.format, seats: chosen, total: summary.total, currency: showing.currency, savedAt: new Date().toISOString(),
    }));
    setKept(true); setSaved(true); setNotice(undefined);
  };
  const remove = () => { onKept(forgetTicketRequest(merchant.id, showing.id)); setSelected([]); setKept(false); setSaved(false); };

  const action = chosen.length === 0 ? 'Choose your seats' : `${kept ? 'Update' : 'Save'} request${summary.total !== undefined ? ` · ${formatMoney(summary.total, summary.currency)}` : ''}`;
  return <dialog {...dialog.props} className="seat-sheet" aria-labelledby="seat-sheet-title">
    <div className="seat-sheet__frame">
      <span className="seat-sheet__handle" aria-hidden="true" />
      <header className="seat-sheet__header">
        <p className="seat-sheet__eyebrow">{merchant.name} · {showing.screenName}</p>
        <h2 id="seat-sheet-title">{film.title}</h2>
        <p className="seat-sheet__when">{dayName(day)} · {showtimeClock(showing.startsAt)}{ends && <> to about {ends}</>} · {showing.format}</p>
        <button type="button" className="seat-sheet__close" onClick={dialog.close} aria-label="Close"><X size={20} strokeWidth={2} aria-hidden="true" /></button>
        {showings.length > 1 && <ShowtimeChips showings={showings} current={showing.id} label={`Other times for ${film.title}`} onOpen={onSwitch} />}
      </header>

      <div className="seat-sheet__body">
        {seats.loading && !snapshot && <div className="seat-sheet__status" role="status">Loading seats…</div>}
        {seats.error && !snapshot && <div className="seat-sheet__status" role="alert">
          <p>The seats for this showing couldn’t load.</p>
          <button type="button" onClick={seats.retry}>Try again</button>
        </div>}
        {snapshot && <>
          <SeatMap plan={snapshot.plan} showing={showing} taken={taken} selected={chosenSet} onToggle={toggle} />
          <p className="seat-sheet__fresh">Seats as of {showtimeClock(snapshot.observedAt)}. {merchant.name} confirms them.</p>
        </>}
        {notice && <p className="seat-sheet__notice" role="status"><Info size={16} strokeWidth={2} aria-hidden="true" />{notice}</p>}
        {stranded.length > 0 && <p className="seat-sheet__notice" role="status"><Info size={16} strokeWidth={2} aria-hidden="true" />
          This leaves {seatList(stranded)} on {stranded.length === 1 ? 'its' : 'their'} own. Cinemas usually ask you not to leave single seats.</p>}
      </div>

      <footer className="seat-sheet__footer">
        {saved ? <div className="seat-sheet__saved" role="status">
          <Check size={20} strokeWidth={2} aria-hidden="true" />
          <div><strong>Saved on this device</strong><span>Not sent to {merchant.name} yet. Booking cinema seats isn’t on NexG yet.</span></div>
          <button type="button" className="seat-sheet__primary" onClick={dialog.close}>Done</button>
        </div> : <>
          <div className="seat-sheet__summary" aria-live="polite">
            {chosen.length ? <>
              <strong>{chosen.length === 1 ? '1 seat' : `${chosen.length} seats`} · {seatList(chosen)}</strong>
              <span>{summary.lines.map((line) => `${line.seats.length} × ${seatTypeLabel[line.type]}${line.price !== undefined ? ` ${formatMoney(line.price, summary.currency)}` : ''}`).join(' · ')}
                {summary.unpriced > 0 && ` · ${merchant.name} prices the rest`}</span>
            </> : <span>Tap the seats you want. Up to {MAX_SEATS}.</span>}
          </div>
          <div className="seat-sheet__actions">
            {kept && <button type="button" className="seat-sheet__secondary" onClick={remove}>Remove request</button>}
            <button type="button" className="seat-sheet__primary" disabled={!chosen.length} onClick={save}>{action}</button>
          </div>
        </>}
      </footer>
    </div>
  </dialog>;
}
