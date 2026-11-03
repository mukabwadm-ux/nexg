'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  normalizeSpecialistSetup,
  type SpecialistBookingInput,
  type SpecialistModel,
  type SpecialistPublicDescriptor,
  type SpecialistSetup,
} from '@nexg/booking-config/specialists';
import { fromKenyaInput, kenyaDateLabel, kenyaTime, quantityInputToMinor } from './format';
import { buttonClass, Field, inputClass } from './panel';
import type { BookingOffering, BookingResource } from './types';

export const SPECIALIST_MODEL_IDS = [
  'TOUR',
  'LINKED_WINDOWS',
  'PRODUCTION_DUE',
  'ENTITLEMENT',
  'FREIGHT',
  'SERVICE_JOB',
] as const;
export function isSpecialistModel(model: string): model is SpecialistModel {
  return (SPECIALIST_MODEL_IDS as readonly string[]).includes(model);
}
export function hasNativeSpecialist(offering?: BookingOffering): boolean {
  return offering?.executionMode === 'native_workflow' && !!offering.specialist;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const str = (form: FormData, name: string) => String(form.get(name) ?? '');
const num = (form: FormData, name: string) => Number(str(form, name));
const all = (form: FormData, name: string) => form.getAll(name).map(String);
function measured(form: FormData, name: string, unit: string, scale: number) {
  return { quantityMinor: quantityInputToMinor(str(form, name), scale), unit, scale };
}
function windowFromForm(form: FormData, name: string) {
  const startTime = fromKenyaInput(str(form, `${name}Start`)),
    endTime = fromKenyaInput(str(form, `${name}End`));
  if (Date.parse(endTime) <= Date.parse(startTime))
    throw new Error('Each work window must end after it starts.');
  return { startTime, endTime };
}

function ResourceChoices({
  label,
  name,
  resources,
  pool = false,
}: {
  label: string;
  name: string;
  resources: BookingResource[];
  pool?: boolean;
}) {
  const eligible = resources.filter(
    (resource) =>
      resource.active &&
      (!pool || resource.kind === 'capacity_pool' || resource.capacityMode === 'per-guest'),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      {eligible.map((resource) => (
        <label key={resource.id} className="flex items-center gap-2 text-sm font-normal">
          <input type="checkbox" name={name} value={resource.id} className="accent-ink" />
          {resource.name}
          {resource.capacityUnit ? (
            <span className="text-muted text-xs">
              {resource.capacityUnit} · {resource.quantityScale ?? 0} decimal places
            </span>
          ) : null}
        </label>
      ))}
      {!eligible.length ? (
        <p className="text-muted text-xs">Add the actual resources for this role first.</p>
      ) : null}
    </fieldset>
  );
}
function ResourceSelect({
  label,
  name,
  resources,
}: {
  label: string;
  name: string;
  resources: BookingResource[];
}) {
  return (
    <Field label={label}>
      <select name={name} className={inputClass} required>
        <option value="">Choose a resource</option>
        {resources
          .filter((resource) => resource.active)
          .map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name}
              {resource.capacityUnit ? ` (${resource.capacityUnit})` : ''}
            </option>
          ))}
      </select>
    </Field>
  );
}
function WorkingDays() {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">Working days</legend>
      <div className="flex flex-wrap gap-3">
        {DAYS.map((day, index) => (
          <label key={day} className="flex items-center gap-1 text-xs">
            <input
              name="spDays"
              type="checkbox"
              value={index}
              className="accent-ink"
              defaultChecked={index !== 0}
            />
            {day}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function UnitFields({ initial = 'unit' }: { initial?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Workload unit">
        <input
          name="spUnit"
          className={inputClass}
          required
          maxLength={30}
          defaultValue={initial}
        />
      </Field>
      <Field label="Quantity precision">
        <select name="spScale" className={inputClass}>
          <option value="0">Whole units</option>
          <option value="1">1 decimal place</option>
          <option value="2">2 decimal places</option>
          <option value="3">3 decimal places</option>
        </select>
      </Field>
    </div>
  );
}

export function SpecialistOfferingFields({
  model,
  enabled,
  onEnabledChange,
  resources,
  offerings,
}: {
  model: SpecialistModel;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  resources: BookingResource[];
  offerings: BookingOffering[];
}) {
  const planId = useId();
  const [tourMode, setTourMode] = useState('private');
  const [incoming, setIncoming] = useState('CUSTOMER_DROPOFF');
  const [outgoing, setOutgoing] = useState('CUSTOMER_COLLECTION');
  const [validity, setValidity] = useState('relative_to_activation');
  const [jobCustody, setJobCustody] = useState('customer_retains');
  const [scope, setScope] = useState<string[]>([]);
  const [creditIds, setCreditIds] = useState(['credit-1']);
  const [legIds, setLegIds] = useState(['leg-1']);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const nextId = useRef(2);
  const pools = resources.filter(
    (resource) => resource.kind === 'capacity_pool' || resource.capacityMode === 'per-guest',
  );
  const eligibleOfferings = offerings.filter(
    (offering) => offering.active && offering.model !== 'ENTITLEMENT',
  );
  return (
    <fieldset className="border-border space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-bold">Fulfilment workflow</legend>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-ink mt-0.5"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span>Schedule and fulfil this work in NEXG</span>
      </label>
      {!enabled ? (
        <p className="text-muted text-xs leading-relaxed">
          Requests can be captured for review. Configure actual resources and policies here before
          promising or tracking fulfilment in NEXG.
        </p>
      ) : (
        <>
          <input type="hidden" name="spEnabled" value="true" />
          {model === 'TOUR' ? (
            <>
              <Field label="Tour type">
                <select
                  name="spTourMode"
                  className={inputClass}
                  value={tourMode}
                  onChange={(event) => setTourMode(event.target.value)}
                >
                  <option value="private">Private itinerary</option>
                  <option value="shared">Shared dated departure</option>
                </select>
              </Field>
              <Field label="Published itinerary">
                <textarea
                  name="spItinerary"
                  className={inputClass}
                  required
                  maxLength={6000}
                  rows={4}
                />
              </Field>
              <input name="spItineraryVersion" type="hidden" value="1" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minimum participants">
                  <input
                    name="spMinParticipants"
                    type="number"
                    className={inputClass}
                    min={1}
                    defaultValue={1}
                    required
                  />
                </Field>
                <Field label="Maximum participants">
                  <input
                    name="spMaxParticipants"
                    type="number"
                    className={inputClass}
                    min={1}
                    required
                  />
                </Field>
              </div>
              <ResourceChoices
                label="Guides, vehicles and other tour resources"
                name="spTourResources"
                resources={resources.filter((resource) => !pools.includes(resource))}
              />
              {tourMode === 'shared' ? (
                <>
                  <ResourceSelect
                    label="Departure place pool"
                    name="spTourPool"
                    resources={pools}
                  />
                  <p className="text-muted text-xs">
                    Publish each actual departure after saving the offering. Customers can select
                    only those departures.
                  </p>
                </>
              ) : null}
            </>
          ) : model === 'LINKED_WINDOWS' ? (
            <>
              <Field label="When the return promise becomes firm">
                <select name="spPromise" className={inputClass}>
                  <option value="FIRM_PRE_ACCEPTED">
                    Incoming, processing and return agreed before acceptance
                  </option>
                  <option value="ASSESSMENT_REQUIRED">
                    Incoming first; processing and return agreed after assessment
                  </option>
                </select>
              </Field>
              <Field label="Incoming method">
                <select
                  name="spIncomingMethod"
                  className={inputClass}
                  value={incoming}
                  onChange={(event) => setIncoming(event.target.value)}
                >
                  <option value="CUSTOMER_DROPOFF">Customer drops off</option>
                  <option value="MERCHANT_COLLECTION">Merchant collects</option>
                  <option value="PARTNER_COLLECTION">Partner collects</option>
                </select>
              </Field>
              {incoming !== 'CUSTOMER_DROPOFF' ? (
                <ResourceChoices
                  label="Incoming collection resources"
                  name="spIncomingResources"
                  resources={resources}
                />
              ) : null}
              <ResourceSelect
                label="Processing capacity pool"
                name="spProcessingPool"
                resources={pools}
              />
              <UnitFields initial="kg" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minimum processing minutes">
                  <input
                    name="spMinProcessing"
                    type="number"
                    className={inputClass}
                    min={0}
                    required
                  />
                </Field>
                <Field label="Maximum processing minutes">
                  <input
                    name="spMaxProcessing"
                    type="number"
                    className={inputClass}
                    min={0}
                    required
                  />
                </Field>
              </div>
              <Field label="Processing time is counted by">
                <select name="spCalendarBasis" className={inputClass}>
                  <option value="elapsed">Elapsed time</option>
                  <option value="business_calendar">Working hours</option>
                </select>
              </Field>
              <WorkingDays />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Processing opens">
                  <input
                    name="spOpens"
                    type="time"
                    className={inputClass}
                    required
                    defaultValue="08:00"
                  />
                </Field>
                <Field label="Processing closes">
                  <input
                    name="spCloses"
                    type="time"
                    className={inputClass}
                    required
                    defaultValue="18:00"
                  />
                </Field>
              </div>
              <Field label="Outgoing method">
                <select
                  name="spOutgoingMethod"
                  className={inputClass}
                  value={outgoing}
                  onChange={(event) => setOutgoing(event.target.value)}
                >
                  <option value="CUSTOMER_COLLECTION">Customer collects</option>
                  <option value="MERCHANT_RETURN">Merchant returns</option>
                  <option value="PARTNER_RETURN">Partner returns</option>
                </select>
              </Field>
              {outgoing !== 'CUSTOMER_COLLECTION' ? (
                <ResourceChoices
                  label="Outgoing return resources"
                  name="spOutgoingResources"
                  resources={resources}
                />
              ) : null}
            </>
          ) : model === 'PRODUCTION_DUE' ? (
            <>
              <ResourceSelect
                label="Production capacity pool"
                name="spProductionPool"
                resources={pools}
              />
              <UnitFields initial="job" />
              <Field label="Preparation notice in minutes">
                <input
                  name="spPreparationLead"
                  className={inputClass}
                  type="number"
                  min={0}
                  required
                />
              </Field>
              <Field label="Latest due time on a working day · EAT">
                <input name="spCutoff" className={inputClass} type="time" required />
              </Field>
              <WorkingDays />
              <Field label="Specification approval">
                <select name="spApprovalMode" className={inputClass}>
                  <option value="required">The specification must be approved</option>
                  <option value="not_required_for_fixed_specification">
                    The offering has an agreed fixed specification
                  </option>
                </select>
              </Field>
              <ResourceChoices
                label="Timed handover resources (optional)"
                name="spHandoffResources"
                resources={resources}
              />
            </>
          ) : model === 'ENTITLEMENT' ? (
            <>
              <input name="spPlanId" type="hidden" value={planId} />
              <input name="spPlanVersion" type="hidden" value="1" />
              <Field label="Plan validity">
                <select
                  name="spValidity"
                  className={inputClass}
                  value={validity}
                  onChange={(event) => setValidity(event.target.value)}
                >
                  <option value="relative_to_activation">Starts when activated</option>
                  <option value="absolute_dates">Fixed start and end dates</option>
                </select>
              </Field>
              {validity === 'absolute_dates' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First valid date">
                    <input name="spValidStarts" className={inputClass} type="date" required />
                  </Field>
                  <Field label="First date no longer valid">
                    <input name="spValidEnds" className={inputClass} type="date" required />
                  </Field>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valid for">
                    <input
                      name="spValidValue"
                      className={inputClass}
                      type="number"
                      min={1}
                      required
                    />
                  </Field>
                  <Field label="Period">
                    <select name="spValidUnit" className={inputClass}>
                      <option value="day">Days</option>
                      <option value="week">Weeks</option>
                      <option value="month">Months</option>
                    </select>
                  </Field>
                </div>
              )}
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-bold">Included offerings</legend>
                {eligibleOfferings.map((offering) => (
                  <label key={offering.id} className="flex items-center gap-2 text-sm">
                    <input
                      name="spScope"
                      type="checkbox"
                      value={offering.id}
                      checked={scope.includes(offering.id)}
                      className="accent-ink"
                      onChange={(event) =>
                        setScope(
                          event.target.checked
                            ? [...scope, offering.id]
                            : scope.filter((id) => id !== offering.id),
                        )
                      }
                    />
                    {offering.name}
                  </label>
                ))}
                {!eligibleOfferings.length ? (
                  <p className="text-muted text-xs">
                    Create the actual services or sessions this plan can access first.
                  </p>
                ) : null}
              </fieldset>
              {creditIds.map((id) => (
                <fieldset key={id} className="border-border space-y-3 rounded-lg border p-3">
                  <legend className="px-1 text-sm font-bold">Plan credit</legend>
                  <input type="hidden" name="spCreditIds" value={id} />
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Quantity">
                      <input
                        name={`${id}:quantity`}
                        className={inputClass}
                        type="number"
                        min="0.001"
                        step="any"
                        required
                      />
                    </Field>
                    <Field label="Unit">
                      <input
                        name={`${id}:unit`}
                        className={inputClass}
                        required
                        maxLength={30}
                        placeholder="visit"
                      />
                    </Field>
                    <Field label="Decimals">
                      <select name={`${id}:scale`} className={inputClass}>
                        <option value="0">0</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                      </select>
                    </Field>
                  </div>
                  <fieldset>
                    <legend className="mb-2 text-xs font-bold">Applies to</legend>
                    {eligibleOfferings
                      .filter((offering) => scope.includes(offering.id))
                      .map((offering) => (
                        <label key={offering.id} className="mb-2 flex items-center gap-2 text-xs">
                          <input
                            name={`${id}:offerings`}
                            type="checkbox"
                            value={offering.id}
                            className="accent-ink"
                          />
                          {offering.name}
                        </label>
                      ))}
                  </fieldset>
                  <button
                    type="button"
                    className="text-muted text-xs underline"
                    onClick={() => setCreditIds(creditIds.filter((entry) => entry !== id))}
                  >
                    Remove credit
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className={buttonClass}
                onClick={() => setCreditIds([...creditIds, `credit-${nextId.current++}`])}
              >
                Add credit
              </button>
              <Field label="Credit when a child booking is cancelled">
                <select name="spCreditCancellation" className={inputClass}>
                  <option value="nonrefundable">Credit is not restored</option>
                  <option value="restore_before_start">
                    Restore credit for an eligible cancellation before the start
                  </option>
                </select>
              </Field>
              <Field label="Renewal">
                <select name="spRenewal" className={inputClass}>
                  <option value="none">No renewal</option>
                  <option value="manual">Merchant-arranged renewal</option>
                  <option value="separately_authorized">
                    Renewal requires separate authorization
                  </option>
                </select>
              </Field>
            </>
          ) : model === 'SERVICE_JOB' ? (
            <>
              <Field label="How jobs enter the calendar">
                <select name="spJobScheduling" className={inputClass}>
                  <option value="queue">
                    Queue — actual work starts when a resource is assigned
                  </option>
                  <option value="scheduled_intake">
                    Scheduled intake — completion is agreed separately
                  </option>
                  <option value="scheduled_work">
                    Scheduled work — reserve the actual service window
                  </option>
                </select>
              </Field>
              <Field label="Scope assessment">
                <select name="spJobAssessment" className={inputClass}>
                  <option value="fixed_scope">Fixed service scope and price</option>
                  <option value="diagnosis_required">
                    Diagnosis and a separate quote are required
                  </option>
                </select>
              </Field>
              <Field label="Actual intake or service duration in minutes">
                <input name="spJobDuration" className={inputClass} type="number" min={1} required />
              </Field>
              <ResourceChoices
                label="Service bays, staff and equipment"
                name="spJobResources"
                resources={resources}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="spJobParts" className="accent-ink" />
                Parts availability must be confirmed before repair
              </label>
              <Field label="Parts confirmation">
                <select name="spJobPartsEvidence" className={inputClass}>
                  <option value="authorized_manual_reference">Authorized merchant reference</option>
                  <option value="provider_api">Verified provider integration</option>
                </select>
              </Field>
              <Field label="Goods custody">
                <select
                  name="spJobCustody"
                  className={inputClass}
                  value={jobCustody}
                  onChange={(event) => setJobCustody(event.target.value)}
                >
                  <option value="customer_retains">The customer retains the item</option>
                  <option value="merchant_holds">
                    The merchant holds the item until actual handover
                  </option>
                </select>
              </Field>
              {jobCustody === 'merchant_holds' ? (
                <>
                  <ResourceChoices
                    label="Separate holding resources"
                    name="spJobCustodyResources"
                    resources={resources}
                  />
                  <Field label="Planned holding duration in minutes">
                    <input
                      name="spJobCustodyDuration"
                      className={inputClass}
                      type="number"
                      min={1}
                      required
                    />
                  </Field>
                  <p className="text-muted text-xs">
                    Holding uses separate actual capacity. The work bay and staff are not reserved
                    continuously until the customer collects.
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <>
              {legIds.map((id, index) => (
                <fieldset key={id} className="border-border space-y-3 rounded-lg border p-3">
                  <legend className="px-1 text-sm font-bold">Route leg {index + 1}</legend>
                  <input name="spLegIds" type="hidden" value={id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Origin">
                      <input
                        name={`${id}:origin`}
                        className={inputClass}
                        required
                        maxLength={200}
                      />
                    </Field>
                    <Field label="Destination">
                      <input
                        name={`${id}:destination`}
                        className={inputClass}
                        required
                        maxLength={200}
                      />
                    </Field>
                  </div>
                  <ResourceChoices
                    label="Vehicles and handling resources"
                    name={`${id}:resources`}
                    resources={resources.filter((resource) => !pools.includes(resource))}
                  />
                  <ResourceChoices
                    label="Independent cargo capacity dimensions"
                    name={`${id}:dimensions`}
                    resources={pools.filter((resource) =>
                      ['kg', 'g', 'cbm', 'container', 'pallet', 'item'].includes(
                        resource.capacityUnit ?? '',
                      ),
                    )}
                    pool
                  />
                  <button
                    type="button"
                    className="text-muted text-xs underline"
                    onClick={() => setLegIds(legIds.filter((entry) => entry !== id))}
                  >
                    Remove leg
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className={buttonClass}
                onClick={() => setLegIds([...legIds, `leg-${nextId.current++}`])}
              >
                Add route leg
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input name="spDocuments" type="checkbox" className="accent-ink" />
                Documents must be cleared before collection
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="spClearance" type="checkbox" className="accent-ink" />
                The contracted route includes a clearance stage
              </label>
              <Field label="Final handover">
                <select name="spFinalMode" className={inputClass}>
                  <option value="delivery">Delivery</option>
                  <option value="consignee_collection">Consignee collection</option>
                </select>
              </Field>
            </>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-bold">
              Contracted supplier components (optional)
            </summary>
            <div className="mt-3 space-y-3">
              {supplierIds.map((id) => (
                <fieldset key={id} className="border-border space-y-3 rounded-lg border p-3">
                  <input name="spSupplierIds" type="hidden" value={id} />
                  <Field label="Supplier component">
                    <input
                      name={`${id}:description`}
                      className={inputClass}
                      required
                      maxLength={2000}
                    />
                  </Field>
                  <Field label="Required confirmation">
                    <select name={`${id}:evidenceKind`} className={inputClass}>
                      <option value="authorized_manual_reference">
                        Authorized merchant reference
                      </option>
                      <option value="provider_api">Verified provider integration</option>
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="text-muted text-xs underline"
                    onClick={() => setSupplierIds(supplierIds.filter((entry) => entry !== id))}
                  >
                    Remove component
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className={buttonClass}
                onClick={() => setSupplierIds([...supplierIds, `supplier-${nextId.current++}`])}
              >
                Add supplier component
              </button>
            </div>
          </details>
        </>
      )}
    </fieldset>
  );
}

export function specialistSetupFromForm(
  model: SpecialistModel,
  form: FormData,
  resources: BookingResource[],
): SpecialistSetup | undefined {
  if (form.get('spEnabled') !== 'true') return undefined;
  const base = {
    model,
    version: 1,
    supplierComponents: all(form, 'spSupplierIds').map((id) => ({
      id,
      description: str(form, `${id}:description`),
      evidenceKind: str(form, `${id}:evidenceKind`),
    })),
  };
  let setup: Record<string, unknown>;
  switch (model) {
    case 'TOUR':
      setup = {
        ...base,
        mode: str(form, 'spTourMode'),
        itinerary: str(form, 'spItinerary'),
        itineraryVersion: num(form, 'spItineraryVersion'),
        resourceIds: all(form, 'spTourResources'),
        poolResourceId: str(form, 'spTourPool') || undefined,
        minimumParticipants: num(form, 'spMinParticipants'),
        maximumParticipants: num(form, 'spMaxParticipants'),
      };
      break;
    case 'LINKED_WINDOWS':
      setup = {
        ...base,
        promiseMode: str(form, 'spPromise'),
        incomingMethod: str(form, 'spIncomingMethod'),
        outgoingMethod: str(form, 'spOutgoingMethod'),
        incomingResourceIds: all(form, 'spIncomingResources'),
        outgoingResourceIds: all(form, 'spOutgoingResources'),
        processingResourceId: str(form, 'spProcessingPool'),
        processingUnit: str(form, 'spUnit'),
        quantityScale: num(form, 'spScale'),
        minimumProcessingMinutes: num(form, 'spMinProcessing'),
        maximumProcessingMinutes: num(form, 'spMaxProcessing'),
        calendarBasis: str(form, 'spCalendarBasis'),
        workingDays: all(form, 'spDays').map(Number),
        opens: str(form, 'spOpens'),
        closes: str(form, 'spCloses'),
      };
      break;
    case 'PRODUCTION_DUE':
      setup = {
        ...base,
        capacityPoolId: str(form, 'spProductionPool'),
        capacityUnit: str(form, 'spUnit'),
        quantityScale: num(form, 'spScale'),
        preparationLeadMinutes: num(form, 'spPreparationLead'),
        cutoffLocalTime: str(form, 'spCutoff'),
        workingDays: all(form, 'spDays').map(Number),
        approvalMode: str(form, 'spApprovalMode'),
        handoffResourceIds: all(form, 'spHandoffResources'),
      };
      break;
    case 'ENTITLEMENT':
      setup = {
        ...base,
        planId: str(form, 'spPlanId'),
        planVersion: num(form, 'spPlanVersion'),
        scopeOfferingIds: all(form, 'spScope'),
        validity:
          str(form, 'spValidity') === 'absolute_dates'
            ? {
                mode: 'absolute_dates',
                starts: str(form, 'spValidStarts'),
                ends: str(form, 'spValidEnds'),
              }
            : {
                mode: 'relative_to_activation',
                duration: { value: num(form, 'spValidValue'), unit: str(form, 'spValidUnit') },
              },
        credits: all(form, 'spCreditIds').map((id) => ({
          id,
          ...measured(form, `${id}:quantity`, str(form, `${id}:unit`), num(form, `${id}:scale`)),
          offeringIds: all(form, `${id}:offerings`),
        })),
        renewal: str(form, 'spRenewal'),
        creditCancellation: str(form, 'spCreditCancellation'),
      };
      break;
    case 'SERVICE_JOB':
      setup = {
        ...base,
        jobSchedulingMode: str(form, 'spJobScheduling'),
        assessmentMode: str(form, 'spJobAssessment'),
        resourceIds: all(form, 'spJobResources'),
        durationMinutes: num(form, 'spJobDuration'),
        partsRequired: form.get('spJobParts') === 'on',
        partsEvidenceKind: str(form, 'spJobPartsEvidence'),
        custodyMode: str(form, 'spJobCustody'),
        custodyResourceIds: all(form, 'spJobCustodyResources'),
        custodyDurationMinutes: form.get('spJobCustodyDuration')
          ? num(form, 'spJobCustodyDuration')
          : 0,
      };
      break;
    case 'FREIGHT':
      setup = {
        ...base,
        legs: all(form, 'spLegIds').map((id) => ({
          id,
          origin: str(form, `${id}:origin`),
          destination: str(form, `${id}:destination`),
          resourceIds: all(form, `${id}:resources`),
          dimensions: all(form, `${id}:dimensions`).map((resourceId) => {
            const resource = resources.find((entry) => entry.id === resourceId);
            if (!resource?.capacityUnit)
              throw new Error('Choose actual typed cargo capacity pools.');
            return { resourceId, unit: resource.capacityUnit, scale: resource.quantityScale ?? 0 };
          }),
        })),
        requiresDocuments: form.get('spDocuments') === 'on',
        requiresClearance: form.get('spClearance') === 'on',
        finalMode: str(form, 'spFinalMode'),
      };
      break;
  }
  return normalizeSpecialistSetup(model, setup);
}
export function specialistResourceIds(setup: SpecialistSetup): string[] {
  switch (setup.model) {
    case 'TOUR':
      return [
        ...new Set([...setup.resourceIds, ...(setup.poolResourceId ? [setup.poolResourceId] : [])]),
      ];
    case 'LINKED_WINDOWS':
      return [
        ...new Set([
          ...setup.incomingResourceIds,
          setup.processingResourceId,
          ...setup.outgoingResourceIds,
        ]),
      ];
    case 'PRODUCTION_DUE':
      return [...new Set([setup.capacityPoolId, ...setup.handoffResourceIds])];
    case 'ENTITLEMENT':
      return [];
    case 'SERVICE_JOB':
      return [...new Set([...setup.resourceIds, ...setup.custodyResourceIds])];
    case 'FREIGHT':
      return [
        ...new Set(
          setup.legs.flatMap((leg) => [
            ...leg.resourceIds,
            ...leg.dimensions.map((dimension) => dimension.resourceId),
          ]),
        ),
      ];
  }
}

export function SpecialistWindowFields({ name, label }: { name: string; label: string }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-bold">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts · EAT">
          <input name={`${name}Start`} type="datetime-local" className={inputClass} required />
        </Field>
        <Field label="Ends · EAT">
          <input name={`${name}End`} type="datetime-local" className={inputClass} required />
        </Field>
      </div>
    </fieldset>
  );
}
function WorkloadField({
  unit,
  scale,
  name = 'spWorkload',
}: {
  unit: string;
  scale: number;
  name?: string;
}) {
  return (
    <Field label={`Workload (${unit})`}>
      <input
        name={name}
        className={inputClass}
        type="number"
        min={10 ** -scale}
        step={10 ** -scale}
        required
      />
    </Field>
  );
}

export function specialistBookingFromForm(
  descriptor: SpecialistPublicDescriptor,
  form: FormData,
): SpecialistBookingInput {
  switch (descriptor.model) {
    case 'TOUR':
      if (descriptor.mode === 'shared') {
        const occurrenceId = str(form, 'spDeparture');
        if (!descriptor.departures.some((departure) => departure.id === occurrenceId))
          throw new Error('Choose an actual published departure.');
        return { model: 'TOUR', occurrenceId, itineraryVersion: descriptor.itineraryVersion };
      }
      return {
        model: 'TOUR',
        ...windowFromForm(form, 'spTour'),
        itineraryVersion: descriptor.itineraryVersion,
      };
    case 'LINKED_WINDOWS':
      return {
        model: 'LINKED_WINDOWS',
        incoming: windowFromForm(form, 'spIncoming'),
        ...(descriptor.promiseMode === 'FIRM_PRE_ACCEPTED'
          ? {
              processing: windowFromForm(form, 'spProcessing'),
              outgoing: windowFromForm(form, 'spOutgoing'),
              workload: measured(
                form,
                'spWorkload',
                descriptor.processingUnit,
                descriptor.quantityScale,
              ),
            }
          : {}),
      };
    case 'PRODUCTION_DUE': {
      const specification = str(form, 'spSpecification').trim();
      if (!specification) throw new Error('Describe the agreed production specification.');
      return {
        model: 'PRODUCTION_DUE',
        specification,
        specificationVersion: 1,
        productionStartTime: fromKenyaInput(str(form, 'spProductionStart')),
        dueTime: fromKenyaInput(str(form, 'spDue')),
        workload: measured(form, 'spWorkload', descriptor.capacityUnit, descriptor.quantityScale),
        ...(descriptor.hasTimedHandoff ? { handoff: windowFromForm(form, 'spHandoff') } : {}),
      };
    }
    case 'ENTITLEMENT':
      return { model: 'ENTITLEMENT' };
    case 'SERVICE_JOB': {
      const jobDescription = str(form, 'spJobDescription').trim();
      if (!jobDescription) throw new Error('Describe the actual job or item.');
      return {
        model: 'SERVICE_JOB',
        jobDescription,
        ...(descriptor.jobSchedulingMode === 'queue'
          ? {}
          : { requestedInterval: windowFromForm(form, 'spJobWindow') }),
        ...(form.get('spJobCompletion')
          ? { completionPromise: fromKenyaInput(str(form, 'spJobCompletion')) }
          : {}),
      };
    }
    case 'FREIGHT': {
      const cargoDescription = str(form, 'spCargoDescription').trim(),
        pieces = num(form, 'spPieces');
      if (!cargoDescription || !Number.isSafeInteger(pieces) || pieces < 1)
        throw new Error('Describe the cargo and enter its actual piece count.');
      const dimensions = [
        ...new Map(
          descriptor.legs
            .flatMap((leg) => leg.dimensions)
            .map((dimension) => [dimension.unit, dimension]),
        ).values(),
      ];
      return {
        model: 'FREIGHT',
        cargoDescription,
        pieces,
        cargo: dimensions.map((dimension) =>
          measured(form, `spCargo:${dimension.unit}`, dimension.unit, dimension.scale),
        ),
        legs: descriptor.legs.map((leg) => ({
          id: leg.id,
          ...windowFromForm(form, `spLeg:${leg.id}`),
        })),
      };
    }
  }
}
export function SpecialistBookingFields({
  offering,
  onChange,
}: {
  offering: BookingOffering;
  onChange: (input: SpecialistBookingInput | null) => void;
}) {
  const descriptor = offering.specialist;
  useEffect(() => {
    onChange(descriptor?.model === 'ENTITLEMENT' ? { model: 'ENTITLEMENT' } : null);
  }, [descriptor, onChange]);
  if (!descriptor) return null;
  return (
    <div
      className="border-border space-y-4 rounded-lg border p-4"
      onChange={(event) => {
        const form = (event.target as HTMLInputElement).form;
        if (!form) return;
        try {
          onChange(specialistBookingFromForm(descriptor, new FormData(form)));
        } catch {
          onChange(null);
        }
      }}
    >
      {descriptor.model === 'TOUR' ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{descriptor.itinerary}</p>
          <p className="text-muted text-xs">
            {descriptor.minimumParticipants}–{descriptor.maximumParticipants} participants ·
            itinerary version {descriptor.itineraryVersion}
          </p>
          {descriptor.mode === 'shared' ? (
            <Field label="Published departure">
              <select name="spDeparture" className={inputClass} required>
                <option value="">Choose a departure</option>
                {descriptor.departures
                  .filter((departure) => Date.parse(departure.endTime) > Date.now())
                  .map((departure) => (
                    <option key={departure.id} value={departure.id}>
                      {kenyaDateLabel(departure.startTime)} · {kenyaTime(departure.startTime)}–
                      {kenyaTime(departure.endTime)} · {departure.capacity} places
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <SpecialistWindowFields name="spTour" label="Private tour window" />
          )}
        </>
      ) : descriptor.model === 'LINKED_WINDOWS' ? (
        <>
          <SpecialistWindowFields
            name="spIncoming"
            label={
              descriptor.incomingMethod === 'CUSTOMER_DROPOFF'
                ? 'Customer drop-off window'
                : 'Incoming collection window'
            }
          />
          {descriptor.promiseMode === 'ASSESSMENT_REQUIRED' ? (
            <p className="text-muted text-sm leading-relaxed">
              Only the incoming step is arranged now. Processing workload, price and the return
              window are agreed after assessment.
            </p>
          ) : (
            <>
              <SpecialistWindowFields name="spProcessing" label="Processing window" />
              <WorkloadField unit={descriptor.processingUnit} scale={descriptor.quantityScale} />
              <SpecialistWindowFields
                name="spOutgoing"
                label={
                  descriptor.outgoingMethod === 'CUSTOMER_COLLECTION'
                    ? 'Customer collection window'
                    : 'Return delivery window'
                }
              />
            </>
          )}
        </>
      ) : descriptor.model === 'PRODUCTION_DUE' ? (
        <>
          <Field label="Production specification">
            <textarea
              name="spSpecification"
              className={inputClass}
              rows={4}
              required
              maxLength={6000}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Production starts · EAT">
              <input
                name="spProductionStart"
                type="datetime-local"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Required by · EAT">
              <input name="spDue" type="datetime-local" className={inputClass} required />
            </Field>
          </div>
          <WorkloadField unit={descriptor.capacityUnit} scale={descriptor.quantityScale} />
          <p className="text-muted text-xs">
            Due cutoff {descriptor.cutoffLocalTime} EAT · {descriptor.preparationLeadMinutes}{' '}
            minutes preparation notice.
            {descriptor.approvalMode === 'required'
              ? ' The exact specification needs approval before commitment.'
              : ''}
          </p>
          {descriptor.hasTimedHandoff ? (
            <SpecialistWindowFields name="spHandoff" label="Handover window" />
          ) : null}
        </>
      ) : descriptor.model === 'ENTITLEMENT' ? (
        <>
          <p className="text-sm font-bold">Plan version {descriptor.planVersion}</p>
          <p className="text-muted text-sm">
            {descriptor.validity.mode === 'absolute_dates'
              ? `Valid from ${descriptor.validity.starts} until ${descriptor.validity.ends} (exclusive).`
              : `Valid for ${descriptor.validity.duration.value} ${descriptor.validity.duration.unit}(s) from activation.`}
          </p>
          <ul className="text-muted list-disc space-y-1 pl-4 text-sm">
            {descriptor.credits.map((credit) => (
              <li key={credit.id}>
                {credit.quantityMinor / 10 ** credit.scale} {credit.unit} credit
              </li>
            ))}
          </ul>
          <p className="text-muted text-xs">
            Activation and plan credits do not reserve a service time. Eligible sessions and
            services are booked separately using the plan.
            {'creditCancellation' in descriptor &&
            descriptor.creditCancellation === 'restore_before_start'
              ? ' Eligible prestart cancellations can have credit restored after merchant review.'
              : ' Used credits are not automatically restored.'}
          </p>
        </>
      ) : descriptor.model === 'SERVICE_JOB' ? (
        <>
          <Field label="Job or item description">
            <textarea
              name="spJobDescription"
              className={inputClass}
              required
              rows={3}
              maxLength={6000}
            />
          </Field>
          {descriptor.jobSchedulingMode === 'queue' ? (
            <p className="text-muted text-sm">
              This joins the work queue. A service time is reserved only when the merchant assigns
              actual work capacity.
            </p>
          ) : (
            <SpecialistWindowFields
              name="spJobWindow"
              label={
                descriptor.jobSchedulingMode === 'scheduled_intake'
                  ? 'Scheduled intake window'
                  : 'Scheduled service window'
              }
            />
          )}
          <Field
            label="Requested completion · EAT (optional)"
            hint="This request is separate from the intake or service window. Completion requires its own agreed scope and actual handover."
          >
            <input name="spJobCompletion" className={inputClass} type="datetime-local" />
          </Field>
          <p className="text-muted text-xs">
            {descriptor.assessmentMode === 'diagnosis_required'
              ? 'Diagnosis and a separate exact quote are required before repair.'
              : 'The fixed scope and exact price must be accepted before service.'}{' '}
            {descriptor.custodyMode === 'merchant_holds'
              ? 'The merchant records actual receipt and handover of the item.'
              : 'The customer retains the item.'}
          </p>
        </>
      ) : (
        <>
          <Field label="Cargo description">
            <textarea
              name="spCargoDescription"
              className={inputClass}
              required
              rows={3}
              maxLength={6000}
            />
          </Field>
          <Field label="Number of pieces">
            <input name="spPieces" className={inputClass} type="number" min={1} required />
          </Field>
          {[
            ...new Map(
              descriptor.legs
                .flatMap((leg) => leg.dimensions)
                .map((dimension) => [dimension.unit, dimension]),
            ).values(),
          ].map((dimension) => (
            <WorkloadField
              key={dimension.unit}
              name={`spCargo:${dimension.unit}`}
              unit={dimension.unit}
              scale={dimension.scale}
            />
          ))}
          {descriptor.legs.map((leg) => (
            <SpecialistWindowFields
              key={leg.id}
              name={`spLeg:${leg.id}`}
              label={`${leg.origin} → ${leg.destination}`}
            />
          ))}
          <p className="text-muted text-xs">
            {descriptor.requiresDocuments ? 'Documents must be cleared before collection. ' : ''}
            {descriptor.requiresClearance ? 'This route includes an actual clearance stage. ' : ''}
            {descriptor.finalMode === 'delivery'
              ? 'Final handover is delivery.'
              : 'Final handover is consignee collection.'}
          </p>
        </>
      )}
    </div>
  );
}
