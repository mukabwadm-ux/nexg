'use client';

import { Button, DetailRow, EmptyState, Input, Select, StatusBadge } from '@nexg/ui';
import { ArrowLeft, Check, Clock3, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { appendMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import type { Offering } from '../offerings/model';
import {
  WorkHeading,
  WorkLayout,
  WorkQueue,
  WorkQueueRow,
  WorkRecordPanel,
  WorkSearch,
  WorkTabs,
} from '../work/presentation';
import { WorkSteps } from '../work/work-steps';
import {
  AIRCRAFT_DAY_END,
  AIRCRAFT_DAY_START,
  availabilityConflict,
  confirmFlight,
  createFlight,
  fleet,
  flightDateLabel,
  flightEnd,
  flightStageLabels,
  routeLabel,
  timeMinutes,
  usd,
  type AviationState,
  type FlightRecord,
  type FlightStage,
} from './model';
import { useFlightCatalogue } from './offerings';
import { AviationQuoteBuilder, type AviationQuoteDraft } from './quote-builder';

const workPath = '/merchant-live-preview/work';
const flightViews = [
  { id: 'all', label: 'All flights' },
  { id: 'quotes', label: 'Quotes & enquiries' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;
type FlightView = (typeof flightViews)[number]['id'];
const stageOrder = ['draft', 'quoted', 'accepted', 'confirmed', 'completed'] as const;
const quotes = new Set<FlightStage>(['draft', 'quoted', 'accepted']);

export function FlightStatus({ stage }: { stage: FlightStage }) {
  const tone =
    stage === 'cancelled'
      ? 'danger'
      : stage === 'confirmed' || stage === 'completed'
        ? 'success'
        : stage === 'draft'
          ? 'neutral'
          : 'warning';
  return (
    <StatusBadge tone={tone} className="normal-case">
      {flightStageLabels[stage]}
    </StatusBadge>
  );
}

function inFlightView(flight: FlightRecord, view: FlightView) {
  return view === 'all' || (view === 'quotes' ? quotes.has(flight.stage) : flight.stage === view);
}

export function FlightWork({
  state,
  onChange,
}: {
  state: AviationState;
  onChange: (next: AviationState) => void;
}) {
  const context = useMerchantOnboardingDemoContext();
  const query = useSearchParams();
  const router = useRouter();
  const requestedFlight = query.get('flight');
  const requestedBuilder = query.get('compose') === '1';
  const [builder, setBuilder] = useState(requestedBuilder);
  const [selectedId, setSelectedId] = useState<string | null>(requestedFlight ?? 'HF-1043');
  const [mobileDetail, setMobileDetail] = useState(Boolean(requestedFlight));
  const [view, setView] = useState<FlightView>('all');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setBuilder(requestedBuilder);
    if (requestedFlight) {
      setSelectedId(requestedFlight);
      setMobileDetail(true);
      setView('all');
      setSearch('');
    }
  }, [requestedBuilder, requestedFlight]);

  const selected = state.flights.find((flight) => flight.id === selectedId);
  const shown = state.flights.filter(
    (flight) =>
      inFlightView(flight, view) &&
      `${flight.id} ${flight.quote.customer} ${routeLabel(flight)} ${flight.quote.service}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  function closeRecord() {
    setSelectedId(null);
    setMobileDetail(false);
  }

  function saveQuote(quote: AviationQuoteDraft) {
    const record = createFlight(quote, state);
    onChange({ ...state, flights: [record, ...state.flights] });
    setBuilder(false);
    setSelectedId(record.id);
    setMobileDetail(true);
    setView('all');
    setSearch('');
    setNotice(
      quote.status === 'draft'
        ? `${record.id} saved as a sample draft.`
        : `${record.id} prepared for review in this demo.`,
    );
    if (requestedBuilder) {
      router.replace(
        appendMerchantOnboardingDemoContext(`${workPath}?flight=${record.id}`, context),
        { scroll: false },
      );
    }
  }

  if (builder) {
    return (
      <WorkLayout>
        <WorkHeading
          description="Quote builder · Build a charter quote around the guest’s itinerary"
          actions={
            <Button
              variant="outline"
              leadingIcon={<ArrowLeft size={16} />}
              onClick={() => {
                setBuilder(false);
                setMobileDetail(false);
                if (requestedBuilder)
                  router.replace(appendMerchantOnboardingDemoContext(workPath, context), {
                    scroll: false,
                  });
              }}
            >
              Back to flight bookings
            </Button>
          }
        />
        <div className="mt-3 min-h-0 flex-1 overflow-auto pb-2" data-table-viewport>
          <FlightQuoteForm initialService={query.get('service') ?? undefined} onSave={saveQuote} />
        </div>
      </WorkLayout>
    );
  }

  return (
    <WorkLayout
      mobileDetail={mobileDetail}
      detail={
        selected && (
          <FlightDetails
            key={selected.id}
            flight={selected}
            state={state}
            onChange={onChange}
            onNotice={setNotice}
            onBack={() => setMobileDetail(false)}
            onClose={closeRecord}
          />
        )
      }
    >
      <WorkHeading
        description="Flight bookings · Enquiries, quotes and confirmed charters"
        actions={
          <Button variant="gold" leadingIcon={<Plus size={16} />} onClick={() => setBuilder(true)}>
            New quote
          </Button>
        }
      />
      <WorkTabs<FlightView>
        tabs={flightViews.map((tab) => ({
          ...tab,
          count: state.flights.filter((flight) => inFlightView(flight, tab.id)).length,
        }))}
        value={view}
        onChange={(next) => {
          setView(next);
          closeRecord();
        }}
      />
      <WorkSearch
        value={search}
        onChange={setSearch}
        placeholder="Search guest, route or reference"
      />
      {notice && (
        <p role="status" className="text-muted mb-2 text-sm">
          {notice}
        </p>
      )}
      {shown.length ? (
        <WorkQueue columns={['Reference', 'Service', 'Route & departure', 'Stage', 'Quote value']}>
          {shown.map((flight) => (
            <WorkQueueRow
              key={flight.id}
              id={flight.id}
              customer={flight.quote.customer}
              item={flight.quote.service}
              context={routeLabel(flight)}
              milestone={`${flightDateLabel(flight.quote.date)} · ${flight.quote.time} EAT`}
              stage={<FlightStatus stage={flight.stage} />}
              operator={usd(flight.quote.totalUsd)}
              selected={flight.id === selectedId}
              onSelect={() => {
                setSelectedId(flight.id);
                setMobileDetail(true);
              }}
            />
          ))}
        </WorkQueue>
      ) : (
        <EmptyState
          size="sm"
          title="No matching flights"
          description="Try another guest, route or booking status."
        />
      )}
      <p className="text-muted mt-3 text-xs">
        {shown.length} sample {shown.length === 1 ? 'record' : 'records'}
      </p>
    </WorkLayout>
  );
}

function FlightQuoteForm({
  initialService,
  onSave,
}: {
  initialService?: string;
  onSave: (quote: AviationQuoteDraft) => void;
}) {
  const context = useMerchantOnboardingDemoContext();
  const { profile, source } = useFlightCatalogue();
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    source.load(profile).then(
      (catalogue) => {
        if (current) setOfferings(catalogue.offerings);
      },
      () => {
        if (current) setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [profile, source]);

  const services = offerings?.filter((item) => item.publication !== 'archived');
  if (error || (services && services.length === 0)) {
    return (
      <EmptyState
        title={error ? 'Flight services could not be loaded' : 'Add a flight service'}
        description={
          error
            ? 'Review the saved catalogue in Offerings.'
            : 'Save an offering to use it in a quote.'
        }
        tone={error ? 'error' : 'empty'}
        action={{
          label: 'Open Offerings',
          href: appendMerchantOnboardingDemoContext('/merchant-live-preview/offerings', context),
        }}
      />
    );
  }
  if (!services)
    return (
      <p className="text-muted p-4 text-sm" role="status">
        Loading flight services…
      </p>
    );

  return (
    <AviationQuoteBuilder
      services={services.map((item) => ({
        id: item.id,
        name: item.name,
        requirements: String(item.fields.request_fields ?? ''),
      }))}
      initialService={initialService}
      onSave={onSave}
    />
  );
}

function FlightDetails({
  flight,
  state,
  onChange,
  onNotice,
  onBack,
  onClose,
}: {
  flight: FlightRecord;
  state: AviationState;
  onChange: (next: AviationState) => void;
  onNotice: (message: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelAsked, setCancelAsked] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const { quote, stage } = flight;
  const active = stage !== 'completed' && stage !== 'cancelled';
  const aircraft = fleet.find((item) => item.id === quote.aircraftId);
  const currentStep = stageOrder.findIndex((item) => item === stage);
  const end = flightEnd(flight);
  const billedHours = Math.max(
    quote.minimumHours,
    (quote.occupiedMinutes + quote.positioningMinutes) / 60,
  );

  function report(message: string) {
    setNotice(message);
    onNotice(message);
  }

  function update(patch: Partial<FlightRecord>, event: string) {
    const changedSchedule = Boolean(
      patch.quote &&
        (quote.aircraftId !== patch.quote.aircraftId ||
          quote.date !== patch.quote.date ||
          quote.time !== patch.quote.time),
    );
    const releasesHold = changedSchedule || patch.stage === 'cancelled';
    const holdReleased = releasesHold && state.blocks.some((block) => block.flightId === flight.id);
    const history = [...flight.history, event];
    if (changedSchedule && holdReleased)
      history.push('Aircraft option released after the assignment or departure changed');
    onChange({
      ...state,
      blocks: releasesHold
        ? state.blocks.filter((block) => block.flightId !== flight.id)
        : state.blocks,
      flights: state.flights.map((record) =>
        record.id === flight.id ? { ...record, ...patch, history } : record,
      ),
    });
    setError('');
    setNotice('');
    if (changedSchedule && holdReleased)
      report('Aircraft option released. Review the new schedule before placing another hold.');
  }

  function confirm() {
    const result = confirmFlight(state, flight.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChange(result.state);
    setError('');
    report(`${flight.id} confirmed in the sample schedule.`);
  }

  function hold() {
    const startMinutes = timeMinutes(quote.time);
    const endMinutes = timeMinutes(end);
    if (
      !Number.isFinite(startMinutes) ||
      !Number.isFinite(endMinutes) ||
      startMinutes < AIRCRAFT_DAY_START * 60 ||
      endMinutes > AIRCRAFT_DAY_END * 60 ||
      endMinutes <= startMinutes
    ) {
      setError('Choose a departure and duration within 07:00–19:00 EAT.');
      return;
    }
    const conflict = availabilityConflict(
      state,
      quote.aircraftId,
      quote.date,
      quote.time,
      end,
      flight.id,
    );
    if (conflict) {
      setError(`Could not hold aircraft: ${conflict}.`);
      return;
    }
    onChange({
      ...state,
      blocks: [
        ...state.blocks.filter((block) => block.flightId !== flight.id),
        {
          id: `hold-${flight.id}`,
          aircraftId: quote.aircraftId,
          date: quote.date,
          start: quote.time,
          end,
          kind: 'hold',
          label: `Option · ${flight.id}`,
          flightId: flight.id,
        },
      ],
    });
    setError('');
    report(`Aircraft option recorded for ${flight.id}.`);
  }

  return (
    <WorkRecordPanel
      title={flight.id}
      subtitle={`${quote.customer} · ${quote.service}`}
      stage={<FlightStatus stage={stage} />}
      onBack={onBack}
      onClose={onClose}
      history={flight.history}
      footer={
        active || notice ? (
          <div className="w-full space-y-2">
            {error && (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-muted text-sm">
                {notice}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {stage === 'draft' && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => update({ stage: 'quoted' }, 'Sample quote prepared for review')}
                >
                  Prepare sample quote
                </Button>
              )}
              {stage === 'quoted' && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() =>
                    update({ stage: 'accepted' }, 'Sample customer acceptance recorded')
                  }
                  leadingIcon={<Check size={15} />}
                >
                  Record acceptance
                </Button>
              )}
              {stage === 'accepted' && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={confirm}
                  leadingIcon={<Check size={15} />}
                >
                  Confirm sample booking
                </Button>
              )}
              {(stage === 'quoted' || stage === 'accepted') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={hold}
                  leadingIcon={<Clock3 size={15} />}
                >
                  Hold aircraft
                </Button>
              )}
              {stage === 'confirmed' && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => update({ stage: 'completed' }, 'Sample flight marked completed')}
                >
                  Mark flight completed
                </Button>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {currentStep >= 0 && (
          <WorkSteps
            stages={stageOrder.map((step) => flightStageLabels[step])}
            current={currentStep}
          />
        )}
        <section>
          <h3 className="border-border border-b pb-2 text-base font-bold">Flight itinerary</h3>
          <p className="mt-2 text-sm font-semibold">{routeLabel(flight)}</p>
          <dl className="divide-border divide-y">
            <DetailRow label="Departure">
              {flightDateLabel(quote.date)} · {quote.time} EAT
            </DetailRow>
            <DetailRow label="Aircraft">
              {aircraft ? `${aircraft.model} · ${aircraft.registration}` : 'Unassigned'}
            </DetailRow>
            <DetailRow label="Passengers">{quote.passengers}</DetailRow>
            <DetailRow label="Schedule interval">
              {quote.time}–{end} EAT
            </DetailRow>
          </dl>
          <p className="text-muted text-xs">
            Includes positioning and a 30 minute turnaround buffer.
          </p>
        </section>
        <section>
          <h3 className="border-border border-b pb-2 text-base font-bold">Quote breakdown · USD</h3>
          <dl className="divide-border divide-y">
            <DetailRow label="Occupied flight time">{quote.occupiedMinutes} min</DetailRow>
            <DetailRow label="Empty positioning">{quote.positioningMinutes} min</DetailRow>
            <DetailRow label="Billable hours">
              {billedHours.toFixed(2)} hr × {usd(quote.rateUsd)}
            </DetailRow>
            {quote.feeLines?.length ? (
              quote.feeLines
                .filter((fee) => fee.amountUsd > 0)
                .map((fee) => (
                  <DetailRow key={fee.label} label={fee.label}>
                    {usd(fee.amountUsd)}
                  </DetailRow>
                ))
            ) : (
              <DetailRow label="Additional charges">{usd(quote.feesUsd)}</DetailRow>
            )}
            <DetailRow label="Whole charter total">
              <strong>{usd(quote.totalUsd)}</strong>
            </DetailRow>
          </dl>
        </section>
        <section>
          <h3 className="border-border border-b pb-2 text-base font-bold">Booking readiness</h3>
          <dl className="divide-border divide-y">
            <DetailRow label="Customer acceptance">
              {stage === 'accepted' || stage === 'confirmed' || stage === 'completed'
                ? 'Recorded'
                : 'Awaiting'}
            </DetailRow>
            <DetailRow label="Passenger details">
              {flight.manifestReady}/{quote.passengers} complete
            </DetailRow>
            <DetailRow label="Payment">
              {flight.payment === 'paid' ? 'Paid · sample' : 'Not recorded'}
            </DetailRow>
          </dl>
          {active && stage !== 'confirmed' && (
            <div className="mt-2 space-y-3">
              <Select
                id="flight-aircraft"
                label="Aircraft assignment"
                value={quote.aircraftId}
                options={fleet.map((item) => ({
                  value: item.id,
                  label: `${item.model} · ${item.registration} · ${item.seats} seats`,
                  disabled: item.seats < quote.passengers,
                }))}
                onValueChange={(value) =>
                  update(
                    { quote: { ...quote, aircraftId: value }, operatorApproved: false },
                    'Sample aircraft assignment changed; operator review needed',
                  )
                }
              />
              <Input
                id="flight-departure"
                label="Departure time · EAT"
                type="time"
                value={quote.time}
                min="07:00"
                max="19:00"
                onChange={(event) => {
                  if (event.target.value)
                    update(
                      { quote: { ...quote, time: event.target.value }, operatorApproved: false },
                      'Sample departure time changed; operator review needed',
                    );
                }}
              />
              <label className="flex items-start gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="accent-gold mt-1"
                  checked={flight.operatorApproved}
                  onChange={(event) =>
                    update(
                      { operatorApproved: event.target.checked },
                      event.target.checked
                        ? 'Written operator confirmation recorded for demo'
                        : 'Operator review reopened',
                    )
                  }
                />
                Written operator confirmation received
              </label>
            </div>
          )}
          {active && (
            <div className="mt-3 flex flex-wrap gap-2">
              {flight.manifestReady < quote.passengers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update(
                      { manifestReady: quote.passengers },
                      'Sample passenger checklist completed',
                    )
                  }
                >
                  Complete sample manifest
                </Button>
              )}
              {flight.payment !== 'paid' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    update({ payment: 'paid' }, 'Sample payment recorded');
                    report('Sample payment recorded. Booking confirmation is a separate step.');
                  }}
                >
                  Record sample payment
                </Button>
              )}
            </div>
          )}
        </section>
        {active && (
          <section className="border-border space-y-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              aria-expanded={cancelAsked}
              onClick={() => setCancelAsked((open) => !open)}
            >
              Cancel sample trip
            </Button>
            {cancelAsked && (
              <>
                <Input
                  id="flight-cancellation"
                  label="Reason for cancellation"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!cancelReason.trim()}
                  onClick={() => {
                    update({ stage: 'cancelled' }, `Sample trip cancelled: ${cancelReason.trim()}`);
                    setCancelAsked(false);
                    setCancelReason('');
                    report('Sample trip cancelled and its aircraft option released.');
                  }}
                >
                  Confirm cancellation
                </Button>
              </>
            )}
          </section>
        )}
      </div>
    </WorkRecordPanel>
  );
}
