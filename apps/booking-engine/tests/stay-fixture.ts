import { randomUUID } from 'node:crypto';
import type { Payload } from 'payload';
import { BookingEngine } from '../src/engine.js';
import { publishStayInventory, type StayQuoteInput } from '../src/stays.js';
import type { Identity } from '../src/types.js';
/** Synthetic trusted catalog provisioning only; never production source cutover. */
export async function setupStayFixture(
  payload: Payload,
  sqlite = true,
  clock = () => Date.parse('2030-01-01T00:00:00Z'),
) {
  const engine = new BookingEngine(payload, sqlite, clock),
    owner: Identity = {
      businessId: randomUUID(),
      userId: randomUUID(),
      role: 'owner',
      expiresAt: Date.now() + 3600000,
    };
  const guest: Identity = { ...owner, userId: randomUUID(), role: 'customer' },
    customer = { name: 'Stay fixture guest', email: 'stay@example.test' };
  const docs = async (collection: string) =>
    (
      await payload.find({
        collection: collection as any,
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as any[];
  const update = async (collection: string, id: any, data: any) =>
    payload.update({
      collection: collection as any,
      id,
      data,
      overrideAccess: true,
      context: { nexgSystem: true },
      depth: 0,
    });
  await engine.configure(owner, { subcategoryId: 'haircare', published: false }, randomUUID());
  const resource: any = await engine.addResource(
    owner,
    {
      name: 'Fixture exclusive room',
      kind: 'asset',
      quantity: 1,
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
    },
    randomUUID(),
  );
  const offering: any = await engine.addOffering(
    owner,
    {
      name: 'Fixture room',
      model: 'APPOINTMENT',
      durationMinutes: 60,
      resourceIds: [resource.id],
      priceMinor: 10000,
      currency: 'KES',
      intakeMode: 'instant_after_requirements',
      active: true,
      bookingEnabled: true,
      leadTimeMinutes: 0,
      horizonDays: 3650,
      paymentPolicyId: 'NO_PREPAYMENT_V1',
      changePolicyId: 'CHANGE_BEFORE_START_V1',
      policyVersion: 1,
    },
    randomUUID(),
  );
  const business = (await docs('businesses'))[0],
    service = (await docs('services'))[0];
  const nexg = {
    ...service.nexg,
    model: 'ASSET_INTERVAL',
    pricingBasis: 'per_night',
    minimumBillableUnits: 1,
  };
  await update('services', service.id, { durationType: 'flexible', nexg });
  const authority = ['reservations', 'availability', 'resources', 'pricing'].map((data_class) => ({
    data_class,
    authority: 'NEXG_AUTHORITATIVE',
    owner_reference: 'nexg-booking-engine',
    scope: { business_id: owner.businessId },
  }));
  const config = {
    ...business.configuration,
    published: true,
    canonicalAnswers: { Q_DATA_AUTHORITY: authority },
  };
  await update('businesses', business.id, { configuration: config });
  const propertyId = randomUUID(),
    unitId = randomUUID();
  await publishStayInventory(
    engine,
    owner,
    {
      offeringId: offering.id,
      expectedOfferingVersion: nexg.version,
      propertyId,
      unitId,
      resourceId: resource.id,
      maxGuests: 4,
      minNights: 1,
      maxNights: 30,
      checkInTime: '15:00',
      checkOutTime: '10:00',
    },
    randomUUID(),
  );
  // Synthetic fixture only: publication remains disabled and production cannot enable it.
  if (process.env.NODE_ENV !== 'test') throw new Error('Stay fixture requires NODE_ENV=test');
  const published = (await docs('services'))[0];
  if (published.nexg.stayInventory.pilotState !== 'disabled')
    throw new Error('Stay publication must default disabled');
  await update('services', published.id, {
    nexg: {
      ...published.nexg,
      stayInventory: { ...published.nexg.stayInventory, pilotState: 'synthetic_fixture_enabled' },
    },
  });
  const input: StayQuoteInput = {
    propertyId,
    unitId,
    checkIn: '2030-01-02',
    checkOut: '2030-01-04',
    adults: 2,
    children: 1,
  };
  return {
    engine,
    owner,
    guest,
    customer,
    docs,
    update,
    business,
    service,
    resource,
    offering,
    authority,
    config,
    input,
  };
}
