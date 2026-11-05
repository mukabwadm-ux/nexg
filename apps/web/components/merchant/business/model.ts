import { z } from 'zod';
import { activityProfiles } from '@nexg/booking-config/profiles';
import { AVIATION_DEMO_CATEGORY } from '@/lib/aviation-demo';
import config from './config.json';

export type Model =
  | 'ORDER'
  | 'APPOINTMENT'
  | 'FIELD_VISIT'
  | 'ASSET_INTERVAL'
  | 'TRANSFER'
  | 'SESSION_CAPACITY'
  | 'SPACE_RESERVATION'
  | 'TOUR'
  | 'PRODUCTION_DUE'
  | 'REQUEST_QUOTE'
  | 'LINKED_WINDOWS'
  | 'SERVICE_JOB'
  | 'ENTITLEMENT'
  | 'FREIGHT'
  | 'STORAGE';
export type Section = 'profile' | 'activities' | 'locations' | 'team' | 'documents' | 'feedback';
export type FieldDefinition = {
  id: string;
  label: string;
  target: string;
  owner: string;
  schema: Record<string, unknown>;
};
export type BusinessCategory = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  defaultModel: Model;
  models: Model[];
  needs: string;
  questions: string[];
  vocabulary: Record<string, string>;
};
export const profiles: BusinessCategory[] = [
  ...(config.profiles as unknown as BusinessCategory[]),
  ...activityProfiles.map((profile): BusinessCategory => ({
    id: profile.subcategoryId,
    categoryId: profile.categoryId,
    categoryName: profile.categoryName,
    name: profile.name,
    defaultModel: profile.defaultModelId,
    models: profile.candidateModelIds,
    needs: profile.specialtyNeeds,
    questions: profile.sourceQuestionIds,
    vocabulary: { ...profile.vocabulary },
  })),
];
const aviationProfiles = AVIATION_DEMO_CATEGORY.subcategoryOptions.map((activity): BusinessCategory => ({
    id: activity.id,
    categoryId: AVIATION_DEMO_CATEGORY.id,
    categoryName: AVIATION_DEMO_CATEGORY.name,
    name: activity.name,
    defaultModel: 'REQUEST_QUOTE',
    models: ['REQUEST_QUOTE'],
    needs: 'Confirm the itinerary, aircraft and operator requirements for each charter.',
    questions: [],
    vocabulary: {},
}));
export const fields = config.fields as Record<string, FieldDefinition>;
export const sections: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'activities', label: 'Activities & setup' },
  { id: 'locations', label: 'Locations & coverage' },
  { id: 'team', label: 'Team' },
  { id: 'documents', label: 'Documents' },
  { id: 'feedback', label: 'Customer feedback' },
];
export const modelLabels: Record<Model, string> = {
  ORDER: 'Product sales',
  APPOINTMENT: 'Appointments',
  FIELD_VISIT: 'Customer visits',
  ASSET_INTERVAL: 'Rentals',
  TRANSFER: 'Passenger transfers',
  SESSION_CAPACITY: 'Sessions and events',
  SPACE_RESERVATION: 'Table and space reservations',
  TOUR: 'Tours',
  PRODUCTION_DUE: 'Custom production',
  REQUEST_QUOTE: 'Requests and quotes',
  LINKED_WINDOWS: 'Collection and return',
  SERVICE_JOB: 'Service jobs',
  ENTITLEMENT: 'Memberships',
  FREIGHT: 'Freight',
  STORAGE: 'Storage',
};
export const methodLabels: Record<string, string> = {
  CUSTOMER_PICKUP: 'Customer pickup',
  CUSTOMER_DROPOFF: 'Customer drop-off',
  MERCHANT_VENUE: 'At the venue',
  CUSTOMER_LOCATION: 'Customer location',
  DIGITAL: 'Digital / remote',
  NEXG_DELIVERY: 'NEXG delivery',
  MERCHANT_DELIVERY: 'Merchant delivery',
  PICKUP_RETURN: 'Collection and return',
  PASSENGER_TRANSFER: 'Passenger transfer',
  FREIGHT: 'Freight',
};
export function allowedMethods(model: Model): string[] {
  if (model === 'ORDER' || model === 'PRODUCTION_DUE' || model === 'ASSET_INTERVAL')
    return ['CUSTOMER_PICKUP', 'NEXG_DELIVERY', 'MERCHANT_DELIVERY'];
  if (model === 'FIELD_VISIT') return ['CUSTOMER_LOCATION'];
  if (model === 'TRANSFER') return ['PASSENGER_TRANSFER'];
  if (model === 'FREIGHT') return ['FREIGHT'];
  if (model === 'LINKED_WINDOWS') return ['PICKUP_RETURN', 'CUSTOMER_DROPOFF', 'CUSTOMER_PICKUP'];
  if (model === 'ENTITLEMENT') return ['DIGITAL', 'MERCHANT_VENUE'];
  if (model === 'APPOINTMENT' || model === 'REQUEST_QUOTE') return ['MERCHANT_VENUE', 'DIGITAL'];
  return ['MERCHANT_VENUE', 'CUSTOMER_LOCATION'];
}
const activitySchema = z.object({
  id: z.string(),
  profileId: z.string(),
  name: z.string().min(1).max(100),
  model: z.enum([
    'ORDER',
    'APPOINTMENT',
    'FIELD_VISIT',
    'ASSET_INTERVAL',
    'TRANSFER',
    'SESSION_CAPACITY',
    'SPACE_RESERVATION',
    'TOUR',
    'PRODUCTION_DUE',
    'REQUEST_QUOTE',
    'LINKED_WINDOWS',
    'SERVICE_JOB',
    'ENTITLEMENT',
    'FREIGHT',
    'STORAGE',
  ]),
  methods: z.array(z.string()).min(1),
  locationIds: z.array(z.string()),
  coverage: z.string().max(2000),
  resourceCount: z.number().int().min(0),
  bookingEnabled: z.boolean(),
  driver: z.boolean(),
  source: z.enum(['NEXG', 'External']),
  sourceConfirmed: z.boolean().optional(),
  answers: z.record(z.unknown()),
  commitments: z.number().int().min(0),
  enabled: z.boolean(),
});
const locationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  type: z.enum(['physical', 'service_base', 'digital_operation']),
  address: z.string().max(1000),
  contact: z.string().max(100),
  activityIds: z.array(z.string()),
  published: z.boolean(),
  commitments: z.number().int().min(0),
  coverage: z.string().max(2000),
});
const memberSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum([
    'Owner',
    'Supervisor',
    'Service provider',
    'Location manager',
    'Viewer',
    'Operator',
    'Driver',
  ]),
  locationIds: z.array(z.string()),
  state: z.enum(['Active', 'Invitation pending', 'Removed']),
  resource: z.string(),
  activityId: z.string(),
});
const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.string(),
  optional: z.boolean(),
  current: z.enum(['Verified', 'Review pending', 'Needed', 'Expired']),
  version: z.number().int().min(0),
  replacement: z.enum(['None', 'Changes requested', 'Review pending']),
  reason: z.string(),
  filename: z.string(),
  size: z.number().min(0),
  expires: z.string(),
  note: z.string(),
  replacements: z
    .array(
      z.object({
        version: z.number().int().positive(),
        filename: z.string(),
        size: z.number().min(0),
        state: z.enum(['Changes requested', 'Review pending']),
        expires: z.string(),
        note: z.string(),
      }),
    )
    .optional(),
});
const reviewSchema = z.object({
  id: z.string(),
  name: z.string(),
  rating: z.number().int().min(1).max(5),
  locationId: z.string(),
  at: z.string(),
  text: z.string(),
  reply: z.string(),
  draft: z.string(),
  reported: z.boolean(),
});
export const businessSchema = z.object({
  schema: z.literal(1),
  accountStatus: z
    .enum(['Approved', 'Review pending', 'Changes requested', 'Paused'])
    .default('Approved'),
  revision: z.number().int().positive(),
  profileId: z.string(),
  profile: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(160),
    email: z.string().email(),
    contact: z.string().max(100),
    logo: z.string().max(3000000),
    cover: z.string().max(3000000),
  }),
  activities: z.array(activitySchema),
  locations: z.array(locationSchema),
  members: z.array(memberSchema),
  documents: z.array(documentSchema),
  reviews: z.array(reviewSchema),
  requests: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      text: z.string(),
      state: z.literal('Review pending'),
    }),
  ),
  history: z.array(z.object({ revision: z.number(), at: z.string(), action: z.string() })),
});
export type Business = z.infer<typeof businessSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Location = z.infer<typeof locationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type BusinessDocument = z.infer<typeof documentSchema>;
export type Review = z.infer<typeof reviewSchema>;
export function parseEditorDraft(section: string, value: unknown): unknown | null {
  const schema =
    section === 'activities'
      ? activitySchema.extend({ name: z.string() })
      : section === 'locations'
        ? locationSchema.extend({ name: z.string() })
        : section === 'team'
          ? memberSchema.extend({ name: z.string(), email: z.string() })
          : section === 'documents'
            ? documentSchema
            : null;
  if (!schema) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
export const category = (id: string) =>
  profiles.find((profile) => profile.id === id) ?? aviationProfiles.find((profile) => profile.id === id);

export function businessSpecialties(profileId: string) {
  return aviationProfiles.some((profile) => profile.id === profileId) ? aviationProfiles : profiles;
}
export function extendBusinessProfiles(extra: BusinessCategory[]): BusinessCategory[] {
  const all = [...profiles];
  for (const p of extra) {
    if (
      all.some((x) => x.id === p.id) ||
      !p.id ||
      !p.name ||
      !p.models.includes(p.defaultModel) ||
      p.models.some((m) => !modelLabels[m]) ||
      p.questions.some((id) => !fields[id])
    )
      throw new Error('Register a unique category with supported models and question IDs.');
    all.push(p);
  }
  return all;
}
export function activityIssues(a: Activity, business: Pick<Business, 'locations'>): string[] {
  const p = category(a.profileId);
  const issues: string[] = [];
  if (!p || !p.models.includes(a.model))
    issues.push('Select a supported activity for this specialty.');
  if (!a.name.trim()) issues.push('Name the activity.');
  if (!a.methods.length || a.methods.some((m) => !allowedMethods(a.model).includes(m)))
    issues.push('Choose a compatible fulfilment method.');
  if (a.locationIds.some((id) => !business.locations.some((l) => l.id === id)))
    issues.push('A selected location is no longer available.');
  if (
    a.methods.some((m) =>
      [
        'MERCHANT_VENUE',
        'CUSTOMER_PICKUP',
        'CUSTOMER_DROPOFF',
        'PASSENGER_TRANSFER',
        'FREIGHT',
      ].includes(m),
    ) &&
    !a.locationIds.some((id) =>
      business.locations.some((l) => l.id === id && l.type !== 'digital_operation'),
    )
  )
    issues.push('Choose a physical location or service base.');
  if (
    a.methods.some((m) =>
      ['CUSTOMER_LOCATION', 'MERCHANT_DELIVERY', 'PICKUP_RETURN', 'FREIGHT'].includes(m),
    ) &&
    !a.coverage.trim()
  )
    issues.push('Define your service area.');
  if (a.source === 'External' && !a.sourceConfirmed)
    issues.push('Connect this activity source in Settings before enabling it.');
  if (a.model === 'ASSET_INTERVAL' && a.driver && a.resourceCount === 0)
    issues.push('Link eligible vehicle and driver resources in Availability.');
  return issues;
}
export function validateBusiness(b: Business): string[] {
  const parsed = businessSchema.safeParse(b);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const issues: string[] = [];
  for (const list of [b.activities, b.locations, b.members, b.documents, b.reviews])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      issues.push('Record IDs must be unique.');
  if (!category(b.profileId)) issues.push('Unknown business specialty.');
  if (!b.members.some((m) => m.role === 'Owner' && m.state === 'Active'))
    issues.push('Keep at least one active owner.');
  for (const a of b.activities) {
    const p = category(a.profileId);
    if (!p || !p.models.includes(a.model))
      issues.push('An activity uses an unsupported specialty or model.');
    if (a.enabled) issues.push(...activityIssues(a, b));
  }
  for (const l of b.locations) {
    if (l.type !== 'digital_operation' && !l.address.trim())
      issues.push(`${l.name}: enter a location address.`);
    if (
      l.published &&
      !l.activityIds.some((id) => b.activities.some((a) => a.id === id && a.enabled))
    )
      issues.push(`${l.name}: assign a configured activity before publishing.`);
    if (l.activityIds.some((id) => !b.activities.some((a) => a.id === id)))
      issues.push('A location references an unknown activity.');
  }
  for (const m of b.members)
    if (m.locationIds.some((id) => !b.locations.some((l) => l.id === id)))
      issues.push('A member references an unknown location.');
  return [...new Set(issues)];
}
export function changeImpact(before: Business, after: Business): string[] {
  const notes: string[] = [];
  for (const old of before.activities) {
    const a = after.activities.find((x) => x.id === old.id);
    if ((!a || !a.enabled) && old.commitments > 0)
      notes.push(
        `${old.name} has ${old.commitments} existing commitments; preserve them and resolve future intake first.`,
      );
    if (a && JSON.stringify(a) !== JSON.stringify(old))
      notes.push(
        `${old.name}: future setup changes; existing work retains its agreed configuration.`,
      );
  }
  for (const old of before.locations) {
    const l = after.locations.find((x) => x.id === old.id);
    if ((!l || !l.published) && old.commitments > 0)
      notes.push(
        `${old.name} has ${old.commitments} existing commitments; closing requires an operational review.`,
      );
  }
  if (before.profile.name !== after.profile.name)
    notes.push(`Trading name: ${before.profile.name} → ${after.profile.name}.`);
  if (before.profile.email !== after.profile.email)
    notes.push(`Public email: ${before.profile.email} → ${after.profile.email}.`);
  if (before.profile.description !== after.profile.description)
    notes.push('The public description will be updated.');
  for (const media of ['logo', 'cover'] as const)
    if (before.profile[media] !== after.profile[media])
      notes.push(
        `${media === 'cover' ? 'Banner photo' : 'Brand logo'}: ${after.profile[media] ? 'added or replaced' : 'removed'}.`,
      );
  const locationNames = (ids: string[], b: Business) =>
    b.locations
      .filter((l) => ids.includes(l.id))
      .map((l) => l.name)
      .join(', ') || 'None';
  for (const a of after.activities) {
    const old = before.activities.find((x) => x.id === a.id);
    if (!old)
      notes.push(
        `Add ${a.name}: ${modelLabels[a.model]}, ${a.methods.map((m) => methodLabels[m]).join(', ')}. ${a.enabled ? 'Business setup enabled' : 'Draft only'}.`,
      );
    else if (
      JSON.stringify(old.methods) !== JSON.stringify(a.methods) ||
      old.enabled !== a.enabled ||
      old.coverage !== a.coverage
    )
      notes.push(
        `${a.name}: ${old.enabled ? 'enabled' : 'draft'} → ${a.enabled ? 'enabled' : 'draft'}; ${a.methods.map((m) => methodLabels[m]).join(', ')}; coverage ${a.coverage || 'not required or not configured'}.`,
      );
  }
  for (const l of after.locations) {
    const old = before.locations.find((x) => x.id === l.id);
    if (!old)
      notes.push(
        `Add ${l.name}: ${l.type.replaceAll('_', ' ')} · ${l.published ? 'published in preview' : 'draft'}.`,
      );
    else if (JSON.stringify(old) !== JSON.stringify(l))
      notes.push(
        `${l.name}: ${l.published ? 'published' : 'unpublished'}; activities ${
          after.activities
            .filter((a) => l.activityIds.includes(a.id))
            .map((a) => a.name)
            .join(', ') || 'none'
        }.`,
      );
  }
  for (const m of after.members) {
    const old = before.members.find((x) => x.id === m.id);
    if (!old)
      notes.push(
        `Invite ${m.name} as ${m.role}; location access: ${locationNames(m.locationIds, after)}. Invitation remains pending.`,
      );
    else if (JSON.stringify(old) !== JSON.stringify(m))
      notes.push(
        `${m.name}: role ${old.role} → ${m.role}; locations ${locationNames(old.locationIds, before)} → ${locationNames(m.locationIds, after)}; ${old.state} → ${m.state}.`,
      );
  }
  for (const r of after.reviews) {
    const old = before.reviews.find((x) => x.id === r.id);
    if (old && old.reply !== r.reply)
      notes.push(`Reply to ${r.name}: “${r.reply}” This posts only to the local sample.`);
    if (old && !old.reported && r.reported)
      notes.push(`Record a local report for the review from ${r.name}.`);
  }
  return notes.length
    ? notes
    : ['The proposed business configuration will be saved in this browser only.'];
}
export function blockingImpact(before: Business, after: Business): boolean {
  return (
    before.activities.some(
      (a) => a.commitments > 0 && !after.activities.some((x) => x.id === a.id && x.enabled),
    ) ||
    before.locations.some(
      (l) =>
        l.commitments > 0 &&
        l.published &&
        !after.locations.some((x) => x.id === l.id && x.published),
    )
  );
}

export function createActivity(
  p: BusinessCategory,
  model: Model = p.defaultModel,
  id = `activity-${p.id}`,
): Activity {
  return {
    id,
    profileId: p.id,
    name: p.name,
    model,
    methods: [allowedMethods(model)[0]!],
    locationIds: ['westlands'],
    coverage: '',
    resourceCount: 0,
    bookingEnabled: ['APPOINTMENT', 'SESSION_CAPACITY', 'SPACE_RESERVATION'].includes(model),
    driver: false,
    source: 'NEXG',
    sourceConfirmed: true,
    answers: {},
    commitments: 0,
    enabled: false,
  };
}
export function seedBusiness(profileId = 'haircare'): Business {
  const p = category(profileId);
  if (!p) throw new Error('Unsupported specialty.');
  const hybrid = profileId === 'haircare';
  const a = createActivity(p);
  a.name = hybrid ? 'Salon services' : p.name;
  a.enabled = true;
  a.resourceCount = 2;
  a.commitments = 2;
  if (
    a.methods.some((m) =>
      ['CUSTOMER_LOCATION', 'MERCHANT_DELIVERY', 'PICKUP_RETURN', 'FREIGHT'].includes(m),
    )
  )
    a.coverage = 'Nairobi service area';
  const product = createActivity(category('cosmetics_stores')!, 'ORDER', 'beauty-products');
  product.name = 'Beauty product sales';
  product.enabled = true;
  product.locationIds = ['westlands', 'kilimani'];
  const visit = createActivity(p, 'FIELD_VISIT', 'home-visits');
  visit.name = 'Home visits';
  visit.methods = ['CUSTOMER_LOCATION'];
  visit.resourceCount = 2;
  const activities = hybrid ? [a, product, visit] : [a];
  const digital = a.methods.every((m) => m === 'DIGITAL');
  const placeName =
    a.model === 'FREIGHT'
      ? 'Westlands depot'
      : a.model === 'STORAGE'
        ? 'Westlands warehouse'
        : a.model === 'ASSET_INTERVAL'
          ? 'Westlands rental branch'
          : a.model === 'SERVICE_JOB'
            ? 'Westlands workshop'
            : 'Westlands';
  const hasProviders = ['APPOINTMENT', 'FIELD_VISIT', 'SESSION_CAPACITY', 'TOUR'].includes(a.model);
  const staffRole: Member['role'] = hasProviders
    ? 'Service provider'
    : a.model === 'TRANSFER'
      ? 'Driver'
      : 'Operator';
  const locations: Location[] = [
    {
      id: 'westlands',
      name: hybrid ? 'Westlands studio' : digital ? 'Online operation' : placeName,
      type: digital
        ? 'digital_operation'
        : a.methods.includes('CUSTOMER_LOCATION') || a.model === 'FREIGHT'
          ? 'service_base'
          : 'physical',
      address: digital ? '' : 'Westlands, Nairobi',
      contact: 'Phone ending 0482',
      activityIds: hybrid ? [a.id, product.id] : [a.id],
      published: true,
      commitments: 2,
      coverage: '',
    },
  ];
  if (hybrid)
    locations.push({
      id: 'kilimani',
      name: 'Kilimani shop',
      type: 'physical',
      address: 'Kilimani, Nairobi',
      contact: 'Phone ending 0482',
      activityIds: [product.id],
      published: true,
      commitments: 0,
      coverage: '',
    });
  return {
    schema: 1,
    accountStatus: 'Approved',
    revision: 12,
    profileId,
    profile: {
      name: hybrid ? 'Nairobi Collective' : `${p.name} Collective`,
      description: hybrid
        ? 'Salon services and beauty essentials in Nairobi.'
        : `${p.name} services and offerings in Nairobi.`,
      email: 'hello@nairobicollective.example',
      contact: 'Phone ending 0482',
      logo: '',
      cover: hybrid ? '/images/business/salon-preview.png' : '',
    },
    activities,
    locations,
    members: [
      {
        id: 'owner',
        name: 'Nadia K.',
        email: 'nadia@example.test',
        role: 'Owner',
        locationIds: locations.map((l) => l.id),
        state: 'Active',
        resource: '',
        activityId: '',
      },
      {
        id: 'maya',
        name: 'Maya O.',
        email: 'maya@example.test',
        role: 'Supervisor',
        locationIds: ['westlands'],
        state: 'Active',
        resource: hasProviders ? 'Maya · Provider 01' : '',
        activityId: a.id,
      },
      {
        id: 'aisha',
        name: 'Aisha N.',
        email: 'aisha@example.test',
        role: staffRole,
        locationIds: ['westlands'],
        state: 'Active',
        resource: hasProviders ? 'Aisha · Provider 02' : '',
        activityId: a.id,
      },
      ...(hybrid
        ? [
            {
              id: 'john',
              name: 'John K.',
              email: 'john@example.test',
              role: 'Location manager' as const,
              locationIds: ['kilimani'],
              state: 'Invitation pending' as const,
              resource: '',
              activityId: '',
            },
          ]
        : []),
    ],
    documents: [
      {
        id: 'registration',
        name: 'Business registration',
        scope: 'Business',
        optional: false,
        current: 'Verified',
        version: 1,
        replacement: 'None',
        reason: '',
        filename: 'business-registration.pdf',
        size: 420000,
        expires: '',
        note: '',
      },
      {
        id: 'address',
        name: 'Location address evidence',
        scope: locations[0]!.name,
        optional: false,
        current: 'Verified',
        version: 1,
        replacement: 'Changes requested',
        reason: 'Replacement image is unreadable. Upload a clearer copy.',
        filename: 'address-proof.jpg',
        size: 1200000,
        expires: '',
        note: '',
      },
      ...(hybrid
        ? [
            {
              id: 'claim',
              name: 'Professional claim evidence',
              scope: 'Salon services',
              optional: true,
              current: 'Review pending' as const,
              version: 1,
              replacement: 'None' as const,
              reason: 'Supports your declared professional claim.',
              filename: 'claim-evidence.pdf',
              size: 240000,
              expires: '',
              note: '',
            },
          ]
        : []),
    ],
    reviews: [
      'Amina K.',
      'Daniel M.',
      'Grace N.',
      'Peter O.',
      'Esther M.',
      'Brian O.',
      'Mary W.',
      'Hassan M.',
    ].map((name, i) => ({
      id: `review-${i}`,
      name,
      rating: i === 2 || i === 6 ? 4 : 5,
      locationId: hybrid && i % 2 === 1 ? 'kilimani' : 'westlands',
      at: `2026-10-${30 - i}`,
      text:
        i === 0
          ? 'Easy booking and friendly team. My service started on time.'
          : 'Helpful service and a straightforward experience.',
      reply: i % 2 === 1 ? 'Thank you for sharing your experience.' : '',
      draft: i === 0 ? 'Thank you, Amina. We are glad you enjoyed your visit.' : '',
      reported: false,
    })),
    requests: [],
    history: [],
  };
}
