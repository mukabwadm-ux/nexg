'use client';

import { DataTable, DetailRow, type ColumnDef } from '@nexg/ui';
import { ArrowRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AVIATION_DEMO_CATEGORY } from '@/lib/aviation-demo';
import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';
import { category, createActivity, seedBusiness, type Business } from '../business/model';
import { localBusinessSource } from '../business/source';
import { BusinessWorkspace } from '../business/workspace';
import { SAMPLE_POLICY } from '../insights/fixtures';
import type { InsightsSourceSnapshot } from '../insights/types';
import { InsightsWorkspace } from '../insights/workspace';
import { useMerchantOnboardingDemoContext } from '../merchant-onboarding-demo-provider';
import type { Context, Snapshot, Transaction } from '../money/model';
import { scopeKey } from '../money/source';
import { MoneyWorkspace } from '../money/workspace';
import { emptyCampaign, type PromotionData } from '../promotions/model';
import { localPromotionSource } from '../promotions/source';
import { PromotionsWorkspace } from '../promotions/workspace';
import { initialState, SAMPLE_IDENTITY, type SettingsIdentity } from '../settings-artboard/model';
import { Action, Card, Modal } from '../settings-artboard/ui';
import { SettingsWorkspace } from '../settings-artboard/workspace';
import {
  acceptedCharterValue,
  DEMO_DATE,
  fleet,
  flightStageLabels,
  routeLabel,
  type FlightRecord,
} from './model';
import { useFlightCatalogue } from './offerings';

const base = { id: 'wilson', label: 'Wilson Airport' };
const sampleName = 'Heliflight Africa';
const currency = { code: 'USD', minorUnit: 2 } as const;
const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
};

function flightBusiness(id: string, context: MerchantOnboardingDemoContext | null): Business {
  const sample = seedBusiness(id);
  const specialties = context?.subcategories ?? AVIATION_DEMO_CATEGORY.subcategoryOptions;
  const activities = specialties.flatMap((specialty) => {
    const profile = category(specialty.id);
    return profile
      ? [
          {
            ...createActivity(profile),
            enabled: true,
            locationIds: [base.id],
            resourceCount: fleet.length,
          },
        ]
      : [];
  });
  return {
    ...sample,
    revision: 1,
    profile: {
      name: context?.businessName ?? sampleName,
      description:
        'Private charters, scenic flights and safari flights from Wilson Airport. Heliflight operations reviews each itinerary and aircraft assignment.',
      email: 'operations@heliflight.example',
      contact: 'Heliflight operations',
      logo: '',
      cover: '',
    },
    activities,
    locations: [
      {
        id: base.id,
        name: base.label,
        type: 'service_base',
        address: 'Wilson Airport, Nairobi',
        contact: 'Heliflight operations',
        activityIds: activities.map((activity) => activity.id),
        published: activities.length > 0,
        commitments: 0,
        coverage: '',
      },
    ],
    members: [
      {
        ...sample.members[0]!,
        name: context?.contactName ?? 'Heliflight team',
        email: 'operations@heliflight.example',
        locationIds: [base.id],
      },
    ],
    documents: [
      {
        id: 'operator-evidence',
        name: 'Operator documents and responsibilities',
        scope: 'Business',
        optional: true,
        current: 'Needed',
        version: 0,
        replacement: 'None',
        reason: 'Review the operator and confirmation responsibilities before using live data.',
        filename: '',
        size: 0,
        expires: '',
        note: '',
      },
    ],
    reviews: [],
    requests: [],
    history: [],
  };
}

export function FlightBusiness() {
  const context = useMerchantOnboardingDemoContext();
  const source = useMemo(
    () => localBusinessSource(storage, (id) => flightBusiness(id, context)),
    [context],
  );
  const availability = (aircraftId?: string) =>
    appendMerchantOnboardingDemoContext(
      '/merchant-live-preview/availability' + (aircraftId ? `?resource=${aircraftId}` : ''),
      context,
    );
  const columns: ColumnDef<(typeof fleet)[number]>[] = [
    {
      accessorKey: 'model',
      header: 'Aircraft',
      cell: ({ row }) => (
        <div>
          <strong>{row.original.model}</strong>
          <div className="bu-muted">{row.original.name}</div>
        </div>
      ),
    },
    { accessorKey: 'registration', header: 'Identifier' },
    { accessorKey: 'seats', header: 'Passenger seats' },
    {
      id: 'schedule',
      header: 'Availability',
      cell: ({ row }) => (
        <Link className="bu-link" href={availability(row.original.id)}>
          View schedule
        </Link>
      ),
    },
  ];

  return (
    <BusinessWorkspace
      demoContext={context}
      initialProfileId={context?.profileId ?? AVIATION_DEMO_CATEGORY.subcategoryOptions[0]!.id}
      source={source}
      locationDetails={
        <section className="bu-card">
          <div className="bu-card-heading">
            <div>
              <h2>Aircraft records</h2>
              <p>Fleet identifiers and passenger seats</p>
            </div>
            <Link className="bu-link" href={availability()}>
              Manage availability <ArrowRight size={14} />
            </Link>
          </div>
          <DataTable caption="Aircraft records" columns={columns} data={[...fleet]} />
        </section>
      }
    />
  );
}

function flightMoney(c: Context, flights: readonly FlightRecord[]): Snapshot {
  const scoped =
    c.offering.id === 'report'
      ? flights
      : flights.filter((flight) => flight.quote.service === c.offering.name);
  const records: Transaction[] = scoped.map((flight) => ({
    id: flight.id,
    work: flight.id,
    type: flight.payment === 'paid' ? 'Sale' : 'Quote',
    amount: Math.round(flight.quote.totalUsd * 100),
    status: flight.payment === 'paid' ? 'Paid' : 'Payment not recorded',
    source: 'Sample flight records',
    date: flight.quote.date,
    time: flight.quote.time,
    method: 'Not recorded',
    customer: flight.quote.customer,
    details: [
      ['Flight service', flight.quote.service],
      ['Flight status', flightStageLabels[flight.stage]],
    ],
  }));
  const statement = { gross: 0, refunds: 0, fees: 0, netCollections: 0, netPayable: 0 };
  const collectionSummary = (items: Transaction[]) => {
    const amount = items
      .filter((item) => item.type === 'Sale')
      .reduce((total, item) => total + item.amount, 0);
    return { ...statement, gross: amount, netCollections: amount };
  };
  return {
    scope: scopeKey(c),
    revision: 0,
    offeringVersion: c.offering.version,
    features: {
      balances: false,
      payouts: false,
      refunds: false,
      security: false,
      reservation: false,
    },
    security: [],
    operations: [],
    drafts: [],
    policy: null,
    statement: {
      ...collectionSummary(records),
      eligible: 0,
      today: collectionSummary(records.filter((item) => item.date === DEMO_DATE)),
      reflectedOperations: [],
    },
    history: [],
    report: {
      date: DEMO_DATE,
      records,
      acceptedQuoteMinor: Math.round(acceptedCharterValue(scoped) * 100),
    },
  };
}

export function FlightMoney({ flights }: { flights: FlightRecord[] }) {
  const context = useMerchantOnboardingDemoContext();
  const { profile, profiles, source: offerings } = useFlightCatalogue();
  const report = useMemo(
    () => ({
      currency,
      offerings,
      location: base.label,
      load: async (c: Context) => flightMoney(c, flights),
      workLink: (id: string) =>
        appendMerchantOnboardingDemoContext(
          `/merchant-live-preview/work?flight=${encodeURIComponent(id)}`,
          context,
        ),
    }),
    [flights, context, offerings],
  );
  return (
    <MoneyWorkspace initialProfileId={profile.id} additionalProfiles={profiles} report={report} />
  );
}

export function FlightInsights({ flights }: { flights: FlightRecord[] }) {
  const context = useMerchantOnboardingDemoContext();
  const snapshot = useMemo<InsightsSourceSnapshot>(() => {
    const services = [...new Set(flights.map((flight) => flight.quote.service))];
    const asOf = `${DEMO_DATE}T09:40:00+03:00`;
    return {
      version: 1,
      sourceMode: 'sample',
      status: 'ready',
      merchantId: 'sample-heliflight',
      merchantName: context?.businessName ?? sampleName,
      subcategoryId: context?.profileId ?? AVIATION_DEMO_CATEGORY.subcategoryOptions[0]!.id,
      asOf,
      currency: currency.code,
      enabledModels: ['REQUEST_QUOTE'],
      locations: [base],
      offerings: services.map((service) => ({
        id: service,
        label: service,
        model: 'REQUEST_QUOTE',
        locationIds: [base.id],
        enabled: true,
        presentation: 'services',
      })),
      records: flights.map((flight) => ({
        id: flight.id,
        reference: flight.id,
        label: routeLabel(flight),
        model: 'REQUEST_QUOTE',
        locationId: base.id,
        offeringId: flight.quote.service,
        requestedOn: DEMO_DATE,
        scheduledOn: flight.quote.date,
        completedOn: flight.stage === 'completed' ? flight.quote.date : null,
        outcome: flight.stage,
        quoteAccepted: ['accepted', 'confirmed', 'completed'].includes(flight.stage),
        quoteAmountMinor: Math.round(flight.quote.totalUsd * 100),
      })),
      lineItems: [],
      postings: [],
      campaignEvents: [],
      capacity: [],
      coverage: [
        {
          id: 'sample-flight-work',
          kind: 'work',
          model: 'REQUEST_QUOTE',
          locationId: base.id,
          status: 'ready',
          from: DEMO_DATE,
          to: DEMO_DATE,
          definitionVersion: 'sample-1',
          asOf,
        },
      ],
    };
  }, [flights, context]);
  return (
    <InsightsWorkspace
      initialSnapshot={snapshot}
      initialFilters={{ from: DEMO_DATE, to: DEMO_DATE, locationId: base.id }}
      initialPolicy={{
        ...SAMPLE_POLICY,
        allowedLocationIds: [base.id],
        allowedModels: ['REQUEST_QUOTE'],
        canReadFinance: false,
        canReadCustomers: false,
        canReadPromotions: false,
      }}
    />
  );
}

export function FlightPromotions() {
  const { profile, profiles, source: offerings } = useFlightCatalogue();
  const source = useMemo(
    () =>
      localPromotionSource(storage, offerings, (profile, catalogue) => {
        const campaign = emptyCampaign(profile, '', 'heliflight-featured-draft');
        const data: PromotionData = {
          version: 1,
          revision: 1,
          campaigns: [
            {
              ...campaign,
              version: 1,
              kind: 'featured',
              name: 'Heliflight charter services',
              history: [
                { at: campaign.updatedAt, action: 'Featured placement draft created', version: 1 },
              ],
            },
          ],
        };
        return { catalogue: { ...catalogue, promotionsPreview: data }, data };
      }),
    [offerings],
  );
  return (
    <PromotionsWorkspace
      initialProfileId={profile.id}
      additionalProfiles={profiles}
      source={source}
      defaultKind="featured"
    />
  );
}

export function FlightSettings({ reset }: { reset: () => void }) {
  const context = useMerchantOnboardingDemoContext();
  const identity: SettingsIdentity = {
    ...SAMPLE_IDENTITY,
    merchantId: 'sample-heliflight',
    userId: 'sample-heliflight-operations',
    businessName: context?.businessName ?? sampleName,
    name: context?.contactName ?? 'Heliflight team',
    email: 'operations@heliflight.example',
    phone: '',
    phoneVerified: false,
  };
  const sample = initialState(identity);
  const alerts = [
    {
      id: 'flight_request',
      group: 'Flight bookings',
      label: 'New charter request',
      description: 'A guest requests a flight quote.',
      channels: ['In-app' as const],
      recipient: 'Heliflight operations',
    },
    {
      id: 'flight_accepted',
      group: 'Flight bookings',
      label: 'Quote accepted',
      description: 'A guest accepts a quote for operator review.',
      channels: ['In-app' as const],
      recipient: 'Heliflight operations',
    },
  ];
  return (
    <SettingsWorkspace
      identity={identity}
      initialSample={{
        ...sample,
        alerts,
        routingRules: alerts,
        connections: [],
        webhooks: [],
        credentials: [],
      }}
      preferencesContent={<FlightSamplePreferences reset={reset} />}
    />
  );
}

function FlightSamplePreferences({ reset }: { reset: () => void }) {
  const [resetAsked, setResetAsked] = useState(false);
  const [notice, setNotice] = useState('');
  return (
    <>
      <Card
        title="Flight sample records"
        description="Restore the original flight bookings and fleet schedule."
        action={
          <Action onClick={() => setResetAsked(true)}>
            <RotateCcw size={15} /> Reset sample records
          </Action>
        }
      >
        <dl className="divide-border divide-y">
          <DetailRow label="Quote currency">USD · sample rate card</DetailRow>
          <DetailRow label="Flight confirmation">
            Customer acceptance and written operator confirmation
          </DetailRow>
        </dl>
        {notice && (
          <p role="status" className="text-muted text-sm">
            {notice}
          </p>
        )}
      </Card>
      <Modal
        title="Reset demo"
        description="Replace this browser’s sample flights and aircraft allocations with the original records?"
        open={resetAsked}
        onClose={() => setResetAsked(false)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Action onClick={() => setResetAsked(false)}>Keep changes</Action>
          <Action
            variant="gold"
            onClick={() => {
              reset();
              setResetAsked(false);
              setNotice('Original sample flight records restored.');
            }}
          >
            Reset demo
          </Action>
        </div>
      </Modal>
    </>
  );
}
