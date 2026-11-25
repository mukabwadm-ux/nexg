import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { runHostCommand } from './commands';
import { pinOf, propertyStatus } from './read';
import { STAY_AMENITIES } from './vocab';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const PROPERTY = '33333333-3333-4333-8333-333333333333';

function access(
  result: { data: unknown; error: { code: string; message: string } | null },
  unitScope: string[] | null = null,
) {
  const rpc = vi.fn(async () => result);
  return {
    rpc,
    access: {
      db: { rpc },
      hostId: HOST,
      unitScope,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

/** A PostGIS point as hex EWKB with SRID 4326, the way PostgREST returns geography. */
function ewkb(lng: number, lat: number) {
  const bytes = Buffer.alloc(25);
  bytes.writeUInt8(1, 0);
  bytes.writeUInt32LE(0x20000001, 1);
  bytes.writeUInt32LE(4326, 5);
  bytes.writeDoubleLE(lng, 9);
  bytes.writeDoubleLE(lat, 17);
  return bytes.toString('hex').toUpperCase();
}

describe('pinOf', () => {
  it('reads hex EWKB', () => {
    expect(pinOf(ewkb(36.7856, -1.2921))).toEqual({ lat: -1.2921, lng: 36.7856 });
  });
  it('reads GeoJSON', () => {
    expect(pinOf({ type: 'Point', coordinates: [36.8, -1.3] })).toEqual({ lat: -1.3, lng: 36.8 });
  });
  it('ignores anything else', () => {
    expect(pinOf(null)).toBeNull();
    expect(pinOf('not a point')).toBeNull();
  });
});

describe('amenity vocabulary', () => {
  it('offers the 17 labels the Discovery engine maps', () => {
    expect(STAY_AMENITIES).toHaveLength(17);
    expect(new Set(STAY_AMENITIES.map((item) => item.toLowerCase())).size).toBe(17);
    expect(STAY_AMENITIES).toContain('Guarded gate');
  });
});

describe('listing details', () => {
  it('sends the pin and what guests read with a property', async () => {
    const { access: a, rpc } = access({ data: {}, error: null });
    await runHostCommand(a, {
      type: 'save',
      collection: 'properties',
      id: PROPERTY,
      record: {
        name: 'Block',
        area: 'Kilimani',
        kind: 'apartment',
        lat: -1.29,
        lng: 36.78,
        amenities: ['Wi-Fi', 'Rooftop braai'],
        neighbourhoodNote: 'Quiet street.',
        houseRules: 'No parties.',
        cancellationPolicy: 'Free up to 5 days before.',
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_property_upsert',
      expect.objectContaining({
        p_property: expect.objectContaining({
          lat: -1.29,
          lng: 36.78,
          amenities: ['Wi-Fi', 'Rooftop braai'],
          neighbourhood_note: 'Quiet street.',
          house_rules: 'No parties.',
          cancellation_policy: 'Free up to 5 days before.',
        }),
      }),
    );
  });

  it('sends beds, size, summary, minimum nights and amenities with a unit', async () => {
    const { access: a, rpc } = access({ data: {}, error: null });
    await runHostCommand(a, {
      type: 'save',
      collection: 'units',
      id: UNIT,
      record: {
        name: 'A',
        bedSetup: '1 queen',
        sizeSqm: 64,
        summary: 'Corner flat.',
        minNights: 2,
        amenities: ['Balcony'],
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_unit_upsert_guarded',
      expect.objectContaining({
        p_unit: expect.objectContaining({
          bed_setup: '1 queen',
          size_sqm: 64,
          unit_summary: 'Corner flat.',
          min_nights: 2,
          unit_amenities: ['Balcony'],
        }),
      }),
    );
  });

  it('refuses half a pin and house rules over 2000 characters', async () => {
    const { access: a } = access({ data: {}, error: null });
    const base = { name: 'Block', area: 'Kilimani', kind: 'apartment' };
    await expect(
      runHostCommand(a, { type: 'save', collection: 'properties', record: { ...base, lat: 1 } }),
    ).rejects.toThrow();
    await expect(
      runHostCommand(a, {
        type: 'save',
        collection: 'properties',
        record: { ...base, houseRules: 'x'.repeat(2001) },
      }),
    ).rejects.toThrow();
  });
});

describe('the publish switch', () => {
  it('calls rpc_unit_set_published', async () => {
    const { access: a, rpc } = access({ data: { listed: true }, error: null });
    const result = await runHostCommand(a, {
      type: 'listing',
      collection: 'units',
      id: UNIT,
      record: { published: true },
    });
    expect(rpc).toHaveBeenCalledWith('rpc_unit_set_published', {
      p_unit: UNIT,
      p_published: true,
    });
    expect(result).toEqual({ message: 'Unit published on NEXG Stays.' });
  });

  it('says when NexG has taken the property down', async () => {
    const { access: a } = access({ data: { held_by_staff: true }, error: null });
    const result = await runHostCommand(a, {
      type: 'listing',
      collection: 'units',
      id: UNIT,
      record: { published: true },
    });
    expect(result.message).toMatch(/NexG has taken this property off the site/);
  });

  it('passes on what an unready unit is missing', async () => {
    const { access: a } = access({
      data: null,
      error: { code: '22023', message: 'Before this unit can go live it needs: A nightly rate.' },
    });
    await expect(
      runHostCommand(a, {
        type: 'listing',
        collection: 'units',
        id: UNIT,
        record: { published: true },
      }),
    ).rejects.toThrow('A nightly rate');
  });

  it('is not open to team members limited to some units', async () => {
    const { access: a, rpc } = access({ data: {}, error: null }, [UNIT]);
    await expect(
      runHostCommand(a, {
        type: 'listing',
        collection: 'units',
        id: UNIT,
        record: { published: false },
      }),
    ).rejects.toThrow('outside your workspace access');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('saving a unit', () => {
  it('saves an existing unit whose capacity and rate came back as 0', async () => {
    const { access: a, rpc } = access({ data: {}, error: null });
    await expect(
      runHostCommand(a, {
        type: 'save',
        collection: 'units',
        id: UNIT,
        record: { name: 'A', capacity: 0, rateKes: 0, bedrooms: 0, sizeSqm: 0, minNights: 1 },
      }),
    ).resolves.toEqual({ message: 'Unit saved.' });
    const unit = (rpc.mock.calls[0] as unknown as [string, { p_unit: Record<string, unknown> }])[1]
      .p_unit;
    expect(unit.max_guests).toBeUndefined();
    expect(unit.nightly_rate_kes).toBeUndefined();
    expect(unit.size_sqm).toBeUndefined();
    expect(unit.bedrooms).toBe(0);
  });

  it('adds a unit with no property chosen and leaves the property to the database', async () => {
    const { access: a, rpc } = access({ data: {}, error: null });
    await runHostCommand(a, { type: 'save', collection: 'units', record: { name: 'Studio 2' } });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_unit_upsert_guarded',
      expect.objectContaining({
        p_unit_id: undefined,
        p_unit: expect.objectContaining({ name: 'Studio 2' }),
      }),
    );
  });

  it('tells a closed host why the unit was not saved', async () => {
    const closed = 'This host account is closed. Contact NexG support to reopen it.';
    const { access: a } = access({ data: null, error: { code: '42501', message: closed } });
    await expect(
      runHostCommand(a, { type: 'save', collection: 'units', id: UNIT, record: { name: 'A' } }),
    ).rejects.toThrow(closed);
  });

  it('keeps Postgres permission errors generic', async () => {
    const { access: a } = access({
      data: null,
      error: { code: '42501', message: 'permission denied for table unit' },
    });
    await expect(
      runHostCommand(a, { type: 'save', collection: 'units', id: UNIT, record: { name: 'A' } }),
    ).rejects.toThrow('outside your workspace access');
  });
});

describe('the property badge', () => {
  it('puts NexG review before the listing switch', () => {
    expect(propertyStatus(true, 'pending')).toBe('Waiting for NexG review');
    expect(propertyStatus(true, 'rejected')).toBe('Not approved by NexG');
    expect(propertyStatus(true, 'suspended')).toBe('Suspended by NexG');
    expect(propertyStatus(true, 'approved')).toBe('Active');
    expect(propertyStatus(false, 'approved')).toBe('Unlisted');
    expect(propertyStatus(true, undefined)).toBe('Active');
  });
});
