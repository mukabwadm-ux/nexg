'use client';

import { CalendarDays, Check, ChevronLeft, Clock3 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { bookingRequest, command } from './api';
import {
  displayQuantity,
  fromKenyaInput,
  kenyaDate,
  kenyaDateLabel,
  kenyaTime,
  localDateTime,
  MODEL_LABELS,
  money,
  offeringPriceLabel,
  quantityInputToMinor,
  STATUS_LABELS,
} from './format';
import { buttonClass, Field, inputClass, primaryClass } from './panel';
import type { AvailabilitySlot, BookingOffering, BookingRecord } from './types';
import { RescheduleForm } from './reschedule-form';
import { QuoteSummary, useBookingQuote } from './quote';
import { PaymentSummary } from './payment-summary';
import { TripFields, tripFromForm } from './trip-fields';
import {
  hasNativeSpecialist,
  SpecialistBookingFields,
  specialistBookingFromForm,
} from './specialist-fields';
import { SpecialistDetails } from './specialist-details';
import type { SpecialistBookingInput } from './types';

interface Catalogue {
  business: { id: string; name: string; timezone: string };
  offerings: BookingOffering[];
}

export function CustomerBooking({ businessId }: { businessId: string }) {
  const base = `/api/public/booking/${encodeURIComponent(businessId)}`;
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState('');
  const [specialist, setSpecialist] = useState<SpecialistBookingInput | null>(null);
  const [date, setDate] = useState(kenyaDate(new Date()));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [resourceId, setResourceId] = useState('');
  const [occurrenceId, setOccurrenceId] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<{ booking: BookingRecord; customerToken: string } | null>(
    null,
  );
  const [changingTime, setChangingTime] = useState(false);
  const [returnPlan, setReturnPlan] = useState<{ bookingId: string; customerToken: string } | null>(
    null,
  );
  const [previousBooking, setPreviousBooking] = useState<{
    bookingId: string;
    customerToken: string;
  } | null>(null);
  const offering = catalogue?.offerings.find((o) => o.id === offeringId);
  const nativeSpecialist = hasNativeSpecialist(offering);
  const flexible = offering && ['ASSET_INTERVAL', 'STORAGE', 'TOUR'].includes(offering.model);
  const requestOnly =
    offering &&
    !nativeSpecialist &&
    (offering.executionMode === 'request_capture' ||
      [
        'ORDER',
        'ENTITLEMENT',
        'REQUEST_QUOTE',
        'PRODUCTION_DUE',
        'FREIGHT',
        'SERVICE_JOB',
      ].includes(offering.model));
  const estimate = useBookingQuote({ offering, start, end, quantity, apiBase: base, specialist });
  const datedSession = offering?.model === 'SESSION_CAPACITY';
  const publishedSessionDates = [
    ...new Set(
      (offering?.occurrences ?? [])
        .filter((entry) => entry.published && Date.parse(entry.endTime) > Date.now())
        .map((entry) => kenyaDate(entry.startTime)),
    ),
  ].sort();
  const sessionDateKey = publishedSessionDates.join('|');
  useEffect(() => {
    if (datedSession && sessionDateKey) setDate(sessionDateKey.split('|')[0]!);
  }, [offeringId, datedSession, sessionDateKey]);

  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await bookingRequest<Catalogue>('/catalog', {}, base);
      setCatalogue(result);
      setOfferingId((id) =>
        result.offerings.some((o) => o.id === id) ? id : (result.offerings[0]?.id ?? ''),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This booking page could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);
  useEffect(() => {
    try {
      const id = sessionStorage.getItem(`nexg-booking:last:${businessId}`);
      if (!id) return;
      const saved = JSON.parse(
        sessionStorage.getItem(`nexg-booking:${businessId}:${id}`) ?? 'null',
      ) as { customerToken?: string } | null;
      if (saved?.customerToken)
        setPreviousBooking({ bookingId: id, customerToken: saved.customerToken });
    } catch {
      /* Session recovery is optional; no data is treated as server-confirmed here. */
    }
  }, [businessId]);
  useEffect(() => {
    setStart('');
    setEnd('');
    setOccurrenceId('');
  }, [offeringId, date, resourceId]);
  useEffect(() => {
    let current = true;
    setSlots([]);
    setAvailabilityMessage('');
    setChecking(false);
    if (
      !offeringId ||
      !date ||
      requestOnly ||
      nativeSpecialist ||
      (offering?.resourceSelectionMode === 'choose_one' && !resourceId)
    )
      return;
    let requestedQuantity: number;
    try {
      requestedQuantity = quantityInputToMinor(quantity, offering?.quantityScale ?? 0);
    } catch {
      setAvailabilityMessage('Enter the required quantity to check availability.');
      return;
    }
    setChecking(true);
    void bookingRequest<{ slots: AvailabilitySlot[]; reason?: string }>(
      `/availability?offeringId=${encodeURIComponent(offeringId)}&date=${date}&quantity=${requestedQuantity}${resourceId ? `&resourceId=${encodeURIComponent(resourceId)}` : ''}`,
      {},
      base,
    )
      .then((result) => {
        if (!current) return;
        setSlots(result.slots ?? []);
        setAvailabilityMessage(
          result.reason ??
            (result.slots?.length
              ? ''
              : 'No available times were found on this date. Please choose another date.'),
        );
      })
      .catch((e) => {
        if (current)
          setAvailabilityMessage(
            e instanceof Error ? e.message : 'Availability could not be checked.',
          );
      })
      .finally(() => {
        if (current) setChecking(false);
      });
    return () => {
      current = false;
    };
  }, [
    offeringId,
    date,
    base,
    requestOnly,
    nativeSpecialist,
    offering?.resourceSelectionMode,
    offering?.quantityScale,
    resourceId,
    quantity,
  ]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const selectedTime = start;
      if (!form.get('email') && !form.get('phone'))
        throw new Error('Add an email address or phone number so the merchant can contact you.');
      const result = await command<{ booking: BookingRecord; customerToken: string }>(
        '/bookings',
        {
          offeringId,
          ...(occurrenceId ? { occurrenceId } : {}),
          ...(resourceId ? { resourceIds: [resourceId] } : {}),
          ...(!nativeSpecialist && selectedTime ? { startTime: fromKenyaInput(selectedTime) } : {}),
          ...(!nativeSpecialist && end ? { endTime: fromKenyaInput(end) } : {}),
          ...(nativeSpecialist && offering?.specialist
            ? { specialist: specialistBookingFromForm(offering.specialist, form) }
            : {}),
          quantity: quantityInputToMinor(quantity, offering?.quantityScale ?? 0),
          expectedTotalMinor: estimate.quote?.totalMinor,
          customer: {
            name: form.get('name'),
            email: form.get('email') || undefined,
            phone: form.get('phone') || undefined,
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
        },
        'POST',
        base,
      );
      setRecord(result);
      try {
        sessionStorage.setItem(
          `nexg-booking:${businessId}:${result.booking.id}`,
          JSON.stringify(result),
        );
        sessionStorage.setItem(`nexg-booking:last:${businessId}`, result.booking.id);
        setPreviousBooking({ bookingId: result.booking.id, customerToken: result.customerToken });
      } catch {
        /* The confirmed result remains available in this tab. */
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Your request could not be confirmed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateBooking(action: string, body: unknown) {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await command<BookingRecord>(
        `/bookings/${encodeURIComponent(record.booking.id)}/${action}`,
        body,
        'POST',
        base,
        { 'x-booking-customer-token': record.customerToken },
      );
      setRecord({ ...record, booking });
      setChangingTime(false);
      try {
        sessionStorage.setItem(
          `nexg-booking:${businessId}:${booking.id}`,
          JSON.stringify({ ...record, booking }),
        );
      } catch {
        /* Optional local recovery only. */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be confirmed.');
    } finally {
      setBusy(false);
    }
  }

  async function viewCoveredBooking(bookingId: string) {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await bookingRequest<BookingRecord>(
        `/bookings/${encodeURIComponent(bookingId)}`,
        { headers: { 'x-booking-customer-token': record.customerToken } },
        base,
      );
      setReturnPlan({ bookingId: record.booking.id, customerToken: record.customerToken });
      setRecord({ booking, customerToken: record.customerToken });
      setChangingTime(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The covered booking could not be retrieved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function backToPlan() {
    if (!returnPlan) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await bookingRequest<BookingRecord>(
        `/bookings/${encodeURIComponent(returnPlan.bookingId)}`,
        { headers: { 'x-booking-customer-token': returnPlan.customerToken } },
        base,
      );
      setRecord({ booking, customerToken: returnPlan.customerToken });
      setReturnPlan(null);
      setChangingTime(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The latest plan record could not be retrieved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreBooking() {
    if (!previousBooking) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await bookingRequest<BookingRecord>(
        `/bookings/${encodeURIComponent(previousBooking.bookingId)}`,
        { headers: { 'x-booking-customer-token': previousBooking.customerToken } },
        base,
      );
      setRecord({ booking, customerToken: previousBooking.customerToken });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This booking could not be retrieved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bg-bg min-h-dvh px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="text-ink mb-8 inline-block text-xl font-extrabold tracking-tight">
          NEXG<span className="text-gold-text">.</span>
        </a>
        <header className="mb-7">
          <p className="text-muted mb-2 flex items-center gap-2 text-xs font-bold">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {catalogue?.business.name ?? 'Book with a NEXG merchant'}
          </p>
          <h1 className="font-serif text-3xl font-extrabold tracking-tight">
            {record
              ? 'Your booking or request'
              : requestOnly
                ? 'Send your request'
                : 'Choose a service and time'}
          </h1>
          <p className="text-muted mt-2 text-sm">
            All dates and times are shown in East Africa Time.
          </p>
          {!record && previousBooking ? (
            <button
              type="button"
              className="text-gold-text mt-3 text-sm font-bold underline"
              disabled={busy}
              onClick={() => void restoreBooking()}
            >
              View your last booking in this session
            </button>
          ) : null}
        </header>
        {error ? (
          <p
            role="alert"
            className="border-danger/30 bg-danger/5 text-danger mb-5 rounded-lg border p-4 text-sm leading-relaxed"
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="text-muted text-sm">
            Loading booking information…
          </p>
        ) : !catalogue ? (
          <button type="button" className={buttonClass} onClick={() => void loadCatalogue()}>
            Try again
          </button>
        ) : record ? (
          <section className="border-border bg-surface space-y-5 rounded-xl border p-5 sm:p-7">
            <p className="bg-gold-soft text-gold-text flex items-center gap-2 rounded-lg p-3 text-sm font-bold">
              <Check className="h-4 w-4" aria-hidden="true" />
              {STATUS_LABELS[record.booking.status] ?? record.booking.status}
            </p>
            <h2 className="text-xl font-extrabold">{record.booking.offeringName}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
              <dt className="text-muted">Customer</dt>
              <dd>{record.booking.customer.name}</dd>
              <dt className="text-muted">Start</dt>
              <dd>
                {record.booking.startTime
                  ? `${kenyaDateLabel(record.booking.startTime)} · ${kenyaTime(record.booking.startTime)}`
                  : 'No date requested'}
              </dd>
              {record.booking.endTime ? (
                <>
                  <dt className="text-muted">End</dt>
                  <dd>
                    {kenyaDateLabel(record.booking.endTime)} · {kenyaTime(record.booking.endTime)}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">Quantity</dt>
              <dd>
                {displayQuantity(
                  record.booking.quantity,
                  record.booking.quantityScale ??
                    catalogue.offerings.find((o) => o.id === record.booking.offeringId)
                      ?.quantityScale,
                  record.booking.capacityUnit ??
                    catalogue.offerings.find((o) => o.id === record.booking.offeringId)
                      ?.capacityUnit,
                )}
              </dd>
              <dt className="text-muted">
                {record.booking.pricingBasis === 'indicative' ? 'Indicative amount' : 'Amount'}
              </dt>
              <dd>{money(record.booking.priceMinor)}</dd>
              <dt className="text-muted">Reference</dt>
              <dd className="break-all font-mono text-xs">{record.booking.id}</dd>
            </dl>
            {record.booking.status === 'pending' ? (
              <p className="text-muted text-sm leading-relaxed">
                Your request is waiting for the merchant’s review. The merchant will confirm the
                next step and any agreed scope.
              </p>
            ) : null}
            {returnPlan ? (
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => void backToPlan()}
              >
                Back to plan
              </button>
            ) : null}
            <PaymentSummary booking={record.booking} />
            {record.booking.specialist ? (
              <SpecialistDetails
                booking={record.booking}
                offering={catalogue.offerings.find(
                  (entry) => entry.id === record.booking.offeringId,
                )}
                offerings={catalogue.offerings}
                disabled={busy}
                customer
                onAction={(body) => updateBooking('workflow', body)}
                onViewChild={viewCoveredBooking}
              />
            ) : null}
            {changingTime && !record.booking.specialist ? (
              <RescheduleForm
                booking={record.booking}
                offering={catalogue.offerings.find((o) => o.id === record.booking.offeringId)}
                apiBase={base}
                customerToken={record.customerToken}
                disabled={busy}
                onCancel={() => setChangingTime(false)}
                onSave={(body) => updateBooking('reschedule', body)}
              />
            ) : !record.booking.specialist &&
              ['held', 'pending', 'confirmed', 'accepted'].includes(record.booking.status) ? (
              <div className="flex flex-wrap gap-2">
                {record.booking.startTime &&
                record.booking.executionMode !== 'request_capture' &&
                ![
                  'ORDER',
                  'ENTITLEMENT',
                  'REQUEST_QUOTE',
                  'PRODUCTION_DUE',
                  'FREIGHT',
                  'SERVICE_JOB',
                ].includes(record.booking.model) ? (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => setChangingTime(true)}
                  >
                    Change time
                  </button>
                ) : null}
                <button
                  className={`${buttonClass} !text-danger`}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Cancel this booking under the merchant’s cancellation policy?',
                      )
                    )
                      void updateBooking('cancel', { expectedVersion: record.booking.version });
                  }}
                >
                  Cancel booking
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="text-gold-text inline-flex items-center gap-2 text-sm font-bold"
              onClick={() => {
                setRecord(null);
                setReturnPlan(null);
                setChangingTime(false);
              }}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Make another booking
            </button>
          </section>
        ) : !catalogue.offerings.length ? (
          <div className="border-border bg-surface rounded-xl border p-6">
            <h2 className="font-extrabold">No bookable offerings are available</h2>
            <p className="text-muted mt-2 text-sm">
              Please contact this business to arrange your request.
            </p>
          </div>
        ) : (
          <form
            className="border-border bg-surface space-y-5 rounded-xl border p-5 sm:p-7"
            onSubmit={(event) => void submit(event)}
          >
            <Field label="Service">
              <select
                className={inputClass}
                value={offeringId}
                onChange={(e) => {
                    if (e.target.value === offeringId) return;
                  setOfferingId(e.target.value);
                  setSpecialist(null);
                  setQuantity('1');
                  setResourceId('');
                }}
              >
                {catalogue.offerings
                  .filter((o) => o.active)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {offeringPriceLabel(o)}
                    </option>
                  ))}
              </select>
            </Field>
            {offering ? (
              <div>
                <p className="text-muted text-xs font-bold">{MODEL_LABELS[offering.model]}</p>
                {offering.description ? (
                  <p className="text-muted mt-2 text-sm leading-relaxed">{offering.description}</p>
                ) : null}
              </div>
            ) : null}
            {offering?.resourceSelectionMode === 'choose_one' ? (
              <Field label="Choose an eligible resource">
                <select
                  className={inputClass}
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  required
                >
                  <option value="">Choose an option</option>
                  {offering.eligibleResources?.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {offering?.model === 'TRANSFER' ? <TripFields offering={offering} /> : null}
            {offering?.model === 'FIELD_VISIT' ? (
              <div className="space-y-4">
                <Field label="Your service area">
                  <select name="customerArea" className={inputClass} required>
                    <option value="">Choose your area</option>
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
            {nativeSpecialist && offering ? (
              <SpecialistBookingFields
                key={offering.id}
                offering={offering}
                onChange={setSpecialist}
              />
            ) : (
              <>
                {' '}
                {!requestOnly ? (
                  <Field label={datedSession ? 'Published session date' : 'Date'}>
                    {datedSession ? (
                      <select
                        className={inputClass}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                      >
                        <option value="">Choose a session date</option>
                        {publishedSessionDates.map((entry) => (
                          <option key={entry} value={entry}>
                            {kenyaDateLabel(`${entry}T12:00:00+03:00`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        type="date"
                        value={date}
                        min={kenyaDate(new Date())}
                        required
                        onChange={(e) => setDate(e.target.value)}
                      />
                    )}
                    {datedSession && !publishedSessionDates.length ? (
                      <p className="text-muted mt-2 text-xs">
                        No future dated sessions are published. Contact the merchant for the next
                        available session.
                      </p>
                    ) : null}
                  </Field>
                ) : null}
                {requestOnly ? (
                  <Field label="Preferred time · EAT (optional)">
                    <input
                      className={inputClass}
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </Field>
                ) : flexible ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Start · EAT">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        value={start}
                        required
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </Field>
                    <Field label="End · EAT">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        value={end}
                        min={start}
                        required
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : (
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold">
                      {datedSession ? 'Published dated sessions' : 'Available start times'}
                    </legend>
                    {checking ? (
                      <p role="status" className="text-muted text-sm">
                        Checking availability…
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {slots.map((slot) => (
                          <button
                            type="button"
                            key={slot.start}
                            className={
                              start === localDateTime(slot.start) ? primaryClass : buttonClass
                            }
                            aria-pressed={start === localDateTime(slot.start)}
                            onClick={() => {
                              setStart(localDateTime(slot.start));
                              setEnd(localDateTime(slot.end));
                              setOccurrenceId(
                                slot.occurrenceId ??
                                  offering?.occurrences?.find(
                                    (entry) =>
                                      Date.parse(entry.startTime) === Date.parse(slot.start) &&
                                      Date.parse(entry.endTime) === Date.parse(slot.end),
                                  )?.id ??
                                  '',
                              );
                            }}
                          >
                            {kenyaTime(slot.start)}
                            {datedSession ? (
                              <span className="mt-1 block text-[0.625rem]">
                                {kenyaTime(slot.end)} end
                                {slot.remainingCapacity !== undefined
                                  ? ` · ${slot.remainingCapacity} places left`
                                  : ''}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                    {availabilityMessage ? (
                      <p role="status" className="text-muted mt-2 text-sm leading-relaxed">
                        {availabilityMessage}
                      </p>
                    ) : null}
                  </fieldset>
                )}
              </>
            )}
            <Field
              label={
                offering?.model === 'SPACE_RESERVATION'
                  ? 'Party size'
                  : offering?.capacityUnit
                    ? `Quantity (${offering.capacityUnit})`
                    : 'Number of places or units'
              }
            >
              <input
                className={inputClass}
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
                required
              />
            </Field>
            <hr className="border-border" />
            <Field label="Your name">
              <input
                className={inputClass}
                name="name"
                autoComplete="name"
                maxLength={120}
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={200}
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputClass}
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  maxLength={40}
                />
              </Field>
            </div>
            <Field label="Details the merchant needs">
              <textarea className={inputClass} name="notes" rows={3} maxLength={1000} />
            </Field>
            <QuoteSummary {...estimate} reservationFee={offering?.reservationFee} />
            <p className="text-muted flex items-start gap-2 text-xs leading-relaxed">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {offering?.intakeMode === 'instant_after_requirements'
                ? 'Your time is confirmed only after the booking requirements and availability checks pass.'
                : 'The merchant will review your request before confirming the booking.'}
            </p>
            <button
              type="submit"
              className={`${primaryClass} w-full`}
              disabled={
                busy ||
                !offeringId ||
                (!nativeSpecialist && !requestOnly && !start) ||
                (nativeSpecialist && !specialist) ||
                (offering?.resourceSelectionMode === 'choose_one' && !resourceId) ||
                !estimate.quote ||
                estimate.checking
              }
            >
              {busy
                ? 'Submitting…'
                : requestOnly || estimate.quote?.binding === false
                  ? 'Send request'
                  : (estimate.quote?.dueNowMinor ?? 0) > 0
                    ? 'Reserve and arrange payment'
                    : offering?.intakeMode !== 'instant_after_requirements'
                      ? 'Request booking'
                      : 'Confirm booking'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
