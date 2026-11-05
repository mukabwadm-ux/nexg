import type { AviationQuoteDraft } from './quote-builder';

export type FlightStage = 'draft' | 'quoted' | 'accepted' | 'confirmed' | 'completed' | 'cancelled';
export type FlightRecord = {
  id: string;
  quote: AviationQuoteDraft;
  stage: FlightStage;
  payment: 'unpaid' | 'paid';
  manifestReady: number;
  operatorApproved: boolean;
  history: string[];
};
export type FleetBlock = {
  id: string;
  aircraftId: string;
  date: string;
  start: string;
  end: string;
  kind: 'hold' | 'maintenance';
  label: string;
  flightId?: string;
};
export type AviationState = { version: 1; flights: FlightRecord[]; blocks: FleetBlock[] };
export const DEMO_DATE = '2026-11-05';
export const AVIATION_STORAGE_KEY = 'nexg:heliflight-meeting-demo:v1';
export const AIRCRAFT_DAY_START = 7;
export const AIRCRAFT_DAY_END = 19;
export const flightStageLabels: Record<FlightStage, string> = {
  draft: 'Draft',
  quoted: 'Quote prepared',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const fleet = [
  {
    id: 'as350-white-blue',
    model: 'AS350',
    name: 'White & blue',
    registration: '5Y-DSM',
    seats: 5,
  },
  { id: 'ec130', model: 'EC130', name: 'Black', registration: '5Y-PRC', seats: 6 },
  { id: 'as350-dark-grey', model: 'AS350', name: 'Dark grey', registration: '5Y-PRL', seats: 5 },
  {
    id: 'as350-green-white',
    model: 'AS350',
    name: 'Green & white',
    registration: '5Y-PRO',
    seats: 5,
  },
  { id: 'as350-black', model: 'AS350', name: 'Black', registration: 'Aircraft 05', seats: 5 },
  {
    id: 'bell-407gxp',
    model: 'Bell 407GXP',
    name: 'Black & gold',
    registration: 'Aircraft 06',
    seats: 6,
  },
] as const;
export const services = [
  {
    id: 'private-charter',
    activity: 'private_charters',
    name: 'Private charter',
    description: 'A private aircraft and a route built around the guest.',
    requirements: 'Route, departure time and aircraft preference',
  },
  {
    id: 'safari',
    activity: 'safari_flights',
    name: 'Chopper safari',
    description: 'Safari transfers and itineraries with lodge coordination.',
    requirements: 'Landing location, lodge contact and onward arrangements',
  },
  {
    id: 'scenic',
    activity: 'scenic_flights',
    name: 'Scenic flight',
    description: 'Scenic circuits over Nairobi and the Rift Valley.',
    requirements: 'Flight duration, group size and preferred views',
  },
  {
    id: 'events',
    activity: 'private_charters',
    name: 'Special occasions',
    description: 'Flight arrangements for proposals, celebrations and events.',
    requirements: 'Event timing, landing permission and guest arrangements',
  },
] as const;

export type FlightService = (typeof services)[number];

export function flightServicesFor(activities: readonly { id: string }[]) {
  if (!activities.length || activities.some((activity) => activity.id === 'helicopter_charters'))
    return services;
  const selected = services.filter((service) =>
    activities.some((activity) => activity.id === service.activity),
  );
  return selected.length ? selected : services;
}

export function flightDateLabel(date: string) {
  const departure = new Date(`${date}T12:00:00+03:00`);
  if (!Number.isFinite(departure.valueOf())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(departure);
}

export function acceptedCharterValue(flights: readonly FlightRecord[]) {
  return flights
    .filter((flight) => ['accepted', 'confirmed', 'completed'].includes(flight.stage))
    .reduce((total, flight) => total + flight.quote.totalUsd, 0);
}

function sample(
  id: string,
  customer: string,
  route: string[],
  aircraftId: string,
  time: string,
  stage: FlightStage,
  totalUsd: number,
  passengers: number,
  occupiedMinutes = 55,
  positioningMinutes = 55,
): FlightRecord {
  return {
    id,
    stage,
    payment: stage === 'confirmed' || stage === 'completed' ? 'paid' : 'unpaid',
    manifestReady: stage === 'confirmed' ? passengers : Math.max(0, passengers - 2),
    operatorApproved: stage === 'confirmed' || stage === 'completed',
    history: [
      'Sample enquiry received',
      'Sample quote prepared',
      ...(stage === 'confirmed'
        ? ['Customer acceptance recorded', 'Written operator confirmation recorded']
        : []),
    ],
    quote: {
      customer,
      service: route.includes('Maasai Mara') ? 'Chopper safari' : 'Private charter',
      date: DEMO_DATE,
      time,
      passengers,
      aircraftId,
      stops: ['Nairobi (Wilson)', ...route],
      rateUsd: 2300,
      minimumHours: 2,
      occupiedMinutes,
      positioningMinutes,
      feesUsd: totalUsd - Math.max(2, (occupiedMinutes + positioningMinutes) / 60) * 2300,
      totalUsd,
      status: stage === 'draft' ? 'draft' : 'quoted',
    },
  };
}
export function initialAviationState(): AviationState {
  return {
    version: 1,
    flights: [
      sample(
        'HF-1042',
        'Acacia Safari Co.',
        ['Maasai Mara'],
        'as350-white-blue',
        '08:00',
        'confirmed',
        4950,
        4,
      ),
      sample(
        'HF-1043',
        'Rift Valley Retreat',
        ['Naivasha'],
        'ec130',
        '11:30',
        'accepted',
        4850,
        6,
        20,
        20,
      ),
      sample(
        'HF-1044',
        'Nairobi Events Studio',
        ['Nanyuki'],
        'as350-green-white',
        '14:00',
        'quoted',
        5100,
        3,
        45,
        45,
      ),
      sample(
        'HF-1045',
        'Coast Travel Desk',
        ['Diani'],
        'bell-407gxp',
        '09:00',
        'draft',
        9800,
        5,
        123,
        123,
      ),
    ],
    blocks: [
      {
        id: 'block-maintenance',
        aircraftId: 'as350-dark-grey',
        date: DEMO_DATE,
        start: '07:00',
        end: '19:00',
        kind: 'maintenance',
        label: 'Scheduled maintenance',
      },
      {
        id: 'block-hold',
        aircraftId: 'ec130',
        date: DEMO_DATE,
        start: '11:30',
        end: '13:00',
        kind: 'hold',
        label: 'Option · HF-1043',
        flightId: 'HF-1043',
      },
    ],
  };
}
export const usd = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
export const timeMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
};
export const minutesTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
export const flightEnd = (record: FlightRecord) =>
  minutesTime(
    timeMinutes(record.quote.time) +
      Math.max(60, record.quote.occupiedMinutes + record.quote.positioningMinutes) +
      30,
  );
export const routeLabel = (record: FlightRecord) => record.quote.stops.join(' → ');
export const isActiveFlight = (record: FlightRecord) => record.stage === 'confirmed';
export function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
): boolean {
  return timeMinutes(start) < timeMinutes(otherEnd) && timeMinutes(otherStart) < timeMinutes(end);
}
export function availabilityConflict(
  state: AviationState,
  aircraftId: string,
  date: string,
  start: string,
  end: string,
  flightId?: string,
): string | null {
  const block = state.blocks.find(
    (b) =>
      b.aircraftId === aircraftId &&
      b.date === date &&
      (!flightId || b.flightId !== flightId) &&
      overlaps(start, end, b.start, b.end),
  );
  if (block) return block.label;
  const flight = state.flights.find(
    (f) =>
      f.id !== flightId &&
      isActiveFlight(f) &&
      f.quote.aircraftId === aircraftId &&
      f.quote.date === date &&
      overlaps(start, end, f.quote.time, flightEnd(f)),
  );
  return flight ? `${flight.id} · ${flight.quote.customer}` : null;
}
export function createFlight(quote: AviationQuoteDraft, state: AviationState): FlightRecord {
  const nextNumber =
    Math.max(1045, ...state.flights.map((f) => Number(f.id.replace('HF-', '')) || 0)) + 1;
  return {
    id: `HF-${nextNumber}`,
    quote,
    stage: quote.status,
    payment: 'unpaid',
    manifestReady: 0,
    operatorApproved: false,
    history: [
      quote.status === 'draft'
        ? 'Sample quote draft saved'
        : 'Sample quote prepared for customer review',
    ],
  };
}
export function confirmFlight(
  state: AviationState,
  id: string,
): { state: AviationState; error?: string } {
  const flight = state.flights.find((f) => f.id === id);
  if (!flight) return { state, error: 'Flight could not be found.' };
  if (flight.stage !== 'accepted' || !flight.operatorApproved)
    return { state, error: 'Record customer acceptance and written operator confirmation first.' };
  const aircraft = fleet.find((a) => a.id === flight.quote.aircraftId);
  if (!aircraft || flight.quote.passengers > aircraft.seats)
    return { state, error: 'Choose an aircraft with enough passenger seats.' };
  const conflict = availabilityConflict(
    state,
    aircraft.id,
    flight.quote.date,
    flight.quote.time,
    flightEnd(flight),
    flight.id,
  );
  if (conflict)
    return {
      state,
      error: `Aircraft unavailable: ${conflict}. Change the aircraft or departure time.`,
    };
  const start = timeMinutes(flight.quote.time);
  const end = timeMinutes(flightEnd(flight));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < AIRCRAFT_DAY_START * 60 || end > AIRCRAFT_DAY_END * 60 || end <= start)
    return { state, error: 'This demo schedules aircraft between 07:00 and 19:00 EAT. Choose a departure and flight duration within that day view.' };
  return {
    state: {
      ...state,
      blocks: state.blocks.filter((b) => b.flightId !== id),
      flights: state.flights.map((f) =>
        f.id === id
          ? {
              ...f,
              stage: 'confirmed',
              history: [...f.history, 'Sample booking confirmed after availability check'],
            }
          : f,
      ),
    },
  };
}
