import { availableSchemas, type Offering, type OfferingProfile } from '../offerings/model';
import { schemas } from '../offerings/schemas';
import config from './config.json';

/** All values are exact sample minor units, carrying the currency's own precision. */
export const KES = { code: 'KES', minorUnit: 2 } as const;
export type Currency = { code: string; minorUnit: number };
export function minor(whole: number, currency: Currency = KES): number {
  const value = whole * 10 ** currency.minorUnit;
  if (!Number.isSafeInteger(value)) throw new Error('Amount is outside the safe sample range.');
  return value;
}
export function parseMinor(value: string, currency: Currency = KES): number | null {
  if (!Number.isInteger(currency.minorUnit) || currency.minorUnit < 0 || currency.minorUnit > 6)
    return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > currency.minorUnit) return null;
  const amount =
    Number(match[1]) * 10 ** currency.minorUnit +
    Number((match[2] ?? '').padEnd(currency.minorUnit, '0') || '0');
  return Number.isSafeInteger(amount) ? amount : null;
}
export function formatAmount(value: number, currency: Currency = KES, includeCode = true): string {
  if (!Number.isSafeInteger(value)) return 'Amount unavailable';
  const amount = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: value % 10 ** currency.minorUnit ? currency.minorUnit : 0,
    maximumFractionDigits: currency.minorUnit,
  }).format(value / 10 ** currency.minorUnit);
  return includeCode ? `${currency.code} ${amount}` : amount;
}
export type Scenario =
  | 'current'
  | 'stale'
  | 'partial'
  | 'unknown'
  | 'offline'
  | 'external'
  | 'empty'
  | 'error';
export type Role = 'manager' | 'viewer';
export type Context = {
  profile: OfferingProfile;
  offering: Offering;
  location: string;
  method: string;
  scenario: Scenario;
  role: Role;
};
export type Descriptor = (typeof config.descriptors)[number];
export type ProfileInfo = (typeof config.profiles)[number];
export function profileInfo(id: string): ProfileInfo | undefined {
  return config.profiles.find((p) => p.subcategoryId === id);
}
export function resolveMoneyView(
  profile: OfferingProfile,
  offering: Offering,
  enabled: string[],
): Descriptor {
  const schema = schemas[offering.schemaId];
  const descriptor = config.descriptors.find((d) => d.schemaId === offering.schemaId);
  if (
    offering.profileId !== profile.id ||
    !availableSchemas(profile).includes(offering.schemaId) ||
    !enabled.includes(offering.schemaId)
  ) {
    throw new Error('This activity is not enabled for the selected specialty.');
  }
  if (
    !schema ||
    !descriptor ||
    descriptor.modelId !== schema.model ||
    !descriptor.workflowIds.length
  ) {
    throw new Error('This activity needs a registered Money workflow before it can be shown.');
  }
  return descriptor;
}
export const isReservation = (schema: string) =>
  [
    'SERVICE_APPOINTMENT_V1',
    'REMOTE_SESSION_V1',
    'FIELD_SERVICE_V1',
    'RENTAL_ASSET_V1',
    'TRANSFER_ROUTE_V1',
    'EVENT_TICKET_V1',
    'GROUP_SESSION_V1',
    'SPACE_RESERVATION_V1',
    'TOUR_PACKAGE_V1',
  ].includes(schema);
export const supportsSecurity = (schema: string) =>
  ['RENTAL_ASSET_V1', 'SPACE_RESERVATION_V1', 'STORAGE_SPACE_V1'].includes(schema);
export function workLabel(model: string): string {
  return (
    (
      {
        ORDER: 'Order',
        APPOINTMENT: 'Booking',
        FIELD_VISIT: 'Visit',
        ASSET_INTERVAL: 'Rental',
        TRANSFER: 'Trip',
        SESSION_CAPACITY: 'Booking',
        SPACE_RESERVATION: 'Reservation',
        TOUR: 'Tour',
        REQUEST_QUOTE: 'Request',
        PRODUCTION_DUE: 'Job',
        LINKED_WINDOWS: 'Service',
        SERVICE_JOB: 'Job',
        ENTITLEMENT: 'Membership',
        FREIGHT: 'Shipment',
        STORAGE: 'Storage',
      } as Record<string, string>
    )[model] ?? 'Work'
  );
}
export function workflowCopy(schema: string): {
  heading: string;
  charges: string;
  reminder: string;
} {
  const variants: Record<string, { heading: string; charges: string; reminder: string }> = {
    PRODUCT_CATALOG_V1: {
      heading: 'Understand your sales and settlement.',
      charges: 'Posted sales',
      reminder: 'A confirmed order is not automatically paid.',
    },
    SERVICE_APPOINTMENT_V1: {
      heading: 'Follow service payments and customer balances.',
      charges: 'Posted service charges',
      reminder: 'Service completion and payment are separate.',
    },
    REMOTE_SESSION_V1: {
      heading: 'Follow remote service payments and balances.',
      charges: 'Posted session charges',
      reminder: 'A session does not imply a travel or venue charge.',
    },
    FIELD_SERVICE_V1: {
      heading: 'Follow visit charges and customer balances.',
      charges: 'Posted visit charges',
      reminder: 'Travel charges require accepted terms.',
    },
    RENTAL_ASSET_V1: {
      heading: 'Track rental charges and customer security separately.',
      charges: 'Posted rental charges',
      reminder: 'An asset return does not automatically release security.',
    },
    TRANSFER_ROUTE_V1: {
      heading: 'Follow trip charges and payments.',
      charges: 'Posted trip charges',
      reminder: 'Staff and vehicles do not create extra sales.',
    },
    EVENT_TICKET_V1: {
      heading: 'Follow ticket payments and refunds.',
      charges: 'Posted ticket charges',
      reminder: 'An event cancellation is not itself a refund.',
    },
    GROUP_SESSION_V1: {
      heading: 'Follow group bookings and payments.',
      charges: 'Posted session charges',
      reminder: 'Included places are not billed a second time.',
    },
    SPACE_RESERVATION_V1: {
      heading: 'Follow table and space reservation payments.',
      charges: 'Posted reservation charges',
      reminder: 'A minimum spend is charged only when posted.',
    },
    TOUR_PACKAGE_V1: {
      heading: 'Follow tour payments and agreed charges.',
      charges: 'Posted tour charges',
      reminder: 'Supplier funds need their own agreed treatment.',
    },
    REQUEST_QUOTE_V1: {
      heading: 'Follow quoted work and issued charges.',
      charges: 'Posted work charges',
      reminder: 'A quote is not itself an invoice, payment or revenue.',
    },
    MADE_TO_ORDER_V1: {
      heading: 'Follow custom work and issued charges.',
      charges: 'Posted work charges',
      reminder: 'Unapproved changes do not create a payment.',
    },
    PICKUP_RETURN_V1: {
      heading: 'Follow service charges and collections.',
      charges: 'Posted service charges',
      reminder: 'Collection, processing and return do not create three sales.',
    },
    SERVICE_JOB_V1: {
      heading: 'Follow invoices, collections and customer balances.',
      charges: 'Posted job charges',
      reminder: 'An estimate is not an issued invoice or debt.',
    },
    MEMBERSHIP_PLAN_V1: {
      heading: 'Follow membership charges and collections.',
      charges: 'Posted plan charges',
      reminder: 'Cash received is not automatically earned revenue.',
    },
    FREIGHT_SHIPMENT_V1: {
      heading: 'Follow shipment charges and collections.',
      charges: 'Posted shipment charges',
      reminder: 'Carrier and customs charges follow the agreed contract.',
    },
    STORAGE_SPACE_V1: {
      heading: 'Follow storage charges and customer balances.',
      charges: 'Posted storage charges',
      reminder: 'Ending custody does not automatically settle money.',
    },
    REGULATED_ENQUIRY_V1: {
      heading: 'Follow permitted service fees and collections.',
      charges: 'Posted service fees',
      reminder: 'This view does not provide customer banking or lending.',
    },
  };
  return (
    variants[schema] ?? {
      heading: 'Understand your money activity.',
      charges: 'Posted charges',
      reminder: 'Work and payment are recorded separately.',
    }
  );
}
export function activitySummary(
  c: Context,
  s: Snapshot,
): { title: string; facts: [string, string][]; note: string } {
  const schema = c.offering.schemaId;
  const field = (key: string, fallback = 'Not set') => {
    const value = c.offering.fields[key];
    return value === '' || value === undefined ? fallback : String(value);
  };
  const terms = s.policy
    ? `Accepted sample · ${s.policy.acceptedVersion}`
    : c.offering.reservationFee && c.offering.reservationFee.mode !== 'none'
      ? 'Offering term set · acceptance unconfirmed'
      : 'No accepted sample policy';
  const entries: Record<string, { title: string; facts: [string, string][]; note: string }> = {
    PRODUCT_CATALOG_V1: {
      title: 'Order money',
      facts: [
        ['Fulfilment', c.method],
        ['Payment source', 'Sample Finance'],
      ],
      note: 'Order confirmation and payment confirmation are independent.',
    },
    SERVICE_APPOINTMENT_V1: {
      title: 'Service payments',
      facts: [
        ['Service duration', `${field('duration_minutes')} min`],
        ['Reservation terms', terms],
      ],
      note: 'A completed service does not itself confirm payment.',
    },
    REMOTE_SESSION_V1: {
      title: 'Remote service payments',
      facts: [
        ['Session duration', `${field('duration_minutes')} min`],
        ['Reservation terms', terms],
      ],
      note: 'Venue or travel charges require separately agreed terms.',
    },
    FIELD_SERVICE_V1: {
      title: 'Visit payments',
      facts: [
        ['Fulfilment', c.method],
        ['Reservation terms', terms],
      ],
      note: 'A call-out or travel charge is not added without an agreement.',
    },
    RENTAL_ASSET_V1: {
      title: 'Rental money',
      facts: [
        ['Rental unit', c.offering.unit],
        ['Security source', s.features.security ? 'Enabled in sample' : 'Not enabled in sample'],
      ],
      note: 'A deposit term alone does not mean security was collected.',
    },
    TRANSFER_ROUTE_V1: {
      title: 'Trip payments',
      facts: [
        ['Transport mode', field('transport_mode', 'Configured trip')],
        ['Fulfilment', c.method],
      ],
      note: 'Staff and vehicles do not each create a separate sale.',
    },
    EVENT_TICKET_V1: {
      title: 'Ticket payments',
      facts: [
        ['Price unit', c.offering.unit],
        ['Reservation terms', terms],
      ],
      note: 'A cancelled event does not itself confirm a refund.',
    },
    GROUP_SESSION_V1: {
      title: 'Group session payments',
      facts: [
        ['Price unit', c.offering.unit],
        ['Reservation terms', terms],
      ],
      note: 'An included membership place is not charged again.',
    },
    SPACE_RESERVATION_V1: {
      title: 'Table and space money',
      facts: [
        ['Capacity use', field('capacity_mode')],
        ['Reservation terms', terms],
      ],
      note: 'A minimum spend is a commitment until a charge is posted.',
    },
    TOUR_PACKAGE_V1: {
      title: 'Tour payments',
      facts: [
        ['Departure', field('departure_mode')],
        ['Transport', field('tour_transport_mode')],
      ],
      note: 'Supplier or pass-through amounts require their own agreement.',
    },
    REQUEST_QUOTE_V1: {
      title: 'Sample quote · Q-1049',
      facts: [
        ['Quote value', formatAmount(minor(15000))],
        ['Status', 'Awaiting decision'],
        ['Invoice', 'Not issued'],
        ['Payment', 'Not recorded'],
      ],
      note: 'This sample quote is excluded from sales and customer debt.',
    },
    MADE_TO_ORDER_V1: {
      title: 'Custom work',
      facts: [
        ['Pricing', c.offering.priceMode === 'quote' ? 'By quotation' : 'Agreed offering price'],
        ['Handover', field('handover_methods')],
      ],
      note: 'A requested change does not create a charge until agreed and issued.',
    },
    PICKUP_RETURN_V1: {
      title: 'Collection service',
      facts: [
        ['Intake unit', field('intake_unit')],
        ['Commercial root', 'One service'],
      ],
      note: 'Collection, processing and return are not three separate sales.',
    },
    SERVICE_JOB_V1: {
      title: 'Service job money',
      facts: [
        ['Work', 'One agreed job'],
        ['Invoice source', s.features.balances ? 'Enabled in sample' : 'Not enabled in sample'],
      ],
      note: 'An estimate is not an issued invoice or customer debt.',
    },
    MEMBERSHIP_PLAN_V1: {
      title: 'Membership billing',
      facts: [
        ['Plan validity', `${field('validity_days')} days`],
        ['Benefit unit', field('usage_unit')],
        ['Earned revenue', 'Not supplied'],
      ],
      note: 'Cash collection is not automatically earned revenue.',
    },
    FREIGHT_SHIPMENT_V1: {
      title: 'Shipment charges',
      facts: [
        ['Agreed rate unit', field('measurement_units')],
        ['Supported route', field('supported_route_references')],
      ],
      note: 'Weight, volume and carrier charges keep their agreed basis.',
    },
    STORAGE_SPACE_V1: {
      title: 'Storage billing',
      facts: [
        ['Storage unit', field('space_unit')],
        ['Billing period', field('billing_period')],
      ],
      note: 'Custody ending does not automatically settle money or prorate charges.',
    },
    REGULATED_ENQUIRY_V1: {
      title: 'Administrative service fees',
      facts: [
        ['Activity', 'Provider enquiry'],
        ['Financial services', 'Not available here'],
      ],
      note: 'Only permitted merchant service fees are shown; customer banking and clinical details are excluded.',
    },
  };
  return (
    entries[schema] ?? {
      title: 'Activity details',
      facts: [['Offering', c.offering.name]],
      note: 'Work and payment are recorded separately.',
    }
  );
}
export type Features = {
  payouts: boolean;
  balances: boolean;
  security: boolean;
  reservation: boolean;
  refunds: boolean;
};
export type Transaction = {
  id: string;
  work: string;
  type: 'Sale' | 'Refund' | 'Fee';
  amount: number;
  status: string;
  source: string;
  date: string;
  time: string;
  method: 'M-Pesa' | 'Card' | 'Not recorded' | 'Not applicable';
  customer: string;
  originalReference?: string;
};
export type Invoice = {
  id: string;
  work: string;
  total: number;
  applied: number;
  credit: number;
  dueDate: string;
  state: 'Overdue' | 'Not due';
  parts?: number;
  labour?: number;
};
export type Security = {
  id: string;
  work: string;
  asset: string;
  collected: number;
  allocation: number;
  refunded: number;
  refundRequested: number;
  state: 'unknown' | 'collected' | 'refunded';
  policyVersion: string;
  operationId?: string;
};
export type ReservationPolicy = {
  acceptedVersion: string;
  advance: number;
  bookingFee: number;
  guarantee: number;
  cancellationCharge: number;
  allocatedAdvance: number;
  refundTerms: 'not-configured' | 'refundable' | 'non-refundable';
  bookingFeeRefundTerms: 'not-configured' | 'refundable' | 'non-refundable';
  cancellation: 'customer' | 'merchant' | 'no_show' | 'none';
  ownerPosted: boolean;
};
export type RefundKind = 'security' | 'sale' | 'advance' | 'booking' | 'guarantee';
export type SampleOperation = {
  id: string;
  kind:
    | 'security-refund'
    | 'sale-refund'
    | 'advance-refund'
    | 'booking-refund'
    | 'guarantee-refund';
  recordId: string;
  amount: number;
  result: 'unknown' | 'confirmed' | 'rejected';
  revision: number;
  note: string;
};
export type RefundDraft = {
  id: string;
  kind: RefundKind;
  recordId: string;
  amount: number;
  reason: string;
};
export type History = { revision: number; description: string; at: string };
export type StatementPeriod = {
  gross: number;
  refunds: number;
  fees: number;
  netCollections: number;
  netPayable: number;
};
export type SampleStatement = StatementPeriod & {
  eligible: number;
  today: StatementPeriod;
  reflectedOperations: string[];
};
export type Snapshot = {
  scope: string;
  revision: number;
  offeringVersion: number;
  features: Features;
  security: Security[];
  operations: SampleOperation[];
  drafts: RefundDraft[];
  policy: ReservationPolicy | null;
  statement: SampleStatement;
  history: History[];
};
export function initialStatement(): SampleStatement {
  return {
    gross: minor(200000),
    refunds: minor(10000),
    fees: minor(8000),
    netCollections: minor(190000),
    netPayable: minor(182000),
    eligible: minor(30000),
    today: {
      gross: minor(64600),
      refunds: minor(4000),
      fees: minor(1200),
      netCollections: minor(60600),
      netPayable: minor(59400),
    },
    reflectedOperations: [],
  };
}
export function statementNeedsRefresh(s: Snapshot) {
  return s.operations.some(
    (o) =>
      o.kind === 'sale-refund' &&
      (o.result === 'unknown' ||
        (o.result === 'confirmed' && !s.statement.reflectedOperations.includes(o.id))),
  );
}
export const remainingSecurity = (record: Security) =>
  record.collected - record.allocation - record.refunded;
export function securityTotals(records: Security[]) {
  return records.reduce(
    (a, r) => ({
      collected: a.collected + r.collected,
      refunded: a.refunded + r.refunded,
      allocated: a.allocated + r.allocation,
      recorded: a.recorded + remainingSecurity(r),
      unknown: a.unknown + (r.state === 'unknown' ? r.refundRequested : 0),
    }),
    { collected: 0, refunded: 0, allocated: 0, recorded: 0, unknown: 0 },
  );
}
export function invoiceTotals(records: Invoice[]) {
  return records.reduce(
    (a, r) => ({
      invoiced: a.invoiced + r.total,
      applied: a.applied + r.applied,
      credits: a.credits + r.credit,
      due: a.due + r.total - r.applied - r.credit,
      overdue: a.overdue + (r.state === 'Overdue' ? r.total - r.applied - r.credit : 0),
    }),
    { invoiced: 0, applied: 0, credits: 0, due: 0, overdue: 0 },
  );
}
export function reservationAmounts(
  p: ReservationPolicy,
  advanceRefunded = 0,
  bookingRefunded = 0,
  guaranteeRefunded = 0,
) {
  const triggered = p.cancellation === 'customer' || p.cancellation === 'no_show';
  const posted = p.ownerPosted && triggered ? p.allocatedAdvance : 0;
  if (
    ![advanceRefunded, bookingRefunded, guaranteeRefunded].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    posted + advanceRefunded > p.advance ||
    bookingRefunded > p.bookingFee ||
    guaranteeRefunded > p.guarantee ||
    posted > p.cancellationCharge ||
    posted < 0
  )
    throw new Error('Allocation or confirmed refund exceeds the accepted component.');
  const chargePosted = p.ownerPosted && triggered ? p.cancellationCharge : 0;
  return {
    collected: p.advance + p.bookingFee + p.guarantee,
    posted,
    chargePosted,
    chargeOutstanding: chargePosted - posted,
    advanceRefunded,
    bookingRefunded,
    guaranteeRefunded,
    remainingAdvance: p.advance - posted - advanceRefunded,
    remainingBookingFee: p.bookingFee - bookingRefunded,
    refundableGuarantee: p.guarantee - guaranteeRefunded,
  };
}
export function reservationSample(): ReservationPolicy {
  return {
    acceptedVersion: 'RP-2026-01',
    advance: minor(500),
    bookingFee: minor(100),
    guarantee: minor(1000),
    cancellationCharge: minor(300),
    allocatedAdvance: minor(300),
    refundTerms: 'refundable',
    bookingFeeRefundTerms: 'not-configured',
    cancellation: 'customer',
    ownerPosted: true,
  };
}
export function policyFromChoices(choices: {
  advance: boolean;
  bookingFee: boolean;
  guarantee: boolean;
  cancellationCharge: boolean;
  refundTerms: ReservationPolicy['refundTerms'];
  bookingFeeRefundTerms?: ReservationPolicy['bookingFeeRefundTerms'];
  cancellation: ReservationPolicy['cancellation'];
}): ReservationPolicy {
  const p = reservationSample();
  p.advance = choices.advance ? minor(500) : 0;
  p.bookingFee = choices.bookingFee ? minor(100) : 0;
  p.guarantee = choices.guarantee ? minor(1000) : 0;
  p.cancellationCharge = choices.cancellationCharge ? minor(300) : 0;
  p.ownerPosted =
    (choices.cancellation === 'customer' || choices.cancellation === 'no_show') &&
    p.cancellationCharge > 0;
  p.allocatedAdvance = p.ownerPosted ? Math.min(p.advance, p.cancellationCharge) : 0;
  p.refundTerms = choices.refundTerms;
  p.bookingFeeRefundTerms = choices.bookingFeeRefundTerms ?? 'not-configured';
  p.cancellation = choices.cancellation;
  return p;
}
export function defaultFeatures(c: Context): Features {
  return {
    payouts: c.profile.id === 'restaurant' && c.offering.schemaId === 'PRODUCT_CATALOG_V1',
    balances: c.offering.schemaId === 'SERVICE_JOB_V1',
    security: c.profile.id === 'self_drive' && c.offering.schemaId === 'RENTAL_ASSET_V1',
    reservation: false,
    refunds: true,
  };
}
export function transactions(view: Descriptor): Transaction[] {
  const label = workLabel(view.modelId);
  const seed: Omit<Transaction, 'method' | 'customer' | 'time'>[] = [
    {
      id: 'TX-6112',
      work: `${label} #4612`,
      type: 'Sale',
      amount: minor(24800),
      status: 'Paid',
      source: 'Sample Finance',
      date: '2026-11-03',
    },
    {
      id: 'TX-6113',
      work: `${label} #4613`,
      type: 'Sale',
      amount: minor(18000),
      status: 'Paid',
      source: 'Sample Finance',
      date: '2026-11-03',
    },
    {
      id: 'TX-6114',
      work: `${label} #4614`,
      type: 'Sale',
      amount: minor(12200),
      status: 'Paid',
      source: 'Sample Finance',
      date: '2026-11-03',
    },
    {
      id: 'TX-6115',
      work: `${label} #4598`,
      type: 'Refund',
      amount: -minor(4000),
      status: 'Confirmed',
      source: 'Sample Finance',
      date: '2026-11-03',
    },
    {
      id: 'TX-6116',
      work: 'Statement fee',
      type: 'Fee',
      amount: -minor(1200),
      status: 'Posted',
      source: 'Sample Finance',
      date: '2026-11-03',
    },
    {
      id: 'TX-6117',
      work: `${label} #4615`,
      type: 'Sale',
      amount: minor(9600),
      status: 'Paid',
      source: 'Sample Finance',
      date: '2026-11-03',
    },
  ];
  const moreSales = [...Array(25)].map(
    (_, i): Omit<Transaction, 'method' | 'customer' | 'time'> => ({
      id: `TX-${6200 + i}`,
      work: `${label} #${4620 + i}`,
      type: 'Sale',
      amount: minor(5000),
      status: 'Paid',
      source: 'Sample Finance',
      date: i % 2 ? '2026-11-02' : '2026-11-01',
    }),
  );
  moreSales.push({
    id: 'TX-6225',
    work: `${label} #4645`,
    type: 'Sale',
    amount: minor(10400),
    status: 'Paid',
    source: 'Sample Finance',
    date: '2026-11-02',
  });
  const moreRefunds = [3000, 2000, 1000].map(
    (amount, i): Omit<Transaction, 'method' | 'customer' | 'time'> => ({
      id: `TX-${6300 + i}`,
      work: `${label} #${4550 + i}`,
      type: 'Refund',
      amount: -minor(amount),
      status: 'Confirmed',
      source: 'Sample Finance',
      date: i % 2 ? '2026-11-02' : '2026-11-01',
    }),
  );
  const raw = [
    ...seed,
    ...moreSales,
    ...moreRefunds,
    {
      id: 'TX-6400',
      work: 'Statement fee',
      type: 'Fee' as const,
      amount: -minor(6800),
      status: 'Posted',
      source: 'Sample Finance',
      date: '2026-11-01',
    },
  ];
  return raw.map((record, i) => ({
    ...record,
    method: record.type === 'Fee' ? 'Not applicable' : i % 2 ? 'Card' : 'M-Pesa',
    customer: record.type === 'Fee' ? 'Not applicable' : `Sample customer ${i + 1}`,
    time:
      record.date === '2026-11-03'
        ? ['09:14', '08:46', '08:12', '08:05', '07:50', '07:30'][i % 6]!
        : '16:20',
  }));
}
/** One normalized local record per sample fact; unknown/refused requests remain distinct from confirmed refunds. */
export function transactionRecords(view: Descriptor, snapshot: Snapshot): Transaction[] {
  const base = transactions(view);
  const refunds = snapshot.operations
    .filter((o) => o.kind === 'sale-refund')
    .map((o): Transaction => {
      const original = base.find((t) => t.id === o.recordId);
      return {
        id: o.id,
        work: original?.work ?? o.recordId,
        type: 'Refund',
        amount: -o.amount,
        status:
          o.result === 'unknown'
            ? 'Outcome unknown'
            : o.result === 'confirmed'
              ? 'Confirmed'
              : 'Rejected',
        source: 'Sample Finance',
        date: '2026-11-03',
        time: '09:40',
        method: original?.method ?? 'Not recorded',
        customer: original?.customer ?? 'Not recorded',
        originalReference: o.recordId,
      };
    });
  return [...base, ...refunds];
}
export function transactionSearchText(t: Transaction): string {
  return `${t.id} ${t.work} ${t.date} ${t.date.replace('2026-11-0', '')} Nov ${t.time} ${t.type} ${t.type === 'Sale' ? 'payment' : ''} ${t.status} ${t.source} ${t.method} ${t.customer} ${t.originalReference ?? ''}`;
}
export function matchesTransaction(t: Transaction, search: string, filter: string): boolean {
  return (
    (filter === 'All' || [t.type, t.status, t.method].includes(filter)) &&
    transactionSearchText(t).toLowerCase().includes(search.trim().toLowerCase())
  );
}
export function transactionStats(records: Transaction[]) {
  return records.reduce(
    (result, t) => {
      result.total++;
      if (t.type === 'Sale' && t.status === 'Paid') {
        result.paidCount++;
        result.paidAmount += t.amount;
      }
      if (t.type === 'Refund' && t.status === 'Confirmed') {
        result.refundCount++;
        result.refundAmount += Math.abs(t.amount);
      }
      if (t.type === 'Fee' && t.status === 'Posted') result.feeCount++;
      if (t.status === 'Outcome unknown' || t.status === 'Rejected') {
        result.attentionCount++;
        result.attentionAmount += Math.abs(t.amount);
      }
      return result;
    },
    {
      total: 0,
      paidCount: 0,
      paidAmount: 0,
      refundCount: 0,
      refundAmount: 0,
      feeCount: 0,
      attentionCount: 0,
      attentionAmount: 0,
    },
  );
}
export function invoices(view: Descriptor): Invoice[] {
  const label = workLabel(view.modelId).toUpperCase();
  return [
    {
      id: 'INV-0812',
      work: `${label}-1050`,
      total: minor(24000),
      applied: minor(18000),
      credit: 0,
      dueDate: '1 Nov 2026',
      state: 'Overdue',
    },
    {
      id: 'INV-0819',
      work: `${label}-1060`,
      total: minor(18000),
      applied: minor(14000),
      credit: 0,
      dueDate: '2 Nov 2026',
      state: 'Overdue',
    },
    {
      id: 'INV-0821',
      work: `${label}-1070`,
      total: minor(10000),
      applied: minor(8000),
      credit: 0,
      dueDate: '2 Nov 2026',
      state: 'Overdue',
    },
    {
      id: 'INV-0832',
      work: `${label}-1081`,
      total: minor(36000),
      applied: minor(20000),
      credit: minor(2000),
      dueDate: '5 Nov 2026',
      state: 'Not due',
      parts: minor(16000),
      labour: minor(20000),
    },
    {
      id: 'INV-0835',
      work: `${label}-1088`,
      total: minor(42000),
      applied: minor(30000),
      credit: minor(4000),
      dueDate: '7 Nov 2026',
      state: 'Not due',
    },
    {
      id: 'INV-0839',
      work: `${label}-1095`,
      total: minor(50000),
      applied: minor(30000),
      credit: minor(4000),
      dueDate: '10 Nov 2026',
      state: 'Not due',
    },
  ];
}
export function securitySamples(c: Context): Security[] {
  const vehicle = c.profile.id === 'self_drive' && c.offering.schemaId === 'RENTAL_ASSET_V1';
  const asset = (name: string, n: number) =>
    vehicle ? name : `${schemas[c.offering.schemaId]?.label ?? 'Resource'} ${n}`;
  const work = (id: string) => (vehicle ? id : id.replace('RNT-', 'RES-'));
  return [
    {
      id: 'SEC-2070',
      work: work('RNT-2070'),
      asset: asset('Toyota RAV4 · RAV4-01', 1),
      collected: minor(20000),
      allocation: minor(2000),
      refunded: 0,
      refundRequested: minor(18000),
      state: 'unknown',
      policyVersion: 'SEC-2026-01',
      operationId: 'OP-6209',
    },
    {
      id: 'SEC-2071',
      work: 'BK-2071',
      asset: asset('Toyota Probox · PRO-02', 2),
      collected: minor(24000),
      allocation: 0,
      refunded: 0,
      refundRequested: 0,
      state: 'collected',
      policyVersion: 'SEC-2026-01',
    },
    {
      id: 'SEC-3180',
      work: 'BK-3180',
      asset: asset('Toyota Hiace · HIA-03', 3),
      collected: minor(22000),
      allocation: 0,
      refunded: 0,
      refundRequested: 0,
      state: 'collected',
      policyVersion: 'SEC-2026-01',
    },
    ...[10000, 12000, 12000].map(
      (n, i): Security => ({
        id: `SEC-${[2054, 2041, 2033][i]}`,
        work: work(`RNT-${[2054, 2041, 2033][i]}`),
        asset: asset('Returned asset', i + 4),
        collected: minor(n),
        allocation: 0,
        refunded: minor(n),
        refundRequested: 0,
        state: 'refunded',
        policyVersion: 'SEC-2026-01',
      }),
    ),
  ];
}
