'use client';

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Plus,
  RefreshCw,
  Settings2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { bookingRequest, command } from './api';
import { bookingCalendarSegments } from './calendar-data';
import {
  addDays,
  addMonths,
  displayQuantity,
  fromKenyaInput,
  humanize,
  kenyaDate,
  kenyaDateLabel,
  kenyaTime,
  kesInputToMinor,
  localDateTime,
  MODEL_LABELS,
  monthDays,
  offeringPriceLabel,
  overlapsDay,
  quantityInputToMinor,
  STATUS_LABELS,
  weekDays,
} from './format';
import { BookingPanel, buttonClass, Field, inputClass, primaryClass } from './panel';
import { SchemaField } from './schema-field';
import { BookingDetails } from './details';
import { QuoteSummary, useBookingQuote } from './quote';
import { DatedSessionForm, ManageItemForm, ResourceClosureForm } from './management';
import { issueText, WorkflowReadiness } from './readiness';
import { TripFields, tripFromForm } from './trip-fields';
import {
  hasNativeSpecialist,
  isSpecialistModel,
  SpecialistBookingFields,
  specialistBookingFromForm,
  SpecialistOfferingFields,
  specialistResourceIds,
  specialistSetupFromForm,
} from './specialist-fields';
import {
  BOOKING_MODELS,
  type BookingModel,
  type BookingOccurrence,
  type AvailabilitySlot,
  type BookingOffering,
  type BookingProfile,
  type BookingQuestion,
  type BookingRecord,
  type BookingResource,
  type SpecialistBookingInput,
  type BookingWorkspaceData,
  type CalendarView,
} from './types';

const ACTIVE = new Set(['held', 'pending', 'confirmed', 'accepted', 'in_progress']);
const NONBLOCKING = new Set([
  'ORDER',
  'REQUEST_QUOTE',
  'ENTITLEMENT',
  'PRODUCTION_DUE',
  'SERVICE_JOB',
  'FREIGHT',
]);
function requestOnlyOffering(offering?: BookingOffering): boolean {
  if (hasNativeSpecialist(offering)) return false;
  return (
    !!offering && (NONBLOCKING.has(offering.model) || offering.executionMode === 'request_capture')
  );
}
function offeringWithOccurrences(
  data: BookingWorkspaceData,
  id: string,
): BookingOffering | undefined {
  const offering = data.offerings.find((entry) => entry.id === id);
  return offering
    ? {
        ...offering,
        eligibleResources:
          offering.eligibleResources ??
          data.resources
            .filter((resource) => resource.active && offering.resourceIds.includes(resource.id))
            .map((resource) => ({ id: resource.id, name: resource.name, kind: resource.kind })),
        occurrences:
          offering.occurrences ?? data.occurrences?.filter((entry) => entry.offeringId === id),
      }
    : undefined;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODEL_HINTS: Partial<Record<BookingModel, string>> = {
  ORDER:
    'Product orders use inventory and fulfilment promises. Enable a scheduled service only when you actually offer it.',
  REQUEST_QUOTE:
    'Customers submit a request. Capacity is committed after scope and the responsible provider confirm it.',
  ENTITLEMENT: 'Membership validity and credits are separate from the sessions a member books.',
  ASSET_INTERVAL:
    'Reserve an identified asset over the full hire period, including configured turnaround time.',
  FREIGHT:
    'Shipment requests need agreed cargo measurements, carrier scope and capacity before confirmation.',
  STORAGE: 'Occupancy uses the declared storage quantity and period. Access visits are separate.',
};

function Status({ value }: { value: string }) {
  const tone =
    value === 'confirmed'
      ? 'bg-gold-soft text-gold-text'
      : value === 'cancelled' || value === 'expired'
        ? 'bg-black/5 text-muted'
        : value === 'completed'
          ? 'bg-ink text-white'
          : 'bg-black/5 text-ink';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${tone}`}>
      {STATUS_LABELS[value] ?? humanize(value)}
    </span>
  );
}

function BookingChip({
  booking,
  onClick,
  compact = false,
}: {
  booking: BookingRecord;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-border focus-visible:outline-gold block w-full rounded-lg border-l-[3px] bg-black/[0.025] px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 ${booking.status === 'cancelled' || booking.status === 'expired' ? 'opacity-60' : ''}`}
    >
      <span className="block truncate text-xs font-extrabold">
        {booking.startTime ? `${kenyaTime(booking.startTime)} · ` : ''}
        {booking.offeringName}
      </span>
      <span className="text-muted mt-1 block truncate text-xs">
        {booking.customer.name}
        {booking.capacityUnit
          ? ` · ${displayQuantity(booking.quantity, booking.quantityScale, booking.capacityUnit)}`
          : ''}
      </span>
      {!compact ? (
        <span className="mt-2 block">
          <Status value={booking.status} />
        </span>
      ) : null}
    </button>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <div
      role="alert"
      className="border-danger/30 bg-danger/5 text-danger rounded-lg border p-3 text-sm leading-relaxed"
    >
      {message}
    </div>
  ) : null;
}

export function MerchantBookingWorkspace({
  apiBase = '/api/merchant/booking',
  development = false,
}: {
  apiBase?: string;
  development?: boolean;
}) {
  const [data, setData] = useState<BookingWorkspaceData | null>(null);
  const [profiles, setProfiles] = useState<BookingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [online, setOnline] = useState(true);
  const [date, setDate] = useState(() => kenyaDate(new Date()));
  const [view, setView] = useState<CalendarView>('week');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [panel, setPanel] = useState<'setup' | 'resource' | 'offering' | 'new' | null>(null);
  const [selected, setSelected] = useState<BookingRecord | null>(null);
  const [managing, setManaging] = useState<
    { kind: 'resource'; item: BookingResource } | { kind: 'offering'; item: BookingOffering } | null
  >(null);
  const [closureResource, setClosureResource] = useState<BookingResource | null>(null);
  const [sessionOffering, setSessionOffering] = useState<BookingOffering | null>(null);
  const [sessionOccurrence, setSessionOccurrence] = useState<BookingOccurrence | null>(null);

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const workspace = await bookingRequest<BookingWorkspaceData>('/workspace', {}, apiBase);
        setData(workspace);
        if (workspace.profiles?.length) setProfiles(workspace.profiles);
        setSelected((current) =>
          current ? (workspace.bookings.find((b) => b.id === current.id) ?? null) : null,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your calendar could not be loaded.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void load(true);
    void bookingRequest<{ profiles: BookingProfile[] } | BookingProfile[]>('/profiles', {}, apiBase)
      .then((result) => setProfiles(Array.isArray(result) ? result : result.profiles))
      .catch(() => {});
  }, [load, apiBase]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  async function mutate(path: string, body: unknown, message: string, method = 'POST') {
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      await command(path, body, method, apiBase);
      setSuccess(message);
      await load();
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The change could not be confirmed. Refresh before trying again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const profile = profiles.find((p) => p.subcategoryId === data?.configuration.subcategoryId);
  const currentModel = (data?.configuration.resolved?.primaryModel ??
    data?.configuration.resolved?.primaryModelId ??
    profile?.defaultModelId ??
    profile?.primaryModelId) as BookingModel | undefined;
  useEffect(() => {
    if (currentModel && NONBLOCKING.has(currentModel)) setView('agenda');
  }, [currentModel]);
  const resourcesNeeded =
    (currentModel && !NONBLOCKING.has(currentModel)) ||
    data?.offerings.some((o) => o.active && !NONBLOCKING.has(o.model));
  const bookings = useMemo(
    () =>
      (data?.bookings ?? []).filter(
        (b) =>
          (resourceFilter === 'all' || b.resourceIds.includes(resourceFilter)) &&
          (statusFilter === 'all' || statusFilter === 'active'
            ? statusFilter === 'all' || ACTIVE.has(b.status)
            : b.status === statusFilter),
      ),
    [data, resourceFilter, statusFilter],
  );
  const dateRange = view === 'month' ? monthDays(date) : view === 'day' ? [date] : weekDays(date);
  const calendarBookings = bookings.flatMap(bookingCalendarSegments);
  const rangeBookings = (view === 'agenda' ? bookings : calendarBookings).filter((booking) => {
    if (!booking.startTime) return view === 'agenda';
    if (view === 'agenda' && !booking.endTime)
      return dateRange.includes(kenyaDate(booking.startTime));
    return dateRange.some((day) => overlapsDay(booking, day));
  });
  const selectBooking = (booking: BookingRecord) =>
    setSelected(data?.bookings.find((record) => record.id === booking.id) ?? booking);
  const attention = (data?.bookings ?? []).filter(
    (b) => b.status === 'pending' || b.status === 'held',
  );
  const disabled = busy || !online;

  if (loading)
    return (
      <main className="space-y-5 px-4 py-7 sm:px-6 lg:px-8" aria-busy="true">
        <h1 className="font-serif text-3xl font-extrabold">Calendar</h1>
        <p className="text-muted text-sm">Loading your bookings and availability…</p>
        <div className="border-border h-80 animate-pulse rounded-xl border bg-black/[0.025]" />
      </main>
    );
  if (!data)
    return (
      <main className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
        <h1 className="font-serif text-3xl font-extrabold">Calendar</h1>
        <ErrorMessage message={error} />
        <p className="text-muted max-w-xl text-sm leading-relaxed">
          Your bookings have not been loaded. Reconnect and try again to see their confirmed status.
        </p>
        <button className={buttonClass} onClick={() => void load(true)}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </main>
    );

  return (
    <main className="space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-muted mb-1 flex items-center gap-2 text-xs font-bold">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {data.business.name} <span aria-hidden="true">·</span> East Africa Time
            {development ? (
              <span className="bg-gold-soft text-gold-text rounded-full px-2 py-1">
                Local development workspace
              </span>
            ) : null}
          </div>
          <h1 className="font-serif text-3xl font-extrabold tracking-tight">Calendar</h1>
          <p className="text-muted mt-2 text-sm">
            {profile?.name ?? 'Your business'}
            {currentModel
              ? ` · ${MODEL_LABELS[currentModel] ?? humanize(currentModel)}`
              : ' · Complete your booking setup'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setPanel('setup');
              setError(null);
            }}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Booking setup
          </button>
          <button
            type="button"
            className={primaryClass}
            disabled={disabled || !data.offerings.some((o) => o.active)}
            onClick={() => {
              setPanel('new');
              setError(null);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New booking
          </button>
        </div>
      </header>
      {!online ? (
        <p role="status" className="bg-gold-soft text-gold-text rounded-lg p-3 text-sm">
          You are offline. Displayed bookings are the last loaded records. Reconnect to make
          changes.
        </p>
      ) : null}
      <ErrorMessage message={error} />
      {success ? (
        <p
          role="status"
          className="bg-gold-soft text-gold-text flex items-center gap-2 rounded-lg p-3 text-sm"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          {success}
        </p>
      ) : null}

      {!data.offerings.length ||
      (resourcesNeeded && !data.resources.length) ||
      (data.configuration.resolved?.clarifications?.length ?? 0) > 0 ? (
        <section
          className="border-border bg-surface rounded-xl border p-4 sm:p-5"
          aria-labelledby="calendar-setup-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="calendar-setup-heading" className="font-extrabold">
                Prepare your booking calendar
              </h2>
              <p className="text-muted mt-1 max-w-2xl text-sm leading-relaxed">
                Choose your activity, add the resources you actually use, then create an offering
                with its duration and booking rules.
              </p>
            </div>
            <button type="button" className={buttonClass} onClick={() => setPanel('setup')}>
              Review setup
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => setPanel('resource')}>
              <Users className="h-4 w-4" aria-hidden="true" />
              Add a resource
            </button>
            <button type="button" className={buttonClass} onClick={() => setPanel('offering')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add an offering
            </button>
          </div>
          {data.configuration.resolved?.clarifications?.map((issue, index) => (
            <p key={index} className="text-danger mt-3 text-sm">
              {issueText(issue)}
            </p>
          ))}
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section
          className="border-border bg-surface min-w-0 rounded-xl border"
          aria-label="Booking calendar"
        >
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className={buttonClass} onClick={() => setDate(kenyaDate(new Date()))}>
                Today
              </button>
              <button
                aria-label="Previous period"
                className={buttonClass}
                onClick={() =>
                  setDate(
                    view === 'month'
                      ? addMonths(date, -1)
                      : addDays(date, view === 'day' ? -1 : -7),
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                aria-label="Next period"
                className={buttonClass}
                onClick={() =>
                  setDate(
                    view === 'month' ? addMonths(date, 1) : addDays(date, view === 'day' ? 1 : 7),
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <label className="sr-only" htmlFor="calendar-date">
                Calendar date
              </label>
              <input
                id="calendar-date"
                type="date"
                className={`${inputClass} !w-auto`}
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="calendar-view">
                Calendar view
              </label>
              <select
                id="calendar-view"
                className={`${inputClass} !w-auto`}
                value={view}
                onChange={(e) => setView(e.target.value as CalendarView)}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="agenda">Agenda</option>
                <option value="resources">Resources</option>
              </select>
              <button
                className={buttonClass}
                disabled={refreshing}
                aria-label="Refresh calendar"
                onClick={() => void load()}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <label className="flex items-center gap-2 text-xs font-bold">
              Resource
              <select
                className={`${inputClass} !w-auto !py-1.5`}
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
              >
                <option value="all">All resources</option>
                {data.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              Status
              <select
                className={`${inputClass} !w-auto !py-1.5`}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-muted ml-auto text-xs tabular-nums" aria-live="polite">
              {rangeBookings.length} {rangeBookings.length === 1 ? 'booking' : 'bookings'}
            </span>
          </div>
          {currentModel && MODEL_HINTS[currentModel] ? (
            <p className="text-muted border-border border-b px-4 py-3 text-xs leading-relaxed">
              {MODEL_HINTS[currentModel]}
            </p>
          ) : null}

          <div className={view === 'agenda' ? '' : 'hidden sm:block'}>
            {view === 'month' ? (
              <div className="grid grid-cols-7">
                <div className="text-muted col-span-7 grid grid-cols-7 border-b py-2 text-center text-xs font-bold">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                {dateRange.map((day) => {
                  const entries = calendarBookings.filter((b) => overlapsDay(b, day));
                  return (
                    <div
                      key={day}
                      className={`border-border min-h-32 min-w-0 space-y-1 border-b border-r p-2 ${day.slice(0, 7) !== date.slice(0, 7) ? 'bg-black/[0.025]' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDate(day);
                          setView('day');
                        }}
                        aria-label={`Open ${kenyaDateLabel(day + 'T12:00:00+03:00')}`}
                        className={`mb-1 rounded-full px-2 py-1 text-xs font-bold ${day === kenyaDate(new Date()) ? 'bg-ink text-white' : ''}`}
                      >
                        {Number(day.slice(-2))}
                      </button>
                      {entries.slice(0, 3).map((b) => (
                        <BookingChip
                          key={b.calendarSegmentId ?? b.id}
                          booking={b}
                          compact
                          onClick={() => selectBooking(b)}
                        />
                      ))}
                      {entries.length > 3 ? (
                        <button
                          className="text-gold-text text-xs font-bold"
                          onClick={() => {
                            setDate(day);
                            setView('day');
                          }}
                        >
                          +{entries.length - 3} more
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : view === 'resources' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-border border-b">
                      <th className="p-3 font-bold">Resource</th>
                      {dateRange.map((day) => (
                        <th key={day} className="p-3 font-bold">
                          {kenyaDateLabel(day + 'T12:00:00+03:00', true)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.resources
                      .filter((r) => resourceFilter === 'all' || r.id === resourceFilter)
                      .map((r) => (
                        <tr key={r.id} className="border-border border-b align-top">
                          <th scope="row" className="min-w-32 p-3 font-bold">
                            {r.name}
                            <span className="text-muted mt-1 block font-normal">
                              {humanize(r.kind)}
                            </span>
                          </th>
                          {dateRange.map((day) => (
                            <td key={day} className="min-w-32 space-y-1 border-l p-2">
                              {calendarBookings
                                .filter((b) => b.resourceIds.includes(r.id) && overlapsDay(b, day))
                                .map((b) => (
                                  <BookingChip
                                    key={b.calendarSegmentId ?? b.id}
                                    booking={b}
                                    compact
                                    onClick={() => selectBooking(b)}
                                  />
                                ))}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.resources.length ? (
                  <EmptyCalendar text="Add your staff, spaces, vehicles or other resources to see this view." />
                ) : null}
              </div>
            ) : view === 'agenda' ? (
              <Agenda entries={rangeBookings} onSelect={selectBooking} />
            ) : (
              <div className={`grid ${view === 'week' ? 'grid-cols-7' : 'grid-cols-1'}`}>
                {dateRange.map((day) => (
                  <div key={day} className="border-border min-h-80 min-w-0 border-r">
                    <div
                      className={`border-border border-b px-2 py-3 text-center text-xs font-bold ${day === kenyaDate(new Date()) ? 'bg-gold-soft text-gold-text' : ''}`}
                    >
                      {kenyaDateLabel(day + 'T12:00:00+03:00', true)}
                    </div>
                    <div className="space-y-2 p-2">
                      {calendarBookings
                        .filter((b) => overlapsDay(b, day))
                        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
                        .map((b) => (
                          <BookingChip
                            key={b.calendarSegmentId ?? b.id}
                            booking={b}
                            onClick={() => selectBooking(b)}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={view === 'agenda' ? 'hidden' : 'sm:hidden'}>
            <Agenda entries={rangeBookings} onSelect={selectBooking} />
          </div>
          {!rangeBookings.length && view !== 'resources' ? (
            <EmptyCalendar
              text={
                data.offerings.length
                  ? 'No bookings match this period and these filters.'
                  : 'Add your first offering to begin taking bookings.'
              }
            />
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="border-border bg-surface rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold">Needs attention</h2>
              <span className="bg-black/5 rounded-full px-2 py-0.5 text-xs tabular-nums">
                {attention.length}
              </span>
            </div>
            {attention.length ? (
              <div className="mt-3 space-y-2">
                {attention.slice(0, 5).map((b) => (
                  <BookingChip
                    key={b.calendarSegmentId ?? b.id}
                    booking={b}
                    onClick={() => selectBooking(b)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted mt-3 text-xs leading-relaxed">
                No requests or holds are waiting for your review.
              </p>
            )}
          </section>
          <section className="border-border bg-surface rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold">Resources</h2>
              <button
                className="text-gold-text rounded p-1"
                aria-label="Add resource"
                onClick={() => setPanel('resource')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {data.resources.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex w-full justify-between gap-2 rounded py-1 text-left text-xs hover:underline"
                  onClick={() => {
                    setManaging({ kind: 'resource', item: r });
                    setError(null);
                  }}
                >
                  <span>{r.name}</span>
                  <span className="text-muted">
                    {r.active
                      ? r.kind === 'space'
                        ? 'Table / space'
                        : humanize(r.kind)
                      : 'Inactive'}
                  </span>
                </button>
              ))}
              {!data.resources.length ? (
                <p className="text-muted text-xs">No resources added.</p>
              ) : null}
            </div>
          </section>
          <section className="border-border bg-surface rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold">Offerings</h2>
              <button
                className="text-gold-text rounded p-1"
                aria-label="Add offering"
                onClick={() => setPanel('offering')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {data.offerings.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="block w-full rounded py-1 text-left text-xs hover:underline"
                  onClick={() => {
                    setManaging({ kind: 'offering', item: o });
                    setError(null);
                  }}
                >
                  <span className="block font-bold">
                    {o.name}
                    {o.active ? '' : ' · Inactive'}
                  </span>
                  <span className="text-muted mt-1 block">
                    {offeringPriceLabel(o)} · {MODEL_LABELS[o.model] ?? humanize(o.model)}
                  </span>
                </button>
              ))}
              {!data.offerings.length ? (
                <p className="text-muted text-xs">No offerings added.</p>
              ) : null}
            </div>
          </section>
          {(data.occurrences?.length ?? 0) > 0 ? (
            <section className="border-border bg-surface rounded-xl border p-4">
              <h2 className="text-sm font-extrabold">Dated sessions</h2>
              <div className="mt-3 space-y-3">
                {data
                  .occurrences!.slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      className="block w-full rounded text-left text-xs hover:underline"
                      onClick={() => {
                        const offering = data.offerings.find(
                          (item) => item.id === entry.offeringId,
                        );
                        if (offering) {
                          setSessionOffering(offering);
                          setSessionOccurrence(entry);
                          setError(null);
                        }
                      }}
                    >
                      <span className="block font-bold">
                        {data.offerings.find((offering) => offering.id === entry.offeringId)
                          ?.name ?? 'Session'}
                        {entry.published ? '' : ' · Draft'}
                      </span>
                      <span className="text-muted mt-1 block">
                        {kenyaDateLabel(entry.startTime, true)} · {kenyaTime(entry.startTime)}–
                        {kenyaTime(entry.endTime)}
                      </span>
                      <span className="text-muted mt-1 block">
                        {entry.capacity} configured places
                        {entry.remainingCapacity !== undefined
                          ? ` · ${entry.remainingCapacity} available`
                          : ''}
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          ) : null}
          <section className="border-border rounded-xl border p-4">
            <h2 className="text-sm font-extrabold">
              Google Calendar <span className="text-muted font-normal">· Optional</span>
            </h2>
            <p className="text-muted mt-2 text-xs leading-relaxed">
              {data.google.connected
                ? `Connected${data.google.calendarName ? ` to ${data.google.calendarName}` : ''}.`
                : 'Not connected. Your NEXG calendar works independently.'}
            </p>
          </section>
          {data.configuration.published ? (
            <a
              className={`${buttonClass} w-full`}
              href={`/book/${encodeURIComponent(data.business.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              Customer booking page
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-muted px-1 text-xs leading-relaxed">
              Publish your booking page in Booking setup when your offerings are ready.
            </p>
          )}
        </aside>
      </div>

      <BookingPanel
        open={panel === 'setup'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Booking setup"
        description="Your onboarding answers determine the work and calendar your business uses."
      >
        <SetupForm
          data={data}
          profiles={profiles}
          apiBase={apiBase}
          disabled={disabled}
          error={error}
          onSave={async (body) => {
            if (await mutate('/configuration', body, 'Booking setup saved.', 'PUT')) setPanel(null);
          }}
        />
      </BookingPanel>
      <BookingPanel
        open={!!managing}
        onOpenChange={(open) => {
          if (!open) setManaging(null);
        }}
        title={managing ? `Manage ${managing.kind}` : 'Manage item'}
        description="Keep the names and availability of your actual resources and offerings up to date."
      >
        {managing ? (
          <ManageItemForm
            key={managing.item.id}
            item={managing.item}
            kind={managing.kind}
            disabled={disabled}
            error={error}
            onSave={async (body) => {
              if (
                await mutate(
                  `/${managing.kind === 'resource' ? 'resources' : 'offerings'}/${encodeURIComponent(managing.item.id)}`,
                  body,
                  'Changes saved.',
                  'PATCH',
                )
              )
                setManaging(null);
            }}
            onAddClosure={
              managing.kind === 'resource'
                ? () => {
                    setClosureResource(managing.item as BookingResource);
                    setManaging(null);
                    setError(null);
                  }
                : undefined
            }
            onAddOccurrence={
              managing.kind === 'offering' &&
              (managing.item.model === 'SESSION_CAPACITY' ||
                (managing.item.specialist?.model === 'TOUR' &&
                  managing.item.specialist.mode === 'shared'))
                ? () => {
                    setSessionOffering(managing.item as BookingOffering);
                    setSessionOccurrence(null);
                    setManaging(null);
                    setError(null);
                  }
                : undefined
            }
            onRemoveClosure={
              managing.kind === 'resource'
                ? async (removeId) => {
                    if (
                      await mutate(
                        `/resources/${encodeURIComponent(managing.item.id)}/closures`,
                        { removeId, expectedVersion: managing.item.version ?? 1 },
                        'Unavailable period removed.',
                      )
                    )
                      setManaging(null);
                  }
                : undefined
            }
          />
        ) : null}
      </BookingPanel>
      <BookingPanel
        open={!!sessionOffering}
        onOpenChange={(open) => {
          if (!open) setSessionOffering(null);
        }}
        title="Publish a dated session"
        description="Customers reserve places in an actual scheduled class or session."
      >
        {sessionOffering ? (
          <DatedSessionForm
            key={sessionOccurrence?.id ?? sessionOffering.id}
            offering={sessionOffering}
            occurrence={sessionOccurrence}
            disabled={disabled}
            error={error}
            onSave={async (body) => {
              if (
                await mutate(
                  `/offerings/${encodeURIComponent(sessionOffering.id)}/occurrences`,
                  body,
                  'Dated session published.',
                )
              )
                setSessionOffering(null);
            }}
          />
        ) : null}
      </BookingPanel>
      <BookingPanel
        open={!!closureResource}
        onOpenChange={(open) => {
          if (!open) setClosureResource(null);
        }}
        title="Block unavailable time"
        description="Block a real period of unavailability on a resource’s calendar."
      >
        {closureResource ? (
          <ResourceClosureForm
            resource={closureResource}
            disabled={disabled}
            error={error}
            onSave={async (body) => {
              if (
                await mutate(
                  `/resources/${encodeURIComponent(closureResource.id)}/closures`,
                  body,
                  'Unavailable time recorded.',
                )
              )
                setClosureResource(null);
            }}
          />
        ) : null}
      </BookingPanel>
      <BookingPanel
        open={panel === 'resource'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Add a resource"
        description="Add a person, space, asset or capacity pool that can actually fulfil your work."
      >
        <ResourceForm
          disabled={disabled}
          error={error}
          onSave={async (body) => {
            if (await mutate('/resources', body, 'Resource added.')) setPanel(null);
          }}
        />
      </BookingPanel>
      <BookingPanel
        open={panel === 'offering'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="Add an offering"
        description="Set the actual service or booking rules customers can use."
      >
        <OfferingForm
          data={data}
          profile={profile}
          disabled={disabled}
          error={error}
          onSave={async (body) => {
            if (await mutate('/offerings', body, 'Offering added.')) setPanel(null);
          }}
        />
      </BookingPanel>
      <BookingPanel
        open={panel === 'new'}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
        title="New booking"
        description="Availability is checked again when the booking is submitted. All times are East Africa Time."
      >
        <BookingForm
          data={data}
          date={date}
          apiBase={apiBase}
          disabled={disabled}
          error={error}
          onSave={async (body) => {
            if (await mutate('/bookings', body, 'Booking saved with its confirmed status.'))
              setPanel(null);
          }}
        />
      </BookingPanel>
      <BookingPanel
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.offeringName ?? 'Booking'}
        description="Review the record and take the next permitted action."
      >
        {selected ? (
          <BookingDetails
            key={selected.id}
            booking={selected}
            offering={offeringWithOccurrences(data, selected.offeringId)}
            resources={data.resources}
            offerings={data.offerings.map(
              (offering) => offeringWithOccurrences(data, offering.id)!,
            )}
            apiBase={apiBase}
            disabled={disabled}
            error={error}
            onMutation={(action, body, message) =>
              mutate(`/bookings/${encodeURIComponent(selected.id)}/${action}`, body, message)
            }
          />
        ) : null}
      </BookingPanel>
    </main>
  );
}

function EmptyCalendar({ text }: { text: string }) {
  return (
    <div className="text-muted px-5 py-10 text-center text-sm">
      <CalendarDays className="mx-auto mb-3 h-6 w-6" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function Agenda({
  entries,
  onSelect,
}: {
  entries: BookingRecord[];
  onSelect: (record: BookingRecord) => void;
}) {
  return (
    <div className="divide-border divide-y">
      {[...entries]
        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
        .map((b) => (
          <button
            key={b.calendarSegmentId ?? b.id}
            type="button"
            onClick={() => onSelect(b)}
            className="focus-visible:outline-gold flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-black/[0.025] focus-visible:outline focus-visible:outline-2"
          >
            <span className="w-28 shrink-0 text-xs">
              <span className="block font-bold">{kenyaDateLabel(b.startTime, true)}</span>
              <span className="text-muted mt-1 block">
                {b.startTime
                  ? `${kenyaTime(b.startTime)}${b.endTime ? ` – ${kenyaTime(b.endTime)}` : ''}`
                  : 'Awaiting scope'}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">{b.offeringName}</span>
              <span className="text-muted mt-1 block text-xs">
                {b.customer.name}
                {b.capacityUnit
                  ? ` · ${displayQuantity(b.quantity, b.quantityScale, b.capacityUnit)}`
                  : ''}
              </span>
            </span>
            <Status value={b.status} />
          </button>
        ))}
    </div>
  );
}

function SetupForm({
  data,
  profiles,
  apiBase,
  disabled,
  error,
  onSave,
}: {
  data: BookingWorkspaceData;
  profiles: BookingProfile[];
  apiBase: string;
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [name, setName] = useState(data.business.name);
  const [subcategoryId, setSubcategoryId] = useState(data.configuration.subcategoryId);
  const [published, setPublished] = useState(data.configuration.published ?? false);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    data.configuration.canonicalAnswers ?? {},
  );
  const [questions, setQuestions] = useState<BookingQuestion[]>([]);
  const [questionError, setQuestionError] = useState('');
  const [questionLoading, setQuestionLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<BookingModel | ''>(
    (data.configuration.resolved?.primaryModel as BookingModel | undefined) ?? '',
  );
  const selectedProfile = profiles.find((p) => p.subcategoryId === subcategoryId);
  const defaultModel = selectedProfile?.defaultModelId ?? selectedProfile?.primaryModelId;
  const candidates = [
    ...new Set([
      ...(defaultModel ? [defaultModel] : []),
      ...(selectedProfile?.candidateModelIds ??
        selectedProfile?.candidateModels
          ?.map((entry) => (typeof entry === 'string' ? entry : (entry.modelId ?? entry.id!)))
          .filter(Boolean) ??
        []),
    ]),
  ];
  const model =
    selectedWorkflow && candidates.includes(selectedWorkflow)
      ? selectedWorkflow
      : (defaultModel ?? candidates[0]);
  useEffect(() => {
    let current = true;
    setQuestionError('');
    setQuestions([]);
    setQuestionLoading(true);
    void bookingRequest<{ questions: BookingQuestion[] }>(
      `/questions?subcategoryId=${encodeURIComponent(subcategoryId)}${model ? `&offeringModel=${model}` : ''}`,
      {},
      apiBase,
    )
      .then((result) => {
        if (current)
          setQuestions(
            result.questions.filter(
              (q) => q.askMerchant !== false && q.captureMode !== 'PLATFORM_CONSTANT',
            ),
          );
      })
      .catch(() => {
        if (current) {
          setQuestions([]);
          setQuestionError(
            'Detailed setup questions are unavailable. You can save your business activity and complete those details when the connection is restored.',
          );
        }
      })
      .finally(() => {
        if (current) setQuestionLoading(false);
      });
    return () => {
      current = false;
    };
  }, [subcategoryId, model, apiBase]);
  const groups = [...new Set(profiles.map((p) => p.categoryName ?? humanize(p.categoryId)))];
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          businessName: name,
          subcategoryId,
          published,
          answers: data.configuration.answers,
          operationalAnswers: data.configuration.operationalAnswers,
          bookingSetup: data.configuration.bookingSetup,
          canonicalAnswers: answers,
        });
      }}
    >
      <Field label="Business name">
        <input
          className={inputClass}
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Business activity"
        hint="Your selected activity configures the offering and calendar models available to your business."
      >
        <select
          className={inputClass}
          value={subcategoryId}
          onChange={(e) => {
            setSubcategoryId(e.target.value);
            setSelectedWorkflow('');
          }}
          required
        >
          {!profiles.length ? (
            <option value={subcategoryId}>{humanize(subcategoryId || 'Choose activity')}</option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {profiles
                .filter((p) => (p.categoryName ?? humanize(p.categoryId)) === group)
                .map((p) => (
                  <option key={p.subcategoryId} value={p.subcategoryId}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {!profiles.length ? (
        <p role="status" className="text-muted text-xs">
          The business activity list has not loaded. Refresh the calendar to retry before changing
          your workflows.
        </p>
      ) : null}
      {selectedProfile?.specialtyNeeds ? (
        <p className="text-muted text-sm leading-relaxed">{selectedProfile.specialtyNeeds}</p>
      ) : null}
      {candidates.length ? (
        <Field
          label="Workflow to configure"
          hint="Choose each workflow your offerings use. Entries stay in this form when you switch. Save booking setup to keep them."
        >
          <select
            className={inputClass}
            value={model ?? ''}
            onChange={(event) => setSelectedWorkflow(event.target.value as BookingModel)}
          >
            {candidates.map((candidate) => (
              <option key={candidate} value={candidate}>
                {MODEL_LABELS[candidate]}
                {data.offerings.some((offering) => offering.model === candidate)
                  ? ' · Used by your offerings'
                  : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <p className="text-muted text-xs">Scheduling uses Kenya time throughout.</p>
      <WorkflowReadiness value={data.configuration.resolved} />
      {questionLoading ? (
        <p role="status" className="text-muted text-xs">
          Loading {model ? MODEL_LABELS[model].toLowerCase() : 'workflow'} details…
        </p>
      ) : null}
      {questions.length ? (
        <details
          key={`${subcategoryId}:${model ?? ''}`}
          className="border-border rounded-lg border p-3"
        >
          <summary className="cursor-pointer text-sm font-bold">
            Activity and workflow details ({questions.length})
          </summary>
          <div className="mt-4 space-y-5">
            {questions.map((q) => {
              const id = q.questionId ?? q.id!;
              return (
                <SchemaField
                  key={id}
                  label={q.label}
                  schema={q.valueSchema ?? q.schema ?? { type: 'string' }}
                  value={answers[id] ?? q.value}
                  required={q.required}
                  onChange={(value) => setAnswers((current) => ({ ...current, [id]: value }))}
                />
              );
            })}
          </div>
        </details>
      ) : null}
      {questionError ? <p className="text-muted text-xs leading-relaxed">{questionError}</p> : null}
      <label className="flex items-start gap-3 rounded-lg bg-black/[0.025] p-3 text-sm">
        <input
          className="accent-ink mt-0.5 h-4 w-4"
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        <span>
          <strong className="block">Publish the customer booking page</strong>
          <span className="text-muted mt-1 block text-xs leading-relaxed">
            Customers can book only active offerings that pass their setup, capacity and policy
            checks.
          </span>
        </span>
      </label>
      <ErrorMessage message={error} />
      <button className={`${primaryClass} w-full`} disabled={disabled} type="submit">
        {disabled ? 'Saving…' : 'Save booking setup'}
      </button>
    </form>
  );
}

function ResourceForm({
  disabled,
  error,
  onSave,
}: {
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [kind, setKind] = useState('staff');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [capacityMode, setCapacityMode] = useState('per-reservation');
  const [scale, setScale] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const exclusive = ['vehicle', 'space', 'asset'].includes(kind);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        const values = new FormData(event.currentTarget);
        try {
          void onSave({
            name: values.get('name'),
            kind,
            quantity: quantityInputToMinor(String(values.get('quantity')), exclusive ? 0 : scale),
            capacityMode: exclusive ? 'per-reservation' : capacityMode,
            capacityUnit: exclusive ? 'asset' : values.get('capacityUnit') || undefined,
            quantityScale: exclusive ? 0 : scale,
            schedule: { days, start: values.get('start'), end: values.get('end') },
            active: true,
          });
        } catch (e) {
          setLocalError(e instanceof Error ? e.message : 'Review the resource capacity.');
        }
      }}
    >
      <Field label="Name">
        <input
          name="name"
          required
          maxLength={120}
          className={inputClass}
          placeholder={
            kind === 'vehicle'
              ? 'Vehicle name or registration'
              : kind === 'space'
                ? 'Table or space name'
                : 'Resource name'
          }
        />
      </Field>
      <Field label="Resource type">
        <select
          className={inputClass}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setCapacityMode(e.target.value === 'capacity_pool' ? 'per-guest' : 'per-reservation');
          }}
        >
          {['staff', 'vehicle', 'room', 'space', 'equipment', 'capacity_pool', 'asset'].map(
            (kind) => (
              <option key={kind} value={kind}>
                {kind === 'space' ? 'Table or private space' : humanize(kind)}
              </option>
            ),
          )}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={
            kind === 'space' || kind === 'vehicle'
              ? 'Maximum party size'
              : exclusive
                ? 'Asset count'
                : 'Capacity'
          }
          hint={exclusive ? 'One identified asset is reserved exclusively.' : undefined}
        >
          <input
            key={`${kind}-${scale}`}
            name="quantity"
            type="number"
            className={inputClass}
            min={exclusive ? 1 : 10 ** -scale}
            step={exclusive ? 1 : 10 ** -scale}
            max={100000}
            required
            defaultValue={1}
          />
        </Field>
        {!exclusive ? (
          <Field label="Capacity is used by">
            <select
              name="capacityMode"
              className={inputClass}
              value={capacityMode}
              onChange={(e) => setCapacityMode(e.target.value)}
            >
              <option value="per-reservation">Each reservation</option>
              <option value="per-guest">Booked quantity</option>
            </select>
          </Field>
        ) : null}
      </div>
      {!exclusive ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Capacity unit">
            <select className={inputClass} name="capacityUnit">
              <option value="place">Place / person</option>
              {[
                'unit',
                'item',
                'job',
                'batch',
                'session',
                'visit',
                'minute',
                'hour',
                'sqm',
                'sqft',
                'cbm',
                'pallet',
                'g',
                'kg',
                'container',
              ].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity precision">
            <select
              className={inputClass}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            >
              <option value="0">Whole units</option>
              <option value="1">1 decimal place</option>
              <option value="2">2 decimal places</option>
              <option value="3">3 decimal places</option>
            </select>
          </Field>
        </div>
      ) : null}
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Available days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day, index) => (
            <label
              key={day}
              className="border-border flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs"
            >
              <input
                className="accent-ink"
                type="checkbox"
                checked={days.includes(index)}
                onChange={(e) =>
                  setDays(e.target.checked ? [...days, index] : days.filter((d) => d !== index))
                }
              />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Available from">
          <input required name="start" className={inputClass} type="time" defaultValue="08:00" />
        </Field>
        <Field label="Available until">
          <input required name="end" className={inputClass} type="time" defaultValue="18:00" />
        </Field>
      </div>
      <p className="text-muted text-xs">
        Times are EAT. An end time before the start time describes an overnight shift.
      </p>
      <ErrorMessage message={localError ?? error} />
      <button
        type="submit"
        className={`${primaryClass} w-full`}
        disabled={disabled || !days.length}
      >
        Add resource
      </button>
    </form>
  );
}

function OfferingForm({
  data,
  profile,
  disabled,
  error,
  onSave,
}: {
  data: BookingWorkspaceData;
  profile?: BookingProfile;
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
}) {
  const candidates = profile?.candidateModelIds ??
    profile?.candidateModels
      ?.map((v) => (typeof v === 'string' ? v : (v.modelId ?? v.id!)))
      .filter(Boolean) ?? [...BOOKING_MODELS];
  const [model, setModel] = useState<BookingModel>(
    profile?.defaultModelId ?? profile?.primaryModelId ?? 'APPOINTMENT',
  );
  const [resources, setResources] = useState<string[]>([]);
  const [intake, setIntake] = useState('merchant_approval');
  const [pricing, setPricing] = useState('per_booking');
  const [feeMode, setFeeMode] = useState('no_fee');
  const [specialistEnabled, setSpecialistEnabled] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const nonblocking = [
    'ORDER',
    'REQUEST_QUOTE',
    'ENTITLEMENT',
    'PRODUCTION_DUE',
    'SERVICE_JOB',
    'FREIGHT',
  ].includes(model);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        const values = new FormData(event.currentTarget);
        try {
          const specialistSetup = isSpecialistModel(model)
            ? specialistSetupFromForm(model, values, data.resources)
            : undefined;
          void onSave({
            name: values.get('name'),
            description: values.get('description'),
            model,
            durationMinutes:
              nonblocking || specialistSetup ? undefined : Number(values.get('duration')),
            minDurationMinutes: Number(values.get('minimum')) || undefined,
            maxDurationMinutes: Number(values.get('maximum')) || undefined,
            resourceIds: specialistSetup ? specialistResourceIds(specialistSetup) : resources,
            ...(specialistSetup ? { specialistSetup } : {}),
            priceMinor: kesInputToMinor(String(values.get('price'))),
            currency: 'KES',
            intakeMode: intake,
            method: values.get('method'),
            bookingEnabled: values.get('bookingEnabled') === 'on',
            requiresAdvanceBooking: values.get('advanceRequired') === 'on',
            transportIncluded: values.get('transportIncluded') === 'on',
            withDriver: values.get('withDriver') === 'on',
            capacityUnit: values.get('capacityUnit') || undefined,
            quantityScale: Number(values.get('quantityScale') || 0),
            pricingBasis: pricing,
            durationUnitMinutes:
              pricing === 'per_duration' ? Number(values.get('durationUnit')) : undefined,
            minimumBillableUnits: ['per_duration', 'per_night', 'per_quantity'].includes(pricing)
              ? Number(values.get('minimumBillableUnits'))
              : undefined,
            bufferBeforeMinutes: Number(values.get('bufferBefore')),
            bufferAfterMinutes: Number(values.get('bufferAfter')),
            leadTimeMinutes: Number(values.get('leadTime')),
            horizonDays: Number(values.get('horizon')),
            paymentPolicyId: values.get('paymentPolicy'),
            changePolicyId: values.get('changePolicy'),
            policyVersion: 1,
            active: true,
            reservationFee: {
              mode: feeMode,
              amountMinor:
                feeMode === 'fixed' ? kesInputToMinor(String(values.get('feeAmount'))) : undefined,
              percentageBps:
                feeMode === 'percentage'
                  ? kesInputToMinor(String(values.get('feePercentage')))
                  : undefined,
              treatment: values.get('feeTreatment') || 'credited_to_total',
              requiredBeforeConfirmation:
                feeMode !== 'no_fee' && values.get('feeRequired') === 'on',
              refundTerms: String(values.get('refundTerms') || ''),
            },
            resourceSelectionMode: values.get('resourceSelectionMode'),
            ...(['FIELD_VISIT', 'TRANSFER'].includes(model)
              ? {
                  serviceArea: {
                    areas: String(values.get('serviceAreas') || '')
                      .split(',')
                      .map((a) => a.trim())
                      .filter(Boolean),
                  },
                  travelMinutes: Number(values.get('travelMinutes')),
                }
              : {}),
          });
        } catch (e) {
          setLocalError(e instanceof Error ? e.message : 'Review the offering details.');
        }
      }}
    >
      <Field label="Offering name">
        <input name="name" className={inputClass} maxLength={160} required />
      </Field>
      <Field label="Work type">
        <select
          className={inputClass}
          value={model}
          onChange={(e) => {
            setModel(e.target.value as BookingModel);
            setSpecialistEnabled(false);
            setResources([]);
            setPricing(NONBLOCKING.has(e.target.value) ? 'indicative' : 'per_booking');
            if (NONBLOCKING.has(e.target.value)) setIntake('request_quote');
          }}
          required
        >
          {[...new Set(candidates)].map((m) => (
            <option key={m} value={m}>
              {MODEL_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      {MODEL_HINTS[model] ? (
        <p className="text-muted text-xs leading-relaxed">{MODEL_HINTS[model]}</p>
      ) : null}
      <Field label="Description">
        <textarea name="description" className={inputClass} rows={2} maxLength={1000} />
      </Field>
      {isSpecialistModel(model) ? (
        <SpecialistOfferingFields
          key={model}
          model={model}
          enabled={specialistEnabled}
          onEnabledChange={(enabled) => {
            setSpecialistEnabled(enabled);
            if (enabled && pricing === 'indicative') setPricing('per_booking');
          }}
          resources={data.resources}
          offerings={data.offerings}
        />
      ) : null}

      <Field label="How the price is calculated">
        <select className={inputClass} value={pricing} onChange={(e) => setPricing(e.target.value)}>
          <option value="per_booking">Fixed price per booking</option>
          <option value="per_quantity">Price × booked quantity</option>
          {!nonblocking || specialistEnabled ? (
            <>
              <option value="per_duration">Price × time used</option>
              <option value="per_night">Price × overnight stays</option>
            </>
          ) : (
            <option value="indicative">Indicative price, agreed after review</option>
          )}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        {!nonblocking && !specialistEnabled ? (
          <Field label="Duration in minutes">
            <input
              name="duration"
              required
              type="number"
              min={1}
              max={525600}
              className={inputClass}
            />
          </Field>
        ) : null}
        <Field
          label={
            pricing === 'indicative'
              ? 'Indicative price in KES'
              : pricing === 'per_booking'
                ? 'Booking price in KES'
                : 'Price per unit in KES'
          }
        >
          <input
            name="price"
            required
            type="number"
            min={0}
            max={1000000000}
            step="0.01"
            className={inputClass}
          />
        </Field>
      </div>
      {pricing === 'per_duration' ? (
        <Field label="Minutes per billing unit" hint="Each started billing unit is rounded up.">
          <input
            name="durationUnit"
            className={inputClass}
            type="number"
            required
            min={1}
            max={525600}
            defaultValue={60}
          />
        </Field>
      ) : null}
      {['per_duration', 'per_night', 'per_quantity'].includes(pricing) ? (
        <Field label="Minimum billable units">
          <input
            name="minimumBillableUnits"
            className={inputClass}
            type="number"
            required
            min={1}
            max={100000}
            defaultValue={1}
          />
        </Field>
      ) : null}
      {['STORAGE', 'FREIGHT', 'PRODUCTION_DUE'].includes(model) || pricing === 'per_quantity' ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity unit">
            <select name="capacityUnit" className={inputClass} required>
              <option value="">Choose a unit</option>
              {[
                'place',
                'person',
                'item',
                'job',
                'unit',
                'sqm',
                'sqft',
                'cbm',
                'pallet',
                'kg',
                'container',
              ].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity precision">
            <select name="quantityScale" className={inputClass}>
              <option value="0">Whole units</option>
              <option value="1">1 decimal place</option>
              <option value="2">2 decimal places</option>
              <option value="3">3 decimal places</option>
            </select>
          </Field>
        </div>
      ) : null}
      {['ASSET_INTERVAL', 'TOUR', 'STORAGE'].includes(model) ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum minutes">
            <input name="minimum" type="number" min={1} className={inputClass} defaultValue={60} />
          </Field>
          <Field label="Maximum minutes">
            <input
              name="maximum"
              type="number"
              min={1}
              max={5256000}
              className={inputClass}
              defaultValue={43200}
            />
          </Field>
        </div>
      ) : null}
      <Field label="Fulfilment method">
        <select name="method" className={inputClass}>
          <option value="merchant_location">At the business</option>
          <option value="customer_location">At the customer’s location</option>
          <option value="digital">Remote / online</option>
        </select>
      </Field>
      {['FIELD_VISIT', 'TRANSFER'].includes(model) ? (
        <div className="space-y-4">
          <Field label="Areas served" hint="Enter the places you can visit, separated by commas.">
            <input name="serviceAreas" className={inputClass} required maxLength={1000} />
          </Field>
          <Field label="Travel allowance in minutes">
            <input name="travelMinutes" className={inputClass} type="number" min={0} required />
          </Field>
        </div>
      ) : null}
      <Field label="Acceptance">
        <select className={inputClass} value={intake} onChange={(e) => setIntake(e.target.value)}>
          {!nonblocking || specialistEnabled ? (
            <option value="instant_after_requirements">Instant after all requirements pass</option>
          ) : null}
          <option value="merchant_approval">Merchant approval</option>
          <option value="request_quote">Request or quote first</option>
          {['APPOINTMENT', 'SERVICE_JOB', 'SESSION_CAPACITY', 'SPACE_RESERVATION'].includes(
            model,
          ) ? (
            <option value="walk_in_only">Walk-ins only</option>
          ) : null}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input className="accent-ink" name="bookingEnabled" type="checkbox" defaultChecked />
        {nonblocking ? 'Accept customer requests' : 'Accept scheduled bookings'}
      </label>
      {!nonblocking || specialistEnabled ? (
        <label className="flex items-center gap-2 text-sm">
          <input className="accent-ink" name="advanceRequired" type="checkbox" />
          Customers must book in advance
        </label>
      ) : null}
      {model === 'TRANSFER' ? (
        <label className="flex items-center gap-2 text-sm">
          <input className="accent-ink" name="transportIncluded" type="checkbox" defaultChecked />
          Transport is included
        </label>
      ) : null}
      {model === 'ASSET_INTERVAL' ? (
        <label className="flex items-center gap-2 text-sm">
          <input className="accent-ink" name="withDriver" type="checkbox" />
          This rental includes a driver
        </label>
      ) : null}
      {!specialistEnabled ? (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Resources used</legend>
          {data.resources.length ? (
            <div className="space-y-2">
              {data.resources
                .filter((r) => r.active)
                .map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      className="accent-ink"
                      type="checkbox"
                      checked={resources.includes(r.id)}
                      onChange={(e) =>
                        setResources(
                          e.target.checked
                            ? [...resources, r.id]
                            : resources.filter((id) => id !== r.id),
                        )
                      }
                    />
                    {r.name}
                    <span className="text-muted text-xs">{humanize(r.kind)}</span>
                  </label>
                ))}
            </div>
          ) : (
            <p className="text-muted text-xs">
              Add actual resources before enabling a resource-dependent offering.
            </p>
          )}
        </fieldset>
      ) : null}
      {!nonblocking || specialistEnabled ? (
        <Field label="How resources are assigned">
          <select
            key={model}
            name="resourceSelectionMode"
            className={inputClass}
            defaultValue={model === 'SPACE_RESERVATION' ? 'choose_one' : 'all'}
          >
            <option value="all">Reserve every selected resource together</option>
            <option value="choose_one">Choose one eligible resource per booking</option>
          </select>
        </Field>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm font-bold">Booking windows and buffers</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Setup minutes">
            <input
              name="bufferBefore"
              className={inputClass}
              type="number"
              min={0}
              defaultValue={0}
            />
          </Field>
          <Field label="Turnaround minutes">
            <input
              name="bufferAfter"
              className={inputClass}
              type="number"
              min={0}
              defaultValue={0}
            />
          </Field>
          <Field label="Minimum notice minutes">
            <input name="leadTime" className={inputClass} type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Book ahead days">
            <input
              name="horizon"
              className={inputClass}
              type="number"
              min={1}
              max={3650}
              defaultValue={90}
            />
          </Field>
        </div>
      </details>
      <fieldset className="border-border space-y-4 rounded-lg border p-3">
        <legend className="px-1 text-sm font-bold">Reservation fee</legend>
        <Field label="Fee option">
          <select
            className={inputClass}
            value={feeMode}
            onChange={(e) => setFeeMode(e.target.value)}
          >
            <option value="no_fee">No reservation fee</option>
            <option value="fixed">Fixed amount</option>
            <option value="percentage">Percentage of the service price</option>
          </select>
        </Field>
        {feeMode === 'fixed' ? (
          <Field label="Reservation fee in KES">
            <input
              name="feeAmount"
              className={inputClass}
              type="number"
              required
              min="0.01"
              step="0.01"
            />
          </Field>
        ) : feeMode === 'percentage' ? (
          <Field label="Reservation fee percentage">
            <input
              name="feePercentage"
              className={inputClass}
              type="number"
              required
              min="0.01"
              max="100"
              step="0.01"
            />
          </Field>
        ) : null}
        {feeMode !== 'no_fee' ? (
          <>
            <Field label="How the fee affects the final price">
              <select className={inputClass} name="feeTreatment">
                <option value="credited_to_total">Counts toward the service total</option>
                <option value="applied_in_addition">Added to the service total</option>
              </select>
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input
                className="accent-ink mt-0.5"
                name="feeRequired"
                type="checkbox"
                defaultChecked
              />
              <span>Payment is required before the booking is confirmed</span>
            </label>
            <p className="text-muted text-xs leading-relaxed">
              The merchant records payment evidence. This does not connect a payment provider or
              automatically verify an M-Pesa transaction.
            </p>
          </>
        ) : null}
        <Field
          label="Refund and cancellation terms"
          hint="Customers see these terms before sending their booking."
        >
          <textarea
            name="refundTerms"
            className={inputClass}
            rows={3}
            required={feeMode !== 'no_fee'}
            minLength={feeMode !== 'no_fee' ? 3 : undefined}
            maxLength={2000}
          />
        </Field>
      </fieldset>
      <Field label="Payment requirement">
        <select key={feeMode} name="paymentPolicy" className={inputClass} required defaultValue="">
          <option value="">Choose the payment terms</option>
          {feeMode === 'no_fee' ? (
            <option value="NO_PREPAYMENT_V1">
              No online prepayment; payment is arranged with the merchant
            </option>
          ) : null}
          <option value="MANUAL_COLLECTION_V1">
            Merchant collects payment and records evidence
          </option>
        </select>
      </Field>
      <Field label="Changes and cancellations">
        <select name="changePolicy" className={inputClass} required defaultValue="">
          <option value="">Choose the change policy</option>
          <option value="CHANGE_BEFORE_START_V1">
            Changes and cancellation before the start, subject to availability
          </option>
        </select>
      </Field>
      <ErrorMessage message={localError ?? error} />
      <button type="submit" className={`${primaryClass} w-full`} disabled={disabled}>
        Save offering
      </button>
    </form>
  );
}

function BookingForm({
  data,
  date,
  apiBase,
  disabled,
  error,
  onSave,
}: {
  data: BookingWorkspaceData;
  date: string;
  apiBase: string;
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [specialist, setSpecialist] = useState<SpecialistBookingInput | null>(null);
  const [offeringId, setOfferingId] = useState(data.offerings.find((o) => o.active)?.id ?? '');
  const [start, setStart] = useState(
    requestOnlyOffering(data.offerings.find((o) => o.active)) ? '' : `${date}T09:00`,
  );
  const [end, setEnd] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [resourceId, setResourceId] = useState('');
  const [occurrenceId, setOccurrenceId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotMessage, setSlotMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const offering = data.offerings.find((o) => o.id === offeringId);
  const nonblocking = requestOnlyOffering(offering);
  const nativeSpecialist = hasNativeSpecialist(offering);
  const datedSession = offering?.model === 'SESSION_CAPACITY';
  const occurrences = (data.occurrences ?? offering?.occurrences ?? [])
    .filter(
      (entry) =>
        entry.offeringId === offeringId &&
        entry.published &&
        Date.parse(entry.endTime) > Date.now(),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const estimate = useBookingQuote({ offering, start, end, quantity, apiBase, specialist });
  async function checkAvailability() {
    setChecking(true);
    setSlotMessage('');
    try {
      const result = await bookingRequest<{
        slots: AvailabilitySlot[];
        reason?: string;
      }>(
        `/availability?offeringId=${encodeURIComponent(offeringId)}&date=${start.slice(0, 10)}&quantity=${quantityInputToMinor(quantity, offering?.quantityScale ?? 0)}${resourceId ? `&resourceId=${encodeURIComponent(resourceId)}` : ''}`,
        {},
        apiBase,
      );
      setSlots(result.slots ?? []);
      setSlotMessage(
        result.reason ??
          (result.slots.length ? '' : 'No available slots were found for this date.'),
      );
    } catch (e) {
      setSlots([]);
      setSlotMessage(e instanceof Error ? e.message : 'Availability could not be checked.');
    } finally {
      setChecking(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        const form = new FormData(event.currentTarget);
        try {
          if (!form.get('phone') && !form.get('email'))
            throw new Error(
              'Add an email address or phone number so the customer can be contacted.',
            );
          void onSave({
            offeringId,
            ...(occurrenceId ? { occurrenceId } : {}),
            ...(resourceId ? { resourceIds: [resourceId] } : {}),
            ...(!nativeSpecialist && start ? { startTime: fromKenyaInput(start) } : {}),
            ...(!nativeSpecialist && end ? { endTime: fromKenyaInput(end) } : {}),
            ...(nativeSpecialist && offering?.specialist
              ? { specialist: specialistBookingFromForm(offering.specialist, form) }
              : {}),
            quantity: quantityInputToMinor(quantity, offering?.quantityScale ?? 0),
            expectedTotalMinor: estimate.quote?.totalMinor,
            customer: {
              name: form.get('customer'),
              phone: form.get('phone') || undefined,
              email: form.get('email') || undefined,
            },
            notes: form.get('notes') || undefined,
            ...(offering?.model === 'TRANSFER' ? { trip: tripFromForm(form) } : {}),
            ...(offering?.model === 'FIELD_VISIT'
              ? {
                  customerLocation: {
                    area: form.get('customerArea'),
                    address: form.get('customerAddress'),
                  },
                }
              : {}),
            hold: form.get('hold') === 'on',
          });
        } catch (e) {
          setLocalError(e instanceof Error ? e.message : 'Review the booking details.');
        }
      }}
    >
      <Field label="Offering">
        <select
          className={inputClass}
          value={offeringId}
          required
          onChange={(e) => {
            if (e.target.value === offeringId) return;
            setOfferingId(e.target.value);
            setSpecialist(null);
            setQuantity('1');
            setResourceId('');
            setOccurrenceId('');
            setSlots([]);
            setSlotMessage('');
            setStart(
              requestOnlyOffering(data.offerings.find((o) => o.id === e.target.value))
                ? ''
                : `${date}T09:00`,
            );
            setEnd('');
          }}
        >
          {data.offerings
            .filter((o) => o.active)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {offeringPriceLabel(o)}
              </option>
            ))}
        </select>
      </Field>
      {offering?.resourceSelectionMode === 'choose_one' ? (
        <Field label="Resource">
          <select
            className={inputClass}
            value={resourceId}
            onChange={(e) => {
              setResourceId(e.target.value);
              setSlots([]);
            }}
            required
          >
            <option value="">Choose one resource</option>
            {data.resources
              .filter((r) => r.active && offering.resourceIds.includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      {!nativeSpecialist ? (
        <>
          {' '}
          {datedSession ? (
            <Field label="Published dated session">
              <select
                className={inputClass}
                value={occurrenceId}
                required
                onChange={(e) => {
                  setOccurrenceId(e.target.value);
                  const selected = occurrences.find((entry) => entry.id === e.target.value);
                  setStart(selected ? localDateTime(selected.startTime) : '');
                  setEnd(selected ? localDateTime(selected.endTime) : '');
                }}
              >
                <option value="">Choose an actual session</option>
                {occurrences.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {kenyaDateLabel(entry.startTime)} · {kenyaTime(entry.startTime)}–
                    {kenyaTime(entry.endTime)} · {entry.capacity} places
                  </option>
                ))}
              </select>
              {!occurrences.length ? (
                <p className="text-muted mt-2 text-xs">
                  No dated sessions are published. Open this offering under Offerings and add its
                  actual session date, time and capacity.
                </p>
              ) : null}
            </Field>
          ) : (
            <Field label={nonblocking ? 'Preferred time · EAT (optional)' : 'Start · EAT'}>
              <input
                className={inputClass}
                type="datetime-local"
                required={!nonblocking}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
          )}
        </>
      ) : null}
      {nativeSpecialist && offering ? (
        <SpecialistBookingFields key={offering.id} offering={offering} onChange={setSpecialist} />
      ) : null}
      <WorkflowReadiness value={offering?.readiness} />
      {offering?.model === 'TRANSFER' ? <TripFields offering={offering} /> : null}
      {offering?.executionMode === 'request_capture' ? (
        <p className="text-muted text-xs leading-relaxed">
          This offering captures a request for review. Preferred dates do not reserve capacity.
        </p>
      ) : null}
      {offering?.model === 'FIELD_VISIT' ? (
        <div className="space-y-4">
          <Field label="Customer service area">
            <select name="customerArea" className={inputClass} required>
              <option value="">Choose an area</option>
              {offering.serviceArea?.areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visit address">
            <textarea
              name="customerAddress"
              className={inputClass}
              required
              maxLength={1000}
              rows={2}
            />
          </Field>
        </div>
      ) : null}
      {!nativeSpecialist &&
      offering &&
      ['ASSET_INTERVAL', 'TOUR', 'STORAGE', 'FIELD_VISIT', 'TRANSFER', 'LINKED_WINDOWS'].includes(
        offering.model,
      ) ? (
        <Field label="End · EAT">
          <input
            className={inputClass}
            type="datetime-local"
            required={['ASSET_INTERVAL', 'STORAGE'].includes(offering.model)}
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      ) : null}
      {!nativeSpecialist && !nonblocking && !datedSession ? (
        <button
          type="button"
          className={buttonClass}
          disabled={
            checking ||
            !offeringId ||
            !start ||
            disabled ||
            (offering?.resourceSelectionMode === 'choose_one' && !resourceId)
          }
          onClick={() => void checkAvailability()}
        >
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          {checking ? 'Checking…' : 'Check availability'}
        </button>
      ) : null}
      {slots.length ? (
        <fieldset>
          <legend className="mb-2 text-xs font-bold">Available start times</legend>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                className={`${buttonClass} !px-2 !py-1.5 !text-xs ${start === localDateTime(slot.start) ? 'ring-gold ring-2' : ''}`}
                onClick={() => {
                  setStart(localDateTime(slot.start));
                  if (end) setEnd(localDateTime(slot.end));
                }}
              >
                {kenyaTime(slot.start)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {slotMessage ? (
        <p role="status" className="text-muted text-sm">
          {slotMessage}
        </p>
      ) : null}
      <Field
        label={
          offering?.model === 'SPACE_RESERVATION'
            ? 'Party size'
            : offering?.capacityUnit
              ? `Quantity (${offering.capacityUnit})`
              : 'Quantity / places'
        }
      >
        <input
          className={inputClass}
          required
          type="number"
          min={10 ** -(offering?.quantityScale ?? 0)}
          step={10 ** -(offering?.quantityScale ?? 0)}
          max={
            nativeSpecialist && ['ENTITLEMENT', 'SERVICE_JOB'].includes(offering?.model ?? '')
              ? 1
              : 100000
          }
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>
      <Field label="Customer name">
        <input
          className={inputClass}
          name="customer"
          required
          maxLength={120}
          autoComplete="name"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <input className={inputClass} name="phone" type="tel" autoComplete="tel" maxLength={40} />
        </Field>
        <Field label="Email">
          <input
            className={inputClass}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={200}
          />
        </Field>
      </div>
      <Field
        label="Administrative notes"
        hint="Add only the details needed to fulfil this booking."
      >
        <textarea className={inputClass} name="notes" rows={2} maxLength={1000} />
      </Field>
      {!nativeSpecialist && !nonblocking ? (
        <label className="flex items-center gap-2 text-sm">
          <input className="accent-ink" name="hold" type="checkbox" />
          Create a temporary hold first
        </label>
      ) : null}
      <QuoteSummary {...estimate} reservationFee={offering?.reservationFee} />
      <ErrorMessage message={localError ?? error} />
      <button
        className={`${primaryClass} w-full`}
        type="submit"
        disabled={
          disabled ||
          !offeringId ||
          !estimate.quote ||
          estimate.checking ||
          (offering?.resourceSelectionMode === 'choose_one' && !resourceId) ||
          (datedSession && !occurrenceId) ||
          (nativeSpecialist && !specialist)
        }
      >
        {disabled
          ? 'Saving…'
          : nonblocking ||
              estimate.quote?.binding === false ||
              offering?.intakeMode === 'request_quote'
            ? 'Submit request'
            : 'Save booking'}
      </button>
    </form>
  );
}
