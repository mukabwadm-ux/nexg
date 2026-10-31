import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Payload } from 'payload';
import { checkAvailability } from 'payload-reserve';
import {
  normalizeBookingAnswers,
  validateReservationFeePolicy,
  getApplicableBookingQuestions,
  getBookingProfile,
  listBookingProfiles,
  resolveBookingConfiguration,
} from '@nexg/booking-config';
import { parseBookingInstant } from './time.js';
import { calculateBookingPrice } from './pricing.js';
import { specialistPublicDescriptor } from '@nexg/booking-config/specialists';
import {
  specialistSetup,
  specialistResourceIds,
  validateSpecialistInventory,
  prepareSpecialistPlan,
  specialistBookingView,
  changeSpecialistWork,
} from './specialist-runtime.js';
import { requireManager } from './auth.js';
import {
  BookingError,
  type BookingInput,
  type Identity,
  type OfferingInput,
  type ResourceInput,
} from './types.js';

type Doc = Record<string, any>;
const EAT = 3 * 60 * 60 * 1000;
const CAPTURE_ONLY = new Set([
  'LINKED_WINDOWS',
  'TOUR',
  'ENTITLEMENT',
  'PRODUCTION_DUE',
  'FREIGHT',
  'SERVICE_JOB',
]);
const NON_BLOCKING = new Set([
  'LINKED_WINDOWS',
  'TOUR',
  'ORDER',
  'REQUEST_QUOTE',
  'ENTITLEMENT',
  'PRODUCTION_DUE',
  'SERVICE_JOB',
  'FREIGHT',
]);
const FLEXIBLE = new Set(['ASSET_INTERVAL', 'STORAGE', 'TOUR', 'LINKED_WINDOWS', 'FREIGHT']);
const CUSTODY_MODELS = new Set(['ASSET_INTERVAL', 'STORAGE', 'SPACE_RESERVATION']);
const KINDS = new Set(['staff', 'asset', 'vehicle', 'room', 'space', 'equipment', 'capacity_pool']);
const BLOCKING = new Set(['held', 'confirmed']);
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const publicId = () => {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6]! & 15) | 0x70;
  b[8] = (b[8]! & 63) | 0x80;
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
function canonicalJson(value: any): any {
  if (Array.isArray(value))
    return value.map((entry) => (entry === undefined ? null : canonicalJson(entry)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalJson(value[key])]),
    );
  return value;
}
const stable = (value: any): string => JSON.stringify(canonicalJson(value));
function text(v: unknown, name: string, max = 200): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new BookingError(
      422,
      `${name} is required and must be at most ${max} characters.`,
      'invalid_input',
    );
  return v.trim();
}
function integer(v: unknown, name: string, min = 0, max = 1e9): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new BookingError(
      422,
      `${name} must be a whole number between ${min} and ${max}.`,
      'invalid_input',
    );
  return v;
}
const instant = parseBookingInstant;
function minutes(v: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
    throw new BookingError(422, 'Hours must use HH:mm.', 'invalid_schedule');
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
}
function normalizeId(id: any): string {
  return String(typeof id === 'object' ? id?.id : id);
}
function scope(identity: Identity) {
  return { nexgBusinessId: identity.businessId, nexgActorId: identity.userId };
}
function location(identity: Identity, input?: string) {
  const id = input ?? (identity.branches?.length === 1 ? identity.branches[0]! : 'primary');
  if (identity.branches && !identity.branches.includes(id))
    throw new BookingError(403, 'This location is outside your access.', 'forbidden');
  return id;
}
function assertBranch(identity: Identity, doc: Doc) {
  if (identity.branches && !identity.branches.includes(doc.nexg?.locationId ?? 'primary'))
    throw new BookingError(403, 'This location is outside your access.', 'forbidden');
}
function allowedInBranch(identity: Identity, doc: Doc) {
  return !identity.branches || identity.branches.includes(doc.nexg?.locationId ?? 'primary');
}

/** SQLite admits one writer; queue the entire command, then let Payload's real
 * transaction and resource-lock hooks enforce allocation. PostgreSQL relies on
 * those database locks and may process unrelated transactions concurrently. */
export class BookingEngine {
  private writer: Promise<unknown> = Promise.resolve();
  constructor(
    public payload: Payload,
    private sqlite = true,
    private clock = () => Date.now(),
  ) {}
  managementContext() {
    return {
      all: this.all.bind(this),
      own: this.own.bind(this),
      update: this.update.bind(this),
      create: this.create.bind(this),
      command: this.command.bind(this),
      audit: this.audit.bind(this),
      request: this.request.bind(this),
      now: this.clock,
    };
  }
  specialistContext() {
    return {
      ...this.managementContext(),
      publicId,
      business: this.business.bind(this),
      allocate: this.allocate.bind(this),
      selectedResources: this.selectedResources.bind(this),
      assertReady: this.assertReady.bind(this),
      validateCapacity: this.validateCapacity.bind(this),
      references: this.references.bind(this),
      window: this.window.bind(this),
      validateBookingDetails: this.validateBookingDetails.bind(this),
      price: this.price.bind(this),
      sourceConfirmationRequired: this.sourceConfirmationRequired.bind(this),
      externalOwnership: this.externalOwnership.bind(this),
    };
  }
  private request(identity: Identity, transactionID?: any): any {
    return { payload: this.payload, context: scope(identity), transactionID };
  }
  private async all(collection: string, identity: Identity, req?: any): Promise<Doc[]> {
    const docs: Doc[] = [];
    let page = 1;
    for (;;) {
      const r = await this.payload.find({
        collection: collection as any,
        where: { businessId: { equals: identity.businessId } },
        limit: 1000,
        page,
        depth: 0,
        overrideAccess: false,
        req: req ?? this.request(identity),
      } as any);
      docs.push(...r.docs);
      if (!r.hasNextPage) break;
      page++;
    }
    return docs;
  }
  private async own(collection: string, id: string, identity: Identity, req?: any): Promise<Doc> {
    const r = await this.payload.find({
      collection: collection as any,
      where: {
        and: [{ businessId: { equals: identity.businessId } }, { publicId: { equals: id } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      req: req ?? this.request(identity),
    } as any);
    const d = r.docs[0] as Doc | undefined;
    if (!d) throw new BookingError(404, 'This record was not found.', 'not_found');
    assertBranch(identity, d);
    return d;
  }
  private async create(collection: string, data: Doc, identity: Identity, req: any): Promise<Doc> {
    return (await this.payload.create({
      collection: collection as any,
      data: { ...data, businessId: identity.businessId },
      context: {
        ...req.context,
        allowConfirmedOnCreate: collection === 'reservations' && data.status === 'confirmed',
      },
      overrideAccess: false,
      depth: 0,
      req,
    } as any)) as Doc;
  }
  private async update(
    collection: string,
    id: any,
    data: Doc,
    identity: Identity,
    req: any,
  ): Promise<Doc> {
    return (await this.payload.update({
      collection: collection as any,
      id,
      data: { ...data, businessId: identity.businessId },
      overrideAccess: false,
      depth: 0,
      req,
    } as any)) as Doc;
  }
  private async transaction<T>(identity: Identity, fn: (req: any) => Promise<T>): Promise<T> {
    const run = async () => {
      const tx = await this.payload.db.beginTransaction();
      if (tx === null)
        throw new BookingError(
          503,
          'Reservation storage is not transaction-safe.',
          'transactions_required',
        );
      const req = this.request(identity, tx);
      try {
        if (!this.sqlite) {
          const businesses = await this.all('businesses', identity, req);
          if (businesses[0])
            await this.update(
              'businesses',
              businesses[0].id,
              { bookingLock: publicId() },
              identity,
              req,
            );
        }
        const result = await fn(req);
        await this.payload.db.commitTransaction(tx);
        return result;
      } catch (e) {
        await this.payload.db.rollbackTransaction(tx);
        throw e;
      }
    };
    if (!this.sqlite) return run();
    const result = this.writer.then(run, run);
    this.writer = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async command<T>(
    identity: Identity,
    key: string | undefined,
    operation: string,
    body: unknown,
    fn: (req: any) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 200)
      throw new BookingError(400, 'An Idempotency-Key is required.', 'idempotency_required');
    const operationKey = hash(
        `${identity.businessId}:${identity.userId}:${identity.role}:${stable(identity.branches ? [...identity.branches].sort() : null)}:${operation}:${key}`,
      ),
      requestHash = hash(stable(body));
    return this.transaction(identity, async (req) => {
      const found = await this.payload.find({
        collection: 'booking-operations',
        where: {
          and: [
            { businessId: { equals: identity.businessId } },
            { operationKey: { equals: operationKey } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: false,
        req,
      } as any);
      const existing = found.docs[0] as Doc | undefined;
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new BookingError(
            409,
            'This operation key was already used for different details.',
            'idempotency_conflict',
          );
        return existing.result as T;
      }
      const result = await fn(req);
      await this.create('booking-operations', { operationKey, requestHash, result }, identity, req);
      return result;
    });
  }
  private async audit(
    identity: Identity,
    req: any,
    operation: string,
    recordId: string,
    detail: Doc = {},
  ) {
    await this.create(
      'booking-audit',
      { actorId: identity.userId, operation, recordId, detail },
      identity,
      req,
    );
    await this.create(
      'booking-outbox',
      {
        eventKey: publicId(),
        eventType: operation,
        payload: { businessId: identity.businessId, recordId, ...detail },
        state: 'pending',
        attempts: 0,
      },
      identity,
      req,
    );
  }
  async business(identity: Identity, req?: any): Promise<Doc> {
    const found = (await this.all('businesses', identity, req))[0];
    if (found) return found;
    if (!req) return this.transaction(identity, (r) => this.business(identity, r));
    const initial = {
      subcategoryId:
        identity.subcategoryId && getBookingProfile(identity.subcategoryId)
          ? identity.subcategoryId
          : '',
      answers: identity.answers ?? {},
      operationalAnswers: {},
      bookingSetup: {},
      canonicalAnswers: {},
      published: false,
      revision: 1,
    };
    return this.create(
      'businesses',
      {
        businessKey: identity.businessId,
        name: identity.businessName ?? 'Your business',
        configuration: initial,
      },
      identity,
      req,
    );
  }
  async profiles() {
    return { profiles: listBookingProfiles() };
  }
  async questions(identity: Identity, subcategoryId: string, offeringModel?: string) {
    const b = await this.business(identity);
    return {
      questions: getApplicableBookingQuestions({
        ...b.configuration,
        subcategoryId,
        offeringModel,
      } as any),
    };
  }
  async bootstrap(identity: Identity, input: Doc) {
    requireManager(identity);
    return this.transaction(identity, async (req) => {
      const existing = (await this.all('businesses', identity, req))[0];
      if (
        existing?.configuration?.bootstrapped === true ||
        (existing && existing.configuration?.revision > 1)
      )
        return { configured: true };
      const b = existing ?? (await this.business(identity, req));
      const subcategoryId =
        input.subcategoryId && getBookingProfile(input.subcategoryId)
          ? input.subcategoryId
          : (b.configuration?.subcategoryId ?? '');
      await this.update(
        'businesses',
        b.id,
        {
          name:
            typeof input.businessName === 'string'
              ? text(input.businessName, 'Business name')
              : b.name,
          configuration: {
            ...b.configuration,
            subcategoryId,
            answers: input.answers ?? {},
            bootstrapped: true,
            published: false,
          },
        },
        identity,
        req,
      );
      return { configured: true };
    });
  }
  async workspace(identity: Identity) {
    requireManager(identity);
    await this.expireHolds(identity);
    const business = await this.business(identity);
    const [offerings, resources, reservations, requests] = await Promise.all(
      ['services', 'resources', 'reservations', 'booking-requests'].map((c) =>
        this.all(c, identity),
      ),
    );
    const occurrences = (await this.all('booking-sessions', identity)).filter(
      (o) =>
        o.published === true &&
        (!identity.branches || identity.branches.includes(o.locationId ?? 'primary')),
    );
    const config = business.configuration ?? {};
    let resolved: any = null;
    try {
      if (config.subcategoryId)
        resolved = resolveBookingConfiguration({
          ...config,
          subcategoryId: config.subcategoryId,
        } as any);
    } catch {}
    return {
      occurrences: occurrences.map((o) => this.occurrenceView(o)),
      business: { id: identity.businessId, name: business.name, timezone: 'Africa/Nairobi' },
      configuration: { ...config, resolved },
      profiles: listBookingProfiles(),
      offerings: offerings
        .filter((d) => allowedInBranch(identity, d))
        .map((d) => ({
          ...this.offeringView(d, config),
          readiness: this.readiness(
            config,
            d,
            resources.filter((r) => (d.nexg.resourceIds ?? []).includes(r.publicId)),
          ),
        })),
      resources: resources
        .filter((d) => allowedInBranch(identity, d))
        .map((d) => this.resourceView(d)),
      bookings: [
        ...reservations.filter(
          (d) => !['session_allocation', 'specialist_allocation'].includes(d.nexg?.recordRole),
        ),
        ...requests,
      ]
        .filter((d) => allowedInBranch(identity, d))
        .map((d) => this.bookingView(d)),
      google: { connected: false, optional: true, state: 'not_connected' },
    };
  }
  async configure(identity: Identity, input: Doc, key?: string) {
    requireManager(identity);
    if (identity.branches)
      throw new BookingError(
        403,
        'Only a business owner can change business-wide setup.',
        'forbidden',
      );
    if (!getBookingProfile(input.subcategoryId))
      throw new BookingError(422, 'Choose a supported business specialty.', 'invalid_specialty');
    return this.command(identity, key, 'configure', input, async (req) => {
      const b = await this.business(identity, req);
      if (
        input.expectedVersion !== undefined &&
        input.expectedVersion !== (b.configuration?.revision ?? 1)
      )
        throw new BookingError(409, 'Setup changed. Refresh before saving.', 'version_conflict');
      const configuration = {
        subcategoryId: input.subcategoryId,
        answers: input.answers ?? {},
        operationalAnswers: input.operationalAnswers ?? {},
        bookingSetup: input.bookingSetup ?? {},
        canonicalAnswers: input.canonicalAnswers ?? {},
        published: input.published === true,
        revision: (b.configuration?.revision ?? 1) + 1,
      };
      const result = await this.update(
        'businesses',
        b.id,
        {
          name: input.businessName ? text(input.businessName, 'Business name') : b.name,
          configuration,
        },
        identity,
        req,
      );
      await this.audit(identity, req, 'booking.configuration.updated', identity.businessId, {
        revision: configuration.revision,
      });
      return { ...configuration, businessName: result.name };
    });
  }
  resourceView(d: Doc) {
    return {
      ...d.nexg,
      id: d.publicId,
      name: d.name,
      kind: d.resourceType,
      quantity: d.quantity,
      capacityMode: d.capacityMode,
      active: d.active,
    };
  }
  offeringView(d: Doc, configuration?: Doc) {
    return {
      ...d.nexg,
      id: d.publicId,
      name: d.name,
      description: d.description,
      durationMinutes:
        d.nexg?.durationMinutes === null ? null : (d.nexg?.durationMinutes ?? d.duration),
      active: d.active,
      pricingBasis: d.nexg?.pricingBasis ?? 'per_booking',
      specialist: d.nexg?.specialistSetup
        ? specialistPublicDescriptor(d.nexg.specialistSetup)
        : undefined,
      executionMode:
        configuration && this.sourceConfirmationRequired(configuration)
          ? 'request_capture'
          : d.nexg?.specialistSetup
            ? 'native_workflow'
            : CAPTURE_ONLY.has(d.nexg?.model)
              ? 'request_capture'
              : NON_BLOCKING.has(d.nexg?.model)
                ? 'work_request'
                : 'native_reservation',
    };
  }
  private publicOfferingView(d: Doc, configuration: Doc, occurrences: Doc[] = []) {
    const n = d.nexg ?? {};
    const string = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const boolean = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
    const fee = n.reservationFee;
    return {
      id: d.publicId,
      name: string(d.name),
      description: string(d.description),
      active: d.active !== false,
      model: string(n.model),
      executionMode: this.sourceConfirmationRequired(configuration)
        ? 'request_capture'
        : n.specialistSetup
          ? 'native_workflow'
          : CAPTURE_ONLY.has(n.model)
            ? 'request_capture'
            : NON_BLOCKING.has(n.model)
              ? 'work_request'
              : 'native_reservation',
      specialist: n.specialistSetup
        ? specialistPublicDescriptor(
            n.specialistSetup,
            occurrences
              .filter((o) => o.offeringId === d.publicId && o.published === true)
              .map((o) => ({
                id: o.publicId,
                startTime: o.startTime,
                endTime: o.endTime,
                capacity: o.capacity,
                resourceIds: o.resourceIds,
              })),
          )
        : undefined,
      priceMinor: number(n.priceMinor),
      currency: 'KES',
      pricingBasis: string(n.pricingBasis) ?? 'per_booking',
      durationMinutes: n.durationMinutes === null ? null : number(n.durationMinutes ?? d.duration),
      minDurationMinutes: number(n.minDurationMinutes),
      maxDurationMinutes: number(n.maxDurationMinutes),
      durationUnitMinutes: number(n.durationUnitMinutes),
      minimumBillableUnits: number(n.minimumBillableUnits),
      quantityScale: number(n.quantityScale) ?? 0,
      capacity: number(n.capacity),
      capacityUnit: string(n.capacityUnit),
      intakeMode: string(n.intakeMode),
      method: string(n.method),
      resourceSelectionMode: string(n.resourceSelectionMode),
      transportIncluded: boolean(n.transportIncluded),
      withDriver: boolean(n.withDriver),
      reservationFee:
        fee && typeof fee === 'object'
          ? {
              mode: string(fee.mode),
              amountMinor: number(fee.amountMinor),
              percentageBps: number(fee.percentageBps),
              treatment: string(fee.treatment),
              requiredBeforeConfirmation: boolean(fee.requiredBeforeConfirmation),
              refundTerms: string(fee.refundTerms),
            }
          : undefined,
      serviceArea: Array.isArray(n.serviceArea?.areas)
        ? { areas: n.serviceArea.areas.filter((area: unknown) => typeof area === 'string') }
        : undefined,
    };
  }
  bookingView(d: Doc) {
    const n = d.nexg ?? {};
    const {
      customerTokenHash: _,
      acceptedConfiguration: _acceptedConfiguration,
      specialistState: _specialistState,
      specialistAllocations: _specialistAllocations,
      entitlementRedemptions: _entitlementRedemptions,
      entitlementValidity: _entitlementValidity,
      entitlementOccurrenceKey: _entitlementOccurrenceKey,
      ...safe
    } = n;
    return {
      ...safe,
      specialist: specialistBookingView(n),
      id: d.publicId,
      occupancyOverdue: n.custodyState === 'in_use' && Date.parse(n.endTime) <= this.clock(),
      status: d.status ?? n.status,
      startTime: d.startTime ?? n.startTime,
      endTime: d.endTime ?? n.endTime,
      quantity: n.quantity ?? d.guestCount,
      version: n.version ?? 1,
    };
  }
  async validateOccurrence(
    identity: Identity,
    service: Doc,
    resources: Doc[],
    start: number,
    end: number,
    req: any,
  ) {
    await this.assertReady(identity, service, resources, req);
    await this.assertNoOverdueCustody(identity, resources, req);
    for (const resource of resources)
      if (!this.scheduleAllows(service, resource, start, end))
        throw new BookingError(
          409,
          'An occurrence resource is outside working hours.',
          'outside_schedule',
        );
  }
  async addResource(identity: Identity, input: ResourceInput, key?: string) {
    requireManager(identity);
    const name = text(input.name, 'Resource name');
    if (!KINDS.has(input.kind))
      throw new BookingError(422, 'Choose a supported resource kind.', 'invalid_resource');
    const count = integer(input.quantity, 'Capacity', 1);
    const s = input.schedule;
    if (
      !s ||
      !Array.isArray(s.days) ||
      !s.days.length ||
      s.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    )
      throw new BookingError(422, 'Choose the available weekdays.', 'invalid_schedule');
    minutes(s.start);
    minutes(s.end);
    if (s.start === s.end)
      throw new BookingError(422, 'Start and end hours must differ.', 'invalid_schedule');
    const locationId = location(identity, input.locationId);
    const exclusive = ['asset', 'vehicle', 'space'].includes(input.kind);
    return this.command(identity, key, 'resource.create', input, async (req) => {
      const id = publicId();
      const resource = await this.create(
        'resources',
        {
          publicId: id,
          name,
          resourceType: input.kind,
          quantity: exclusive ? 1 : count,
          capacityMode: exclusive
            ? 'per-reservation'
            : (input.capacityMode ??
              (input.kind === 'capacity_pool' ? 'per-guest' : 'per-reservation')),
          active: input.active !== false,
          services: [],
          nexg: {
            version: 1,
            locationId,
            schedule: s,
            capacityUnit: input.capacityUnit ?? (exclusive ? 'asset' : 'place'),
            quantityScale: integer(input.quantityScale ?? 0, 'Quantity scale', 0, 6),
            partyCapacity:
              input.partyCapacity ??
              (input.kind === 'space' || input.kind === 'vehicle' ? count : undefined),
          },
        },
        identity,
        req,
      );
      const recurringSlots = s.days
        .map((day) => ({ day: DAYS[day], startTime: s.start, endTime: s.end }))
        .filter((x) => x.endTime > x.startTime);
      if (recurringSlots.length)
        await this.create(
          'schedules',
          {
            name: `${name} hours`,
            resource: resource.id,
            scheduleType: 'recurring',
            recurringSlots,
            active: true,
          },
          identity,
          req,
        );
      await this.audit(identity, req, 'booking.resource.created', id);
      return this.resourceView(resource);
    });
  }
  async addOffering(identity: Identity, input: OfferingInput, key?: string) {
    requireManager(identity);
    const name = text(input.name, 'Offering name');
    const profile = await this.business(identity);
    if (!profile.configuration?.subcategoryId)
      throw new BookingError(422, 'Choose your business specialty first.', 'setup_required');
    const validModels = [
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
    ];
    if (!validModels.includes(input.model))
      throw new BookingError(422, 'Choose a supported offering model.', 'invalid_model');
    const duration =
      NON_BLOCKING.has(input.model) && input.durationMinutes === undefined
        ? 1
        : integer(input.durationMinutes, 'Duration', 1, 60 * 24 * 366);
    integer(input.priceMinor, 'Price');
    if (input.currency !== 'KES')
      throw new BookingError(422, 'Native offering prices use KES.', 'invalid_currency');
    if (
      !['per_booking', 'per_quantity', 'per_duration', 'per_night', 'indicative'].includes(
        input.pricingBasis ?? 'per_booking',
      )
    )
      throw new BookingError(422, 'Choose a supported pricing basis.', 'invalid_price');
    if (input.pricingBasis === 'per_duration')
      integer(input.durationUnitMinutes, 'Billing duration unit', 1, 527040);
    if (input.minimumBillableUnits !== undefined)
      integer(input.minimumBillableUnits, 'Minimum billable units', 1);
    const feeIssues = validateReservationFeePolicy(
      input.reservationFee ?? {
        mode: 'no_fee',
        treatment: 'credited_to_total',
        requiredBeforeConfirmation: false,
        refundTerms: 'No reservation fee.',
      },
      input.paymentPolicyId,
    );
    if (feeIssues.length)
      throw new BookingError(422, feeIssues.map((x: any) => x.message).join(' '), 'invalid_fee');
    if (input.reservationFee) {
      const f = input.reservationFee;
      if (
        !['no_fee', 'fixed', 'percentage'].includes(f.mode) ||
        !['applied_in_addition', 'credited_to_total'].includes(f.treatment)
      )
        throw new BookingError(422, 'Choose valid reservation fee terms.', 'invalid_fee');
      if (f.mode === 'fixed') integer(f.amountMinor, 'Reservation fee', 0);
      if (f.mode === 'percentage')
        integer(f.percentageBps, 'Reservation fee basis points', 0, 10000);
      if (f.mode !== 'no_fee') text(f.refundTerms, 'Reservation fee refund terms', 2000);
      if (
        f.requiredBeforeConfirmation &&
        f.mode !== 'no_fee' &&
        input.paymentPolicyId !== 'MANUAL_COLLECTION_V1'
      )
        throw new BookingError(
          422,
          'Fee collection requires the explicit manual collection policy until an authoritative payment provider is configured.',
          'payment_policy_required',
        );
    }
    if (
      input.requiresPayment === true &&
      !(input.reservationFee?.requiredBeforeConfirmation && input.reservationFee.mode !== 'no_fee')
    )
      throw new BookingError(
        422,
        'Required collection needs an exact approved reservation-fee obligation.',
        'payment_obligation_required',
      );
    if (input.pricingBasis === 'indicative' && !NON_BLOCKING.has(input.model))
      throw new BookingError(
        422,
        'Indicative prices are for requests pending scope approval.',
        'invalid_price',
      );
    const locationId = location(identity, input.locationId);
    const normalizedSpecialist = specialistSetup(
      input.model,
      input.specialistSetup,
      normalizeBookingAnswers(profile.configuration).answers,
    );
    const ids = [
      ...new Set([
        ...(input.resourceIds ?? []),
        ...(normalizedSpecialist ? specialistResourceIds(normalizedSpecialist) : []),
      ]),
    ];
    if (!NON_BLOCKING.has(input.model) && !ids.length)
      throw new BookingError(
        422,
        'Add the actual resources needed by this offering.',
        'resources_required',
      );
    return this.command(identity, key, 'offering.create', input, async (req) => {
      const resources = await Promise.all(
        ids.map((id) => this.own('resources', id, identity, req)),
      );
      if (resources.some((r) => r.active === false))
        throw new BookingError(422, 'An assigned resource is inactive.', 'inactive_resource');
      if (normalizedSpecialist) {
        validateSpecialistInventory(normalizedSpecialist, resources);
        if (normalizedSpecialist.model === 'ENTITLEMENT')
          for (const targetId of normalizedSpecialist.scopeOfferingIds)
            await this.own('services', targetId, identity, req);
      }
      const id = publicId();
      const n = {
        ...input,
        specialistSetup: normalizedSpecialist,
        capacity:
          normalizedSpecialist?.model === 'TOUR'
            ? normalizedSpecialist.maximumParticipants
            : input.capacity,
        capacityUnit: normalizedSpecialist?.model === 'TOUR' ? 'place' : input.capacityUnit,
        version: 1,
        durationMinutes:
          NON_BLOCKING.has(input.model) && input.durationMinutes === undefined ? null : duration,
        resourceIds: ids,
        locationId,
        priceMinor: input.priceMinor,
        currency: 'KES',
        configurationRevision: profile.configuration.revision,
        bookingEnabled: input.bookingEnabled !== false,
      };
      const service = await this.create(
        'services',
        {
          publicId: id,
          name,
          description: input.description ?? '',
          duration: normalizedSpecialist ? 1 : duration,
          durationType: normalizedSpecialist || FLEXIBLE.has(input.model) ? 'flexible' : 'fixed',
          bufferTimeBefore: integer(
            (input.bufferBeforeMinutes ?? 0) +
              (input.model === 'FIELD_VISIT' ||
              (input.model === 'TRANSFER' && input.transportIncluded !== false)
                ? integer(input.travelMinutes, 'Travel buffer', 0, 720)
                : 0),
            'Setup buffer',
            0,
            1439,
          ),
          bufferTimeAfter: integer(
            Math.max(
              (input.bufferAfterMinutes ?? 0) +
                (input.model === 'FIELD_VISIT' ||
                (input.model === 'TRANSFER' && input.transportIncluded !== false)
                  ? integer(input.travelMinutes, 'Travel buffer', 0, 720)
                  : 0),
              input.model === 'SPACE_RESERVATION'
                ? ((normalizeBookingAnswers(profile.configuration).answers.BQ_SPACE_POLICY as any)
                    ?.turnover_minutes ?? 0)
                : 0,
            ),
            'Turnaround buffer',
            0,
            1439,
          ),
          active: input.active !== false,
          nexg: n,
        },
        identity,
        req,
      );
      for (const resource of resources)
        await this.update(
          'resources',
          resource.id,
          {
            services: [
              ...new Set([
                ...(resource.services ?? []).map((v: any) => (typeof v === 'object' ? v.id : v)),
                service.id,
              ]),
            ],
          },
          identity,
          req,
        );
      await this.audit(identity, req, 'booking.offering.created', id);
      return this.offeringView(service);
    });
  }
  private validateBookingDetails(service: Doc, input: BookingInput) {
    const n = service.nexg;
    if (n.model === 'FIELD_VISIT') {
      if (!input.customerLocation || !n.serviceArea?.areas?.includes(input.customerLocation.area))
        throw new BookingError(
          422,
          'Select a supported customer service area.',
          'outside_service_area',
        );
      text(input.customerLocation.address, 'Customer service address', 500);
    }
    if (n.model === 'TRANSFER') {
      const trip = input.trip;
      if (!trip || !n.serviceArea?.areas?.includes(trip.pickupArea))
        throw new BookingError(
          422,
          'Select a supported pickup area and meeting point.',
          'trip_details_required',
        );
      text(trip.pickupAddress, 'Pickup meeting point', 500);
      if (n.transportIncluded !== false) {
        if (!n.serviceArea?.areas?.includes(trip.dropoffArea))
          throw new BookingError(422, 'Select a supported dropoff area.', 'outside_service_area');
        text(trip.dropoffAddress, 'Dropoff address', 500);
      }
    }
  }
  private price(service: Doc, start: number | null, end: number | null, quantity: number) {
    return calculateBookingPrice(service.nexg, start, end, quantity);
  }
  private requestPrice(
    service: Doc,
    start: number | null,
    end: number | null,
    quantity: number,
    captureOnly: boolean,
  ) {
    if (
      captureOnly &&
      (start === null || end === null) &&
      ['per_duration', 'per_night'].includes(service.nexg.pricingBasis)
    ) {
      return calculateBookingPrice(
        {
          ...service.nexg,
          pricingBasis: 'indicative',
          reservationFee: {
            mode: 'no_fee',
            treatment: 'credited_to_total',
            requiredBeforeConfirmation: false,
            refundTerms: 'No fee is payable before the scope and price are confirmed.',
          },
        },
        start,
        end,
        quantity,
      );
    }
    return this.price(service, start, end, quantity);
  }
  async quote(identity: Identity, input: Doc, publicOnly = false) {
    const service = await this.own('services', input.offeringId, identity);
    if (publicOnly) await this.assertPublished(identity, service);
    const b = await this.business(identity),
      captureOnly =
        this.sourceConfirmationRequired(b.configuration) || CAPTURE_ONLY.has(service.nexg.model);
    const specialistPlan =
      service.nexg.specialistSetup && !this.sourceConfirmationRequired(b.configuration)
        ? await prepareSpecialistPlan(this, identity, service, {
            ...input,
            customer: { name: 'Quote' },
          } as BookingInput)
        : undefined;
    const times =
      specialistPlan ??
      this.window(
        service,
        {
          ...input,
          offeringId: input.offeringId,
          customer: { name: 'Price quote' },
        },
        captureOnly,
      );
    const pricing = this.requestPrice(
      service,
      times.start,
      times.end,
      integer(input.quantity ?? 1, 'Quantity', 1),
      captureOnly,
    );
    const sourceRequired = this.sourceConfirmationRequired(b.configuration);
    return {
      ...pricing,
      binding: !sourceRequired && !pricing.indicative,
      sourceRequired,
      indicative: sourceRequired || pricing.indicative,
    };
  }
  private async entitlementChange(
    identity: Identity,
    n: Doc,
    times: { start: number | null; end: number | null },
    input: Doc,
    req?: any,
  ) {
    if (!n.entitlementId) return undefined;
    const parent = await this.own('booking-requests', n.entitlementId, identity, req);
    const validity = n.entitlementValidity ?? parent.nexg?.specialistState?.validity;
    if (
      !validity ||
      times.start === null ||
      times.end === null ||
      times.start < Date.parse(validity.starts) ||
      times.end > Date.parse(validity.ends)
    )
      throw new BookingError(
        422,
        'Keep the booking inside its accepted entitlement validity.',
        'entitlement_expired',
      );
    if (
      times.end - times.start !== Date.parse(n.endTime) - Date.parse(n.startTime) ||
      (input.quantity !== undefined && input.quantity !== n.quantity)
    )
      throw new BookingError(
        422,
        'Entitlement rescheduling retains the accepted duration and quantity.',
        'entitlement_usage_mismatch',
      );
    let occurrenceId = input.occurrenceId ?? n.occurrenceId ?? '';
    if (n.model === 'SESSION_CAPACITY') {
      const occurrence = (await this.all('booking-sessions', identity, req)).find(
        (row) =>
          row.published === true &&
          row.offeringId === n.offeringId &&
          Date.parse(row.startTime) === times.start &&
          Date.parse(row.endTime) === times.end &&
          (!input.occurrenceId || row.publicId === input.occurrenceId),
      );
      if (!occurrence)
        throw new BookingError(
          422,
          'Choose an actual published session.',
          'published_occurrence_required',
        );
      occurrenceId = occurrence.publicId;
    }
    const oldKey =
      n.entitlementOccurrenceKey ??
      n.entitlementDebit?.occurrenceKey ??
      [n.offeringId, Date.parse(n.startTime), Date.parse(n.endTime), n.occurrenceId ?? ''].join(
        ':',
      );
    const key = [n.offeringId, times.start, times.end, occurrenceId].join(':');
    if (key !== oldKey && parent.nexg.specialistState.usedOccurrenceKeys?.includes(key))
      throw new BookingError(
        409,
        'That entitlement occurrence is already redeemed.',
        'entitlement_duplicate_occurrence',
      );
    return { parent, validity, oldKey, key };
  }
  private async updateEntitlementChange(identity: Identity, result: Doc, change: any, req: any) {
    if (!change) return;
    const parent = change.parent,
      pn = parent.nexg,
      child = result.nexg;
    const state = {
      ...pn.specialistState,
      version: pn.specialistState.version + 1,
      usedOccurrenceKeys: (pn.specialistState.usedOccurrenceKeys ?? []).map((key: string) =>
        key === change.oldKey ? change.key : key,
      ),
      redemptions: (pn.specialistState.redemptions ?? []).map((entry: Doc) =>
        entry.occurrenceKey === change.oldKey ? { ...entry, occurrenceKey: change.key } : entry,
      ),
      history: [
        ...(pn.specialistState.history ?? []),
        { command: 'RescheduleEntitledBooking', at: new Date(this.clock()).toISOString() },
      ],
    };
    await this.update(
      'booking-requests',
      parent.id,
      {
        nexg: {
          ...pn,
          specialistState: state,
          version: pn.version + 1,
          entitlementRedemptions: (pn.entitlementRedemptions ?? []).map((entry: Doc) =>
            entry.bookingId === result.publicId
              ? {
                  ...entry,
                  startTime: child.startTime,
                  endTime: child.endTime,
                  occurrenceKey: change.key,
                }
              : entry,
          ),
        },
      },
      identity,
      req,
    );
    await this.audit(identity, req, 'booking.entitlement.rescheduled', parent.publicId, {
      bookingId: result.publicId,
    });
  }
  async quoteBooking(identity: Identity, id: string, input: Doc, customerToken?: string) {
    if (identity.role !== 'customer') requireManager(identity);
    const { doc } = await this.locateBooking(identity, id, this.request(identity));
    if (identity.role === 'customer') this.assertCustomerToken(doc, customerToken);
    const n = doc.nexg ?? {};
    if (['cancelled', 'completed', 'expired', 'no-show'].includes(doc.status ?? n.status))
      throw new BookingError(409, 'This booking is already closed.', 'invalid_transition');
    if (input.quantity !== undefined && input.quantity !== n.quantity)
      throw new BookingError(
        422,
        'Rescheduling retains the accepted booking quantity.',
        'quantity_change_not_supported',
      );
    const business = await this.business(identity),
      acceptedConfiguration =
        n.acceptedConfiguration ??
        (n.configurationRevision === business.configuration?.revision
          ? business.configuration
          : undefined);
    if (!acceptedConfiguration)
      throw new BookingError(
        409,
        'This legacy booking needs a reviewed configuration migration.',
        'accepted_configuration_required',
      );
    const service = await this.own('services', n.offeringId, identity),
      times = this.window(service, {
        offeringId: n.offeringId,
        startTime: input.startTime ?? n.startTime,
        endTime: input.endTime,
        customer: n.customer,
      });
    if (n.model === 'SESSION_CAPACITY')
      await this.publishedOccurrence(
        identity,
        service,
        new Date(times.start!).toISOString(),
        new Date(times.end!).toISOString(),
        input.occurrenceId,
        this.request(identity),
      );
    await this.entitlementChange(identity, n, times, input);
    const pricing = this.price(
        {
          ...service,
          nexg: { ...service.nexg, ...n.acceptedPricing, reservationFee: n.acceptedReservationFee },
        },
        times.start,
        times.end,
        n.quantity,
      ),
      sourceRequired = this.externalOwnership(acceptedConfiguration, [
        'pricing',
        'finance.payment',
      ]);
    return {
      ...pricing,
      binding: !sourceRequired && !pricing.indicative,
      sourceRequired,
      indicative: sourceRequired || pricing.indicative,
    };
  }
  private readiness(configuration: Doc, service: Doc, resources: Doc[]) {
    const n = service.nexg ?? {};
    const external = this.sourceConfirmationRequired(configuration);
    const authority = [
      {
        data_class: 'reservations',
        authority: external ? 'EXTERNAL_AUTHORITATIVE' : 'NEXG_AUTHORITATIVE',
        owner_reference: external ? 'external-system' : 'nexg-booking-engine',
        scope: { business_id: String(service.businessId) },
      },
    ];
    if (n.specialistSetup)
      authority.push({
        data_class: 'work_items',
        authority: external ? 'EXTERNAL_AUTHORITATIVE' : 'NEXG_AUTHORITATIVE',
        owner_reference: external ? 'external-system' : 'nexg-booking-engine',
        scope: { business_id: String(service.businessId) },
      });
    if (n.paymentPolicyId === 'MANUAL_COLLECTION_V1')
      authority.push({
        data_class: 'finance.payment',
        authority: 'NEXG_AUTHORITATIVE',
        owner_reference: 'nexg-manual-collection-ledger',
        scope: { business_id: String(service.businessId) },
      });
    const resolved = resolveBookingConfiguration({
      ...configuration,
      scope: {
        businessId: String(service.businessId),
        offeringId: service.publicId,
        locationId: n.locationId,
      },
      offering: {
        ...n,
        resourceIds:
          n.resourceSelectionMode === 'choose_one'
            ? resources
                .filter((r) => r.active !== false)
                .slice(0, 1)
                .map((r) => r.publicId)
            : n.resourceIds,
        authority,
        id: service.publicId,
        name: service.name,
        durationMinutes: n.durationMinutes ?? undefined,
        capacity: n.capacity ?? resources.find((r) => r.capacityMode === 'per-guest')?.quantity,
        buffers: {
          beforeMinutes: service.bufferTimeBefore ?? 0,
          afterMinutes: service.bufferTimeAfter ?? 0,
        },
        policy: {
          paymentPolicyId: n.paymentPolicyId,
          changePolicyId: n.changePolicyId,
          version: n.policyVersion,
        },
        serviceAreaConfigured:
          typeof n.serviceArea === 'object' &&
          Array.isArray(n.serviceArea?.areas) &&
          n.serviceArea.areas.length > 0,
        travelConfigured: Number.isInteger(n.travelMinutes) && n.travelMinutes >= 0,
      },
      resources: resources.map((r) => ({
        id: r.publicId,
        active: r.active !== false,
        kind: r.resourceType,
        locationId: r.nexg?.locationId,
        hasSchedule: !!r.nexg?.schedule?.days?.length,
        capacity: r.quantity,
        capacityUnit: r.nexg?.capacityUnit,
        quantityScale: r.nexg?.quantityScale,
        capacityMode: r.capacityMode,
      })),
      authority,
    } as any);
    if (CAPTURE_ONLY.has(n.model) && !n.specialistSetup)
      return {
        ...resolved,
        isReady: false,
        canConfirmNative: false,
        activeModels: [],
        status: 'SETUP_REQUIRED',
        missingInputs: [
          ...resolved.missingInputs,
          {
            code: 'EXECUTION_ADAPTER_REQUIRED',
            severity: 'required',
            message:
              'This workflow currently captures requests. Its booking-specific execution adapter must be configured before operational acceptance.',
          },
        ],
      };
    return resolved;
  }
  private async assertReady(
    identity: Identity,
    service: Doc,
    resources: Doc[],
    req: any,
    acceptedConfiguration?: Doc,
  ) {
    const n = service.nexg;
    if (
      !['NO_PREPAYMENT_V1', 'MANUAL_COLLECTION_V1'].includes(n.paymentPolicyId) ||
      n.changePolicyId !== 'CHANGE_BEFORE_START_V1' ||
      n.policyVersion !== 1
    )
      throw new BookingError(
        422,
        'Select the supported versioned payment and change policies before confirming.',
        'policy_setup_required',
      );
    if (
      n.model === 'TRANSFER' &&
      (!Array.isArray(n.serviceArea?.areas) ||
        !n.serviceArea.areas.length ||
        (n.transportIncluded !== false &&
          (!Number.isSafeInteger(n.travelMinutes) || n.travelMinutes < 0)))
    )
      throw new BookingError(
        422,
        'Configure supported pickup/dropoff areas and conservative travel time.',
        'transfer_setup_required',
      );
    const configuration =
        acceptedConfiguration ?? (await this.business(identity, req)).configuration,
      readinessService = acceptedConfiguration
        ? { ...service, nexg: { ...service.nexg, bookingEnabled: true } }
        : service,
      resolved = this.readiness(configuration, readinessService, resources);
    if (resolved.primaryModel !== service.nexg.model || !resolved.canConfirmNative)
      throw new BookingError(
        422,
        'Complete this offering setup: ' +
          [...resolved.missingInputs, ...resolved.invalidInputs, ...resolved.clarifications]
            .map((x) => x.message)
            .join(' ')
            .slice(0, 1800),
        'offering_setup_required',
      );
  }
  private externalOwnership(config: Doc, classes: string[]) {
    const normalized = normalizeBookingAnswers(config as any);
    const values = normalized.values['integration.data_authority'];
    return (
      Array.isArray(values) &&
      values.some(
        (x: any) => classes.includes(x.data_class) && x.authority !== 'NEXG_AUTHORITATIVE',
      )
    );
  }
  private externalReservations(config: Doc) {
    return this.externalOwnership(config, [
      'reservations',
      'availability',
      'resources',
      'capacity',
    ]);
  }
  private sourceConfirmationRequired(configuration: Doc) {
    return (
      this.externalReservations(configuration) ||
      this.externalOwnership(configuration, [
        'pricing',
        'finance.payment',
        'work_items',
        'fulfillment',
        'offerings',
      ])
    );
  }
  private window(service: Doc, input: BookingInput, allowUnscheduledRequest = false) {
    const request = NON_BLOCKING.has(service.nexg.model) || allowUnscheduledRequest;
    if (request && !input.startTime) {
      if (input.endTime)
        throw new BookingError(422, 'A preferred end needs a preferred start.', 'invalid_interval');
      return { start: null, end: null };
    }
    const start = instant(input.startTime);
    if (request && !input.endTime) return { start, end: null };
    const duration = service.duration * 60000;
    const end = input.endTime ? instant(input.endTime) : start + duration;
    if (end <= start) throw new BookingError(422, 'End must follow start.', 'invalid_interval');
    const n = service.nexg;
    if (FLEXIBLE.has(n.model)) {
      const min = (n.minDurationMinutes ?? service.duration) * 60000,
        max = (n.maxDurationMinutes ?? 60 * 24 * 366) * 60000;
      if (end - start < min || end - start > max)
        throw new BookingError(
          422,
          'This period is outside the offering’s allowed duration.',
          'invalid_duration',
        );
    } else if (end - start !== duration)
      throw new BookingError(
        422,
        'The end time must match the offering duration.',
        'invalid_duration',
      );
    const lead = (n.leadTimeMinutes ?? 0) * 60000;
    if (start < this.clock() + lead)
      throw new BookingError(409, 'This time is too soon to book.', 'lead_time');
    if (n.horizonDays && start > this.clock() + n.horizonDays * 86400000)
      throw new BookingError(409, 'This time is beyond the booking window.', 'booking_horizon');
    return { start, end };
  }
  private inSchedule(resource: Doc, start: number, end: number) {
    if (
      (resource.nexg?.closures ?? []).some(
        (c: any) => Date.parse(c.startTime) < end && Date.parse(c.endTime) > start,
      )
    )
      return false;
    const s = resource.nexg?.schedule;
    if (!s || !s.days?.length) return false;
    const open = minutes(s.start),
      close = minutes(s.end);
    const localDay = Math.floor((start + EAT) / 86400000) * 86400000 - EAT;
    for (let anchor = localDay - 86400000; anchor <= end; anchor += 86400000) {
      const day = new Date(anchor + EAT).getUTCDay();
      if (!s.days.includes(day)) continue;
      const a = anchor + open * 60000,
        b = anchor + close * 60000 + (close <= open ? 86400000 : 0);
      if (start >= a && end <= b) return true;
      if (FLEXIBLE.has(resource.nexg?.model) && start >= a && end <= b) return true;
    }
    return false;
  }
  private async selectedResources(service: Doc, input: BookingInput, identity: Identity, req: any) {
    const allowed = service.nexg.resourceIds as string[];
    const chosen = input.resourceIds?.length ? [...new Set(input.resourceIds)] : allowed;
    if (service.nexg.resourceSelectionMode === 'choose_one' && chosen.length !== 1)
      throw new BookingError(
        422,
        'Choose exactly one eligible resource.',
        'resource_selection_required',
      );
    if (
      service.nexg.resourceSelectionMode !== 'choose_one' &&
      allowed.some((id) => !chosen.includes(id))
    )
      throw new BookingError(
        422,
        'All resources in this offering bundle must be assigned together.',
        'resource_bundle_required',
      );
    if (chosen.some((id) => !allowed.includes(id)))
      throw new BookingError(
        422,
        'This resource is not eligible for the offering.',
        'resource_mismatch',
      );
    const resources = await Promise.all(
      chosen.map((id) => this.own('resources', id, identity, req)),
    );
    const model = service.nexg.model;
    if (!NON_BLOCKING.has(model) && !resources.length)
      throw new BookingError(422, 'Resource setup is incomplete.', 'resources_required');
    if (
      ((model === 'TRANSFER' && service.nexg.transportIncluded !== false) ||
        (model === 'ASSET_INTERVAL' && service.nexg.withDriver === true)) &&
      (!resources.some((r) => r.resourceType === 'vehicle') ||
        !resources.some((r) => r.resourceType === 'staff'))
    )
      throw new BookingError(
        422,
        'This offering needs an eligible vehicle and driver together.',
        'resource_bundle_required',
      );
    if (
      model === 'TRANSFER' &&
      service.nexg.transportIncluded === false &&
      !resources.some((r) => r.resourceType === 'staff')
    )
      throw new BookingError(422, 'A greeter must be assigned.', 'resource_bundle_required');
    return resources;
  }
  private validateCapacity(service: Doc, resources: Doc[], quantity: number, configuration: Doc) {
    if (service.nexg.model === 'TRANSFER' && service.nexg.transportIncluded !== false) {
      const seats = resources
        .filter((r) => r.resourceType === 'vehicle')
        .reduce((sum, r) => sum + (r.nexg?.partyCapacity ?? 0), 0);
      if (seats < quantity)
        throw new BookingError(
          409,
          'The selected vehicle does not fit this passenger party.',
          'party_capacity',
        );
    }
    if (service.nexg.model !== 'SPACE_RESERVATION') return;
    const spaces = resources.filter((r) => r.resourceType === 'space');
    if (spaces.length !== resources.length || !spaces.length)
      throw new BookingError(422, 'Choose actual table or space resources.', 'space_required');
    const seats = spaces.reduce((n, r) => n + (r.nexg?.partyCapacity ?? 0), 0);
    if (seats < quantity)
      throw new BookingError(409, 'The selected space does not fit this party.', 'party_capacity');
    const policy = this.readiness(configuration, service, resources).normalizedAnswers
      .BQ_SPACE_POLICY as any;
    if (!policy)
      throw new BookingError(
        422,
        'Configure the actual table and party-size policy.',
        'space_policy_required',
      );
    for (const resource of spaces) {
      const configured = policy.spaces?.find(
        (s: any) => s.resource_id === resource.publicId && s.active === true,
      );
      if (!configured || configured.maximum_party_size > resource.nexg.partyCapacity)
        throw new BookingError(
          422,
          'A selected table is outside its configured space policy.',
          'space_policy_mismatch',
        );
      if (
        spaces.length === 1 &&
        (quantity < configured.minimum_party_size || quantity > configured.maximum_party_size)
      )
        throw new BookingError(
          409,
          'This party does not fit the selected table policy.',
          'party_capacity',
        );
    }
    if (spaces.length > 1) {
      const ids = spaces
        .map((r) => r.publicId)
        .sort()
        .join(',');
      if (
        !policy.combinations?.some(
          (c: any) =>
            [...c.resource_ids].sort().join(',') === ids &&
            quantity >= c.minimum_party_size &&
            quantity <= c.maximum_party_size,
        )
      )
        throw new BookingError(
          422,
          'This table combination is not approved for this party.',
          'invalid_space_combination',
        );
    }
    if (service.bufferTimeAfter < policy.turnover_minutes)
      throw new BookingError(
        422,
        'This offering must include the configured table turnover time.',
        'turnover_required',
      );
  }
  private async expiredInTransaction(identity: Identity, req: any) {
    const docs = await this.all('reservations', identity, req);
    for (const d of docs)
      if (
        d.status === 'held' &&
        d.nexg?.expiresAt &&
        Date.parse(d.nexg.expiresAt) <= this.clock()
      ) {
        await this.update(
          'reservations',
          d.id,
          {
            status: 'expired',
            nexg: {
              ...d.nexg,
              refundState: d.nexg?.paidMinor > 0 ? 'review_required' : undefined,
              version: (d.nexg.version ?? 1) + 1,
            },
          },
          identity,
          req,
        );
        await this.audit(identity, req, 'booking.hold.expired', d.publicId);
      }
    await this.cleanupSessions(identity, req);
  }
  async expireHolds(identity: Identity) {
    return this.transaction(identity, (req) => this.expiredInTransaction(identity, req));
  }
  occurrenceView(d: Doc) {
    return {
      id: d.publicId,
      offeringId: d.offeringId,
      startTime: d.startTime,
      endTime: d.endTime,
      capacity: d.capacity,
      resourceIds: d.resourceIds,
      published: d.published,
      version: d.version ?? 1,
      locationId: d.locationId,
    };
  }
  private async publishedOccurrence(
    identity: Identity,
    service: Doc,
    startTime: string,
    endTime: string,
    occurrenceId: string | undefined,
    req: any,
  ) {
    const occurrence = (await this.all('booking-sessions', identity, req)).find(
      (d) =>
        d.published === true &&
        d.offeringId === service.publicId &&
        (!occurrenceId || d.publicId === occurrenceId) &&
        Date.parse(d.startTime) === Date.parse(startTime) &&
        Date.parse(d.endTime) === Date.parse(endTime),
    );
    if (!occurrence)
      throw new BookingError(
        422,
        'Choose an actual merchant-published dated session.',
        'published_occurrence_required',
      );
    return occurrence;
  }
  private async assertNoOverdueCustody(identity: Identity, resources: Doc[], req: any) {
    const existing = await this.all('reservations', identity, req);
    for (const reservation of existing)
      if (
        reservation.nexg?.custodyState === 'in_use' &&
        Date.parse(reservation.endTime) <= this.clock() &&
        resources.some((r) => this.references(reservation, r.id))
      )
        throw new BookingError(
          409,
          'A selected physical resource is overdue and has not been returned or released.',
          'overdue_occupancy',
        );
  }
  private scheduleAllows(service: Doc, resource: Doc, start: number, end: number) {
    if (
      (resource.nexg?.closures ?? []).some(
        (c: any) => Date.parse(c.startTime) < end && Date.parse(c.endTime) > start,
      )
    )
      return false;
    const before = (service.bufferTimeBefore ?? 0) * 60000,
      after = (service.bufferTimeAfter ?? 0) * 60000;
    if (
      FLEXIBLE.has(service.nexg.model) &&
      resource.resourceType !== 'staff' &&
      Math.floor((end + EAT) / 86400000) > Math.floor((start + EAT) / 86400000)
    )
      return (
        this.inSchedule(resource, start - before, start + 60000) &&
        this.inSchedule(resource, end - 60000, end + after)
      );
    return this.inSchedule(resource, start - before, end + after);
  }
  async availability(
    identity: Identity,
    offeringId: string,
    date: string,
    publicOnly = false,
    options: {
      quantity?: number;
      startTime?: string;
      endTime?: string;
      resourceIds?: string[];
    } = {},
  ) {
    await this.expireHolds(identity);
    const service = await this.own('services', offeringId, identity);
    if (publicOnly) await this.assertPublished(identity, service);
    const b = await this.business(identity);
    if (this.externalOwnership(b.configuration ?? {}, ['pricing', 'finance.payment']))
      return { slots: [], reason: 'Authoritative pricing or collection confirmation is required.' };
    if (this.externalReservations(b.configuration ?? {}))
      return { slots: [], reason: 'Source availability is not confirmed.' };
    if (
      service.active === false ||
      service.nexg.bookingEnabled === false ||
      NON_BLOCKING.has(service.nexg.model)
    )
      return {
        slots: [],
        reason: 'This offering accepts requests rather than instant time reservations.',
      };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T12:00:00+03:00`)) ||
      new Date(`${date}T12:00:00+03:00`).toISOString().slice(0, 10) !== date
    )
      throw new BookingError(422, 'Choose a valid date.', 'invalid_date');
    const quantity = integer(options.quantity ?? 1, 'Quantity', 1),
      req = this.request(identity);
    const resources = await this.selectedResources(
      service,
      { offeringId, resourceIds: options.resourceIds, customer: { name: 'Availability' } },
      identity,
      req,
    );
    this.validateCapacity(service, resources, quantity, b.configuration);
    await this.assertNoOverdueCustody(identity, resources, req);
    const readiness = this.readiness(b.configuration, service, resources);
    if (!readiness.canConfirmNative)
      return publicOnly
        ? {
            slots: [],
            setupRequired: true,
            reason:
              'Online reservations are not available for this offering yet. Please contact the merchant.',
          }
        : {
            slots: [],
            reason: 'Complete this offering setup before displaying reservable times.',
            readiness,
          };
    const sessions =
      service.nexg.model === 'SESSION_CAPACITY' ? await this.all('booking-sessions', identity) : [];
    const slots: Array<{
        occurrenceId?: string;
        start: string;
        end: string;
        remainingCapacity: number;
      }> = [],
      day = Date.parse(`${date}T00:00:00+03:00`);
    const rangeDuration =
      options.startTime && options.endTime
        ? instant(options.endTime) - instant(options.startTime)
        : undefined;
    const starts =
      service.nexg.model === 'SESSION_CAPACITY'
        ? sessions
            .filter(
              (s) =>
                s.published === true &&
                s.offeringId === offeringId &&
                Date.parse(s.startTime) >= day &&
                Date.parse(s.startTime) < day + 86400000,
            )
            .map((s) => Date.parse(s.startTime))
        : options.startTime
          ? [instant(options.startTime)]
          : Array.from({ length: 96 }, (_, i) => day + i * 15 * 60000);
    for (const start of starts) {
      const end = start + (rangeDuration ?? service.duration * 60000);
      try {
        this.window(service, {
          offeringId,
          startTime: new Date(start).toISOString(),
          endTime: new Date(end).toISOString(),
          customer: { name: 'Availability' },
        });
      } catch (e) {
        if (e instanceof BookingError) continue;
        throw e;
      }
      if (resources.some((r) => !this.scheduleAllows(service, r, start, end))) continue;
      let available = true,
        remaining = Number.MAX_SAFE_INTEGER;
      const session = sessions.find(
        (s) =>
          Date.parse(s.startTime) === start &&
          Date.parse(s.endTime) === end &&
          s.offeringId === offeringId,
      );
      const pool =
        service.nexg.model === 'SESSION_CAPACITY'
          ? resources.find(
              (r) => r.capacityMode === 'per-guest' || r.resourceType === 'capacity_pool',
            )
          : undefined;
      for (const resource of resources) {
        const result = await checkAvailability({
          payload: this.payload,
          req,
          resourceId: resource.id,
          resourceSlug: 'resources',
          reservationSlug: 'reservations',
          servicesSlug: 'services',
          blockingStatuses: ['held', 'confirmed'],
          bufferBefore: service.bufferTimeBefore ?? 0,
          bufferAfter: service.bufferTimeAfter ?? 0,
          startTime: new Date(start),
          endTime: new Date(end),
          guestCount: resource.capacityMode === 'per-guest' ? quantity : 1,
          excludeReservationId:
            session && resource.id !== pool?.id ? session.reservationId : undefined,
        });
        if (!result.available) {
          available = false;
          break;
        }
        if (resource.capacityMode === 'per-guest')
          remaining = Math.min(remaining, result.totalCapacity - result.currentCount);
      }
      if (available && pool && session) {
        const attendees = (await this.all('reservations', identity)).filter(
          (r) =>
            String(r.nexg?.sessionId) === String(session.id) &&
            r.nexg?.recordRole !== 'session_allocation' &&
            BLOCKING.has(r.status),
        );
        remaining = Math.min(
          remaining,
          Math.min(session.capacity, service.nexg.capacity ?? session.capacity) -
            attendees.reduce((sum, r) => sum + (r.guestCount ?? 1), 0),
        );
        if (remaining < quantity) available = false;
      }
      if (available)
        slots.push({
          occurrenceId: session?.publicId,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          remainingCapacity: remaining === Number.MAX_SAFE_INTEGER ? 1 : remaining,
        });
    }
    return {
      slots,
      reason: slots.length ? undefined : 'No available times for this quantity and period.',
      timezone: 'Africa/Nairobi',
      quantity,
    };
  }
  private references(d: Doc, resourceId: any) {
    return (
      normalizeId(d.resource) === String(resourceId) ||
      (d.items ?? []).some((i: any) => normalizeId(i.resource) === String(resourceId))
    );
  }
  private async assertPublished(identity: Identity, service?: Doc, req?: any) {
    const b = (await this.all('businesses', identity, req))[0];
    if (!b) throw new BookingError(404, 'This booking page is not available.', 'not_published');
    if (
      b.configuration?.published !== true ||
      (service && (service.active === false || service.nexg?.bookingEnabled === false))
    )
      throw new BookingError(404, 'This booking page is not available.', 'not_published');
    return b;
  }
  async publicCatalog(identity: Identity) {
    const b = await this.assertPublished(identity);
    const occurrences = await this.all('booking-sessions', identity);
    const resources = await this.all('resources', identity);
    const offerings = (await this.all('services', identity))
      .filter((d) => d.active !== false && d.nexg?.bookingEnabled !== false)
      .map((d) => ({
        ...this.publicOfferingView(d, b.configuration ?? {}, occurrences),
        occurrences: occurrences
          .filter((o) => o.published === true && o.offeringId === d.publicId)
          .map((o) => ({
            id: o.publicId,
            offeringId: d.publicId,
            startTime: o.startTime,
            endTime: o.endTime,
            capacity: o.capacity,
            published: true,
          })),
        eligibleResources:
          d.nexg?.resourceSelectionMode === 'choose_one'
            ? resources
                .filter(
                  (r) => r.active !== false && (d.nexg?.resourceIds ?? []).includes(r.publicId),
                )
                .map((r) => ({ id: r.publicId, name: r.name, kind: r.resourceType }))
            : [],
      }));
    return {
      business: { id: identity.businessId, name: b.name, timezone: 'Africa/Nairobi' },
      offerings,
    };
  }
  async createBooking(identity: Identity, input: BookingInput, key?: string, publicOnly = false) {
    if (!publicOnly) requireManager(identity);
    if (
      publicOnly &&
      (!key ||
        !/^([0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(key))
    )
      throw new BookingError(
        400,
        'Use a fresh secure operation UUID for public booking.',
        'invalid_public_operation_key',
      );
    const customer = {
      name: text(input.customer?.name, 'Customer name'),
      email: input.customer?.email?.trim(),
      phone: input.customer?.phone?.trim(),
    };
    if (!customer.email && !customer.phone)
      throw new BookingError(422, 'Add a customer email or phone number.', 'contact_required');
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
      throw new BookingError(422, 'Enter a valid email address.', 'invalid_email');
    const quantity = integer(input.quantity ?? 1, 'Quantity', 1);
    const customerToken = publicOnly
      ? createHmac('sha256', this.payload.config.secret)
          .update(
            `customer:${identity.businessId}:${identity.userId}:${hash(stable(input))}:${key}`,
          )
          .digest('base64url')
      : undefined;
    const result = await this.command(identity, key, 'booking.create', input, async (req) => {
      await this.expiredInTransaction(identity, req);
      const service = await this.own('services', input.offeringId, identity, req);
      if (publicOnly) await this.assertPublished(identity, service, req);
      if (service.active === false)
        throw new BookingError(409, 'This offering is inactive.', 'inactive_offering');
      if (input.hold && NON_BLOCKING.has(service.nexg.model))
        throw new BookingError(
          422,
          'A request does not create a calendar hold.',
          'nonblocking_request',
        );
      const b = await this.business(identity, req);
      const sourceRequired = this.sourceConfirmationRequired(b.configuration);
      const specialistPlan =
        service.nexg.specialistSetup && !sourceRequired
          ? await prepareSpecialistPlan(this, identity, service, input, req)
          : undefined;
      const { start, end } = specialistPlan ?? this.window(service, input, sourceRequired);
      const resources = await this.selectedResources(service, input, identity, req);
      const n = service.nexg;
      const configured = this.readiness(b.configuration, service, resources);
      if (configured.primaryModel !== n.model)
        throw new BookingError(
          422,
          'This offering model is not enabled by the specialty setup. Complete its onboarding questions first.',
          'model_not_enabled',
        );
      const requestOnly =
        this.externalOwnership(b.configuration, ['pricing', 'finance.payment']) ||
        NON_BLOCKING.has(n.model) ||
        n.intakeMode === 'request_quote' ||
        n.intakeMode === 'merchant_approval' ||
        this.externalReservations(b.configuration ?? {});
      if (
        n.bookingEnabled === false &&
        !(
          specialistPlan?.plan.model === 'SERVICE_JOB' &&
          specialistPlan.plan.acceptedTerms.setup.model === 'SERVICE_JOB' &&
          specialistPlan.plan.acceptedTerms.setup.jobSchedulingMode === 'queue' &&
          !publicOnly
        )
      )
        throw new BookingError(409, 'Booking is disabled for this offering.', 'booking_disabled');
      if (n.intakeMode === 'walk_in_only' && publicOnly)
        throw new BookingError(
          409,
          'This offering accepts arrivals rather than advance bookings.',
          'walk_in_only',
        );
      this.validateCapacity(service, resources, quantity, b.configuration);
      if (!requestOnly || input.hold) await this.assertReady(identity, service, resources, req);
      const externalPrice = this.externalOwnership(b.configuration, ['pricing', 'finance.payment']);
      const pricing = {
        ...this.requestPrice(
          service,
          start,
          end,
          quantity,
          sourceRequired || CAPTURE_ONLY.has(n.model),
        ),
        sourceRequired: externalPrice,
        indicative:
          sourceRequired ||
          n.pricingBasis === 'indicative' ||
          ((start === null || end === null) &&
            ['per_duration', 'per_night'].includes(n.pricingBasis)),
      };
      if (externalPrice && input.hold)
        throw new BookingError(
          409,
          'Confirm price and collection ownership with its source before holding this booking.',
          'source_price_required',
        );
      if (input.expectedTotalMinor !== undefined && input.expectedTotalMinor !== pricing.totalMinor)
        throw new BookingError(
          409,
          'The booking price changed. Review the updated total.',
          'price_changed',
        );
      this.validateBookingDetails(service, input);
      const paymentRequired = n.requiresPayment === true || pricing.dueNowMinor > 0;
      const id = publicId(),
        token = customerToken;
      const metadata = {
        specialistState: specialistPlan?.plan.acceptedTerms,
        specialistAllocations: specialistPlan ? [] : undefined,
        executionMode: specialistPlan
          ? 'native_workflow'
          : sourceRequired || CAPTURE_ONLY.has(n.model)
            ? 'request_capture'
            : NON_BLOCKING.has(n.model)
              ? 'work_request'
              : 'native_reservation',
        publicId: id,
        offeringId: service.publicId,
        offeringName: service.name,
        model: n.model,
        resourceIds: resources.map((r) => r.publicId),
        customer,
        trip: input.trip,
        customerLocation: input.customerLocation,
        allocations: input.allocations ?? [],
        pricing,
        pricingBasis: pricing.basis,
        unitPriceMinor: n.priceMinor,
        quantityScale: n.quantityScale ?? 0,
        capacityUnit: n.capacityUnit ?? 'place',
        notes: typeof input.notes === 'string' ? input.notes.slice(0, 2000) : '',
        startTime: start === null ? null : new Date(start).toISOString(),
        endTime: end === null ? null : new Date(end).toISOString(),
        quantity,
        version: 1,
        priceMinor: pricing.totalMinor,
        currency: 'KES',
        locationId: n.locationId,
        configurationRevision: b.configuration?.revision,
        acceptedConfiguration: structuredClone(b.configuration ?? {}),
        status:
          input.hold || (paymentRequired && !requestOnly)
            ? 'held'
            : requestOnly
              ? 'pending'
              : 'confirmed',
        requiresPayment: paymentRequired,
        paymentState: paymentRequired ? 'awaiting_payment' : 'not_required',
        acceptedReservationFee: n.reservationFee ?? { mode: 'no_fee' },
        paidMinor: 0,
        customerTokenHash: token ? hash(token) : undefined,
        acceptedPricing: {
          pricingBasis: n.pricingBasis ?? 'per_booking',
          priceMinor: n.priceMinor,
          durationUnitMinutes: n.durationUnitMinutes,
          minimumBillableUnits: n.minimumBillableUnits,
        },
        acceptedPolicies: {
          paymentPolicyId: n.paymentPolicyId,
          changePolicyId: n.changePolicyId,
          version: n.policyVersion,
          terms: {
            payment: 'No online prepayment; pay the merchant separately.',
            changes: 'Changes and cancellation before work starts, subject to availability.',
          },
        },
        custodyState: CUSTODY_MODELS.has(n.model) ? 'not_started' : undefined,
        createdBy: identity.userId,
      };
      let doc: Doc;
      if (requestOnly && !input.hold) {
        doc = await this.create(
          'booking-requests',
          { publicId: id, nexg: metadata },
          identity,
          req,
        );
      } else {
        if (this.externalReservations(b.configuration ?? {}))
          throw new BookingError(
            409,
            'This resource needs confirmation from its owning system.',
            'source_confirmation_required',
          );
        doc = await this.allocate(identity, req, service, resources, input, metadata);
      }
      await this.audit(identity, req, 'booking.created', id, { status: metadata.status });
      const booking = this.bookingView(doc);
      return booking;
    });
    return publicOnly ? { booking: result, customerToken } : result;
  }
  private async allocate(
    identity: Identity,
    req: any,
    service: Doc,
    resources: Doc[],
    input: BookingInput,
    metadata: Doc,
    acceptedExistingBooking = false,
  ): Promise<Doc> {
    if (
      !acceptedExistingBooking &&
      (service.active === false || service.nexg.bookingEnabled === false)
    )
      throw new BookingError(409, 'This offering is closed to new bookings.', 'inactive_offering');
    await this.assertNoOverdueCustody(identity, resources, req);
    if (!resources.length)
      throw new BookingError(
        422,
        'Choose actual resources before confirming.',
        'resources_required',
      );
    const start = Date.parse(metadata.startTime),
      end = Date.parse(metadata.endTime);
    if (input.allocations) {
      if (
        !Array.isArray(input.allocations) ||
        new Set(input.allocations.map((a) => a.resourceId)).size !== input.allocations.length
      )
        throw new BookingError(
          422,
          'Use one allocation per actual selected resource.',
          'invalid_allocations',
        );
      for (const allocation of input.allocations) {
        if (!resources.some((r) => r.publicId === allocation.resourceId))
          throw new BookingError(
            422,
            'Every allocation must refer to an actual selected resource.',
            'resource_mismatch',
          );
        if (
          (allocation.startTime && instant(allocation.startTime) !== start) ||
          (allocation.endTime && instant(allocation.endTime) !== end)
        )
          throw new BookingError(
            422,
            'Separate leg windows require the linked-workflow execution adapter.',
            'allocation_window_unsupported',
          );
      }
    }
    for (const r of resources) {
      if (r.active === false)
        throw new BookingError(409, 'A selected resource is inactive.', 'inactive_resource');
      if (!this.scheduleAllows(service, r, start, end))
        throw new BookingError(
          409,
          'A selected resource is outside its working hours.',
          'outside_schedule',
        );
      if (!r.nexg?.schedule)
        throw new BookingError(
          422,
          'A selected resource has no configured hours.',
          'setup_required',
        );
    }
    let selected = resources;
    let sessionId: string | undefined;
    if (service.nexg.model === 'SESSION_CAPACITY') {
      if ((service.nexg.quantityScale ?? 0) !== 0)
        throw new BookingError(
          422,
          'Session places use whole-person quantities.',
          'invalid_session_unit',
        );
      const pool = resources.find(
        (r) => r.capacityMode === 'per-guest' || r.resourceType === 'capacity_pool',
      );
      if (!pool)
        throw new BookingError(
          422,
          'A dated session needs a configured place-capacity pool.',
          'session_pool_required',
        );
      const occurrence = await this.publishedOccurrence(
        identity,
        service,
        metadata.startTime,
        metadata.endTime,
        input.occurrenceId,
        req,
      );
      sessionId = String(occurrence.id);
      if (
        [...occurrence.resourceIds].sort().join(',') !==
        resources
          .map((r) => r.publicId)
          .sort()
          .join(',')
      )
        throw new BookingError(
          422,
          'Choose the exact published occurrence resource assignment.',
          'occurrence_resource_mismatch',
        );
      const attendees = (await this.all('reservations', identity, req)).filter(
        (r) =>
          String(r.nexg?.sessionId) === sessionId &&
          r.nexg?.recordRole !== 'session_allocation' &&
          BLOCKING.has(r.status),
      );
      const capacity = Math.min(
          integer(occurrence.capacity, 'Occurrence capacity', 1),
          integer(service.nexg.capacity ?? occurrence.capacity, 'Offering capacity', 1),
          pool.quantity,
        ),
        used = attendees.reduce((sum, r) => sum + (r.guestCount ?? 1), 0);
      if (used + metadata.quantity > capacity)
        throw new BookingError(
          409,
          'This published session has insufficient remaining capacity.',
          'session_capacity',
        );
      if (service.nexg.capacityUnit !== pool.nexg?.capacityUnit)
        throw new BookingError(422, 'Session and pool capacity units must match.', 'unit_mismatch');
      metadata.occurrenceId = occurrence.publicId;
      selected = [pool];
    }
    const allocationUnits = (r: Doc) => {
      const explicit = input.allocations?.find((a) => a.resourceId === r.publicId);
      if (explicit) {
        if (explicit.unit !== r.nexg.capacityUnit || explicit.scale !== r.nexg.quantityScale)
          throw new BookingError(
            422,
            'Allocation units do not match the resource.',
            'unit_mismatch',
          );
        const amount = integer(explicit.quantityMinor, 'Allocation quantity', 1);
        if (r.capacityMode !== 'per-guest' && amount !== 1)
          throw new BookingError(
            422,
            'An exclusive resource allocation is one actual resource.',
            'invalid_allocation_quantity',
          );
        if (service.nexg.model === 'SESSION_CAPACITY' && amount !== metadata.quantity)
          throw new BookingError(
            422,
            'Session place allocation must match attendee quantity.',
            'invalid_allocation_quantity',
          );
        return amount;
      }
      if (
        ['STORAGE', 'FREIGHT'].includes(service.nexg.model) &&
        r.capacityMode === 'per-guest' &&
        (service.nexg.capacityUnit !== r.nexg.capacityUnit ||
          (service.nexg.quantityScale ?? 0) !== (r.nexg.quantityScale ?? 0))
      )
        throw new BookingError(
          422,
          'Declare matching capacity units before confirming this allocation.',
          'unit_mismatch',
        );
      return r.capacityMode === 'per-guest' ? metadata.quantity : 1;
    };
    const first = selected[0]!;
    const expiresAt =
      metadata.status === 'held' ? new Date(this.clock() + 10 * 60000).toISOString() : undefined;
    return this.create(
      'reservations',
      {
        publicId: metadata.publicId,
        service: service.id,
        resource: first.id,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        status: metadata.status,
        guest: metadata.customer,
        guestCount: allocationUnits(first),
        items: selected
          .slice(1)
          .map((r) => ({ resource: r.id, service: service.id, guestCount: allocationUnits(r) })),
        nexg: { ...metadata, sessionId, expiresAt },
      },
      identity,
      req,
    );
  }
  private async locateBooking(identity: Identity, id: string, req: any) {
    try {
      return { collection: 'reservations', doc: await this.own('reservations', id, identity, req) };
    } catch (e) {
      if (!(e instanceof BookingError) || e.status !== 404) throw e;
      return {
        collection: 'booking-requests',
        doc: await this.own('booking-requests', id, identity, req),
      };
    }
  }
  async customerBooking(identity: Identity, id: string, token: string | undefined) {
    const { doc } = await this.locateBooking(identity, id, this.request(identity));
    this.assertCustomerToken(doc, token);
    return this.bookingView(doc);
  }
  private assertCustomerToken(doc: Doc, token: string | undefined) {
    const expected = doc.nexg?.customerTokenHash;
    if (!token || !expected)
      throw new BookingError(
        403,
        'Use the private link for this booking.',
        'customer_token_required',
      );
    const actual = hash(token);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new BookingError(403, 'This booking link is invalid.', 'invalid_customer_token');
  }
  private async cleanupSessions(identity: Identity, req: any) {
    const reservations = await this.all('reservations', identity, req),
      sessions = await this.all('booking-sessions', identity, req);
    for (const session of sessions) {
      if (session.published === true) continue;
      if (
        reservations.some(
          (r) => String(r.nexg?.sessionId) === String(session.id) && BLOCKING.has(r.status),
        )
      )
        continue;
      const anchor = reservations.find((r) => String(r.id) === session.reservationId);
      if (anchor && anchor.status === 'confirmed')
        await this.update('reservations', anchor.id, { status: 'cancelled' }, identity, req);
      await this.payload.delete({
        collection: 'booking-sessions',
        id: session.id,
        overrideAccess: false,
        req,
      } as any);
    }
  }
  async changeBooking(
    identity: Identity,
    id: string,
    action: string,
    input: Doc,
    key?: string,
    customerToken?: string,
  ) {
    if (identity.role !== 'customer') requireManager(identity);
    else {
      const current = await this.locateBooking(identity, id, this.request(identity));
      this.assertCustomerToken(current.doc, customerToken);
    }
    return this.command(identity, key, `booking.${id}.${action}`, input, async (req) => {
      await this.expiredInTransaction(identity, req);
      const { collection, doc } = await this.locateBooking(identity, id, req);
      if (identity.role === 'customer') this.assertCustomerToken(doc, customerToken);
      const n = doc.nexg ?? {},
        state = doc.status ?? n.status;
      if (n.recordRole === 'specialist_allocation')
        throw new BookingError(
          422,
          'Change this allocation through its parent specialist workflow.',
          'specialist_command_required',
        );
      if (input.expectedVersion !== n.version)
        throw new BookingError(
          409,
          'The booking changed. Refresh its details before trying again.',
          'version_conflict',
        );
      if (
        action !== 'record_refund' &&
        ['cancelled', 'completed', 'expired', 'no-show'].includes(state)
      )
        throw new BookingError(409, 'This booking is already closed.', 'invalid_transition');
      const service = await this.own('services', n.offeringId, identity, req),
        b = await this.business(identity, req);
      const acceptedConfiguration =
        n.acceptedConfiguration ??
        (n.configurationRevision === b.configuration?.revision ? b.configuration : undefined);
      if (['confirm', 'reschedule'].includes(action) && !acceptedConfiguration)
        throw new BookingError(
          409,
          'This legacy booking has no accepted configuration snapshot. Review its original setup before migrating it.',
          'accepted_configuration_required',
        );
      if (
        n.specialistState &&
        ['confirm', 'accept', 'start', 'complete', 'cancel', 'reschedule'].includes(action)
      )
        throw new BookingError(
          422,
          'Use this specialist workflow’s explicit commands to preserve its commitments and custody.',
          'specialist_command_required',
        );
      let result: Doc;
      if (action === 'workflow') {
        if (!acceptedConfiguration)
          throw new BookingError(
            409,
            'The accepted workflow configuration is required.',
            'accepted_configuration_required',
          );
        result = await changeSpecialistWork(
          this,
          identity,
          req,
          doc,
          service,
          input,
          acceptedConfiguration,
        );
      } else if (action === 'cancel') {
        if (
          n.custodyState === 'in_use' ||
          n.workState === 'in_progress' ||
          (n.startTime && Date.parse(n.startTime) <= this.clock())
        )
          throw new BookingError(
            409,
            'The accepted change policy permits cancellation before work starts.',
            'change_policy',
          );
        result = await this.update(
          collection,
          doc.id,
          {
            ...(collection === 'reservations' ? { status: 'cancelled' } : {}),
            nexg: {
              ...n,
              status: 'cancelled',
              refundState: n.paidMinor > 0 ? 'review_required' : undefined,
              version: n.version + 1,
            },
          },
          identity,
          req,
        );
      } else if (action === 'record_refund') {
        if (!['cancelled', 'expired', 'completed'].includes(state))
          throw new BookingError(
            409,
            'Close the booking before recording its refund.',
            'refund_requires_closed_booking',
          );
        if (identity.role !== 'owner')
          throw new BookingError(
            403,
            'Only the owner may record manual refund evidence.',
            'forbidden',
          );
        const amountMinor = integer(input.amountMinor, 'Refunded amount', 1),
          reference = text(input.reference, 'Refund reference', 200),
          evidence = text(input.evidence, 'Refund evidence', 2000);
        const refundRecords = [
          ...(await this.all('reservations', identity, req)),
          ...(await this.all('booking-requests', identity, req)),
        ];
        if (
          refundRecords.some((record) =>
            (record.nexg?.refundEvidence ?? []).some(
              (entry: any) => entry.reference?.trim().toUpperCase() === reference.toUpperCase(),
            ),
          )
        )
          throw new BookingError(
            409,
            'This refund reference is already recorded.',
            'duplicate_refund_reference',
          );
        if (amountMinor > (n.paidMinor ?? 0) - (n.refundedMinor ?? 0))
          throw new BookingError(
            422,
            'The refund exceeds the recorded collection balance.',
            'invalid_refund',
          );
        const refundedMinor = (n.refundedMinor ?? 0) + amountMinor;
        result = await this.update(
          collection,
          doc.id,
          {
            nexg: {
              ...n,
              refundedMinor,
              refundState:
                refundedMinor === n.paidMinor
                  ? 'merchant_recorded_refunded'
                  : 'merchant_recorded_partial',
              refundEvidence: [
                ...(n.refundEvidence ?? []),
                {
                  amountMinor,
                  reference,
                  evidence,
                  recordedBy: identity.userId,
                  recordedAt: new Date(this.clock()).toISOString(),
                  verification: 'merchant_asserted',
                },
              ],
              version: n.version + 1,
            },
          },
          identity,
          req,
        );
      } else if (action === 'record_payment') {
        if (identity.role !== 'owner')
          throw new BookingError(
            403,
            'Only the owner may record manual collection evidence.',
            'forbidden',
          );
        if (
          n.pricing?.sourceRequired ||
          (acceptedConfiguration &&
            this.externalOwnership(acceptedConfiguration, ['pricing', 'finance.payment']))
        )
          throw new BookingError(
            409,
            'Authoritative pricing or collection confirmation is required.',
            'source_price_required',
          );
        if (n.acceptedPolicies?.paymentPolicyId !== 'MANUAL_COLLECTION_V1')
          throw new BookingError(
            422,
            'This booking did not accept manual collection terms.',
            'payment_policy_required',
          );
        const amountMinor = integer(input.amountMinor, 'Collected amount', 1),
          reference = text(input.reference, 'Receipt or payment reference', 200),
          evidence = text(input.evidence, 'Collection evidence', 2000);
        if (!['cash', 'mpesa', 'card', 'bank'].includes(input.method))
          throw new BookingError(
            422,
            'Choose the actual collection method.',
            'invalid_payment_method',
          );
        const collectionRecords = [
          ...(await this.all('reservations', identity, req)),
          ...(await this.all('booking-requests', identity, req)),
        ];
        if (
          collectionRecords.some((record) =>
            (record.nexg?.paymentEvidence ?? []).some(
              (entry: any) =>
                entry.method === input.method &&
                entry.reference?.trim().toUpperCase() === reference.toUpperCase(),
            ),
          )
        )
          throw new BookingError(
            409,
            'This collection receipt is already recorded.',
            'duplicate_collection_reference',
          );
        if (amountMinor > (n.pricing?.totalDueMinor ?? n.priceMinor) - (n.paidMinor ?? 0))
          throw new BookingError(
            422,
            'The collection exceeds the booking balance.',
            'invalid_collection',
          );
        const paidMinor = (n.paidMinor ?? 0) + amountMinor,
          paymentEvidence = [
            ...(n.paymentEvidence ?? []),
            {
              amountMinor,
              currency: 'KES',
              method: input.method,
              reference,
              evidence,
              recordedBy: identity.userId,
              recordedAt: new Date(this.clock()).toISOString(),
              verification: 'merchant_asserted',
            },
          ];
        result = await this.update(
          collection,
          doc.id,
          {
            nexg: {
              ...n,
              paidMinor,
              paymentEvidence,
              paymentState:
                paidMinor >= (n.pricing?.dueNowMinor ?? n.priceMinor)
                  ? 'merchant_recorded'
                  : 'awaiting_payment',
              version: n.version + 1,
            },
          },
          identity,
          req,
        );
      } else if (['check_out', 'check_in', 'return', 'release'].includes(action)) {
        if (identity.role === 'customer' || !CUSTODY_MODELS.has(n.model) || state !== 'confirmed')
          throw new BookingError(
            409,
            'Only a confirmed physical reservation supports custody actions.',
            'invalid_transition',
          );
        const begin = action === 'check_out' || action === 'check_in';
        if (begin) {
          if (this.clock() < Date.parse(n.startTime) || this.clock() >= Date.parse(n.endTime))
            throw new BookingError(
              409,
              'Start custody during the accepted reservation interval. Revise the reservation if the handover time changes.',
              'outside_custody_window',
            );
          const physical = await this.selectedResources(
            service,
            { offeringId: n.offeringId, resourceIds: n.resourceIds, customer: n.customer },
            identity,
            req,
          );
          for (const resource of physical)
            await this.update('resources', resource.id, { bookingLock: publicId() }, identity, req);
          const existing = await this.all('reservations', identity, req);
          if (
            existing.some(
              (r) =>
                r.id !== doc.id &&
                r.nexg?.custodyState === 'in_use' &&
                physical.some((p) => this.references(r, p.id)),
            )
          )
            throw new BookingError(
              409,
              'This resource is still physically in use by another reservation.',
              'custody_conflict',
            );
          if (n.custodyState === 'in_use')
            throw new BookingError(409, 'This resource is already in use.', 'invalid_transition');
          if (
            (n.model === 'ASSET_INTERVAL' && action !== 'check_out') ||
            (n.model !== 'ASSET_INTERVAL' && action !== 'check_in')
          )
            throw new BookingError(
              422,
              'Use the custody action appropriate to this booking.',
              'invalid_transition',
            );
          result = await this.update(
            'reservations',
            doc.id,
            {
              nexg: {
                ...n,
                custodyState: 'in_use',
                workState: 'in_progress',
                checkedOutAt: new Date(this.clock()).toISOString(),
                version: n.version + 1,
              },
            },
            identity,
            req,
          );
        } else {
          if (n.custodyState !== 'in_use')
            throw new BookingError(
              409,
              'Record actual use before recording its return or release.',
              'invalid_transition',
            );
          const evidence = text(input.completionEvidence, 'Return or release evidence', 2000);
          result = await this.update(
            'reservations',
            doc.id,
            {
              status: 'completed',
              nexg: {
                ...n,
                status: 'completed',
                custodyState: 'released',
                workState: 'completed',
                releasedAt: new Date(this.clock()).toISOString(),
                completionEvidence: evidence,
                version: n.version + 1,
              },
            },
            identity,
            req,
          );
        }
      } else if (action === 'accept' || action === 'start') {
        if (identity.role === 'customer')
          throw new BookingError(403, 'Only the merchant can progress this work.', 'forbidden');
        if (
          n.pricing?.sourceRequired ||
          (acceptedConfiguration &&
            this.externalOwnership(acceptedConfiguration, ['pricing', 'finance.payment']))
        )
          throw new BookingError(
            409,
            'Resolve authoritative pricing before accepting work.',
            'source_price_required',
          );
        if (
          n.requiresPayment &&
          (n.paidMinor ?? 0) - (n.refundedMinor ?? 0) < (n.pricing?.dueNowMinor ?? 0)
        )
          throw new BookingError(
            409,
            'Record the accepted reservation-fee collection before progressing this work.',
            'payment_required',
          );
        if (CAPTURE_ONLY.has(n.model))
          throw new BookingError(
            422,
            'This request needs its booking-specific execution adapter before operational acceptance.',
            'execution_adapter_required',
          );
        if (action === 'accept' && (collection !== 'booking-requests' || state !== 'pending'))
          throw new BookingError(
            409,
            'Only a pending request can be accepted.',
            'invalid_transition',
          );
        if (action === 'start' && CUSTODY_MODELS.has(n.model))
          throw new BookingError(
            422,
            'Record the actual check-in or checkout for this physical resource.',
            'custody_action_required',
          );
        if (action === 'start' && !['accepted', 'confirmed'].includes(state))
          throw new BookingError(
            409,
            'Accept or confirm this work before starting.',
            'invalid_transition',
          );
        result = await this.update(
          collection,
          doc.id,
          {
            nexg: {
              ...n,
              status:
                collection === 'booking-requests'
                  ? action === 'accept'
                    ? 'accepted'
                    : 'in_progress'
                  : n.status,
              workState: action === 'accept' ? 'accepted' : 'in_progress',
              version: n.version + 1,
            },
          },
          identity,
          req,
        );
      } else if (action === 'confirm') {
        if (identity.role === 'customer')
          throw new BookingError(403, 'The merchant confirms this request.', 'forbidden');
        if (NON_BLOCKING.has(n.model))
          throw new BookingError(
            409,
            'Accept this request through its work lifecycle; it does not reserve calendar capacity.',
            'nonblocking_request',
          );
        if (
          n.requiresPayment &&
          ((n.paidMinor ?? 0) - (n.refundedMinor ?? 0) < (n.pricing?.dueNowMinor ?? 0) ||
            n.paymentState !== 'merchant_recorded')
        )
          throw new BookingError(
            409,
            'An authoritative payment confirmation or explicit merchant collection evidence is required.',
            'payment_required',
          );
        if (this.externalOwnership(acceptedConfiguration, ['pricing', 'finance.payment']))
          throw new BookingError(
            409,
            'The price or payment owner has not confirmed this request.',
            'source_price_required',
          );
        if (this.externalReservations(acceptedConfiguration))
          throw new BookingError(
            409,
            'The owning system has not confirmed this request.',
            'source_confirmation_required',
          );
        const resources = await this.selectedResources(
          service,
          { offeringId: n.offeringId, customer: n.customer, resourceIds: n.resourceIds },
          identity,
          req,
        );
        this.validateCapacity(service, resources, n.quantity, acceptedConfiguration);
        await this.assertReady(identity, service, resources, req, acceptedConfiguration);
        if (collection === 'booking-requests') {
          result = await this.allocate(
            identity,
            req,
            service,
            resources,
            {
              offeringId: n.offeringId,
              startTime: n.startTime,
              customer: n.customer,
              quantity: n.quantity,
              allocations: n.allocations,
              occurrenceId: n.occurrenceId,
            },
            { ...n, status: 'confirmed', version: n.version + 1 },
            true,
          );
          await this.payload.delete({
            collection: 'booking-requests',
            id: doc.id,
            overrideAccess: false,
            req,
          } as any);
        } else {
          if (doc.status !== 'held')
            throw new BookingError(
              409,
              'This reservation is already confirmed.',
              'invalid_transition',
            );
          result = await this.update(
            'reservations',
            doc.id,
            {
              status: 'confirmed',
              nexg: { ...n, status: 'confirmed', version: n.version + 1, expiresAt: null },
            },
            identity,
            req,
          );
        }
      } else if (action === 'complete') {
        if (CUSTODY_MODELS.has(n.model))
          throw new BookingError(
            409,
            'A physical reservation requires an explicit return or release; scheduled end and generic completion do not release custody.',
            'custody_release_required',
          );
        if (
          identity.role === 'customer' ||
          !['confirmed', 'accepted', 'in_progress'].includes(state)
        )
          throw new BookingError(
            409,
            'Only accepted or confirmed work can be completed by the merchant.',
            'invalid_transition',
          );
        const evidence = text(input.completionEvidence, 'Completion evidence', 2000);
        result = await this.update(
          collection,
          doc.id,
          {
            ...(collection === 'reservations' ? { status: 'completed' } : {}),
            nexg: {
              ...n,
              status: 'completed',
              workState: 'completed',
              completionEvidence: evidence,
              completedAt: new Date(this.clock()).toISOString(),
              version: n.version + 1,
            },
          },
          identity,
          req,
        );
      } else if (action === 'reschedule') {
        if (
          n.workState === 'in_progress' ||
          (n.startTime && Date.parse(n.startTime) <= this.clock())
        )
          throw new BookingError(
            409,
            'The change policy permits rescheduling before work starts.',
            'change_policy',
          );
        const times = this.window(service, {
          offeringId: n.offeringId,
          startTime: input.startTime,
          endTime: input.endTime,
          customer: n.customer,
        });
        const entitlementChange = await this.entitlementChange(identity, n, times, input, req);
        const calculatedPricing = this.price(
          {
            ...service,
            nexg: {
              ...service.nexg,
              ...n.acceptedPricing,
              reservationFee: n.acceptedReservationFee,
            },
          },
          times.start,
          times.end,
          n.quantity,
        );
        const sourceRequired = this.externalOwnership(acceptedConfiguration, [
          'pricing',
          'finance.payment',
        ]);
        const pricing = {
          ...calculatedPricing,
          sourceRequired,
          indicative: sourceRequired || calculatedPricing.indicative,
        };
        if (n.requiresPayment && (n.paidMinor ?? 0) - (n.refundedMinor ?? 0) < pricing.dueNowMinor)
          throw new BookingError(
            409,
            'The revised period requires additional fee collection. The original reservation is unchanged.',
            'additional_collection_required',
          );
        if (
          input.expectedTotalMinor !== undefined &&
          input.expectedTotalMinor !== pricing.totalMinor
        )
          throw new BookingError(409, 'Review the changed booking price.', 'price_changed');
        const changed = {
          ...n,
          ...(entitlementChange
            ? {
                entitlementOccurrenceKey: entitlementChange.key,
                entitlementValidity: entitlementChange.validity,
                entitlementDebit: n.entitlementDebit
                  ? { ...n.entitlementDebit, occurrenceKey: entitlementChange.key }
                  : undefined,
              }
            : {}),
          pricing,
          pricingBasis: pricing.basis,
          priceMinor: pricing.totalMinor,
          startTime: times.start === null ? null : new Date(times.start).toISOString(),
          endTime: times.end === null ? null : new Date(times.end).toISOString(),
          version: n.version + 1,
        };
        if (collection === 'reservations') {
          const resources = await this.selectedResources(
            service,
            { offeringId: n.offeringId, resourceIds: n.resourceIds, customer: n.customer },
            identity,
            req,
          );
          this.validateCapacity(service, resources, n.quantity, acceptedConfiguration);
          await this.assertReady(identity, service, resources, req, acceptedConfiguration);
          if (n.model === 'SESSION_CAPACITY') {
            await this.update('reservations', doc.id, { status: 'cancelled' }, identity, req);
            await this.cleanupSessions(identity, req);
            const replacement = await this.allocate(
              identity,
              req,
              service,
              resources,
              {
                offeringId: n.offeringId,
                startTime: changed.startTime,
                endTime: changed.endTime,
                quantity: n.quantity,
                customer: n.customer,
                allocations: n.allocations,
                occurrenceId: input.occurrenceId,
              },
              { ...changed, publicId: publicId() },
              true,
            );
            await this.payload.delete({
              collection: 'reservations',
              id: doc.id,
              overrideAccess: false,
              req,
            } as any);
            result = await this.update(
              'reservations',
              replacement.id,
              { publicId: id, nexg: { ...replacement.nexg, publicId: id } },
              identity,
              req,
            );
          } else {
            for (const r of resources)
              if (!this.scheduleAllows(service, r, times.start!, times.end!))
                throw new BookingError(
                  409,
                  'The new time is outside working hours.',
                  'outside_schedule',
                );
            result = await this.update(
              collection,
              doc.id,
              { startTime: changed.startTime, endTime: changed.endTime, nexg: changed },
              identity,
              req,
            );
          }
        } else result = await this.update(collection, doc.id, { nexg: changed }, identity, req);
        await this.updateEntitlementChange(identity, result, entitlementChange, req);
      } else throw new BookingError(404, 'Unknown booking action.', 'not_found');
      await this.cleanupSessions(identity, req);
      await this.audit(identity, req, `booking.${action}`, id, { version: result.nexg?.version });
      return this.bookingView(result);
    });
  }
}
