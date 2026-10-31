'use client';

import { useEffect, useState } from 'react';
import type {
  EntitlementCredit,
  SpecialistPublicDescriptor,
} from '@nexg/booking-config/specialists';
import {
  displayQuantity,
  fromKenyaInput,
  humanize,
  kenyaDateLabel,
  kenyaTime,
  kesInputToMinor,
  money,
  quantityInputToMinor,
} from './format';
import { buttonClass, Field, inputClass, primaryClass } from './panel';
import { SpecialistWindowFields } from './specialist-fields';
import { TripFields, tripFromForm } from './trip-fields';
import type { BookingOffering, BookingRecord } from './types';

const CUSTOMER_COMMANDS = new Set([
  'AcceptTourScope',
  'AcceptLinkedScope',
  'AcceptProductionScope',
  'AcceptFreightQuote',
  'RequestSpecialistCancellation',
  'RedeemEntitlement',
  'BookEntitledOffering',
  'AcceptFixedScopeServiceJob',
  'ApproveServiceJob',
]);
const ACCEPTANCE = new Set([
  'AcceptTourScope',
  'AcceptLinkedScope',
  'AcceptProductionScope',
  'AcceptFreightQuote',
  'ActivateMembership',
  'ApproveProcessingPrice',
  'AcceptFixedScopeServiceJob',
  'ApproveServiceJob',
]);
const COMMITMENTS = new Set([
  'ConfirmTour',
  'ConfirmCollectionLeg',
  'CommitProduction',
  'ConfirmFreightBooking',
  'ConfirmServiceWorkSlot',
  'ConfirmServiceIntakeSlot',
  'ConfirmCustomerDropoffPromise',
]);
const NO_EVIDENCE = new Set([
  ...ACCEPTANCE,
  ...COMMITMENTS,
  'RedeemEntitlement',
  'BookEntitledOffering',
  'ExpireMembership',
]);
const LABELS: Record<string, string> = {
  IssueSpecialistQuote: 'Propose an exact price',
  AcceptTourScope: 'Accept itinerary and price',
  AcceptLinkedScope: 'Accept collection, processing and return scope',
  ConfirmTour: 'Commit tour resources',
  StartTour: 'Start tour',
  SubmitTourCompletion: 'Submit tour completion',
  CompleteTour: 'Approve tour completion',
  ConfirmCollectionLeg: 'Commit incoming step',
  ConfirmGoodsCollected: 'Record collected goods',
  ReceiveCustomerDropoff: 'Receive customer drop-off',
  ConfirmCustomerDropoffPromise: 'Confirm drop-off promise',
  ReceiveForProcessing: 'Record receipt for processing',
  ApproveProcessingPrice: 'Approve processing scope and price',
  StartProcessing: 'Start processing',
  FinishProcessing: 'Finish processing',
  ConfirmReturnLeg: 'Confirm return step',
  CompleteReturn: 'Record final return',
  AcceptProductionScope: 'Accept specification and price',
  CommitProduction: 'Commit production capacity',
  StartProduction: 'Start production',
  SubmitProductionResult: 'Submit production result',
  ReturnProductionForCorrection: 'Return for correction',
  ApproveProductionResult: 'Approve production result',
  CompleteProductionHandover: 'Complete production handover',
  ActivateMembership: 'Activate plan',
  PauseMembership: 'Pause plan',
  ResumeMembership: 'Resume plan',
  ExpireMembership: 'Record plan expiry',
  RedeemEntitlement: 'Book using plan credits',
  BookEntitledOffering: 'Book covered service',
  RestoreEntitlementCredit: 'Restore eligible cancelled credit',
  AcceptFreightQuote: 'Accept cargo scope and price',
  ConfirmFreightBooking: 'Commit route capacity',
  ClearFreightDocuments: 'Clear cargo documents',
  ConfirmFreightCollection: 'Record cargo collection',
  ConfirmFreightDeparture: 'Record departure',
  RecordFreightClearanceArrival: 'Record clearance arrival',
  ConfirmFreightClearance: 'Confirm clearance',
  ConfirmFreightDestinationArrival: 'Record destination arrival',
  ConfirmFreightDelivery: 'Record delivery',
  ConfirmConsigneeCollection: 'Record consignee collection',
  CloseFreight: 'Close completed freight',
  RequestSpecialistCancellation: 'Request cancellation review',
  ConfirmSpecialistCancellation: 'Approve reviewed cancellation',
  AcceptFixedScopeServiceJob: 'Accept fixed service scope and price',
  ConfirmServiceWorkSlot: 'Commit the service work slot',
  ConfirmServiceIntakeSlot: 'Commit the intake slot',
  AcceptServiceIntake: 'Record actual service intake',
  StartDiagnosis: 'Start diagnosis',
  IssueServiceQuote: 'Propose a diagnosed repair quote',
  ApproveServiceJob: 'Accept diagnosed scope and price',
  RequestServiceParts: 'Record parts request',
  StartRepair: 'Start repair with confirmed parts',
  StartNoPartsService: 'Start service work',
  StartJobWork: 'Start actual job work',
  SubmitServiceResult: 'Submit service result',
  ApproveServiceRelease: 'Approve service release',
  ConfirmServiceHandover: 'Record actual item handover',
  CompleteServiceJob: 'Complete the service job',
  ReturnServiceForCorrection: 'Return service for correction',
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asInterval(value: unknown) {
  const data = object(value);
  return typeof data.startTime === 'string' && typeof data.endTime === 'string'
    ? { startTime: data.startTime, endTime: data.endTime }
    : null;
}
function WindowSummary({ label, value }: { label: string; value: unknown }) {
  const interval = asInterval(value);
  return interval ? (
    <div className="text-xs">
      <dt className="font-bold">{label}</dt>
      <dd className="text-muted mt-1">
        {kenyaDateLabel(interval.startTime, true)} · {kenyaTime(interval.startTime)} →{' '}
        {kenyaDateLabel(interval.endTime, true)} · {kenyaTime(interval.endTime)}
      </dd>
    </div>
  ) : null;
}

export function SpecialistDetails({
  booking,
  offering,
  offerings,
  disabled,
  customer = false,
  onAction,
  onViewChild,
}: {
  booking: BookingRecord;
  offering?: BookingOffering;
  offerings: BookingOffering[];
  disabled: boolean;
  customer?: boolean;
  onAction: (body: unknown) => Promise<unknown>;
  onViewChild?: (bookingId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  useEffect(() => setSelected(''), [booking.version]);
  const work = booking.specialist;
  if (!work) return null;
  const details = work.details;
  const descriptor = work.descriptor ?? offering?.specialist;
  const commands = work.availableCommands.filter(
    (command) => !customer || CUSTOMER_COMMANDS.has(command),
  );
  const redemptions = work.redemptions ?? [];
  return (
    <section
      className="border-border space-y-4 rounded-lg border p-4"
      aria-label="Fulfilment progress"
    >
      <div>
        <h3 className="font-bold">{humanize(work.state)}</h3>
        <p className="text-muted mt-2 text-sm leading-relaxed">{work.summary}</p>
      </div>
      {['itinerary', 'specification', 'cargoDescription', 'jobDescription', 'findings'].map(
        (key) =>
          typeof details[key] === 'string' ? (
            <p key={key} className="whitespace-pre-wrap text-sm leading-relaxed">
              {String(details[key])}
            </p>
          ) : null,
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        <WindowSummary label="Incoming" value={details.incoming} />
        <WindowSummary
          label="Requested service or intake window"
          value={details.requestedInterval}
        />
        <WindowSummary label="Processing" value={details.processing} />
        <WindowSummary label="Outgoing" value={details.outgoing} />
        <WindowSummary label="Handover" value={details.handoff} />
        {typeof details.completionPromise === 'string' ? (
          <div className="text-xs">
            <dt className="font-bold">Requested completion</dt>
            <dd className="text-muted mt-1">
              {kenyaDateLabel(details.completionPromise)} · {kenyaTime(details.completionPromise)}
            </dd>
          </div>
        ) : null}
        {typeof details.dueTime === 'string' ? (
          <div className="text-xs">
            <dt className="font-bold">Due</dt>
            <dd className="text-muted mt-1">
              {kenyaDateLabel(details.dueTime)} · {kenyaTime(details.dueTime)}
            </dd>
          </div>
        ) : null}
        {Object.keys(object(details.validity)).length ? (
          <WindowSummary
            label="Plan validity"
            value={{
              startTime: object(details.validity).starts,
              endTime: object(details.validity).ends,
            }}
          />
        ) : null}
      </dl>
      {Array.isArray(details.credits) ? (
        <ul className="text-muted space-y-2 text-sm">
          {(details.credits as EntitlementCredit[]).map((credit) => (
            <li key={credit.id}>
              {displayQuantity(credit.quantityMinor, credit.scale, credit.unit)} remaining ·{' '}
              {credit.offeringIds
                .map((id) => offerings.find((entry) => entry.id === id)?.name ?? 'Covered offering')
                .join(', ')}
            </li>
          ))}
        </ul>
      ) : null}
      {Array.isArray(details.cargo) ? (
        <ul className="text-muted space-y-1 text-sm">
          {details.cargo.map((entry, index) => {
            const value = object(entry);
            return typeof value.quantityMinor === 'number' && typeof value.unit === 'string' ? (
              <li key={index}>
                {displayQuantity(value.quantityMinor, Number(value.scale ?? 0), value.unit)}
              </li>
            ) : null;
          })}
        </ul>
      ) : null}
      {Array.isArray(details.route) ? (
        <ol className="text-muted list-decimal space-y-2 pl-4 text-sm">
          {details.route.map((entry, index) => {
            const leg = object(entry),
              window = Array.isArray(details.legs)
                ? details.legs.find((item) => object(item).id === leg.id)
                : undefined;
            return (
              <li key={index}>
                {String(leg.origin ?? 'Origin')} → {String(leg.destination ?? 'Destination')}
                <WindowSummary label="Contracted leg window" value={window} />
              </li>
            );
          })}
        </ol>
      ) : null}
      {work.allocations.length ? (
        <details>
          <summary className="cursor-pointer text-sm font-bold">
            Committed resource windows ({work.allocations.length})
          </summary>
          <dl className="mt-3 space-y-3">
            {work.allocations.map((allocation) => (
              <WindowSummary
                key={allocation.id}
                label={humanize(allocation.role)}
                value={allocation}
              />
            ))}
          </dl>
        </details>
      ) : (
        <p className="text-muted text-xs">No resource capacity has been committed yet.</p>
      )}
      {redemptions.length ? (
        <section className="space-y-2">
          <h4 className="text-sm font-bold">Booked plan services</h4>
          {redemptions.map((child) => (
            <div key={child.id} className="text-muted text-xs">
              {offerings.find((entry) => entry.id === child.offeringId)?.name ?? 'Covered service'}{' '}
              · {kenyaDateLabel(child.startTime, true)} · {kenyaTime(child.startTime)}
              <span className="mt-1 block break-all font-mono text-[0.625rem]">{child.id}</span>
              {customer && onViewChild ? (
                <button
                  type="button"
                  className="text-gold-text mt-2 font-bold underline"
                  disabled={disabled}
                  onClick={() => void onViewChild(child.id)}
                >
                  View covered booking
                </button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {descriptor?.model === 'ENTITLEMENT' &&
      descriptor.creditCancellation === 'restore_before_start' ? (
        <p className="text-muted text-xs">
          Eligible cancelled bookings need the merchant’s recorded credit restoration. Cancellation
          does not restore credit automatically.
        </p>
      ) : null}
      {customer &&
      work.model === 'ENTITLEMENT' &&
      !commands.some(
        (command) => command === 'RedeemEntitlement' || command === 'BookEntitledOffering',
      ) ? (
        <p className="text-muted text-xs">
          Ask the merchant to book an eligible service using your remaining plan access or credits.
        </p>
      ) : null}
      {selected ? (
        <WorkflowAction
          key={`${booking.version}:${selected}`}
          command={selected}
          booking={booking}
          descriptor={descriptor}
          offering={offering}
          offerings={offerings}
          disabled={disabled}
          onCancel={() => setSelected('')}
          onAction={onAction}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {commands.map((command) => (
            <button
              key={command}
              type="button"
              disabled={disabled}
              className={command.includes('Cancellation') ? buttonClass : primaryClass}
              onClick={() => setSelected(command)}
            >
              {LABELS[command] ?? command.replace(/([a-z])([A-Z])/g, '$1 $2')}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkflowAction({
  command,
  booking,
  descriptor,
  offering,
  offerings,
  disabled,
  onCancel,
  onAction,
}: {
  command: string;
  booking: BookingRecord;
  descriptor?: SpecialistPublicDescriptor;
  offering?: BookingOffering;
  offerings: BookingOffering[];
  disabled: boolean;
  onCancel: () => void;
  onAction: (body: unknown) => Promise<unknown>;
}) {
  const [error, setError] = useState('');
  if (command === 'RedeemEntitlement' || command === 'BookEntitledOffering')
    return (
      <RedemptionForm
        command={command}
        booking={booking}
        descriptor={descriptor}
        offerings={offerings}
        disabled={disabled}
        onCancel={onCancel}
        onAction={onAction}
      />
    );
  const assessment =
    command === 'ApproveProcessingPrice' &&
    descriptor?.model === 'LINKED_WINDOWS' &&
    descriptor.promiseMode === 'ASSESSMENT_REQUIRED';
  const supplierComponents = offering?.specialistSetup?.supplierComponents ?? [];
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        const form = new FormData(event.currentTarget);
        try {
          const body: Record<string, unknown> = { command, expectedVersion: booking.version };
          if (ACCEPTANCE.has(command))
            body.approval = {
              version: booking.specialist?.scopeVersion ?? descriptor?.version,
              priceMinor: booking.priceMinor,
            };
          if (command === 'IssueSpecialistQuote' || command === 'IssueServiceQuote') {
            body.scopeVersion = booking.specialist?.scopeVersion ?? descriptor?.version;
            body.serviceSubtotalMinor = kesInputToMinor(String(form.get('serviceSubtotal')));
          }
          if (command === 'IssueServiceQuote') {
            body.findings = form.get('jobFindings');
            body.partsRequired = form.get('jobPartsRequired') === 'on';
          }
          if (command === 'StartRepair' && form.get('partsReference'))
            body.partsConfirmation = {
              reference: form.get('partsReference'),
              verification: 'merchant_asserted',
            };
          if (!NO_EVIDENCE.has(command)) body.evidence = form.get('evidence');
          if (assessment && descriptor?.model === 'LINKED_WINDOWS') {
            const readWindow = (prefix: string) => ({
              startTime: fromKenyaInput(String(form.get(`${prefix}Start`))),
              endTime: fromKenyaInput(String(form.get(`${prefix}End`))),
            });
            body.processing = readWindow('assessProcessing');
            body.outgoing = readWindow('assessOutgoing');
            body.workload = {
              quantityMinor: quantityInputToMinor(
                String(form.get('assessWorkload')),
                descriptor.quantityScale,
              ),
              unit: descriptor.processingUnit,
              scale: descriptor.quantityScale,
            };
          }
          if (COMMITMENTS.has(command))
            body.supplierConfirmations = supplierComponents
              .filter((component) => component.evidenceKind === 'authorized_manual_reference')
              .map((component) => ({
                componentId: component.id,
                reference: form.get(`supplier:${component.id}`),
                verification: 'merchant_asserted',
              }));
          if (command === 'RestoreEntitlementCredit')
            body.cancelledBooking = { bookingId: form.get('childBookingId') };
          void onAction(body);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Review these workflow details.');
        }
      }}
    >
      <h4 className="font-bold">{LABELS[command] ?? command}</h4>
      {command === 'IssueSpecialistQuote' || command === 'IssueServiceQuote' ? (
        <>
          <Field
            label="Service subtotal in KES"
            hint="Accepted reservation-fee terms are calculated by the booking engine. A new price needs fresh customer acceptance."
          >
            <input
              name="serviceSubtotal"
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={(booking.pricing?.serviceSubtotalMinor ?? booking.priceMinor) / 100}
            />
          </Field>
          <p className="text-muted text-xs">
            Repricing is blocked once money is collected or resource commitments are active.
          </p>
        </>
      ) : null}
      {command === 'IssueServiceQuote' ? (
        <>
          <Field label="Actual diagnosis and proposed repair scope">
            <textarea
              name="jobFindings"
              className={inputClass}
              required
              minLength={3}
              maxLength={6000}
              rows={4}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="jobPartsRequired" className="accent-ink" />
            The assessed repair requires confirmed parts
          </label>
        </>
      ) : null}
      {command === 'StartRepair' &&
      descriptor?.model === 'SERVICE_JOB' &&
      (booking.specialist?.details.partsRequired ?? descriptor.partsRequired) ? (
        offering?.specialistSetup?.model === 'SERVICE_JOB' &&
        offering.specialistSetup.partsEvidenceKind === 'authorized_manual_reference' ? (
          <Field label="Authorized parts availability reference">
            <input name="partsReference" className={inputClass} required maxLength={200} />
          </Field>
        ) : (
          <p className="text-muted text-sm">
            Parts availability needs a verified provider confirmation. A manual reference does not
            verify a provider transaction.
          </p>
        )
      ) : null}
      {ACCEPTANCE.has(command) ? (
        <>
          <p className="text-sm font-bold">Exact total: {money(booking.priceMinor)}</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="accent-ink mt-0.5" required />
            <span>I accept this displayed scope, version and exact price.</span>
          </label>
        </>
      ) : null}
      {assessment && descriptor?.model === 'LINKED_WINDOWS' ? (
        <>
          <SpecialistWindowFields name="assessProcessing" label="Assessed processing window" />
          <Field label={`Assessed workload (${descriptor.processingUnit})`}>
            <input
              name="assessWorkload"
              className={inputClass}
              type="number"
              min={10 ** -descriptor.quantityScale}
              step={10 ** -descriptor.quantityScale}
              required
            />
          </Field>
          <SpecialistWindowFields name="assessOutgoing" label="Agreed return window" />
        </>
      ) : null}
      {COMMITMENTS.has(command)
        ? supplierComponents.map((component) =>
            component.evidenceKind === 'authorized_manual_reference' ? (
              <Field key={component.id} label={`${component.description} · authorized reference`}>
                <input
                  name={`supplier:${component.id}`}
                  className={inputClass}
                  required
                  maxLength={200}
                />
              </Field>
            ) : (
              <p key={component.id} className="text-muted text-xs">
                {component.description}: a verified provider confirmation is required.
              </p>
            ),
          )
        : null}
      {command === 'RestoreEntitlementCredit' ? (
        <Field label="Actual cancelled child booking">
          <select name="childBookingId" className={inputClass} required>
            <option value="">Choose the cancelled booking</option>
            {booking.specialist?.redemptions?.map((child) => (
              <option key={child.id} value={child.id}>
                {offerings.find((entry) => entry.id === child.offeringId)?.name ??
                  'Covered service'}{' '}
                · {kenyaDateLabel(child.startTime, true)} · {kenyaTime(child.startTime)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {!NO_EVIDENCE.has(command) ? (
        <Field
          label={
            command.includes('Cancellation')
              ? 'Reason and actual cancellation evidence'
              : 'Actual milestone evidence'
          }
        >
          <textarea
            name="evidence"
            className={inputClass}
            rows={3}
            required
            minLength={3}
            maxLength={2000}
          />
        </Field>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className={primaryClass} disabled={disabled}>
          Confirm this step
        </button>
        <button type="button" className={buttonClass} disabled={disabled} onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}

function RedemptionForm({
  command,
  booking,
  descriptor,
  offerings,
  disabled,
  onCancel,
  onAction,
}: {
  command: string;
  booking: BookingRecord;
  descriptor?: SpecialistPublicDescriptor;
  offerings: BookingOffering[];
  disabled: boolean;
  onCancel: () => void;
  onAction: (body: unknown) => Promise<unknown>;
}) {
  const [offeringId, setOfferingId] = useState(''),
    [creditId, setCreditId] = useState(''),
    [occurrenceId, setOccurrenceId] = useState(''),
    [error, setError] = useState('');
  const credits = Array.isArray(booking.specialist?.details.credits)
    ? (booking.specialist!.details.credits as EntitlementCredit[])
    : [];
  const scope =
    descriptor?.model === 'ENTITLEMENT'
      ? descriptor.scopeOfferingIds
      : credits.flatMap((credit) => credit.offeringIds);
  const selected = offerings.find((entry) => entry.id === offeringId),
    credit = credits.find((entry) => entry.id === creditId);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        const form = new FormData(event.currentTarget);
        try {
          if (!selected) throw new Error('Choose an actual covered offering.');
          const occurrence = selected.occurrences?.find((entry) => entry.id === occurrenceId);
          const startTime = occurrence?.startTime ?? fromKenyaInput(String(form.get('childStart'))),
            endTime =
              occurrence?.endTime ||
              (form.get('childEnd') ? fromKenyaInput(String(form.get('childEnd'))) : undefined);
          const body: Record<string, unknown> = {
            command,
            expectedVersion: booking.version,
            offeringId,
            occurrenceKey: `${offeringId}:${occurrenceId || startTime}:${endTime ?? ''}`,
            booking: {
              offeringId,
              ...(occurrenceId ? { occurrenceId } : {}),
              startTime,
              ...(endTime ? { endTime } : {}),
              quantity: quantityInputToMinor(
                String(form.get('childQuantity')),
                selected.quantityScale ?? 0,
              ),
              ...(form.get('childResource') ? { resourceIds: [form.get('childResource')] } : {}),
              ...(selected.model === 'FIELD_VISIT'
                ? {
                    customerLocation: {
                      area: form.get('childArea'),
                      address: form.get('childAddress'),
                    },
                  }
                : {}),
              ...(selected.model === 'TRANSFER' ? { trip: tripFromForm(form) } : {}),
            },
          };
          if (command === 'RedeemEntitlement') {
            if (!credit) throw new Error('Choose a credit for this offering.');
            body.creditId = credit.id;
            body.quantityMinor = quantityInputToMinor(String(form.get('creditUse')), credit.scale);
            body.unit = credit.unit;
            body.scale = credit.scale;
          }
          void onAction(body);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Review the covered booking details.');
        }
      }}
    >
      <h4 className="font-bold">{LABELS[command]}</h4>
      <Field label="Covered offering">
        <select
          className={inputClass}
          value={offeringId}
          required
          onChange={(event) => {
            setOfferingId(event.target.value);
            setCreditId('');
            setOccurrenceId('');
          }}
        >
          <option value="">Choose an offering</option>
          {offerings
            .filter(
              (entry) =>
                entry.active &&
                scope.includes(entry.id) &&
                entry.executionMode !== 'request_capture' &&
                entry.executionMode !== 'native_workflow',
            )
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
        </select>
      </Field>
      {selected?.model === 'SESSION_CAPACITY' ? (
        <Field label="Actual dated session">
          <select
            className={inputClass}
            value={occurrenceId}
            required
            onChange={(event) => setOccurrenceId(event.target.value)}
          >
            <option value="">Choose a published session</option>
            {selected.occurrences
              ?.filter((entry) => entry.published && Date.parse(entry.startTime) > Date.now())
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {kenyaDateLabel(entry.startTime)} · {kenyaTime(entry.startTime)}
                </option>
              ))}
          </select>
        </Field>
      ) : selected ? (
        <>
          <Field label="Child booking start · EAT">
            <input name="childStart" className={inputClass} type="datetime-local" required />
          </Field>
          <Field label="Child booking end · EAT">
            <input
              name="childEnd"
              className={inputClass}
              type="datetime-local"
              required={['ASSET_INTERVAL', 'STORAGE'].includes(selected.model)}
            />
          </Field>
        </>
      ) : null}
      {selected?.resourceSelectionMode === 'choose_one' ? (
        <Field label="Eligible resource">
          <select name="childResource" className={inputClass} required>
            <option value="">Choose a resource</option>
            {selected.eligibleResources?.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {selected?.model === 'TRANSFER' ? <TripFields offering={selected} /> : null}
      {selected?.model === 'FIELD_VISIT' ? (
        <>
          <Field label="Visit area">
            <select name="childArea" className={inputClass} required>
              <option value="">Choose an area</option>
              {selected.serviceArea?.areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visit address">
            <textarea name="childAddress" className={inputClass} required maxLength={1000} />
          </Field>
        </>
      ) : null}
      <Field
        label={
          selected?.capacityUnit
            ? `Booking quantity (${selected.capacityUnit})`
            : 'Booking quantity'
        }
      >
        <input
          name="childQuantity"
          className={inputClass}
          type="number"
          min={10 ** -(selected?.quantityScale ?? 0)}
          step={10 ** -(selected?.quantityScale ?? 0)}
          required
          defaultValue={1}
        />
      </Field>
      {command === 'RedeemEntitlement' ? (
        <>
          <Field label="Applicable remaining credit">
            <select
              className={inputClass}
              value={creditId}
              required
              onChange={(event) => setCreditId(event.target.value)}
            >
              <option value="">Choose a credit</option>
              {credits
                .filter((entry) => entry.offeringIds.includes(offeringId))
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {displayQuantity(entry.quantityMinor, entry.scale, entry.unit)} remaining
                  </option>
                ))}
            </select>
          </Field>
          {credit ? (
            <Field label={`Credit use (${credit.unit})`}>
              <input
                key={credit.id}
                name="creditUse"
                className={inputClass}
                type="number"
                min={10 ** -credit.scale}
                max={credit.quantityMinor / 10 ** credit.scale}
                step={10 ** -credit.scale}
                defaultValue={1}
                required
              />
            </Field>
          ) : null}
        </>
      ) : null}
      <p className="text-muted text-xs">
        The booking engine checks the accepted plan scope, credit balance, validity and actual child
        capacity together. Failed allocation does not consume credit.
      </p>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className={primaryClass} disabled={disabled}>
          Book covered service
        </button>
        <button type="button" className={buttonClass} disabled={disabled} onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}
