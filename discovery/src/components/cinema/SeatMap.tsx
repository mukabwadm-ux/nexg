import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Accessibility } from 'lucide-react';
import { formatMoney, seatTypeLabel, type Seat, type SeatPlan, type SeatRow, type SeatType, type Showing } from '../../data/cinema/cinema';

/** A row's section: VIP if most of its seats are VIP, otherwise standard (wheelchair spaces sit inside a section). */
function rowSection(row: SeatRow): SeatType {
  const seats = row.cells.filter((cell): cell is Seat => Boolean(cell) && cell!.type !== 'wheelchair');
  return seats.filter((seat) => seat.type === 'vip').length > seats.length / 2 ? 'vip' : 'standard';
}

/**
 * The seat map: the screen at the top, rows facing it, a priced label at each section ("VIP · KES 1,300", as
 * District marks "GOLD: ₹660"), aisles as gaps and row letters on both sides. Every seat is a button that says its
 * row, number, type and state. Wide halls scroll sideways on phones and open centred.
 */
export function SeatMap({ plan, showing, taken, selected, onToggle }: {
  plan: SeatPlan; showing: Showing; taken: ReadonlySet<string>; selected: ReadonlySet<string>; onToggle: (seat: Seat) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  }, [plan.screenId]);
  const columns = Math.max(...plan.rows.map((row) => row.cells.length));
  let section: SeatType | undefined;

  return <div className="seat-map">
    <div className="seat-map__screen" aria-hidden="true"><span>Screen</span></div>
    <div ref={scroller} className="seat-map__scroll">
      <div className="seat-map__rows" style={{ '--columns': columns } as CSSProperties} role="group" aria-label={`Seats in ${plan.screenName}`}>
        {plan.rows.map((row) => {
          const kind = rowSection(row);
          const price = showing.prices[kind];
          const label = kind !== section ? `${seatTypeLabel[kind]}${price !== undefined ? ` · ${formatMoney(price, showing.currency)}` : ''}` : undefined;
          section = kind;
          return <div key={row.label} className="seat-map__block">
            {label && <p className="seat-map__section">{label}</p>}
            <div className="seat-map__row">
              <span className="seat-map__label" aria-hidden="true">{row.label}</span>
              {row.cells.map((seat, index) => seat ? <SeatButton key={seat.id} seat={seat} taken={taken.has(seat.id)} selected={selected.has(seat.id)} onToggle={onToggle} />
                : <span key={`gap-${index}`} className="seat-map__gap" aria-hidden="true" />)}
              <span className="seat-map__label" aria-hidden="true">{row.label}</span>
            </div>
          </div>;
        })}
      </div>
    </div>
    <ul className="seat-legend" aria-label="Seat key">
      <li><span className="seat-key" data-state="free" />Free</li>
      <li><span className="seat-key" data-state="taken" />Taken</li>
      <li><span className="seat-key" data-state="selected" />Yours</li>
      {plan.rows.some((row) => row.cells.some((cell) => cell?.type === 'vip')) && <li><span className="seat-key" data-type="vip" />VIP</li>}
      {plan.rows.some((row) => row.cells.some((cell) => cell?.type === 'wheelchair')) && <li><span className="seat-key" data-type="wheelchair"><Accessibility size={12} strokeWidth={2} aria-hidden="true" /></span>Wheelchair space</li>}
    </ul>
  </div>;
}

function SeatButton({ seat, taken, selected, onToggle }: { seat: Seat; taken: boolean; selected: boolean; onToggle: (seat: Seat) => void }) {
  const state = taken ? 'taken' : selected ? 'selected' : 'free';
  return <button type="button" className="seat" data-type={seat.type} data-state={state} aria-pressed={selected} disabled={taken}
    aria-label={`Row ${seat.row}, seat ${seat.number}, ${seatTypeLabel[seat.type]}, ${taken ? 'taken' : selected ? 'chosen' : 'free'}`}
    onClick={() => onToggle(seat)}>
    {seat.type === 'wheelchair' && !taken ? <Accessibility size={14} strokeWidth={2} aria-hidden="true" /> : <span aria-hidden="true">{taken ? '' : seat.number}</span>}
  </button>;
}
