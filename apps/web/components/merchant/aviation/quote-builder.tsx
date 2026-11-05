'use client';

import { Button, Card, Input, Select } from '@nexg/ui';
import { useId, useState, type FormEvent } from 'react';
import { ArrowDown, Check, CircleAlert, Clock3, MapPin, Plus, Trash2 } from 'lucide-react';

import { DEMO_DATE, fleet, usd } from './model';
import styles from './quote-builder.module.css';

export type AviationQuoteDraft = {
  customer: string;
  service: string;
  date: string;
  time: string;
  passengers: number;
  aircraftId: string;
  stops: string[];
  rateUsd: number;
  minimumHours: number;
  occupiedMinutes: number;
  positioningMinutes: number;
  feesUsd: number;
  totalUsd: number;
  status: 'draft' | 'quoted';
  feeLines?: Array<{ label: string; amountUsd: number }>;
};

function numberValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000_000 ? parsed : null;
}

export function AviationQuoteBuilder({
  onSave,
  services,
  initialService,
}: {
  onSave: (quote: AviationQuoteDraft) => void;
  services: readonly { id: string; name: string; requirements?: string }[];
  initialService?: string;
}) {
  const uid = useId();
  const [customer, setCustomer] = useState('');
  const [service, setService] = useState<string>(
    () => services.find((item) => item.id === initialService)?.id ?? services[0]!.id,
  );
  const [date, setDate] = useState(DEMO_DATE);
  const [time, setTime] = useState('09:00');
  const [passengers, setPassengers] = useState('4');
  const [aircraftId, setAircraftId] = useState('as350-white-blue');
  const [origin, setOrigin] = useState('Nairobi (Wilson)');
  const [stops, setStops] = useState([{ id: 1, name: 'Maasai Mara' }]);
  const [nextStopId, setNextStopId] = useState(2);
  const [occupied, setOccupied] = useState('55');
  const [positioning, setPositioning] = useState('55');
  const [rate, setRate] = useState('2300');
  const [minimum, setMinimum] = useState('2');
  const [waiting, setWaiting] = useState('0');
  const [landing, setLanding] = useState('0');
  const [overnight, setOvernight] = useState('0');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const selectedService = services.find((item) => item.id === service) ?? services[0]!;
  const aircraft = fleet.find((item) => item.id === aircraftId) ?? fleet[0];
  const passengerCount = numberValue(passengers);
  const occupiedMinutes = numberValue(occupied);
  const positioningMinutes = numberValue(positioning);
  const rateUsd = numberValue(rate);
  const minimumHours = numberValue(minimum);
  const waitingUsd = numberValue(waiting);
  const landingUsd = numberValue(landing);
  const overnightUsd = numberValue(overnight);
  const amountsValid =
    occupiedMinutes !== null &&
    occupiedMinutes > 0 &&
    positioningMinutes !== null &&
    rateUsd !== null &&
    rateUsd > 0 &&
    minimumHours !== null &&
    minimumHours > 0 &&
    waitingUsd !== null &&
    landingUsd !== null &&
    overnightUsd !== null;
  const flownHours = ((occupiedMinutes ?? 0) + (positioningMinutes ?? 0)) / 60;
  const billedHours = Math.max(flownHours, minimumHours ?? 0);
  const flightUsd = Math.round(billedHours * (rateUsd ?? 0) * 100) / 100;
  const feesUsd =
    Math.round(((waitingUsd ?? 0) + (landingUsd ?? 0) + (overnightUsd ?? 0)) * 100) / 100;
  const totalUsd = Math.round((flightUsd + feesUsd) * 100) / 100;
  const overCapacity = passengerCount !== null && passengerCount > aircraft.seats;

  function changePassengers(value: string) {
    setPassengers(value);
    if (Number(value) === 6 && aircraft.seats < 6) setAircraftId('ec130');
    setFeedback('');
  }

  function addStop() {
    setStops((current) => [...current, { id: nextStopId, name: '' }]);
    setNextStopId((current) => current + 1);
    setFeedback('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');
    if (
      !customer.trim() ||
      !origin.trim() ||
      stops.some((stop) => !stop.name.trim()) ||
      !date ||
      !time
    ) {
      setError('Add the customer, departure date and time, and every route stop.');
      return;
    }
    if (passengerCount === null || !Number.isInteger(passengerCount) || passengerCount < 1) {
      setError('Enter a whole number of passengers, starting from 1.');
      return;
    }
    if (overCapacity) {
      setError(
        `This aircraft has up to ${aircraft.seats} passenger seats. Select another aircraft or arrange a multi-aircraft quote with the operator.`,
      );
      return;
    }
    if (
      !amountsValid ||
      occupiedMinutes === null ||
      positioningMinutes === null ||
      rateUsd === null ||
      minimumHours === null ||
      waitingUsd === null ||
      landingUsd === null ||
      overnightUsd === null
    ) {
      setError(
        'Check the flying time, rate, minimum hours and fees. Flying time, rate and minimum hours must be greater than zero; fees and positioning time cannot be negative.',
      );
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value === 'quoted' ? 'quoted' : 'draft';
    onSave({
      customer: customer.trim(),
      service: selectedService.name,
      date,
      time,
      passengers: passengerCount,
      aircraftId,
      stops: [origin.trim(), ...stops.map((stop) => stop.name.trim())],
      rateUsd,
      minimumHours,
      occupiedMinutes,
      positioningMinutes,
      feesUsd,
      totalUsd,
      status,
      feeLines: [
        { label: 'Waiting', amountUsd: waitingUsd },
        { label: 'Landing fees', amountUsd: landingUsd },
        { label: 'Overnight crew', amountUsd: overnightUsd },
      ],
    });
    setError('');
    setFeedback(
      status === 'draft'
        ? 'Draft saved to this demo.'
        : 'Quote prepared in this demo. Operator review and written confirmation are still required.',
    );
  }

  const inputId = (name: string) => `${uid}-${name}`;

  return (
    <form className={styles.builder} onSubmit={submit} onChange={() => setFeedback('')}>
      <div className={styles.formColumn}>
        <Card
          className={styles.section}
          padded={false}
          role="region"
          aria-labelledby={inputId('trip-heading')}
        >
          <div className={styles.sectionHeading}>
            <h2 id={inputId('trip-heading')}>Trip details</h2>
            <span>All times EAT</span>
          </div>
          <div className={styles.fields}>
            <Input
              label="Customer name"
              containerClassName={styles.fullWidth}
              id={inputId('customer')}
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              placeholder="Person or company"
              required
              maxLength={120}
              autoComplete="organization"
            />
            <Select
              id={inputId('service')}
              label="Service type"
              value={service}
              onValueChange={setService}
              hint={selectedService.requirements}
              options={services.map((item) => ({ value: item.id, label: item.name }))}
            />
            <Input
              label="Passengers"
              id={inputId('passengers')}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              max="99"
              required
              value={passengers}
              onChange={(event) => changePassengers(event.target.value)}
              aria-invalid={overCapacity || undefined}
              aria-describedby={inputId('capacity-note')}
            />
            <Input
              label="Departure date"
              id={inputId('date')}
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <Input
              label="Departure time"
              id={inputId('time')}
              type="time"
              required
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
            <Select
              id={inputId('aircraft')}
              className={styles.fullWidth}
              label="Aircraft requested"
              value={aircraftId}
              onValueChange={setAircraftId}
              options={fleet.map((item) => ({
                value: item.id,
                label: `${item.model} · ${item.name} · up to ${item.seats} passengers`,
              }))}
            />
            <p
              id={inputId('capacity-note')}
              className={`${styles.note} ${styles.fullWidth} ${overCapacity ? styles.dangerText : ''}`}
            >
              {overCapacity
                ? `Up to ${aircraft.seats} passengers in this aircraft. A larger party needs a multi-aircraft quote.`
                : passengerCount === 6 && aircraftId === 'ec130'
                  ? 'EC130 suggested for six passengers. The operator must still review passenger and baggage weights.'
                  : 'Seat count is a first check. The operator must approve passenger and baggage weights, fuel and aircraft availability.'}
            </p>
          </div>
        </Card>

        <Card
          className={styles.section}
          padded={false}
          role="region"
          aria-labelledby={inputId('route-heading')}
        >
          <div className={styles.sectionHeading}>
            <h2 id={inputId('route-heading')}>Route & flying time</h2>
            <MapPin size={16} aria-hidden="true" />
          </div>
          <div className={styles.route}>
            <Input
              label="From"
              id={inputId('origin')}
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              required
              maxLength={160}
            />
            {stops.map((stop, index) => (
              <div className={styles.stop} key={stop.id}>
                <ArrowDown size={14} className={styles.routeArrow} aria-hidden="true" />
                <Input
                  label={index === stops.length - 1 ? 'Destination' : `Stop ${index + 1}`}
                  id={inputId(`stop-${stop.id}`)}
                  value={stop.name}
                  onChange={(event) =>
                    setStops((current) =>
                      current.map((item) =>
                        item.id === stop.id ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="Airstrip, property or coordinates"
                  required
                  maxLength={160}
                />
                {stops.length > 1 && (
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label={`Remove ${stop.name || `stop ${index + 1}`}`}
                    onClick={() =>
                      setStops((current) => current.filter((item) => item.id !== stop.id))
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            <button className={styles.textButton} type="button" onClick={addStop}>
              <Plus size={15} aria-hidden="true" /> Add a stop
            </button>
          </div>
          <div className={`${styles.fields} ${styles.durationFields}`}>
            <Input
              label="Occupied legs · minutes"
              id={inputId('occupied')}
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              max="100000"
              required
              value={occupied}
              onChange={(event) => setOccupied(event.target.value)}
            />
            <Input
              label="Empty positioning · minutes"
              id={inputId('positioning')}
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              max="100000"
              required
              value={positioning}
              onChange={(event) => setPositioning(event.target.value)}
            />
          </div>
          <p className={styles.note}>
            Enter the operator&apos;s planned total for each type of leg. Stops do not calculate
            flying time automatically.
          </p>
        </Card>

        <Card
          className={styles.section}
          padded={false}
          role="region"
          aria-labelledby={inputId('pricing-heading')}
        >
          <div className={styles.sectionHeading}>
            <h2 id={inputId('pricing-heading')}>Rates & additional fees</h2>
            <span>USD</span>
          </div>
          <div className={styles.fields}>
            <Input
              label="Hourly rate · USD"
              id={inputId('rate')}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max="10000000"
              required
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
            <Input
              label="Minimum billable hours"
              id={inputId('minimum')}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max="10000"
              required
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
            <Input
              label="Waiting fee · USD"
              id={inputId('waiting')}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max="10000000"
              required
              value={waiting}
              onChange={(event) => setWaiting(event.target.value)}
            />
            <Input
              label="Landing fees · USD"
              id={inputId('landing')}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max="10000000"
              required
              value={landing}
              onChange={(event) => setLanding(event.target.value)}
            />
            <Input
              label="Overnight crew · USD"
              id={inputId('overnight')}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max="10000000"
              required
              value={overnight}
              onChange={(event) => setOvernight(event.target.value)}
            />
          </div>
        </Card>
      </div>

      <aside className={styles.summaryColumn} aria-label="Quote summary">
        <Card className={styles.summary} padded={false}>
          <div className={styles.sampleLabel}>
            <CircleAlert size={15} aria-hidden="true" /> Sample rate card · operator review required
          </div>
          <div className={styles.summaryHeading}>
            <h2>Quote summary</h2>
            <span>Whole aircraft</span>
          </div>
          <p className={styles.aircraftName}>
            {aircraft.model} · {aircraft.name}
          </p>
          <p className={styles.routeSummary}>
            {[origin, ...stops.map((stop) => stop.name || 'New stop')].join(' → ')}
          </p>
          <dl className={styles.itemization}>
            <div>
              <dt>Occupied flying</dt>
              <dd>{occupiedMinutes !== null ? `${occupiedMinutes} min` : '—'}</dd>
            </div>
            <div>
              <dt>Empty positioning</dt>
              <dd>{positioningMinutes !== null ? `${positioningMinutes} min` : '—'}</dd>
            </div>
            <div>
              <dt>Billable flying time</dt>
              <dd>{amountsValid ? `${billedHours.toFixed(2)} hr` : '—'}</dd>
            </div>
            <div className={styles.flightLine}>
              <dt>Flying time × hourly rate</dt>
              <dd>{amountsValid ? usd(flightUsd) : '—'}</dd>
            </div>
            <div>
              <dt>Waiting</dt>
              <dd>{waitingUsd !== null ? usd(waitingUsd) : '—'}</dd>
            </div>
            <div>
              <dt>Landing fees</dt>
              <dd>{landingUsd !== null ? usd(landingUsd) : '—'}</dd>
            </div>
            <div>
              <dt>Overnight crew</dt>
              <dd>{overnightUsd !== null ? usd(overnightUsd) : '—'}</dd>
            </div>
          </dl>
          <div className={styles.total}>
            <span>Quote total · USD</span>
            <strong aria-live="polite">{amountsValid ? usd(totalUsd) : 'Check amounts'}</strong>
          </div>
          <p className={styles.note}>
            {amountsValid && flownHours < (minimumHours ?? 0)
              ? `The ${minimumHours}-hour minimum applies. `
              : ''}
            Only the fees entered above are included. Confirm taxes and any other charges before
            issuing.
          </p>
          <div className={styles.validity}>
            <Clock3 size={16} aria-hidden="true" />
            <p>
              <strong>Valid for 7 days from issue</strong>
              <span>Subject to aircraft and crew availability.</span>
            </p>
          </div>
          <p className={styles.confirmationNote}>
            Preparing a quote does not send it to the customer or confirm a flight. Written operator
            confirmation is required.
          </p>
          <div className={styles.actions}>
            <Button variant="gold" type="submit" value="quoted" name="intent">
              Prepare quote
            </Button>
            <Button variant="outline" type="submit" value="draft" name="intent">
              Save draft
            </Button>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              {error}
            </p>
          )}
          {feedback && (
            <p className={styles.feedback} role="status">
              <Check size={16} aria-hidden="true" />
              {feedback}
            </p>
          )}
        </Card>
      </aside>
    </form>
  );
}
