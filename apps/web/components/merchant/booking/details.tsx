'use client';

import { useState } from 'react';

import {
  displayQuantity,
  kenyaDateLabel,
  kenyaTime,
  kesInputToMinor,
  money,
  STATUS_LABELS,
} from './format';
import { buttonClass, Field, inputClass, primaryClass } from './panel';
import { RescheduleForm } from './reschedule-form';
import { PaymentSummary } from './payment-summary';
import { SpecialistDetails } from './specialist-details';
import type { BookingOffering, BookingRecord, BookingResource } from './types';

const NONBLOCKING = new Set([
  'ORDER',
  'REQUEST_QUOTE',
  'ENTITLEMENT',
  'PRODUCTION_DUE',
  'SERVICE_JOB',
  'FREIGHT',
]);
const ACTIVE = new Set(['held', 'pending', 'confirmed', 'accepted', 'in_progress']);

export function BookingDetails({
  booking,
  offering,
  resources,
  offerings,
  apiBase,
  disabled,
  error,
  onMutation,
}: {
  booking: BookingRecord;
  offering?: BookingOffering;
  resources: BookingResource[];
  offerings: BookingOffering[];
  apiBase: string;
  disabled: boolean;
  error: string | null;
  onMutation: (action: string, body: unknown, message: string) => Promise<boolean>;
}) {
  const [changingTime, setChangingTime] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [recordingRefund, setRecordingRefund] = useState(false);
  const nonblocking = NONBLOCKING.has(booking.model);
  const captureOnly = booking.executionMode === 'request_capture';
  const custody = ['ASSET_INTERVAL', 'STORAGE', 'SPACE_RESERVATION'].includes(booking.model);
  const releaseAction = booking.model === 'ASSET_INTERVAL' ? 'return' : 'release';
  return (
    <div className="space-y-5">
      <p className="bg-gold-soft text-gold-text inline-flex rounded-full px-3 py-1 text-xs font-bold">
        {STATUS_LABELS[booking.status] ?? booking.status}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
        <dt className="text-muted">Customer</dt>
        <dd className="font-bold">{booking.customer.name}</dd>
        <dt className="text-muted">{nonblocking ? 'Requested date' : 'Start'}</dt>
        <dd>
          {booking.startTime
            ? `${kenyaDateLabel(booking.startTime)} · ${kenyaTime(booking.startTime)}`
            : 'No date requested'}
        </dd>
        {!nonblocking ? (
          <>
            <dt className="text-muted">End</dt>
            <dd>
              {kenyaDateLabel(booking.endTime)} · {kenyaTime(booking.endTime)}
            </dd>
          </>
        ) : null}
        <dt className="text-muted">Quantity</dt>
        <dd>
          {displayQuantity(
            booking.quantity,
            booking.quantityScale ?? offering?.quantityScale,
            booking.capacityUnit ?? offering?.capacityUnit,
          )}
        </dd>
        <dt className="text-muted">
          {booking.pricingBasis === 'indicative' ? 'Indicative amount' : 'Amount'}
        </dt>
        <dd>{money(booking.priceMinor)}</dd>
        <dt className="text-muted">Resources</dt>
        <dd>
          {booking.resourceIds
            .map((id) => resources.find((r) => r.id === id)?.name ?? 'Assigned resource')
            .join(', ') || (nonblocking ? 'No time or capacity reservation' : 'Not allocated')}
        </dd>
        {booking.expiresAt ? (
          <>
            <dt className="text-muted">Hold expires</dt>
            <dd>{kenyaTime(booking.expiresAt)} EAT</dd>
          </>
        ) : null}
        {booking.customer.phone ? (
          <>
            <dt className="text-muted">Phone</dt>
            <dd>{booking.customer.phone}</dd>
          </>
        ) : null}
        {booking.customer.email ? (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{booking.customer.email}</dd>
          </>
        ) : null}
      </dl>
      {booking.custodyState ? (
        <p
          className={`rounded-lg p-3 text-sm ${booking.occupancyOverdue ? 'bg-danger/5 text-danger' : 'bg-black/[0.025] text-muted'}`}
        >
          {booking.custodyState === 'in_use'
            ? booking.occupancyOverdue
              ? 'Overdue: this resource is still in use. Record its actual return or release before it becomes available.'
              : 'Currently in use. The scheduled end does not record a physical return.'
            : booking.custodyState === 'released'
              ? 'Resource returned or released.'
              : 'Use has not started.'}
        </p>
      ) : null}
      <PaymentSummary booking={booking} />
      {booking.specialist ? (
        <SpecialistDetails
          booking={booking}
          offering={offering}
          offerings={offerings}
          disabled={disabled}
          onAction={(body) => onMutation('workflow', body, 'Workflow step saved.')}
        />
      ) : null}
      {booking.paymentEvidence?.length ? (
        <details className="border-border rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-bold">
            Recorded collection evidence
          </summary>
          <ul className="mt-3 space-y-3">
            {booking.paymentEvidence.map((entry, index) => (
              <li key={index} className="text-xs leading-relaxed">
                <p className="font-bold">
                  {money(entry.amountMinor)} · {entry.method} · {entry.reference}
                </p>
                <p className="text-muted mt-1 whitespace-pre-wrap">{entry.evidence}</p>
                <p className="text-muted mt-1">
                  {kenyaDateLabel(entry.recordedAt)} · {kenyaTime(entry.recordedAt)} · Merchant
                  recorded
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {booking.notes ? (
        <p className="border-border whitespace-pre-wrap rounded-lg border p-3 text-sm">
          {booking.notes}
        </p>
      ) : null}
      {booking.customerLocation ? (
        <section className="border-border rounded-lg border p-3 text-sm">
          <h3 className="font-bold">Visit location · {booking.customerLocation.area}</h3>
          <p className="text-muted mt-2 whitespace-pre-wrap">{booking.customerLocation.address}</p>
        </section>
      ) : null}
      {booking.trip ? (
        <section className="border-border space-y-2 rounded-lg border p-3 text-sm">
          <h3 className="font-bold">Pickup / meeting point · {booking.trip.pickupArea}</h3>
          <p className="text-muted whitespace-pre-wrap">{booking.trip.pickupAddress}</p>
          {booking.trip.dropoffArea ? (
            <>
              <h3 className="pt-2 font-bold">Drop-off · {booking.trip.dropoffArea}</h3>
              <p className="text-muted whitespace-pre-wrap">{booking.trip.dropoffAddress}</p>
            </>
          ) : null}
        </section>
      ) : null}
      {captureOnly ? (
        <p className="text-muted text-sm leading-relaxed">
          This request records the customer’s requirements for review. Agree the detailed scope and
          schedule separately before promising availability.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger/5 text-danger rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}
      {changingTime ? (
        <RescheduleForm
          booking={booking}
          offering={offering}
          apiBase={apiBase}
          disabled={disabled}
          onCancel={() => setChangingTime(false)}
          onSave={async (body) => {
            if (await onMutation('reschedule', body, 'Booking rescheduled.'))
              setChangingTime(false);
          }}
        />
      ) : recordingPayment ? (
        <PaymentForm
          booking={booking}
          disabled={disabled}
          onCancel={() => setRecordingPayment(false)}
          onSave={async (body) => {
            if (await onMutation('record_payment', body, 'Collection evidence recorded.'))
              setRecordingPayment(false);
          }}
        />
      ) : recordingRefund ? (
        <PaymentForm
          refund
          booking={booking}
          disabled={disabled}
          onCancel={() => setRecordingRefund(false)}
          onSave={async (body) => {
            if (await onMutation('record_refund', body, 'Refund evidence recorded.'))
              setRecordingRefund(false);
          }}
        />
      ) : finishing ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void onMutation(
              custody ? releaseAction : 'complete',
              { expectedVersion: booking.version, completionEvidence: form.get('evidence') },
              custody
                ? 'Resource returned or released.'
                : nonblocking
                  ? 'Work completed.'
                  : 'Booking completed.',
            ).then((done) => {
              if (done) setFinishing(false);
            });
          }}
        >
          <Field
            label={custody ? 'Return or release record' : 'Completion record'}
            hint="Record the actual handover, service or work completed. Do not include unnecessary personal information."
          >
            <textarea
              name="evidence"
              required
              minLength={3}
              maxLength={1000}
              className={inputClass}
              rows={3}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className={primaryClass} type="submit" disabled={disabled}>
              {custody ? 'Confirm return or release' : 'Confirm completion'}
            </button>
            <button
              className={buttonClass}
              type="button"
              disabled={disabled}
              onClick={() => setFinishing(false)}
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {booking.acceptedPolicies?.paymentPolicyId === 'MANUAL_COLLECTION_V1' &&
          ACTIVE.has(booking.status) &&
          (booking.paidMinor ?? 0) < (booking.pricing?.totalDueMinor ?? booking.priceMinor) ? (
            <button
              disabled={disabled}
              className={buttonClass}
              onClick={() => setRecordingPayment(true)}
            >
              Record collection evidence
            </button>
          ) : null}
          {(booking.paidMinor ?? 0) > (booking.refundedMinor ?? 0) ? (
            <button
              disabled={disabled}
              className={buttonClass}
              onClick={() => setRecordingRefund(true)}
            >
              Record actual refund
            </button>
          ) : null}
          {!booking.specialist && nonblocking && !captureOnly && booking.status === 'pending' ? (
            <button
              disabled={disabled}
              className={primaryClass}
              onClick={() =>
                void onMutation('accept', { expectedVersion: booking.version }, 'Request accepted.')
              }
            >
              Accept request
            </button>
          ) : null}
          {!booking.specialist && nonblocking && booking.status === 'accepted' ? (
            <button
              disabled={disabled}
              className={primaryClass}
              onClick={() =>
                void onMutation('start', { expectedVersion: booking.version }, 'Work started.')
              }
            >
              Start work
            </button>
          ) : null}
          {!booking.specialist &&
          !nonblocking &&
          !captureOnly &&
          ['pending', 'held'].includes(booking.status) ? (
            <button
              disabled={disabled}
              className={primaryClass}
              onClick={() =>
                void onMutation(
                  'confirm',
                  { expectedVersion: booking.version },
                  'Booking confirmed.',
                )
              }
            >
              Confirm booking
            </button>
          ) : null}
          {!booking.specialist &&
          custody &&
          booking.status === 'confirmed' &&
          booking.custodyState !== 'in_use' ? (
            <button
              disabled={disabled}
              className={primaryClass}
              onClick={() =>
                void onMutation(
                  booking.model === 'ASSET_INTERVAL' ? 'check_out' : 'check_in',
                  { expectedVersion: booking.version },
                  'Actual use recorded.',
                )
              }
            >
              {booking.model === 'ASSET_INTERVAL' ? 'Record checkout' : 'Record check-in'}
            </button>
          ) : null}
          {!booking.specialist &&
          (custody
            ? booking.custodyState === 'in_use'
            : booking.status === 'confirmed' || booking.status === 'in_progress') ? (
            <button disabled={disabled} className={primaryClass} onClick={() => setFinishing(true)}>
              {custody
                ? booking.model === 'ASSET_INTERVAL'
                  ? 'Record return'
                  : 'Release space'
                : nonblocking
                  ? 'Complete work'
                  : 'Mark completed'}
            </button>
          ) : null}
          {!booking.specialist &&
          ACTIVE.has(booking.status) &&
          booking.custodyState !== 'in_use' &&
          booking.workState !== 'in_progress' ? (
            <>
              {!nonblocking && !captureOnly ? (
                <button
                  disabled={disabled}
                  className={buttonClass}
                  onClick={() => setChangingTime(true)}
                >
                  Reschedule
                </button>
              ) : null}
              <button
                disabled={disabled}
                className={`${buttonClass} !text-danger`}
                onClick={() => {
                  if (
                    window.confirm(
                      'Cancel this record? Any payment or refund follows its separate policy.',
                    )
                  )
                    void onMutation(
                      'cancel',
                      { expectedVersion: booking.version },
                      nonblocking || captureOnly ? 'Request cancelled.' : 'Booking cancelled.',
                    );
                }}
              >
                {nonblocking || captureOnly ? 'Cancel request' : 'Cancel booking'}
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PaymentForm({
  booking,
  refund = false,
  disabled,
  onCancel,
  onSave,
}: {
  booking: BookingRecord;
  refund?: boolean;
  disabled: boolean;
  onCancel: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const due = refund
    ? (booking.paidMinor ?? 0) - (booking.refundedMinor ?? 0)
    : Math.max(0, (booking.pricing?.dueNowMinor ?? booking.priceMinor) - (booking.paidMinor ?? 0));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        const form = new FormData(event.currentTarget);
        try {
          void onSave({
            expectedVersion: booking.version,
            amountMinor: kesInputToMinor(String(form.get('amount'))),
            method: form.get('method'),
            reference: form.get('reference'),
            evidence: form.get('evidence'),
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Review the collection amount.');
        }
      }}
    >
      <p className="text-muted text-sm leading-relaxed">
        {refund
          ? 'Record a refund you actually sent under the accepted cancellation terms. This action records evidence; it does not transfer money.'
          : 'Record money you actually collected. This records the owner’s evidence and does not verify a transaction with a payment provider.'}
      </p>
      <Field label={refund ? 'Refunded amount in KES' : 'Collected amount in KES'}>
        <input
          name="amount"
          type="number"
          className={inputClass}
          min="0.01"
          step="0.01"
          defaultValue={due / 100 || undefined}
          required
        />
      </Field>
      {!refund ? (
        <Field label="Collection method">
          <select name="method" className={inputClass} required>
            <option value="">Choose a method</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="card">Card</option>
            <option value="bank">Bank transfer</option>
          </select>
        </Field>
      ) : null}
      <Field label="Receipt or payment reference">
        <input name="reference" className={inputClass} required maxLength={200} />
      </Field>
      <Field label={refund ? 'Refund evidence' : 'Collection evidence'}>
        <textarea
          name="evidence"
          className={inputClass}
          required
          minLength={3}
          maxLength={2000}
          rows={3}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryClass} disabled={disabled}>
          {refund ? 'Record refund' : 'Record collection'}
        </button>
        <button type="button" className={buttonClass} disabled={disabled} onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}
