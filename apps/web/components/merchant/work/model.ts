import type { BookingModel, BookingProfileSummary } from '@nexg/booking-config/profiles';
import type { ResolvedBookingConfiguration } from '@nexg/booking-config';
import profileViews from './work-profile-views.json';
import { baseSubcategoryId } from '@nexg/booking-config/profiles';

export type WorkflowId =
  | 'WF_ORDER'
  | 'WF_BOOKING'
  | 'WF_SCHEDULED_WORK'
  | 'WF_MADE_TO_ORDER'
  | 'WF_APPOINTMENT'
  | 'WF_REMOTE_SESSION'
  | 'WF_FIELD_SERVICE'
  | 'WF_RENTAL'
  | 'WF_TRANSFER'
  | 'WF_EVENT_SESSION'
  | 'WF_GROUP_ACTIVITY'
  | 'WF_TOUR'
  | 'WF_REQUEST_QUOTE'
  | 'WF_PICKUP_RETURN'
  | 'WF_MEMBERSHIP'
  | 'WF_FREIGHT'
  | 'WF_STORAGE'
  | 'WF_REGULATED_ENQUIRY'
  | 'WF_SERVICE_JOB'
  | 'WF_SPACE_RESERVATION_V1';
export type WorkTab = 'attention' | 'upcoming' | 'progress' | 'history';
export type WorkTemplate = {
  label: string;
  singular: string;
  itemLabel: string;
  item: string;
  contextLabel: string;
  context: string;
  milestoneLabel: string;
  milestone: string;
  stages: string[];
  actions: string[];
  confirmation: string;
  source: string;
};
export type WorkRecord = {
  id: string;
  reference?: string;
  statusLabel?: string;
  additionalActions?: { id: string; label: string }[];
  manageHref?: string;
  workflowId: WorkflowId;
  customer: string;
  item: string;
  context: string;
  milestone: string;
  operator: string;
  stage: number;
  attention: boolean;
  upcoming: boolean;
  history: string[];
  confirmation: string;
  sourceLabel: string;
  nextAction?: { id: string; label: string };
  lines?: { name: string; quantity: number; amount: string }[];
  readOnly?: boolean;
};

// Work consumes an explicitly selected workflow. Candidate profiles alone do not activate work.
export interface WorkSource {
  list(workflowId: WorkflowId, profile?: BookingProfileSummary): Promise<WorkRecord[]>;
  advance(record: WorkRecord, actionId: string): Promise<WorkRecord>;
}

// The booking resolver describes a selected offering, not all the merchant's
// possible offerings. Keep each offering separate and never turn a candidate
// model into work. A future source can supply these resolved inputs unchanged.
export type ResolvedWorkActivity = {
  offeringId: string;
  workflowId: WorkflowId;
  modelId: BookingModel;
  linkedExecution: boolean;
  configurationRevision: string;
};
export function workActivitiesFromBooking(
  offeringId: string,
  config: Pick<
    ResolvedBookingConfiguration,
    'isReady' | 'activeModels' | 'workflowBindings' | 'configurationRevision'
  >,
): { activities: ResolvedWorkActivity[]; unsupported: string[] } {
  if (!config.isReady) return { activities: [], unsupported: [] };
  const activities: ResolvedWorkActivity[] = [];
  const unsupported: string[] = [];
  for (const binding of config.workflowBindings) {
    if (!config.activeModels.includes(binding.modelId)) continue;
    if (!(binding.workflowId in templates)) {
      unsupported.push(binding.workflowId);
      continue;
    }
    activities.push({
      offeringId,
      workflowId: binding.workflowId as WorkflowId,
      modelId: binding.modelId,
      linkedExecution: binding.linkedExecution,
      configurationRevision: config.configurationRevision,
    });
  }
  return { activities, unsupported };
}

export const templates: Record<WorkflowId, WorkTemplate> = {
  WF_BOOKING: {
    label: 'Earlier bookings',
    singular: 'booking',
    itemLabel: 'Resource',
    item: '',
    contextLabel: 'Party',
    context: '',
    milestoneLabel: 'Starts',
    milestone: '',
    stages: ['Pending', 'Confirmed', 'Closed'],
    actions: [],
    confirmation: '',
    source: 'Earlier bookings',
  },
  WF_SCHEDULED_WORK: {
    label: 'Scheduled work',
    singular: 'booking',
    itemLabel: 'Offering',
    item: '',
    contextLabel: 'Resources',
    context: '',
    milestoneLabel: 'Starts',
    milestone: '',
    stages: ['Pending', 'Confirmed', 'In progress', 'Closed'],
    actions: [],
    confirmation: '',
    source: 'Booking calendar',
  },
  WF_ORDER: {
    label: 'Orders',
    singular: 'order',
    itemLabel: 'Items',
    item: '4 items',
    contextLabel: 'Fulfilment',
    context: 'Customer pickup',
    milestoneLabel: 'Ready by',
    milestone: 'Today, 11:00 AM',
    stages: ['Confirmed', 'Picking', 'Ready', 'Collected'],
    actions: ['Start picking', 'Mark ready for pickup', 'Record collection'],
    confirmation: 'Confirmed automatically · stock allocated',
    source: 'Inventory API · stock read-only; execution in workspace',
  },
  WF_MADE_TO_ORDER: {
    label: 'Custom production',
    singular: 'job',
    itemLabel: 'Specification',
    item: 'Personalised order',
    contextLabel: 'Scope',
    context: 'Agreed design',
    milestoneLabel: 'Due',
    milestone: 'Tomorrow, 2:00 PM',
    stages: ['Agreed', 'In production', 'Quality check', 'Handed over'],
    actions: ['Start production', 'Send to quality check', 'Record handover'],
    confirmation: 'Customer agreement recorded',
    source: 'Work execution · workspace',
  },
  WF_APPOINTMENT: {
    label: 'Appointments',
    singular: 'appointment',
    itemLabel: 'Service',
    item: 'Consultation',
    contextLabel: 'Location',
    context: 'Westlands studio',
    milestoneLabel: 'Starts',
    milestone: 'Today, 11:00 AM',
    stages: ['Confirmed', 'Checked in', 'In service', 'Completed'],
    actions: ['Check in', 'Start service', 'Complete service'],
    confirmation: 'Time and resource confirmed',
    source: 'Booking schedule · preview',
  },
  WF_REMOTE_SESSION: {
    label: 'Remote sessions',
    singular: 'session',
    itemLabel: 'Service',
    item: 'Online consultation',
    contextLabel: 'Access',
    context: 'Remote session',
    milestoneLabel: 'Starts',
    milestone: 'Today, 11:00 AM',
    stages: ['Confirmed', 'Ready', 'In session', 'Completed'],
    actions: ['Mark access ready', 'Start session', 'Complete session'],
    confirmation: 'Time and provider confirmed',
    source: 'Booking schedule · preview',
  },
  WF_FIELD_SERVICE: {
    label: 'Customer visits',
    singular: 'visit',
    itemLabel: 'Service',
    item: 'On-site service',
    contextLabel: 'Location',
    context: 'Customer location',
    milestoneLabel: 'Arrival window',
    milestone: 'Today, 11:00 AM',
    stages: ['Scheduled', 'Travelling', 'At location', 'Completed'],
    actions: ['Start travel', 'Record arrival', 'Complete visit'],
    confirmation: 'Visit scheduled',
    source: 'Visit schedule · preview',
  },
  WF_RENTAL: {
    label: 'Rentals',
    singular: 'rental',
    itemLabel: 'Vehicle / asset',
    item: 'Toyota RAV4 · KDJ 482M',
    contextLabel: 'Rental period',
    context: 'Self-drive · 3 days',
    milestoneLabel: 'Return',
    milestone: 'Today, 4:00 PM',
    stages: ['Confirmed', 'Handed over', 'In use', 'Returned', 'Inspected'],
    actions: ['Record handover', 'Start rental', 'Record return', 'Complete inspection'],
    confirmation: 'Vehicle and rental period confirmed',
    source: 'Asset availability · preview',
  },
  WF_TRANSFER: {
    label: 'Transfers',
    singular: 'transfer',
    itemLabel: 'Route',
    item: 'Airport to Westlands',
    contextLabel: 'Party',
    context: '2 passengers',
    milestoneLabel: 'Pickup',
    milestone: 'Today, 11:00 AM',
    stages: ['Scheduled', 'Arrived', 'In transit', 'Completed'],
    actions: ['Record arrival', 'Start trip', 'Complete trip'],
    confirmation: 'Transfer scheduled',
    source: 'Transfer schedule · preview',
  },
  WF_EVENT_SESSION: {
    label: 'Event bookings',
    singular: 'booking',
    itemLabel: 'Event',
    item: 'Evening event',
    contextLabel: 'Admission',
    context: '2 places',
    milestoneLabel: 'Starts',
    milestone: 'Today, 6:00 PM',
    stages: ['Confirmed', 'Ready', 'Checked in', 'Completed'],
    actions: ['Mark ready', 'Check in', 'Complete attendance'],
    confirmation: 'Places confirmed',
    source: 'Event schedule · preview',
  },
  WF_GROUP_ACTIVITY: {
    label: 'Group activities',
    singular: 'booking',
    itemLabel: 'Activity',
    item: 'Group session',
    contextLabel: 'Participants',
    context: '2 places',
    milestoneLabel: 'Starts',
    milestone: 'Today, 11:00 AM',
    stages: ['Confirmed', 'Ready', 'In session', 'Completed'],
    actions: ['Mark session ready', 'Start activity', 'Complete activity'],
    confirmation: 'Places confirmed',
    source: 'Activity schedule · preview',
  },
  WF_TOUR: {
    label: 'Tours',
    singular: 'booking',
    itemLabel: 'Tour',
    item: 'Nairobi day tour',
    contextLabel: 'Party',
    context: '2 guests',
    milestoneLabel: 'Departure',
    milestone: 'Today, 9:00 AM',
    stages: ['Confirmed', 'Ready', 'Departed', 'Completed'],
    actions: ['Mark ready', 'Record departure', 'Complete tour'],
    confirmation: 'Tour places confirmed',
    source: 'Tour schedule · preview',
  },
  WF_REQUEST_QUOTE: {
    label: 'Requests and quotes',
    singular: 'request',
    itemLabel: 'Request',
    item: 'Service enquiry',
    contextLabel: 'Scope',
    context: 'Details supplied',
    milestoneLabel: 'Respond by',
    milestone: 'Today, 3:00 PM',
    stages: ['Received', 'Quote prepared', 'Customer decision', 'Agreed'],
    actions: ['Prepare quote', 'Send quote', 'Record customer agreement'],
    confirmation: 'Request received · agreement still required',
    source: 'Requests · preview',
  },
  WF_PICKUP_RETURN: {
    label: 'Collection and return',
    singular: 'job',
    itemLabel: 'Items',
    item: 'Laundry · 4 items',
    contextLabel: 'Collection',
    context: 'Customer drop-off',
    milestoneLabel: 'Return',
    milestone: 'Tomorrow, 4:00 PM',
    stages: ['Scheduled', 'Received', 'Processing', 'Ready for collection', 'Returned'],
    actions: ['Record receipt', 'Start processing', 'Mark ready', 'Record return'],
    confirmation: 'Collection and return terms confirmed',
    source: 'Job schedule · preview',
  },
  WF_MEMBERSHIP: {
    label: 'Memberships',
    singular: 'membership',
    itemLabel: 'Entitlement',
    item: 'Monthly access',
    contextLabel: 'Validity',
    context: 'Current period',
    milestoneLabel: 'Ends',
    milestone: '30 November',
    stages: ['Active', 'Renewal due', 'Renewed'],
    actions: ['Mark renewal due', 'Record renewal'],
    confirmation: 'Access entitlement recorded',
    source: 'Entitlements · preview',
  },
  WF_FREIGHT: {
    label: 'Shipments',
    singular: 'shipment',
    itemLabel: 'Cargo',
    item: '3 cartons',
    contextLabel: 'Route',
    context: 'Nairobi to Mombasa',
    milestoneLabel: 'Collection',
    milestone: 'Today, 2:00 PM',
    stages: ['Scheduled', 'Collected', 'In transit', 'Delivered'],
    actions: ['Record collection', 'Start transit', 'Record delivery'],
    confirmation: 'Shipment scheduled',
    source: 'Shipment milestones · preview',
  },
  WF_STORAGE: {
    label: 'Storage',
    singular: 'allocation',
    itemLabel: 'Stored item',
    item: '4 containers',
    contextLabel: 'Allocation',
    context: 'Storage unit A12',
    milestoneLabel: 'Period ends',
    milestone: '30 November',
    stages: ['Allocated', 'Received', 'Stored', 'Released'],
    actions: ['Record intake', 'Mark stored', 'Record release'],
    confirmation: 'Space allocated',
    source: 'Storage allocation · preview',
  },
  WF_REGULATED_ENQUIRY: {
    label: 'Provider enquiries',
    singular: 'enquiry',
    itemLabel: 'Enquiry',
    item: 'Provider information request',
    contextLabel: 'Provider',
    context: 'Assigned provider',
    milestoneLabel: 'Respond by',
    milestone: 'Today, 3:00 PM',
    stages: ['Received', 'Responded', 'Referred', 'Acknowledged'],
    actions: ['Record response', 'Record referral', 'Record acknowledgement'],
    confirmation: 'Administrative enquiry received',
    source: 'Provider handoff · preview',
  },
  WF_SERVICE_JOB: {
    label: 'Service jobs',
    singular: 'job',
    itemLabel: 'Item',
    item: 'Customer device',
    contextLabel: 'Scope',
    context: 'Assessment and repair',
    milestoneLabel: 'Due',
    milestone: 'Tomorrow, 2:00 PM',
    stages: ['Received', 'Assessment', 'In service', 'Ready', 'Handed over'],
    actions: ['Start assessment', 'Start agreed service', 'Mark ready', 'Record handover'],
    confirmation: 'Job received',
    source: 'Service job · preview',
  },
  WF_SPACE_RESERVATION_V1: {
    label: 'Table and space reservations',
    singular: 'reservation',
    itemLabel: 'Space',
    item: 'Table for 4',
    contextLabel: 'Party',
    context: '4 guests',
    milestoneLabel: 'Arrival',
    milestone: 'Today, 7:00 PM',
    stages: ['Confirmed', 'Arrived', 'Seated', 'Released'],
    actions: ['Record arrival', 'Seat party', 'Release space'],
    confirmation: 'Space and time confirmed',
    source: 'Reservation schedule · preview',
  },
};

// Preview choices for a future declarative category using registered models.
// They are suggestions only; a resolved offering still chooses its binding.
const modelViews: Record<BookingModel, WorkflowId[]> = {
  ORDER: ['WF_ORDER'],
  PRODUCTION_DUE: ['WF_MADE_TO_ORDER'],
  APPOINTMENT: ['WF_APPOINTMENT', 'WF_REMOTE_SESSION'],
  FIELD_VISIT: ['WF_FIELD_SERVICE', 'WF_SERVICE_JOB'],
  ASSET_INTERVAL: ['WF_RENTAL'],
  TRANSFER: ['WF_TRANSFER'],
  SESSION_CAPACITY: ['WF_EVENT_SESSION', 'WF_GROUP_ACTIVITY'],
  SPACE_RESERVATION: ['WF_SPACE_RESERVATION_V1'],
  TOUR: ['WF_TOUR'],
  REQUEST_QUOTE: ['WF_REQUEST_QUOTE', 'WF_REGULATED_ENQUIRY'],
  LINKED_WINDOWS: ['WF_PICKUP_RETURN'],
  SERVICE_JOB: ['WF_SERVICE_JOB'],
  ENTITLEMENT: ['WF_MEMBERSHIP'],
  FREIGHT: ['WF_FREIGHT'],
  STORAGE: ['WF_STORAGE'],
};

export function candidateWorkflows(profile: BookingProfileSummary): WorkflowId[] {
  const entry = profileViews.find(
    (item) => item.subcategoryId === baseSubcategoryId(profile.subcategoryId),
  );
  const choices = entry
    ? entry.views.flatMap((view) => view.workflowIds)
    : profile.candidateModels.flatMap((model) => modelViews[model] ?? []);
  return [...new Set(choices)].filter((id): id is WorkflowId => id in templates);
}
export function defaultWorkflow(profile: BookingProfileSummary): WorkflowId | undefined {
  const entry = profileViews.find(
    (item) => item.subcategoryId === baseSubcategoryId(profile.subcategoryId),
  );
  const model = entry?.views.find((view) => view.modelId === profile.defaultModelId);
  return (
    model?.workflowIds.find((id): id is WorkflowId => id in templates) ??
    (!entry ? modelViews[profile.defaultModelId]?.[0] : undefined)
  );
}
export function modelForWorkflow(
  profile: BookingProfileSummary,
  workflow: WorkflowId,
): BookingModel | undefined {
  return profileViews
    .find((item) => item.subcategoryId === baseSubcategoryId(profile.subcategoryId))
    ?.views.find((view) => view.workflowIds.includes(workflow))?.modelId as
    | BookingModel
    | undefined;
}
export function inTab(record: WorkRecord, tab: WorkTab): boolean {
  const done = record.stage >= templates[record.workflowId].stages.length - 1;
  return tab === 'history'
    ? done
    : tab === 'attention'
      ? record.attention && !done
      : tab === 'upcoming'
        ? record.upcoming && !done
        : !record.upcoming && !done;
}

function sampleMilestone(value: string, index: number): string {
  const match = /^(Today|Tomorrow), (\d{1,2}):(\d{2}) (AM|PM)$/.exec(value);
  if (!match || index === 0) return value;
  const hours = (Number(match[2]) % 12) + (match[4] === 'PM' ? 12 : 0);
  const minutes = hours * 60 + Number(match[3]) + index * 15;
  const hour = Math.floor(minutes / 60) % 24;
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${match[1]}, ${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${period}`;
}

export function createSampleRecords(
  workflowId: WorkflowId,
  profile?: BookingProfileSummary,
): WorkRecord[] {
  const template = templates[workflowId];
  const isRental = workflowId === 'WF_RENTAL';
  const isGrocery = profile?.categoryId === 'groceries_essentials';
  const item =
    isRental && profile?.subcategoryId === 'bike_rental'
      ? 'Bicycle · BIKE 012'
      : workflowId === 'WF_ORDER' && profile && !isGrocery
        ? `Sample ${profile.vocabulary.offeringSingular ?? 'product'}`
        : template.item;
  const rentalContext: Record<string, string> = {
    car_rental: 'Daily rental · 3 days',
    self_drive: 'Self-drive · 3 days',
    corporate_rental: 'Corporate fleet · monthly agreement',
    long_term_rental: 'Long-term rental · 3 months',
    bike_rental: 'City bicycle · 1 day',
  };
  const lines =
    workflowId === 'WF_ORDER' && isGrocery
      ? [
          { name: 'Maize flour 2 kg', quantity: 1, amount: 'KES 220' },
          { name: 'Cooking oil 1 L', quantity: 1, amount: 'KES 380' },
          { name: 'Milk 1 L', quantity: 1, amount: 'KES 160' },
          { name: 'Eggs tray', quantity: 1, amount: 'KES 450' },
        ]
      : undefined;
  const customers = [
    'Amina K.',
    'Daniel M.',
    'Grace N.',
    'Peter O.',
    'Linda W.',
    'David S.',
    'Esther M.',
    'Brian O.',
    'Mary W.',
    'Hassan M.',
    'Faith N.',
    'John K.',
    'Leah N.',
    'James K.',
    'Ruth W.',
    'Joseph M.',
  ];
  return customers.map((customer, index) => {
    const upcoming = index >= 12 && index < 14;
    const completed = index >= 14;
    const stage = completed
      ? template.stages.length - 1
      : upcoming
        ? 0
        : isRental
          ? 2
          : Math.min((index % 2) + 1, template.stages.length - 2);
    const action = template.actions[stage];
    const rentalItem =
      isRental && index > 0
        ? profile?.subcategoryId === 'bike_rental'
          ? `Bicycle · BIKE ${String(index + 12).padStart(3, '0')}`
          : `Rental vehicle · VEH-${String(index + 1).padStart(3, '0')}`
        : item;
    return {
      id: `${workflowId === 'WF_ORDER' ? 'ORD' : isRental ? 'RNT' : 'WRK'}-${2048 - index}`,
      workflowId,
      customer,
      item: rentalItem,
      context:
        isRental && profile
          ? (rentalContext[profile.subcategoryId] ?? template.context)
          : template.context,
      milestone: sampleMilestone(template.milestone, index),
      lines,
      confirmation: template.confirmation,
      sourceLabel: template.source,
      operator: ['Maya', 'John', 'Aisha'][index % 3]!,
      stage,
      attention: false,
      upcoming,
      history: [template.confirmation, ...(completed ? [template.actions[stage - 1]!] : [])],
      nextAction: action ? { id: `sample:${workflowId}:${stage}`, label: action } : undefined,
    };
  });
}
export const sampleSource: WorkSource = {
  async list(workflowId, profile) {
    return createSampleRecords(workflowId, profile);
  },
  async advance(record, actionId) {
    const template = templates[record.workflowId];
    if (
      record.readOnly ||
      record.stage >= template.stages.length - 1 ||
      record.nextAction?.id !== actionId
    )
      return record;
    const action = template.actions[record.stage];
    if (!action) return record;
    const nextStage = record.stage + 1;
    const nextLabel = template.actions[nextStage];
    return {
      ...record,
      stage: nextStage,
      attention: false,
      upcoming: false,
      history: [...record.history, action],
      nextAction: nextLabel
        ? { id: `sample:${record.workflowId}:${nextStage}`, label: nextLabel }
        : undefined,
    };
  },
};
