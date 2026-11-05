'use client';

import { Button } from '@nexg/ui';
import {
  AlertCircle,
  CalendarDays,
  CircleDollarSign,
  FileText,
  MapPin,
  Plane,
  Plus,
} from 'lucide-react';
import Link from 'next/link';

import { appendMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';
import {
  ActionRow,
  HomeGlance,
  HomeOverview,
  HomeSection,
  Metric,
  SectionHead,
  Status,
} from '../home-live';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import {
  acceptedCharterValue,
  DEMO_DATE,
  fleet,
  flightDateLabel,
  flightStageLabels,
  routeLabel,
  usd,
  type FlightRecord,
  type FlightStage,
  type AviationState,
} from './model';

const pipelineStages: FlightStage[] = ['draft', 'quoted', 'accepted', 'confirmed'];

export function FlightPipeline({ flights }: { flights: readonly FlightRecord[] }) {
  return (
    <ul className="space-y-2">
      {pipelineStages.map((stage) => {
        const count = flights.filter((flight) => flight.stage === stage).length;
        return (
          <li
            key={stage}
            className="grid grid-cols-[7rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs"
          >
            <span className="text-muted">{flightStageLabels[stage]}</span>
            <div aria-hidden="true" className="bg-bg h-2 overflow-hidden rounded-full">
              <div
                className="bg-gold h-full rounded-full"
                style={{ width: `${(count / Math.max(flights.length, 1)) * 100}%` }}
              />
            </div>
            <strong className="text-right tabular-nums">{count}</strong>
          </li>
        );
      })}
    </ul>
  );
}

export function FlightHome({ state }: { state: AviationState }) {
  const context = useMerchantOnboardingDemoContext();
  const href = (path: string) =>
    appendMerchantOnboardingDemoContext('/merchant-live-preview' + path, context);
  const work = href('/work');
  const schedule = href('/availability');
  const nextQuote = href('/work?compose=1');
  const attention = state.flights.filter((flight) =>
    ['draft', 'quoted', 'accepted'].includes(flight.stage),
  );
  const confirmed = state.flights.filter((flight) => flight.stage === 'confirmed');
  const next = [...confirmed].sort((a, b) =>
    `${a.quote.date}T${a.quote.time}`.localeCompare(`${b.quote.date}T${b.quote.time}`),
  )[0];

  return (
    <HomeOverview
      name={context?.businessName ?? 'Heliflight Africa'}
      description="Review charter requests, upcoming flights and the fleet schedule."
      actions={
        <Button variant="gold" size="sm" asChild>
          <Link href={nextQuote}>
            <Plus size={15} aria-hidden="true" /> New quote
          </Link>
        </Button>
      }
      status={
        <>
          <Status
            icon={<FileText />}
            label="Business"
            value="Sample"
            note="Heliflight charter workspace"
          />
          <Status
            icon={<MapPin />}
            label="Operating base"
            value="Wilson Airport"
            note="Nairobi · East Africa Time"
            divider
          />
          <Status
            icon={<Plane />}
            label="Accepting work"
            value="Quote requests"
            note="Operator confirmation follows customer acceptance."
            divider
          />
        </>
      }
      glance={
        <HomeGlance caption={`Sample data · ${flightDateLabel(DEMO_DATE)}`}>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Metric
              icon={<CalendarDays />}
              tone="blue"
              label="Confirmed flights"
              value={String(confirmed.length)}
              href={work}
            />
            <Metric
              icon={<Plane />}
              tone="orange"
              label="Fleet aircraft"
              value={String(fleet.length)}
              href={schedule}
            />
            <Metric
              icon={<CircleDollarSign />}
              tone="green"
              label="Accepted charter value"
              value={usd(acceptedCharterValue(state.flights))}
              href={href('/money')}
            />
          </div>
          <div className="mt-3 space-y-2">
            <h3 className="text-sm font-extrabold">Charter pipeline</h3>
            <FlightPipeline flights={state.flights} />
          </div>
        </HomeGlance>
      }
      attention={
        attention.length > 0 && (
          <HomeSection>
            <SectionHead
              icon={<AlertCircle className="text-orange-600" />}
              title="Needs attention"
              subtitle="Review the next step for each charter request."
              href={work}
              action={`View all (${attention.length})`}
            />
            <div className="divide-border border-border mt-2 divide-y border-t">
              {attention.slice(0, 4).map((flight) => (
                <ActionRow
                  key={flight.id}
                  icon={<FileText />}
                  tone="orange"
                  title={flight.quote.customer}
                  detail={`${flight.id} · ${routeLabel(flight)} · ${flight.quote.passengers} guests`}
                  meta={flightStageLabels[flight.stage]}
                  href={href(`/work?flight=${flight.id}`)}
                  button={flight.stage === 'accepted' ? 'Review booking' : 'Review quote'}
                />
              ))}
            </div>
          </HomeSection>
        )
      }
      locations={
        <HomeSection>
          <SectionHead
            icon={<Plane />}
            title="Fleet at a glance"
            subtitle={`Wilson Airport · ${fleet.length} aircraft · ${flightDateLabel(DEMO_DATE)}`}
            href={schedule}
            action="View availability"
          />
          <div className="divide-border border-border mt-2 divide-y border-t">
            {fleet.map((aircraft) => {
              const blocked = state.blocks.some(
                (block) => block.aircraftId === aircraft.id && block.date === DEMO_DATE,
              );
              const booked = confirmed.some(
                (flight) =>
                  flight.quote.aircraftId === aircraft.id && flight.quote.date === DEMO_DATE,
              );
              return (
                <ActionRow
                  key={aircraft.id}
                  icon={<Plane />}
                  tone={blocked ? 'orange' : 'blue'}
                  title={`${aircraft.model} · ${aircraft.registration}`}
                  detail={`${aircraft.seats} seats · ${blocked ? 'Has a block' : booked ? 'Has a flight' : 'Open sample schedule'}`}
                  href={href(`/availability?resource=${aircraft.id}`)}
                  button="View schedule"
                  secondary
                />
              );
            })}
          </div>
        </HomeSection>
      }
      extras={
        <HomeSection>
          <SectionHead
            icon={<CalendarDays />}
            title="Next confirmed flight"
            subtitle={
              next
                ? `${flightDateLabel(next.quote.date)} · ${next.quote.time} EAT`
                : 'No confirmed flights in the sample schedule.'
            }
            href={next ? href(`/work?flight=${next.id}`) : work}
            action={next ? 'Open flight' : 'View Work'}
          />
          {next && (
            <div className="divide-border border-border mt-2 divide-y border-t">
              <ActionRow
                icon={<Plane />}
                tone="green"
                title={routeLabel(next)}
                detail={`${fleet.find((aircraft) => aircraft.id === next.quote.aircraftId)?.model ?? 'Aircraft'} · ${next.quote.passengers} guests`}
                meta={`Manifest ${next.manifestReady}/${next.quote.passengers} complete`}
                href={href(`/work?flight=${next.id}`)}
                button="Review flight"
              />
            </div>
          )}
        </HomeSection>
      }
    />
  );
}
