import { listBookingProfiles, type BookingModel } from '@nexg/booking-config/profiles';
import { profiles, type Offering, type OfferingProfile } from '../offerings/model';
import { schemas } from '../offerings/schemas';

export { profiles };
export const DEMO_NOW = '2026-11-03T09:40';
export const LOCATIONS = ['Westlands', 'Kilimani', 'Industrial Area'] as const;
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export type Scenario =
  | 'current'
  | 'stale'
  | 'unknown'
  | 'partial'
  | 'external'
  | 'offline'
  | 'empty'
  | 'unconfigured'
  | 'error';
export type Role = 'manager' | 'viewer';
export type Interval = { start: string; end: string; nextDay: boolean };
export type DayHours = {
  day: number;
  state: 'open' | 'closed' | 'unspecified';
  intervals: Interval[];
};
export type Resource = {
  id: string;
  name: string;
  kind: string;
  state: 'current' | 'unknown';
  hours?: DayHours[];
  hoursVersions?: { effectiveFrom: string; hours: DayHours[]; operationId: string }[];
};
export type Pool = { id: string; label: string; unit: string; total: number };
export type Commitment = {
  id: string;
  workId: string;
  title: string;
  customer: string;
  start: string;
  end: string;
  resources: string[];
  status:
    | 'confirmed'
    | 'held'
    | 'in_use'
    | 'overdue'
    | 'block'
    | 'break'
    | 'tentative'
    | 'completed';
  role?: string;
  poolId?: string;
  quantity?: number;
  ongoing?: boolean;
  expiresAt?: string;
  fee?: { amount: number; state: 'awaiting' | 'recorded' };
  location?: string;
  occurrenceId?: string;
  beforeMinutes?: number;
  afterMinutes?: number;
  draft?: boolean;
  seriesId?: string;
  ownerScope?: { offeringId: string; location: string; method: string; workId: string };
};
export type Occurrence = {
  id: string;
  title: string;
  start: string;
  end: string;
  poolId: string;
  resources: string[];
};
export type Pause = { method: string; reason: string; start: string; end: string | null };
export type History = {
  operationId: string;
  title: string;
  at: string;
  revision: number;
  before?: string;
  after?: string;
  effectiveFrom?: string;
};
export type Snapshot = {
  dateHours?: Record<string, DayHours>;
  baseHours?: DayHours[];
  scheduleVersions?: { effectiveFrom: string; hours: DayHours[]; operationId: string }[];
  scope: string;
  revision: number;
  offeringVersion: number;
  hours: DayHours[];
  resources: Resource[];
  events: Commitment[];
  pools: Pool[];
  occurrences: Occurrence[];
  pauses: Pause[];
  history: History[];
  coverageStart: string;
  coverageEnd: string;
  pendingOperationIds?: string[];
  observedAt: string;
  now: string;
  settings: {
    noticeMinutes: number;
    horizonDays: number;
    cutoff: string;
    jobMode: 'queue' | 'intake' | 'work';
    promise: 'firm' | 'assessment';
    productionLimit: number;
    productionUnit: string;
  };
};
export type Context = {
  profile: OfferingProfile;
  offering: Offering;
  location: string;
  method: string;
  scenario: Scenario;
  role: Role;
};
export type View = {
  model: BookingModel;
  renderer: string;
  title: string;
  subtitle: string;
  resources: boolean;
  unit: string;
  guidance: string;
  workflowId: string;
};
const entries: Record<BookingModel, Omit<View, 'model' | 'unit'>> = {
  ORDER: {
    renderer: 'hours',
    title: 'Orders',
    subtitle: 'Set your hours and when new orders can come in.',
    resources: false,
    guidance:
      'Operating hours, new-order intake and inventory are separate. Existing work continues during a pause.',
    workflowId: 'WF_ORDER',
  },
  APPOINTMENT: {
    renderer: 'calendar',
    title: 'Appointments',
    subtitle: 'Plan staff time, rooms and service availability.',
    resources: true,
    guidance:
      'Every required resource, exact duration and buffer must fit. Hidden resource constraints still apply.',
    workflowId: 'WF_APPOINTMENT',
  },
  FIELD_VISIT: {
    renderer: 'roles',
    title: 'Field visits',
    subtitle: 'Coordinate team time, coverage and travel.',
    resources: true,
    guidance:
      'Coverage is eligibility, not proof of an available team. Travel and setup consume their actual configured resources.',
    workflowId: 'WF_FIELD_SERVICE',
  },
  ASSET_INTERVAL: {
    renderer: 'assets',
    title: 'Asset reservations',
    subtitle: 'Manage asset time, actual returns and maintenance.',
    resources: true,
    guidance:
      'An overdue return continues to occupy the asset. A planned end never records an actual return.',
    workflowId: 'WF_RENTAL',
  },
  TRANSFER: {
    renderer: 'roles',
    title: 'Transfers',
    subtitle: 'Coordinate pickup times and the resources each trip needs.',
    resources: true,
    guidance:
      'Allocate transport only when included. Meet-and-greet can use a greeter without a vehicle.',
    workflowId: 'WF_TRANSFER',
  },
  SESSION_CAPACITY: {
    renderer: 'sessions',
    title: 'Dated sessions',
    subtitle: 'Publish dated sessions and manage participant capacity.',
    resources: true,
    guidance:
      'Places belong to one dated session. The instructor and room do not multiply its capacity.',
    workflowId: 'WF_GROUP_ACTIVITY',
  },
  SPACE_RESERVATION: {
    renderer: 'spaces',
    title: 'Tables and spaces',
    subtitle: 'Match parties to compatible spaces and reservation times.',
    resources: true,
    guidance:
      'A combined reservation occupies every selected table. Dining duration and turnover remain separate from orders.',
    workflowId: 'WF_SPACE_RESERVATION_V1',
  },
  TOUR: {
    renderer: 'sessions',
    title: 'Tour departures',
    subtitle: 'Plan shared departures and private itinerary resources.',
    resources: true,
    guidance:
      'Shared places, private guides and supplier-controlled components have separate constraints.',
    workflowId: 'WF_TOUR',
  },
  PRODUCTION_DUE: {
    renderer: 'workload',
    title: 'Production due dates',
    subtitle: 'Plan workload, cutoffs and realistic completion promises.',
    resources: true,
    guidance:
      'A due promise is not an appointment. Production units, materials, working days and customer agreement remain explicit.',
    workflowId: 'WF_MADE_TO_ORDER',
  },
  REQUEST_QUOTE: {
    renderer: 'coverage',
    title: 'Enquiry coverage',
    subtitle: 'Set request intake and response coverage.',
    resources: false,
    guidance:
      'An enquiry reserves no service capacity. Provider handoff is not regulatory approval.',
    workflowId: 'WF_REQUEST_QUOTE',
  },
  LINKED_WINDOWS: {
    renderer: 'roles',
    title: 'Collection and return',
    subtitle: 'Keep incoming, processing and outgoing windows feasible.',
    resources: true,
    guidance:
      'A firm promise checks every required role. Assessment commits incoming intake only. Customer drop-off creates no driver.',
    workflowId: 'WF_PICKUP_RETURN',
  },
  SERVICE_JOB: {
    renderer: 'jobs',
    title: 'Service jobs',
    subtitle: 'Separate the queue, scheduled intake and actual work time.',
    resources: true,
    guidance:
      'Queue position and completion estimates are not reserved work slots. Custody, bays and technicians are independent.',
    workflowId: 'WF_SERVICE_JOB',
  },
  ENTITLEMENT: {
    renderer: 'access',
    title: 'Member access',
    subtitle: 'Show access hours and the availability of covered services.',
    resources: false,
    guidance: 'Credits and validity are not places. Each covered service needs its own booking.',
    workflowId: 'WF_MEMBERSHIP',
  },
  FREIGHT: {
    renderer: 'occupancy',
    title: 'Freight capacity',
    subtitle: 'Coordinate cargo capacity, loading and carrier legs.',
    resources: true,
    guidance:
      'Weight, volume and pallets keep separate limits. Transit estimates do not confirm a carrier leg.',
    workflowId: 'WF_FREIGHT',
  },
  STORAGE: {
    renderer: 'occupancy',
    title: 'Storage occupancy',
    subtitle: 'Track occupied space and separate access appointments.',
    resources: true,
    guidance:
      'Capacity releases after actual removal. Occupancy, access and handling use different units.',
    workflowId: 'WF_STORAGE',
  },
};
export function resolveView(profile: OfferingProfile, offering: Offering, enabled: string[]): View {
  const schema = schemas[offering.schemaId];
  if (
    !schema ||
    offering.profileId !== profile.id ||
    !enabled.includes(offering.schemaId) ||
    !profile.models.includes(schema.model)
  )
    throw new Error(
      'Availability setup unresolved. Select a configured offering with a registered editor and supported model.',
    );
  const base = entries[schema.model];
  const workflowId =
    offering.schemaId === 'REMOTE_SESSION_V1'
      ? 'WF_REMOTE_SESSION'
      : offering.schemaId === 'EVENT_TICKET_V1'
        ? 'WF_EVENT_SESSION'
        : offering.schemaId === 'REGULATED_ENQUIRY_V1'
          ? 'WF_REGULATED_ENQUIRY'
          : base.workflowId;
  return {
    ...base,
    model: schema.model,
    unit: schema.unit,
    workflowId,
    renderer:
      schema.model === 'TOUR' && offering.fields.departure_mode === 'Private itinerary'
        ? 'roles'
        : base.renderer,
    title:
      offering.schemaId === 'REMOTE_SESSION_V1'
        ? 'Remote sessions'
        : offering.schemaId === 'REGULATED_ENQUIRY_V1'
          ? 'Provider enquiries'
          : base.title,
  };
}
export function categoryName(id: string) {
  return (
    listBookingProfiles().find((p) => p.categoryId === id)?.categoryName ?? id.replaceAll('_', ' ')
  );
}
export function specialtyNeeds(id: string) {
  return (
    listBookingProfiles().find((p) => p.subcategoryId === id)?.specialtyNeeds ??
    'Uses the declared offering, method, resources and units.'
  );
}
export const scopeKey = (c: Context) => JSON.stringify([c.location, c.offering.id, c.method]);
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export function stamp(v: string) {
  return Date.parse(v.endsWith('Z') || /[+-]\d\d:\d\d$/.test(v) ? v : v + '+03:00');
}
export const addMinutes = (v: string, minutes: number) =>
  new Date(stamp(v) + minutes * 60000).toISOString();
export function dateAdd(date: string, days: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function monday(date: string) {
  const d = new Date(date + 'T12:00:00Z').getUTCDay();
  return dateAdd(date, -((d + 6) % 7));
}
export function localDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(stamp(value)));
}
export function localTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(stamp(value)));
}
export function prettyDate(value: string) {
  // Browser and server ICU versions disagree about punctuation in weekday labels.
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .formatToParts(new Date(stamp(value.includes('T') ? value : value + 'T12:00')))
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(' ');
}
export function localInput(value: string) {
  return localDate(value) + 'T' + localTime(value);
}
export const overlaps = (a: string, b: string, c: string, d: string) =>
  stamp(a) < stamp(d) && stamp(c) < stamp(b);
export function duration(c: Context) {
  return (
    Number(
      c.offering.fields.duration_minutes ?? c.offering.fields.production_duration_minutes ?? 60,
    ) || 60
  );
}
export function beforeBuffer(c: Context) {
  return Number(c.offering.fields.buffer_before_minutes ?? c.offering.fields.travel_minutes ?? 0);
}
export function afterBuffer(c: Context) {
  return Number(
    c.offering.fields.buffer_after_minutes ??
      c.offering.fields.turnaround_minutes ??
      c.offering.fields.turnover_minutes ??
      0,
  );
}
export function normalHours(): DayHours[] {
  return DAYS.map((_, day) => ({
    day,
    state: 'open',
    intervals: [
      {
        start: day < 5 ? '08:00' : day === 5 ? '09:00' : '10:00',
        end: day === 4 || day === 5 ? '22:00' : day === 6 ? '18:00' : '21:00',
        nextDay: false,
      },
    ],
  }));
}
export function validateHours(days: DayHours[]): string[] {
  const issues: string[] = [];
  if (days.length !== 7 || new Set(days.map((x) => x.day)).size !== 7)
    return ['Provide exactly one rule for each day.'];
  const spans: { start: number; end: number }[] = [];
  for (const day of days) {
    if (
      !Number.isInteger(day.day) ||
      day.day < 0 ||
      day.day > 6 ||
      !['open', 'closed', 'unspecified'].includes(day.state)
    ) {
      issues.push('Choose a valid day and hours state.');
      continue;
    }
    if (day.state !== 'open') continue;
    if (!day.intervals.length) issues.push(DAYS[day.day] + ': add an interval or select closed.');
    for (const i of day.intervals) {
      if (
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(i.start) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(i.end)
      ) {
        issues.push(DAYS[day.day] + ': enter valid times.');
        continue;
      }
      const minute = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      const start = day.day * 1440 + minute(i.start),
        end = day.day * 1440 + minute(i.end) + (i.nextDay ? 1440 : 0);
      if (end <= start || end - start > 1440)
        issues.push(
          DAYS[day.day] + ': end must follow start, using Ends next day for overnight hours.',
        );
      spans.push({ start, end });
    }
  }
  const sorted = [
    ...spans,
    ...spans
      .filter((x) => x.end > 10080)
      .map((x) => ({ start: x.start - 10080, end: x.end - 10080 })),
  ].sort((a, b) => a.start - b.start);
  if (sorted.some((s, i) => i > 0 && s.start < sorted[i - 1]!.end))
    issues.push('Intervals overlap, including an adjacent overnight period.');
  return [...new Set(issues)];
}
export function fitsHours(hours: DayHours[], start: string, end: string): boolean {
  const d = localDate(start),
    week = monday(d);
  const spans = hours
    .filter((x) => x.state === 'open')
    .flatMap((h) =>
      h.intervals.map((i) => ({
        start: dateAdd(week, h.day) + 'T' + i.start,
        end: dateAdd(week, h.day + (i.nextDay ? 1 : 0)) + 'T' + i.end,
      })),
    );
  // Include Sunday of the previous week for requests after midnight on Monday.
  const sunday = hours.find((h) => h.day === 6 && h.state === 'open');
  if (sunday)
    for (const i of sunday.intervals.filter((x) => x.nextDay))
      spans.push({ start: dateAdd(week, -1) + 'T' + i.start, end: week + 'T' + i.end });
  return spans.some((i) => stamp(start) >= stamp(i.start) && stamp(end) <= stamp(i.end));
}
export function hoursForDate(s: Pick<Snapshot, 'scheduleVersions' | 'baseHours' | 'hours'>, date: string): DayHours[] {
  const version = [...(s.scheduleVersions ?? [])]
    .reverse()
    .filter((v) => v.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return version?.hours ?? s.baseHours ?? s.hours;
}
export function resourceHoursForDate(s: Snapshot, r: Resource, date: string): DayHours[] {
  const version = [...(r.hoursVersions ?? [])]
    .reverse()
    .filter((v) => v.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return version?.hours ?? r.hours ?? hoursForDate(s, date);
}
export function fitsSchedule(s: Snapshot, start: string, end: string): boolean {
  const h = clone(hoursForDate(s, localDate(start))),
    date = localDate(start),
    prev = dateAdd(date, -1);
  for (const d of [prev, date]) {
    const rule = s.dateHours?.[d];
    if (rule) {
      const index = (new Date(d + 'T12:00Z').getUTCDay() + 6) % 7;
      h[index] = { ...clone(rule), day: index };
    }
  }
  return fitsHours(h, start, end);
}
export type HoursSchedule = Pick<Snapshot, 'hours' | 'baseHours' | 'scheduleVersions' | 'dateHours' | 'events'>;

export function effectiveIntervals(s: HoursSchedule, date: string): Interval[] {
  const index = (new Date(date + 'T12:00Z').getUTCDay() + 6) % 7;
  const day = s.dateHours?.[date] ?? hoursForDate(s, date)[index];
  if (!day || day.state !== 'open') return [];
  let intervals = day.intervals.map((i) => ({
    start: stamp(date + 'T' + i.start),
    end: stamp(dateAdd(date, i.nextDay ? 1 : 0) + 'T' + i.end),
  }));
  for (const e of activeEvents(s).filter((e) => e.status === 'block' && !e.resources.length))
    intervals = intervals.flatMap((t) => {
      const a = stamp(e.start),
        b = stamp(e.end);
      if (a >= t.end || b <= t.start) return [t];
      return [
        ...(a > t.start ? [{ start: t.start, end: a }] : []),
        ...(b < t.end ? [{ start: b, end: t.end }] : []),
      ];
    });
  return intervals.map((t) => ({
    start: localTime(new Date(t.start).toISOString()),
    end: localTime(new Date(t.end).toISOString()),
    nextDay: localDate(new Date(t.end).toISOString()) !== date,
  }));
}
export function seedSnapshot(c: Context): Snapshot {
  const model = schemas[c.offering.schemaId]!.model;
  const named = (name: string, kind: string, state: Resource['state'] = 'current'): Resource => ({
    id: c.profile.id + ':' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    kind,
    state,
  });
  const resourceKind =
    model === 'APPOINTMENT'
      ? c.offering.schemaId === 'REMOTE_SESSION_V1'
        ? 'Provider'
        : 'Staff'
      : model === 'FIELD_VISIT'
        ? 'Team'
        : model === 'TOUR'
          ? 'Guide'
          : model === 'SERVICE_JOB'
            ? 'Technician'
            : model === 'STORAGE'
              ? 'Storage zone'
              : model === 'PRODUCTION_DUE'
                ? 'Production team'
                : 'Resource';
  let resources = c.offering.resources.map((name) => named(name, resourceKind));
  const timed = !['ORDER', 'REQUEST_QUOTE', 'ENTITLEMENT'].includes(model);
  if (model === 'ASSET_INTERVAL' && resources.length)
    resources = (
      c.profile.id === 'bike_rental'
        ? ['Bicycle 01', 'Bicycle 02', 'Bicycle 03', 'Bicycle 04']
        : [
            'Toyota RAV4 · RAV4-01',
            'Toyota Probox · PRO-02',
            'Toyota Hiace · HIA-03',
            'Toyota Corolla · COR-04',
          ]
    ).map((n, i) => named(n, 'Asset', i === 3 ? 'unknown' : 'current'));
  if (model === 'SPACE_RESERVATION' && resources.length)
    resources = ['Table 1 · seats 4', 'Table 2 · seats 4', 'Table 3 · seats 6'].map((n) =>
      named(n, 'Space'),
    );
  if (model === 'TRANSFER')
    resources =
      c.offering.fields.transport_mode === 'Greeter only'
        ? [named(String(c.offering.fields.greeter_reference || 'Greeter 01'), 'Greeter')]
        : [
            ...resources.map((r) => ({ ...r, kind: 'Vehicle' })),
            named(String(c.offering.fields.driver_reference || 'Driver 01'), 'Driver'),
          ];
  if (model === 'ASSET_INTERVAL' && c.offering.fields.driver_mode === 'Qualified driver included')
    resources.push(named(String(c.offering.fields.driver_reference || 'Driver 01'), 'Driver'));
  if (model === 'TOUR' && c.offering.fields.departure_mode === 'Private itinerary')
    resources = resources
      .filter((r) => !r.name.toLowerCase().includes('pool'))
      .map((r) => ({ ...r, kind: 'Guide' }));
  if (model === 'TOUR' && c.offering.fields.tour_transport_mode === 'Vehicle included')
    resources.push(
      named(String(c.offering.fields.tour_vehicle_reference || 'Tour vehicle 01'), 'Vehicle'),
    );
  if (model === 'LINKED_WINDOWS' && c.method.includes('drop-off')) resources = [];
  const events: Commitment[] = [],
    pools: Pool[] = [],
    occurrences: Occurrence[] = [];
  const prefix = c.offering.id + ':';
  const event = (
    id: string,
    title: string,
    start: string,
    end: string,
    ids: string[],
    status: Commitment['status'],
    extra: Partial<Commitment> = {},
  ) =>
    events.push({
      id: prefix + id + ':' + (extra.role ?? 'main'),
      workId: id,
      title,
      customer: 'Mary A. (sample)',
      start,
      end,
      resources: ids,
      status,
      beforeMinutes: ['block', 'break', 'tentative'].includes(status) ? 0 : beforeBuffer(c),
      afterMinutes: ['block', 'break', 'tentative'].includes(status) ? 0 : afterBuffer(c),
      location: c.location,
      ...extra,
    });
  const first = resources[0]?.id;
  if (model === 'ASSET_INTERVAL' && first) {
    event('RNT-2070', c.offering.name, '2026-11-02T08:00', '2026-11-02T18:00', [first], 'overdue', {
      ongoing: true,
    });
    event(
      'BK-2071',
      c.offering.name,
      '2026-11-05T09:00',
      '2026-11-06T18:00',
      [first, ...resources.filter((r) => r.kind === 'Driver').map((r) => r.id)],
      'confirmed',
    );
    if (resources[1])
      event(
        'BK-3180',
        c.offering.name,
        '2026-11-04T08:00',
        '2026-11-05T18:00',
        [resources[1].id],
        'confirmed',
      );
  } else if (
    model === 'SESSION_CAPACITY' ||
    (model === 'TOUR' && c.offering.fields.departure_mode !== 'Private itinerary')
  ) {
    const start = String(c.offering.fields.session_start || '2026-11-07T10:00');
    const total = Number(
      c.offering.fields.participant_limit ?? c.offering.fields.group_size_max ?? 12,
    );
    pools.push({ id: 'places', label: 'Participant places', unit: 'people', total });
    occurrences.push({
      id: prefix + 'session-1',
      title: c.offering.name,
      start,
      end: addMinutes(start, duration(c)),
      poolId: 'places',
      resources: resources.map((r) => r.id),
    });
    const anchor = occurrences[occurrences.length - 1]!;
    event('SESSION-1', c.offering.name, anchor.start, anchor.end, anchor.resources, 'confirmed', {
      role: 'Session anchor',
      occurrenceId: anchor.id,
    });
    event(
      'BK-1060',
      c.offering.name,
      start,
      addMinutes(start, duration(c)),
      resources.map((r) => r.id),
      'confirmed',
      { poolId: 'places', quantity: Math.min(7, total) },
    );
    if (total > 7)
      event(
        'BK-1061',
        c.offering.name,
        start,
        addMinutes(start, duration(c)),
        resources.map((r) => r.id),
        'held',
        { poolId: 'places', quantity: Math.min(2, total - 7), expiresAt: '2026-11-03T09:45' },
      );
  } else if (['STORAGE', 'FREIGHT', 'PRODUCTION_DUE', 'LINKED_WINDOWS'].includes(model)) {
    const unit =
      model === 'STORAGE'
        ? String(c.offering.fields.space_unit || 'm²')
        : model === 'FREIGHT'
          ? 'kg'
          : model === 'LINKED_WINDOWS'
            ? String(c.offering.fields.intake_unit || 'kg')
            : 'items';
    const total =
      model === 'STORAGE'
        ? Number(c.offering.fields.storage_capacity || 100)
        : model === 'FREIGHT'
          ? Number(c.offering.fields.max_weight_kg || 1000)
          : 50;
    pools.push({
      id: 'primary',
      label:
        model === 'PRODUCTION_DUE'
          ? 'Daily production'
          : model === 'LINKED_WINDOWS'
            ? 'Processing capacity'
            : 'Occupancy capacity',
      unit,
      total,
    });
    if (model === 'FREIGHT')
      pools.push({ id: 'volume', label: 'Volume capacity', unit: 'm³', total: 20 });
    event(
      'BK-1080',
      c.offering.name,
      '2026-11-03T10:00',
      model === 'STORAGE'
        ? '2026-11-30T18:00'
        : model === 'LINKED_WINDOWS'
          ? '2026-11-04T10:00'
          : '2026-11-03T16:00',
      first ? [first] : [],
      'confirmed',
      {
        poolId: 'primary',
        quantity: Math.min(total, model === 'FREIGHT' ? 300 : 20),
        role:
          model === 'LINKED_WINDOWS'
            ? 'Processing'
            : model === 'PRODUCTION_DUE'
              ? 'Due workload'
              : 'Occupancy',
      },
    );
    if (model === 'LINKED_WINDOWS') {
      const dropoff = c.method.includes('drop-off');
      event(
        'BK-1080',
        c.offering.name,
        '2026-11-03T09:00',
        '2026-11-03T10:00',
        !dropoff && first ? [first] : [],
        'confirmed',
        { role: dropoff ? 'Customer drop-off' : 'Collection' },
      );
      event(
        'BK-1080',
        c.offering.name,
        '2026-11-04T10:00',
        '2026-11-04T11:00',
        !dropoff && resources[1] ? [resources[1].id] : [],
        'confirmed',
        { role: dropoff ? 'Customer pickup' : 'Return' },
      );
    }
  } else if (model === 'SERVICE_JOB') {
    event('JOB-1080', c.offering.name, '2026-11-03T10:00', '2026-11-03T11:00', [], 'tentative', {
      role: 'Queue position1 · Estimate only, no time reserved',
    });
    event('JOB-1081', c.offering.name, '2026-11-03T11:00', '2026-11-03T12:00', [], 'tentative', {
      role: 'Queue position2 · Estimate only, no time reserved',
    });
  } else if (first && timed) {
    const ids = [
      first,
      ...resources
        .filter((r) => r.kind === 'Driver' || (r.kind === 'Vehicle' && model === 'TOUR'))
        .map((r) => r.id),
    ].filter((id, i, a) => a.indexOf(id) === i);
    if (model === 'APPOINTMENT' && c.offering.schemaId !== 'REMOTE_SESSION_V1') {
      const room = named('Treatment Room 1', 'Existing booking resource');
      resources.push(room);
      ids.push(room.id);
    }
    event(
      'BK-1048',
      c.offering.name,
      '2026-11-03T10:00',
      addMinutes('2026-11-03T10:00', duration(c)),
      ids,
      'held',
      { expiresAt: '2026-11-03T09:45', fee: { amount: 500, state: 'awaiting' } },
    );
    const next = addMinutes('2026-11-03T10:00', duration(c) + afterBuffer(c));
    event('BK-1051', c.offering.name, next, addMinutes(next, duration(c)), ids, 'confirmed');
    if (resources[1] && !ids.includes(resources[1].id)) {
      event(
        'BK-1042',
        'Consultation (45 min)',
        '2026-11-03T09:00',
        '2026-11-03T09:45',
        [resources[1].id],
        'confirmed',
      );
      event('BREAK-1', 'Break', '2026-11-03T13:00', '2026-11-03T14:00', [resources[1].id], 'break');
    }
  }
  if (model === 'ORDER')
    event(
      'CLOSE-1',
      'Early close · Planned team meeting',
      '2026-11-06T18:00',
      '2026-11-06T22:00',
      [],
      'block',
      { role: 'Date exception' },
    );
  const hours = normalHours();
  if (model === 'ORDER')
    hours[3]!.intervals = [
      { start: '08:00', end: '12:00', nextDay: false },
      { start: '14:00', end: '21:00', nextDay: false },
    ];
  return {
    scope: scopeKey(c),
    revision: 0,
    offeringVersion: c.offering.version,
    hours,
    resources,
    events,
    pools,
    occurrences,
    pauses:
      model === 'ORDER'
        ? [
            {
              method: 'Customer collection',
              reason: 'Counter maintenance',
              start: '2026-11-03T08:00',
              end: '2026-11-03T13:00',
            },
          ]
        : [],
    history: [],
    coverageStart: '2026-11-02T00:00',
    coverageEnd: '2026-12-03T00:00',
    observedAt: DEMO_NOW,
    now: DEMO_NOW,
    settings: {
      noticeMinutes: ['ORDER', 'REQUEST_QUOTE', 'ENTITLEMENT'].includes(model) ? 0 : 15,
      horizonDays: 30,
      cutoff: '20:30',
      jobMode: 'queue',
      promise: 'firm',
      productionLimit: 50,
      productionUnit: 'items',
    },
  };
}
export type Proposal = {
  id: string;
  kind:
    | 'hours'
    | 'block'
    | 'pause'
    | 'capacity'
    | 'occurrence'
    | 'remove'
    | 'settings'
    | 'resource-hours'
    | 'hold'
    | 'date-hours';
  title: string;
  reason: string;
  start?: string;
  end?: string;
  resourceIds?: string[];
  hours?: DayHours[];
  quantity?: number;
  unit?: string;
  poolId?: string;
  method?: string;
  eventId?: string;
  affectScope?: 'one' | 'future';
  settings?: Partial<Snapshot['settings']>;
  recurrence?: { everyDays: number; count: number; until?: string; excludeDates?: string[] };
  date?: string;
  effectiveFrom?: string;
  customer?: string;
  targets?: string[];
  allowPartial?: boolean;
  offeringVersion?: number;
  request?: AvailabilityRequest;
};
export type Impact = {
  targets?: { location: string; errors: string[] }[];
  errors: string[];
  affected: Commitment[];
  warnings: string[];
  occurrences: { start: string; end: string }[];
};
export function expandProposal(p: Proposal): { start: string; end: string }[] {
  if (!p.start || !p.end) return [];
  const count = p.recurrence?.count ?? 1,
    step = p.recurrence?.everyDays ?? 1;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 52 ||
    !Number.isInteger(step) ||
    step < 1 ||
    step > 365
  )
    return [];
  const dates: { start: string; end: string }[] = [];
  for (let i = 0; i < count; i++) {
    const start = addMinutes(p.start!, i * step * 1440),
      end = addMinutes(p.end!, i * step * 1440);
    if (p.recurrence?.until && localDate(start) > p.recurrence.until) break;
    if (p.recurrence?.excludeDates?.includes(localDate(start))) continue;
    dates.push({ start, end });
  }
  return dates;
}
export function activeEvents(s: Pick<Snapshot, 'events'>) {
  return s.events.filter((e) => e.status !== 'tentative' && e.status !== 'completed');
}
export function poolUsage(s: Snapshot, id: string, start?: string, end?: string) {
  const records = activeEvents(s).filter(
    (e) =>
      e.poolId === id &&
      (!start || !end || overlaps(start, end, e.start, e.ongoing ? s.coverageEnd : e.end)),
  );
  const points: { at: number; amount: number; held: boolean }[] = [];
  const seen = new Set<string>();
  for (const e of records) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const amount = e.quantity ?? 1;
    points.push({
      at: Math.max(stamp(e.start), start ? stamp(start) : -Infinity),
      amount,
      held: e.status === 'held',
    });
    points.push({
      at: Math.min(stamp(e.ongoing ? s.coverageEnd : e.end), end ? stamp(end) : Infinity),
      amount: -amount,
      held: e.status === 'held',
    });
  }
  points.sort((a, b) => a.at - b.at || a.amount - b.amount);
  let held = 0,
    reserved = 0,
    peakHeld = 0,
    peakReserved = 0;
  for (const point of points) {
    if (point.held) held += point.amount;
    else reserved += point.amount;
    if (held + reserved > peakHeld + peakReserved) {
      peakHeld = held;
      peakReserved = reserved;
    }
  }
  const round = (v: number) => Number(v.toFixed(6));
  const total = s.pools.find((p) => p.id === id)?.total ?? 0;
  return {
    total,
    held: round(peakHeld),
    reserved: round(peakReserved),
    remaining: round(total - peakHeld - peakReserved),
  };
}
export function previewImpact(s: Snapshot, p: Proposal, c: Context): Impact {
  const errors: string[] = [],
    warnings: string[] = [];
  let affected: Commitment[] = [];
  if (c.role === 'viewer')
    errors.push('This sample role can view schedules but cannot apply changes.');
  if (c.location === 'All locations')
    errors.push('Choose explicit target locations before editing.');
  if (
    ['external', 'offline', 'stale', 'unknown', 'partial'].includes(c.scenario) ||
    c.offering.sources.availability === 'external' ||
    c.offering.sync !== 'current'
  )
    errors.push(
      'The availability source is read-only or not current. Keep a draft and refresh the sample source.',
    );
  if (p.offeringVersion !== undefined && p.offeringVersion !== c.offering.version)
    errors.push('The offering changed. Reload its current version and review this draft.');
  if (!p.title.trim() || !p.reason.trim()) errors.push('Enter a name and reason for this change.');
  let occurrences = expandProposal(p);
  const editing = p.eventId ? s.events.find((e) => e.id === p.eventId) : undefined;
  const editedIds = new Set<string>();
  if (p.kind === 'block' && p.eventId) {
    if (!editing || !['block', 'break'].includes(editing.status) || editing.ownerScope)
      errors.push('Only a local time block can be edited in this scope.');
    else {
      const changed = s.events.filter(
        (e) =>
          e.id === editing.id ||
          (p.affectScope === 'future' &&
            editing.seriesId &&
            e.seriesId === editing.seriesId &&
            stamp(e.start) >= stamp(editing.start)),
      );
      changed.forEach((e) => editedIds.add(e.id));
      if (p.start && p.end) {
        const shift = (stamp(p.start) - stamp(editing.start)) / 60000,
          span = (stamp(p.end) - stamp(p.start)) / 60000;
        occurrences = changed.map((e) => ({
          start: addMinutes(e.start, shift),
          end: addMinutes(e.start, shift + span),
        }));
      }
    }
  }

  if (p.start || p.end) {
    if (
      !p.start ||
      !p.end ||
      !Number.isFinite(stamp(p.start)) ||
      !Number.isFinite(stamp(p.end)) ||
      stamp(p.end) < stamp(p.start) ||
      (stamp(p.end) === stamp(p.start) && p.kind !== 'pause')
    )
      errors.push('Enter a valid start and end, with end after start.');
    if (p.recurrence && !occurrences.length)
      errors.push('Use 1–52 occurrences and a whole-day interval from 1 to 365.');
    if (occurrences.some((x) => stamp(x.start) < stamp(s.now)))
      errors.push('New changes must begin at or after the sample clock.');
    if (occurrences.some((x) => stamp(x.end) > stamp(s.coverageEnd)))
      errors.push(
        'The change extends beyond confirmed sample coverage. Choose a covered date range.',
      );
  }
  if (p.kind === 'date-hours') {
    if (
      !p.date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
      stamp(p.date + 'T23:59') < stamp(s.now) ||
      stamp(p.date + 'T00:00') >= stamp(s.coverageEnd)
    )
      errors.push('Choose a future covered date for the special hours.');
    errors.push(...validateHours(p.hours ?? []));
    if (p.date && p.hours?.length === 7) {
      const index = (new Date(p.date + 'T12:00Z').getUTCDay() + 6) % 7;
      const proposed = { ...s, dateHours: { ...s.dateHours, [p.date]: p.hours[index]! } };
      affected = activeEvents(s).filter(
        (e) =>
          stamp(e.end) > stamp(s.now) &&
          localDate(e.start) === p.date &&
          !fitsSchedule(proposed, e.start, e.end),
      );
    }
  }
  if (p.kind === 'hours' || p.kind === 'resource-hours') {
    if (
      p.effectiveFrom &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom) ||
        p.effectiveFrom < localDate(s.now) ||
        stamp(p.effectiveFrom + 'T00:00') >= stamp(s.coverageEnd))
    )
      errors.push('Choose an effective date from today within sample coverage.');
    errors.push(...validateHours(p.hours ?? []));
    if (!errors.length)
      affected = activeEvents(s).filter(
        (e) =>
          !e.ownerScope &&
          stamp(e.end) > stamp(s.now) &&
          (!p.effectiveFrom || localDate(e.start) >= p.effectiveFrom) &&
          (p.kind === 'hours' || e.resources.some((id) => p.resourceIds?.includes(id))) &&
          !fitsHours(p.hours!, e.start, e.end),
      );
  }
  if (['block', 'occurrence', 'hold'].includes(p.kind)) {
    if (!p.start || !p.end) errors.push('Choose a dated start and end.');
    if (p.resourceIds?.some((id) => !s.resources.some((r) => r.id === id)))
      errors.push('A selected resource is no longer in this scope.');
    if (p.resourceIds?.some((id) => s.resources.find((r) => r.id === id)?.state === 'unknown'))
      errors.push('A selected resource has unknown source data.');
    if (p.kind === 'block') {
      affected = activeEvents(s).filter(
        (e) =>
          !editedIds.has(e.id) &&
          ((!p.resourceIds?.length && !e.ownerScope) ||
            (p.resourceIds?.length && e.resources.some((id) => p.resourceIds?.includes(id)))) &&
          occurrences.some((x) =>
            overlaps(
              x.start,
              x.end,
              addMinutes(e.start, -(e.beforeMinutes ?? 0)),
              e.ongoing ? s.coverageEnd : addMinutes(e.end, e.afterMinutes ?? afterBuffer(c)),
            ),
          ),
      );
      if (s.events.some((e) => e.ongoing && e.resources.some((id) => p.resourceIds?.includes(id))))
        warnings.push(
          'Overdue return remains unresolved. Actual custody must be resolved in Work.',
        );
    }
    if (p.kind === 'occurrence')
      affected = activeEvents(s).filter(
        (e) =>
          e.resources.some((id) => p.resourceIds?.includes(id)) &&
          occurrences.some((t) =>
            overlaps(t.start, t.end, e.start, e.ongoing ? s.coverageEnd : e.end),
          ),
      );
    if (p.kind === 'occurrence' && (!p.poolId || !s.pools.some((x) => x.id === p.poolId)))
      errors.push('Choose an existing capacity pool.');
  }
  if (p.kind === 'capacity') {
    if (p.unit === 'people' && !Number.isInteger(p.quantity))
      errors.push('Participant capacity must be a whole number.');
    const pool = s.pools.find((x) => x.id === p.poolId);
    if (!pool || p.unit !== pool.unit || !Number.isFinite(p.quantity) || p.quantity! < 0)
      errors.push('Enter a non-negative capacity in the pool’s declared unit.');
    else if (p.unit === 'people' && !Number.isInteger(p.quantity))
      errors.push('Participant capacity must be a whole number.');
    else if ((p.quantity ?? 0) < poolUsage(s, p.poolId!).held + poolUsage(s, p.poolId!).reserved) {
      errors.push('Capacity cannot be lower than confirmed and valid held obligations.');
      affected = s.events.filter((e) => e.poolId === p.poolId);
    }
  }
  if (p.kind === 'hold') {
    const q = p.request ?? {
      start: p.start ?? '',
      end: p.end ?? '',
      quantity: p.quantity ?? 1,
      resourceIds: p.resourceIds ?? [],
      poolId: p.poolId,
    };
    const checked = evaluate(s, c, q);
    if (checked.state !== 'available') errors.push(...checked.reasons);
  }
  if (p.kind === 'pause' && !p.method) errors.push('Select the method affected by this pause.');
  if (p.kind === 'remove') {
    const e = s.events.find((x) => x.id === p.eventId);
    if (!e || e.ownerScope || !['block', 'break'].includes(e.status))
      errors.push(
        'Only a local time block can be removed here. Resolve bookings, holds and custody in Work.',
      );
  }
  if (p.kind === 'settings' && p.settings) {
    if (
      p.settings.noticeMinutes !== undefined &&
      (!Number.isInteger(p.settings.noticeMinutes) ||
        p.settings.noticeMinutes < 0 ||
        p.settings.noticeMinutes > 10080)
    )
      errors.push('Notice must be 0–10,080 whole minutes.');
    if (
      p.settings.horizonDays !== undefined &&
      (!Number.isInteger(p.settings.horizonDays) ||
        p.settings.horizonDays < 1 ||
        p.settings.horizonDays > 365)
    )
      errors.push('Horizon must be 1–365 days.');
    if (p.settings.cutoff !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.settings.cutoff))
      errors.push('Enter a valid cutoff.');
  }
  if (affected.length)
    errors.push(
      'Existing commitments are retained. Resolve affected work or change this proposal before applying.',
    );
  return { errors: [...new Set(errors)], affected, warnings, occurrences };
}
export function currentReservationFee(c: Context): Commitment['fee'] {
  const policy = c.offering.reservationFee;
  if (!policy || policy.mode === 'none') return undefined;
  const amount =
    policy.mode === 'fixed'
      ? Number(policy.amount)
      : Math.round(Number(c.offering.price) * Number(policy.amount)) / 100;
  return Number.isFinite(amount) && amount > 0 ? { amount, state: 'awaiting' } : undefined;
}
export function applyProposal(s: Snapshot, p: Proposal, c: Context): Snapshot {
  const impact = previewImpact(s, p, c);
  if (impact.errors.length) throw new Error(impact.errors.join(' '));
  const next = clone(s);
  if (p.kind === 'hours') {
    next.baseHours = clone(s.baseHours ?? s.hours);
    next.scheduleVersions = [
      ...(next.scheduleVersions ?? []),
      {
        effectiveFrom: p.effectiveFrom ?? localDate(s.now),
        hours: clone(p.hours!),
        operationId: p.id,
      },
    ];
    if (!p.effectiveFrom || p.effectiveFrom <= localDate(s.now)) next.hours = clone(p.hours!);
  }
  if (p.kind === 'date-hours' && p.date) {
    const index = (new Date(p.date + 'T12:00Z').getUTCDay() + 6) % 7;
    next.dateHours = { ...next.dateHours, [p.date]: clone(p.hours![index]!) };
  }
  if (p.kind === 'resource-hours')
    next.resources = next.resources.map((r) =>
      p.resourceIds?.includes(r.id)
        ? {
            ...r,
            hoursVersions: [
              ...(r.hoursVersions ?? []),
              {
                effectiveFrom: p.effectiveFrom ?? localDate(s.now),
                hours: clone(p.hours!),
                operationId: p.id,
              },
            ],
          }
        : r,
    );
  if (p.kind === 'settings') next.settings = { ...next.settings, ...p.settings };
  if (p.kind === 'capacity')
    next.pools = next.pools.map((pool) =>
      pool.id === p.poolId ? { ...pool, total: p.quantity! } : pool,
    );
  if (p.kind === 'pause') {
    next.pauses = next.pauses.filter((x) => x.method !== p.method);
    if (p.start && (!p.end || stamp(p.end) > stamp(next.now)))
      next.pauses.push({ method: p.method!, reason: p.reason, start: p.start, end: p.end ?? null });
  }
  if (p.kind === 'remove' || (p.kind === 'block' && p.eventId)) {
    const original = s.events.find((e) => e.id === p.eventId);
    next.events = next.events.filter(
      (e) =>
        e.id !== p.eventId &&
        !(
          p.affectScope === 'future' &&
          original?.seriesId &&
          e.seriesId === original.seriesId &&
          stamp(e.start) >= stamp(original.start)
        ),
    );
  }

  if (p.kind === 'block' || p.kind === 'occurrence')
    for (const [i, t] of impact.occurrences.entries()) {
      if (p.kind === 'block')
        next.events.push({
          id: p.id + ':' + i,
          seriesId: p.recurrence ? p.id : s.events.find((e) => e.id === p.eventId)?.seriesId,
          workId: 'BLOCK-' + p.id.slice(-5),
          title: p.title,
          customer: 'You (sample)',
          start: t.start,
          end: t.end,
          resources: p.resourceIds ?? [],
          status: 'block',
          role: p.reason,
          location: c.location,
        });
      else {
        const pool = next.pools.find((x) => x.id === p.poolId)!;
        const poolId = p.id + ':pool:' + i,
          id = p.id + ':' + i;
        next.pools.push({
          ...pool,
          id: poolId,
          label: p.title + ' · ' + prettyDate(t.start),
          total: p.quantity ?? pool.total,
        });
        next.occurrences.push({
          id,
          title: p.title,
          start: t.start,
          end: t.end,
          poolId,
          resources: p.resourceIds ?? [],
        });
        next.events.push({
          id: p.id + ':anchor:' + i,
          workId: 'SESSION-' + p.id.slice(-5) + '-' + i,
          title: p.title,
          customer: 'Session resources',
          start: t.start,
          end: t.end,
          resources: p.resourceIds ?? [],
          status: 'confirmed',
          role: 'Session anchor',
          beforeMinutes: beforeBuffer(c),
          afterMinutes: afterBuffer(c),
          occurrenceId: id,
          location: c.location,
        });
      }
    }
  if (p.kind === 'hold') {
    const q = p.request;
    const model = schemas[c.offering.schemaId]!.model;
    const base: Commitment = {
      id: p.id,
      workId: 'HOLD-' + p.id.slice(-5),
      title: c.offering.name,
      customer: p.customer || 'Sample customer',
      start: p.start!,
      end: p.end!,
      resources: p.resourceIds ?? [],
      status: 'held',
      beforeMinutes: beforeBuffer(c),
      afterMinutes: afterBuffer(c),
      expiresAt: addMinutes(s.now, 5),
      fee: currentReservationFee(c),
      location: c.location,
    };
    if (model === 'LINKED_WINDOWS') {
      const drop = c.method.includes('drop-off');
      next.events.push({
        ...base,
        role: drop ? 'Customer drop-off' : 'Collection',
        resources: drop ? [] : base.resources.slice(0, 1),
      });
      if (s.settings.promise === 'firm' && q?.outgoingStart && q.outgoingEnd) {
        next.events.push({
          ...base,
          id: p.id + ':processing',
          role: 'Processing',
          start: p.end!,
          end: addMinutes(p.end!, Number(c.offering.fields.processing_minutes ?? 0)),
          resources: [],
          poolId: p.poolId,
          quantity: p.quantity ?? 1,
          fee: undefined,
        });
        next.events.push({
          ...base,
          id: p.id + ':outgoing',
          role: drop ? 'Customer pickup' : 'Return',
          start: q.outgoingStart,
          end: q.outgoingEnd,
          resources: drop ? [] : base.resources.slice(1, 2),
          fee: undefined,
        });
      }
    } else {
      next.events.push({ ...base, poolId: p.poolId, quantity: p.quantity ?? 1 });
      if (model === 'FREIGHT')
        for (const pool of s.pools.filter((x) => x.id !== p.poolId))
          next.events.push({
            ...base,
            id: p.id + ':' + pool.id,
            poolId: pool.id,
            quantity: q?.quantities?.[pool.id] ?? 0,
            role: pool.label,
            fee: undefined,
          });
    }
  }
  return next;
}
export type AvailabilityRequest = {
  start: string;
  end: string;
  quantity: number;
  poolId?: string;
  resourceIds: string[];
  partySize?: number;
  coverageConfirmed?: boolean;
  quantities?: Record<string, number>;
  luggage?: number;
  outgoingStart?: string;
  outgoingEnd?: string;
};
export type AvailabilityResult = {
  state: 'available' | 'unavailable' | 'unknown' | 'request-only';
  reasons: string[];
  resources: string[];
};
export function evaluate(s: Snapshot, c: Context, q: AvailabilityRequest): AvailabilityResult {
  const model = schemas[c.offering.schemaId]?.model;
  const result = (
    state: AvailabilityResult['state'],
    ...reasons: string[]
  ): AvailabilityResult => ({ state, reasons, resources: q.resourceIds });
  if (!model) return result('unknown', 'Unsupported offering setup.');
  if (c.scenario === 'unconfigured')
    return result(
      'unknown',
      'Required availability setup is missing. Complete its declared links before promising capacity.',
    );
  if (s.pendingOperationIds?.length)
    return result(
      'unknown',
      'A change result is still being checked. Reconcile the saved operation before promising availability.',
    );
  if (
    ['stale', 'unknown', 'partial', 'offline'].includes(c.scenario) ||
    c.offering.sync !== 'current'
  )
    return result('unknown', 'The source is not current. Refresh before promising capacity.');
  if (c.scenario === 'external' || c.offering.sources.availability === 'external')
    return result('unknown', 'Read-only external source cannot reserve through this preview.');
  if (c.offering.availabilityPaused)
    return result('unavailable', 'This offering is paused in Offerings.');
  if (
    c.offering.schemaId === 'SERVICE_APPOINTMENT_V1' &&
    c.offering.fields.service_location_modes === 'Customer location'
  )
    return result(
      'unknown',
      'Customer-location work needs coverage and travel setup. Configure the field-service activity in Offerings.',
    );
  if (c.offering.publication !== 'published' || !c.offering.availabilityLinked)
    return result(
      'unavailable',
      'Publish the offering and complete its availability links in Offerings.',
    );
  if (
    !q.start ||
    !q.end ||
    !Number.isFinite(stamp(q.start)) ||
    stamp(q.end) <= stamp(q.start) ||
    !Number.isFinite(q.quantity) ||
    q.quantity <= 0
  )
    return result('unavailable', 'Use a valid date range and positive quantity.');
  if (
    stamp(q.start) < stamp(s.now) ||
    stamp(q.start) < stamp(s.coverageStart) ||
    stamp(q.end) > stamp(s.coverageEnd)
  )
    return result('unknown', 'The request is outside confirmed sample coverage or is in the past.');
  if (
    stamp(q.start) < stamp(addMinutes(s.now, s.settings.noticeMinutes)) ||
    stamp(q.start) > stamp(addMinutes(s.now, s.settings.horizonDays * 1440))
  )
    return result(
      'unavailable',
      'The request does not meet the configured notice or booking horizon.',
    );
  if (
    s.pauses.some(
      (p) =>
        p.method === c.method &&
        stamp(s.now) >= stamp(p.start) &&
        (!p.end || stamp(s.now) < stamp(p.end)),
    )
  )
    return result(
      'unavailable',
      'New intake is paused for ' + c.method + '. Existing work is retained.',
    );
  if (
    activeEvents(s).some(
      (e) =>
        e.status === 'block' && !e.resources.length && overlaps(q.start, q.end, e.start, e.end),
    )
  )
    return result(
      'unavailable',
      'A dated closure blocks this activity for the requested interval.',
    );
  const endpointHours =
    ['ASSET_INTERVAL', 'STORAGE', 'FREIGHT', 'PRODUCTION_DUE'].includes(model) ||
    (model === 'TOUR' && c.offering.fields.departure_mode === 'Private itinerary');
  if (
    !(endpointHours
      ? fitsSchedule(s, q.start, addMinutes(q.start, 1)) &&
        fitsSchedule(s, addMinutes(q.end, -1), q.end)
      : fitsSchedule(s, q.start, q.end))
  )
    return result('unavailable', 'Outside the configured operating/intake intervals.');
  if (model === 'ORDER') {
    if (!Number.isFinite(c.offering.stock))
      return result('unknown', 'No current inventory quantity is available.');
    if (q.quantity > (c.offering.stock ?? 0))
      return result('unavailable', 'Requested quantity exceeds source-confirmed stock.');
    if (localTime(q.start) > s.settings.cutoff)
      return result('unavailable', 'After the configured last-order cutoff.');
    return result(
      'available',
      'Order window and sample inventory checks pass. No stock allocation or real order is created.',
    );
  }
  if (
    model === 'REQUEST_QUOTE' ||
    model === 'ENTITLEMENT' ||
    c.offering.priceMode === 'quote' ||
    c.offering.priceMode === 'enquiry'
  )
    return result(
      'request-only',
      model === 'ENTITLEMENT'
        ? 'Access/credit context only. Book the actual covered service separately.'
        : 'Intake is open. Scope/customer agreement or provider handoff is still required; no resource promise is created.',
    );
  if (model === 'FIELD_VISIT' && !q.coverageConfirmed)
    return result(
      'unavailable',
      'Select a covered sample service area. Coverage does not itself reserve a team.',
    );
  if (
    model === 'LINKED_WINDOWS' &&
    s.settings.promise === 'firm' &&
    (!q.outgoingStart || !q.outgoingEnd)
  )
    return result(
      'unavailable',
      'A firm promise needs a feasible outgoing window as well as incoming and processing.',
    );
  if (model === 'SERVICE_JOB' && s.settings.jobMode === 'queue')
    return result(
      'request-only',
      'Queue intake is open; this is not a fixed appointment or completion promise.',
    );
  if (model === 'SPACE_RESERVATION') {
    const selected = s.resources.filter((r) => q.resourceIds.includes(r.id));
    const seats = selected.reduce((n, r) => n + Number(/seats (\d+)/.exec(r.name)?.[1] ?? 0), 0);
    const combination =
      selected.length === 1 ||
      (selected.length === 2 && selected.every((r) => /Table [12] /.test(r.name)));
    if (!combination || seats < (q.partySize ?? q.quantity))
      return result(
        'unavailable',
        'Choose one fitting table or the approved Table1 + Table2 combination.',
      );
  }
  if (
    ['SESSION_CAPACITY', 'TOUR', 'SPACE_RESERVATION'].includes(model) &&
    !Number.isInteger(q.quantity)
  )
    return result('unavailable', 'Participants and party size must be whole people.');
  if (
    model === 'PRODUCTION_DUE' &&
    stamp(q.end) <
      stamp(addMinutes(s.now, Number(c.offering.fields.production_duration_minutes ?? 0)))
  )
    return result(
      'unavailable',
      'The due promise does not allow the configured production lead time.',
    );
  if (q.poolId) {
    const pool = s.pools.find((x) => x.id === q.poolId);
    if (!pool) return result('unknown', 'The capacity pool could not be resolved.');
    const processing = model === 'LINKED_WINDOWS';
    const usage = poolUsage(
      s,
      q.poolId,
      processing ? q.end : q.start,
      processing ? addMinutes(q.end, Number(c.offering.fields.processing_minutes ?? 0)) : q.end,
    );
    if (q.quantity > usage.remaining)
      return result(
        'unavailable',
        'Only ' + usage.remaining + ' ' + pool.unit + ' remain for that interval.',
      );
    if (
      ['SESSION_CAPACITY', 'TOUR'].includes(model) &&
      !s.occurrences.some(
        (o) =>
          o.poolId === q.poolId &&
          stamp(q.start) === stamp(o.start) &&
          stamp(q.end) === stamp(o.end),
      )
    )
      return result('unavailable', 'Choose an actual published dated occurrence.');
  }
  if (
    ['APPOINTMENT', 'FIELD_VISIT', 'TRANSFER'].includes(model) &&
    Math.abs((stamp(q.end) - stamp(q.start)) / 60000 - duration(c)) > 0.01
  )
    return result(
      'unavailable',
      'The exact configured service duration must fit; it cannot be shortened to a slot step.',
    );
  if (model === 'FREIGHT') {
    for (const pool of s.pools.filter((p) => p.id !== q.poolId)) {
      const amount = q.quantities?.[pool.id];
      if (amount === undefined || !Number.isFinite(amount) || amount < 0)
        return result(
          'unknown',
          'Provide the cargo quantity in ' + pool.unit + '; weight does not prove volume capacity.',
        );
      if (amount > poolUsage(s, pool.id, q.start, q.end).remaining)
        return result('unavailable', 'Cargo exceeds the independent ' + pool.unit + ' capacity.');
    }
  }
  if (
    model === 'TRANSFER' &&
    c.offering.fields.transport_mode !== 'Greeter only' &&
    (q.quantity > Number(c.offering.fields.passenger_limit ?? 0) ||
      (q.luggage ?? 0) > Number(c.offering.fields.luggage_limit ?? 0))
  )
    return result('unavailable', 'The passenger or luggage limit does not fit this vehicle.');
  if (
    model === 'LINKED_WINDOWS' &&
    !c.method.includes('drop-off') &&
    s.settings.promise === 'firm' &&
    s.resources.slice(0, 2).some((r) => !q.resourceIds.includes(r.id))
  )
    return result(
      'unavailable',
      'A firm collection and return promise needs both actual transport roles.',
    );
  const selectedKinds = s.resources.filter((r) => q.resourceIds.includes(r.id)).map((r) => r.kind);
  if (
    ((model === 'TRANSFER' && c.offering.fields.transport_mode !== 'Greeter only') ||
      (model === 'ASSET_INTERVAL' &&
        c.offering.fields.driver_mode === 'Qualified driver included')) &&
    !selectedKinds.includes('Driver')
  )
    return result('unavailable', 'Include the actual driver resource in this joint allocation.');
  if (
    model === 'TRANSFER' &&
    c.offering.fields.transport_mode === 'Greeter only' &&
    !selectedKinds.includes('Greeter')
  )
    return result('unavailable', 'Select the actual greeter resource; no vehicle is included.');
  const required = q.resourceIds;
  if (!required.length && !q.poolId && model !== 'PRODUCTION_DUE')
    return result('unavailable', 'Choose the actual required resources.');
  if (
    required.some(
      (id) =>
        !s.resources.some((r) => r.id === id) ||
        s.resources.find((r) => r.id === id)?.state === 'unknown',
    )
  )
    return result('unknown', 'A required resource has unknown source data.');
  const ownOccurrence = s.occurrences.find(
    (o) =>
      o.poolId === q.poolId && stamp(o.start) === stamp(q.start) && stamp(o.end) === stamp(q.end),
  );
  const blocked = activeEvents(s).filter(
    (e) =>
      !(e.role === 'Session anchor' && e.occurrenceId === ownOccurrence?.id) &&
      ((e.status === 'block' && !e.resources.length) ||
        (e.resources.some((id) => required.includes(id)) &&
          (!q.poolId || e.poolId !== q.poolId))) &&
      overlaps(
        addMinutes(q.start, -beforeBuffer(c)),
        addMinutes(q.end, afterBuffer(c)),
        addMinutes(e.start, -(e.beforeMinutes ?? 0)),
        e.ongoing ? s.coverageEnd : addMinutes(e.end, e.afterMinutes ?? afterBuffer(c)),
      ),
  );
  if (blocked.length)
    return result(
      'unavailable',
      ...blocked.map(
        (e) =>
          e.workId +
          ' blocks ' +
          e.resources.map((id) => s.resources.find((r) => r.id === id)?.name ?? id).join(' + ') +
          (e.ongoing ? ' until actual return is recorded.' : '.'),
      ),
    );
  for (const r of s.resources.filter((r) => required.includes(r.id)))
    if (
      (r.hours || r.hoursVersions?.length) &&
      !fitsHours(
        resourceHoursForDate(s, r, localDate(q.start)),
        addMinutes(q.start, -beforeBuffer(c)),
        addMinutes(q.end, afterBuffer(c)),
      )
    )
      return result('unavailable', r.name + ' is outside its shift, including required buffers.');
  if (q.outgoingStart && q.outgoingEnd) {
    const processing = Number(c.offering.fields.processing_minutes ?? 0);
    if (
      stamp(q.outgoingStart) < stamp(addMinutes(q.end, processing)) ||
      !fitsSchedule(s, q.outgoingStart, q.outgoingEnd)
    )
      return result(
        'unavailable',
        'Outgoing window does not allow processing time and open hours.',
      );
    if (
      activeEvents(s).some(
        (e) =>
          e.resources.some((id) => required.includes(id)) &&
          overlaps(q.outgoingStart!, q.outgoingEnd!, e.start, e.ongoing ? s.coverageEnd : e.end),
      )
    )
      return result('unavailable', 'A required outgoing resource is occupied.');
  }
  return result(
    'available',
    'The declared sample requirements pass. Source confirmation is simulated; no live booking or charge is created.',
  );
}
export function sourceLabel(c: Context) {
  if (c.offering.sources.availability === 'external' || c.scenario === 'external')
    return 'External sample · Read only';
  if (c.offering.sync !== 'current') return 'Offering source ' + c.offering.sync;
  return c.scenario === 'current'
    ? 'Current sample'
    : c.scenario === 'empty'
      ? 'No scheduled work'
      : c.scenario === 'unconfigured'
        ? 'Setup missing'
        : c.scenario[0]!.toUpperCase() + c.scenario.slice(1) + ' sample source';
}
