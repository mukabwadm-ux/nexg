import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarCheck, Handshake, SearchX } from 'lucide-react';
import type { DiscoveryProvider, Merchant } from '../../providers/DiscoveryProvider';
import { useProviderRead } from '../../hooks/useProviderRead';
import { localDateKey } from '../../data/massagePresentation';
import { readItemRequest } from '../../data/itemSheet';
import { transferCardAction } from '../../data/offeringKinds';
import {
  classCounts, cleanTransferForm, fareLabel, fareNote, listsMeetGreet, localTimeKey, lowestFarePerClass, meetGreetListings, meetGreetSummary,
  operatorCount, readTransferOperators, rideSummary, transferErrors, transferFieldOrder, transferForm, transferRequestSummary, transferVehicles,
  tripFromForm, vehicleKey, vehicleOperatorCount, type TransferForm, type TransferVehicle,
} from '../../data/transferPresentation';
import { OfferingCard } from '../cards/OfferingCard';
import { OfferingSheet } from '../cards/OfferingSheet';
import { emptyTransferTrip, transferReady } from '../cards/RentalTripPanel';
import { CatalogSkeleton, CatalogState } from '../CatalogState';
import { SavedNotice, useSavedItems } from '../ExperienceCard';
import { TransferTripForm } from './TransferTripForm';
import './transfers.css';

/** Vehicles per step of "More matching vehicles": whole rows at two, three and four across. */
const PAGE_SIZE = 12;
const NO_MERCHANTS: Merchant[] = [];

/* The trip and the chosen vehicle survive a visit to an operator's store and back, for this browser session only. */
const SEARCH_KEY = 'nexg.discovery.transfers.v1';
interface StoredSearch { form: TransferForm; shown: boolean; selected?: string }
function storage(kind: 'session' | 'local'): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return undefined;
  }
}
function readSearch(today: string): StoredSearch | undefined {
  try {
    const raw = storage('session')?.getItem(SEARCH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const entry = parsed as Record<string, unknown>;
    const form = cleanTransferForm(entry.form, today);
    return form && { form, shown: entry.shown === true, ...(typeof entry.selected === 'string' ? { selected: entry.selected } : {}) };
  } catch {
    return undefined;
  }
}
function writeSearch(search: StoredSearch) {
  try {
    storage('session')?.setItem(SEARCH_KEY, JSON.stringify(search));
  } catch {
    // Blocked or full storage keeps the trip for this visit only.
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Airport transfers, trip first (owner, 8 Nov 2026, and the "Airport transfers" design): the ride, then the vehicles
 * that match it across every operator. The lowest listed fare in each vehicle class leads, then the other matching
 * vehicles, filterable by class. Selecting one pins it in a bar at the bottom; "Review transfer" opens the one item
 * sheet with the ride filled in, which keeps the request on this device (nothing is sent to the operator yet). Only
 * catalogue facts are shown: fares as listed, never seats or bags, and the operator confirms the rest.
 */
export function TransferSearch({ title, provider, onOpen }: {
  title: string; provider: DiscoveryProvider;
  /** Opens an operator's store. */
  onOpen: (merchantId: string, itemId?: string) => void;
}) {
  const ids = useId();
  const today = localDateKey();
  const [stored] = useState(() => readSearch(today));
  const [form, setForm] = useState<TransferForm>(() => stored?.form ?? transferForm(emptyTransferTrip()));
  const [shown, setShown] = useState(stored?.shown ?? false);
  const [attempted, setAttempted] = useState(false);
  const [selectedKey, setSelectedKey] = useState(stored?.selected);
  const [reviewing, setReviewing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [more, setMore] = useState({ key: '', count: PAGE_SIZE });
  const [focusSignal, setFocusSignal] = useState(0);
  const [searches, setSearches] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const { saved, toggle } = useSavedItems();
  const formBox = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // One category read (a page of 48 operators with their items per request), started at once so "Find" is instant.
  const operators = useProviderRead('transfers:operators', (signal) => readTransferOperators(provider, signal));
  // Areas only feed the place suggestions; without them the field still takes any place.
  useEffect(() => {
    const controller = new AbortController();
    provider.getAreas(controller.signal).then((list) => { if (!controller.signal.aborted) setAreas(list); }, () => {});
    return () => controller.abort();
  }, [provider]);
  useEffect(() => { writeSearch({ form, shown, ...(selectedKey ? { selected: selectedKey } : {}) }); }, [form, shown, selectedKey]);

  const trip = tripFromForm(form);
  const errors = transferErrors(form, { today, time: localTimeKey() });
  const complete = transferReady(trip) && !transferFieldOrder.some((field) => errors[field]);
  const merchants = operators.value?.merchants ?? NO_MERCHANTS;
  const vehicles = useMemo(() => transferVehicles(merchants, { direction: form.direction, airport: form.airport }), [merchants, form.direction, form.airport]);
  const recommended = useMemo(() => lowestFarePerClass(vehicles), [vehicles]);
  const rest = useMemo(() => { const lead = new Set(recommended.map(vehicleKey)); return vehicles.filter((vehicle) => !lead.has(vehicleKey(vehicle))); }, [vehicles, recommended]);
  const chips = useMemo(() => classCounts(rest), [rest]);
  const activeFilter = chips.some((chip) => chip.id === filter) ? filter : 'all';
  const filtered = activeFilter === 'all' ? rest : rest.filter((vehicle) => vehicle.vehicleClass.id === activeFilter);
  const listKey = `${form.direction}:${form.airport}:${activeFilter}`;
  const visibleCount = more.key === listKey ? more.count : PAGE_SIZE;
  const listings = useMemo(() => meetGreetListings(merchants), [merchants]);
  const meetGreet = trip.meetGreet && operators.value ? meetGreetSummary(listings, vehicles) : undefined;
  const selected = vehicles.find((vehicle) => vehicleKey(vehicle) === selectedKey);
  const summary = selected && transferRequestSummary(trip, selected);
  // Read on every render: the sheet writes the request where the operator's store reads it.
  const kept = selected ? readItemRequest(storage('local'), selected.merchant, selected.item.id, today) : undefined;
  const operatorsWithVehicles = operatorCount(vehicles);
  const listingOperators = useMemo(() => vehicleOperatorCount(merchants), [merchants]);

  // After "Find transfers", bring the results up when they start below the middle of the screen (phones).
  useEffect(() => {
    const target = resultsRef.current;
    if (!searches || !target) return;
    if (target.getBoundingClientRect().top > window.innerHeight * 0.5) target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [searches]);

  const find = () => {
    setShown(true);
    setSearches((count) => count + 1);
    setAnnouncement(operators.value ? `${vehicles.length} matching ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}.` : 'Loading matching vehicles.');
  };
  const editTrip = () => {
    const box = formBox.current;
    box?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    box?.querySelector<HTMLInputElement>('.transfer-tabs input:checked')?.focus({ preventScroll: true });
  };
  const review = () => {
    if (!selected) return;
    // A new request needs the whole ride (an edit since the search may have left a field empty); a saved one opens as saved.
    if (!complete && !kept) { setAttempted(true); setFocusSignal((count) => count + 1); setAnnouncement('Complete your trip to review the transfer.'); return; }
    setReviewing(true);
  };
  const select = (vehicle: TransferVehicle) => {
    const key = vehicleKey(vehicle);
    if (key === selectedKey) { review(); return; }
    setSelectedKey(key);
    setAnnouncement(`Selected ${vehicle.item.name} from ${vehicle.merchant.name}, ${fareLabel(vehicle.item)}. Review transfer is at the bottom of the screen.`);
  };

  const pick = (vehicle: TransferVehicle) => {
    const key = vehicleKey(vehicle);
    const chosen = key === selectedKey;
    const listed = trip.meetGreet && listsMeetGreet(listings, vehicle);
    return <div key={key} className={`transfer-pick${chosen ? ' is-selected' : ''}`}>
      <OfferingCard item={vehicle.item} kind="vehicle" saved={saved.has(vehicle.item.id)} onSave={toggle} onOpen={() => select(vehicle)}
        tag={vehicle.vehicleClass.title} byline={listed ? `${vehicle.merchant.name} · Lists meet & greet` : vehicle.merchant.name}
        actionLabel={chosen ? 'Selected' : transferCardAction} />
    </div>;
  };

  const loaded = operators.value;
  return <div className={`category-page transfers${summary ? ' has-bar' : ''}`}>
    <header className="category-page-heading transfers__heading">
      <h1>{title}</h1>
      <p>Your trip first, then compare vehicles across operators.</p>
    </header>

    <div ref={formBox} className="transfers__form">
      <TransferTripForm form={form} onChange={setForm} errors={errors} showErrors={attempted} areas={areas} today={today}
        onSubmit={find} onInvalid={() => { setAttempted(true); setAnnouncement('Check the highlighted fields.'); }} focusSignal={focusSignal} />
    </div>

    {!shown ? (listingOperators > 0 && <p className="transfers__hint">Add your trip to compare vehicles from {listingOperators} {listingOperators === 1 ? 'operator' : 'operators'}.</p>)
      : <section ref={resultsRef} className="transfer-results" aria-labelledby={`${ids}-ride`}>
        <div className="transfer-ride">
          <CalendarCheck className="transfer-ride__icon" size={20} strokeWidth={1.75} aria-hidden="true" />
          <div className="transfer-ride__text">
            <h2 id={`${ids}-ride`} className="transfer-ride__title">{rideSummary(trip)}</h2>
            <p>{fareNote(trip)}</p>
          </div>
          <button type="button" className="transfer-ride__edit" onClick={editTrip}>Edit trip</button>
        </div>

        {meetGreet && <div className="transfer-note">
          <Handshake className="transfer-note__icon" size={20} strokeWidth={1.75} aria-hidden="true" />
          <div className="transfer-note__text">
            <p><strong>Meet & greet at arrivals.</strong> {meetGreet.text}</p>
            {meetGreet.separate.length > 0 && <p className="transfer-note__also">Also listed on its own by{' '}
              {meetGreet.separate.map((merchant, index) => <span key={merchant.id}>
                {index > 0 && (index === meetGreet.separate.length - 1 ? ' and ' : ', ')}
                <button type="button" className="transfer-note__link" onClick={() => onOpen(merchant.id)}>{merchant.name}</button>
              </span>)}.</p>}
          </div>
        </div>}

        {operators.loading ? <CatalogSkeleton layout="grid" count={4} label="Loading matching vehicles" />
          : operators.error ? <CatalogState error={operators.error} failure={operators.failure} retry={operators.retry} />
          : !vehicles.length ? <div className="empty-state transfer-empty">
            <SearchX size={26} strokeWidth={1.5} aria-hidden="true" />
            <h2>{listingOperators ? 'No listed vehicles match this trip' : 'No vehicles are listed yet'}</h2>
            <p>{listingOperators
              ? `None of the ${listingOperators} ${listingOperators === 1 ? 'operator' : 'operators'} with vehicles on NexG ${listingOperators === 1 ? 'lists' : 'list'} one for this ${form.direction === 'pickup' ? 'pickup' : 'drop-off'} at this airport yet. Try the other airport or direction.`
              : 'Transfer operators appear here as soon as they list their vehicles on NexG.'}</p>
            {listingOperators > 0 && <button type="button" className="button" onClick={editTrip}>Change the trip</button>}
          </div>
          : <>
            {recommended.length > 0 && <section className="transfer-section" aria-labelledby={`${ids}-lowest`}>
              <div className="transfer-section__heading">
                <h2 id={`${ids}-lowest`}>Lowest listed fare per vehicle class</h2>
                <p>The cheapest listed vehicle in each class, from {operatorsWithVehicles} {operatorsWithVehicles === 1 ? 'operator' : 'operators'}.</p>
              </div>
              {/* Four across on a laptop, five when there are five classes, so one row holds them all. */}
              <div className="transfer-grid transfer-grid--lead" style={{ '--transfer-lead': recommended.length > 4 ? 5 : 4 } as CSSProperties}>{recommended.map(pick)}</div>
            </section>}

            {rest.length > 0 && <section className="transfer-section" aria-labelledby={`${ids}-more`}>
              <div className="transfer-section__heading transfer-section__heading--row">
                <h2 id={`${ids}-more`}>More matching vehicles</h2>
                <p className="transfer-section__count" role="status">{filtered.length} {filtered.length === 1 ? 'vehicle' : 'vehicles'} · lowest fare first</p>
              </div>
              {chips.length > 1 && <div className="transfer-chips" role="group" aria-label="Filter by vehicle class">
                <button type="button" aria-pressed={activeFilter === 'all'} onClick={() => setFilter('all')}>All<span>{rest.length}</span></button>
                {chips.map((chip) => <button key={chip.id} type="button" aria-pressed={activeFilter === chip.id} onClick={() => setFilter(chip.id)}>{chip.title}<span>{chip.count}</span></button>)}
              </div>}
              <div className="transfer-grid">{filtered.slice(0, visibleCount).map(pick)}</div>
              {filtered.length > visibleCount && <button type="button" className="transfer-more" onClick={() => setMore({ key: listKey, count: visibleCount + PAGE_SIZE })}>
                Show more vehicles<span>{filtered.length - visibleCount} more</span></button>}
            </section>}
            {loaded?.partial && <p className="status-message" role="status">Showing vehicles from the first {merchants.length} transfer operators.</p>}
          </>}
      </section>}

    {summary && <div className="transfer-bar" role="region" aria-label="Selected transfer">
      <div className="transfer-bar__text">
        <span className="transfer-bar__label">{kept ? 'Request saved on this device · not sent yet' : 'Selected transfer'}</span>
        <strong className="transfer-bar__vehicle">{summary.vehicle}</strong>
        <span className="transfer-bar__meta"><span className="transfer-bar__inline-fare">{summary.fare} · </span>{summary.operator}{summary.meetGreet ? ' · meet & greet: the operator confirms it' : ''}</span>
      </div>
      <p className="transfer-bar__fare"><span>Listed fare</span><strong>{summary.fare}</strong></p>
      <button type="button" className="transfer-bar__action" onClick={review}>{kept ? 'View request' : <>Review<span className="transfer-bar__wide"> transfer</span></>}</button>
    </div>}

    {reviewing && selected && <OfferingSheet key={vehicleKey(selected)} context="discovery" kind="vehicle" merchant={selected.merchant} item={selected.item}
      ride={trip} eyebrow={selected.vehicleClass.title} saved={saved.has(selected.item.id)} onSave={toggle}
      onClose={() => setReviewing(false)} onOpenStore={() => onOpen(selected.merchant.id)} />}
    <SavedNotice />
    <p className="sr-only" role="status">{announcement}</p>
  </div>;
}
