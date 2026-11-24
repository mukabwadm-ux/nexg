import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { runHostCommand } from './commands';
import { guideDocument } from './guides';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const ARTICLE = '44444444-4444-4444-8444-444444444444';

const article = {
  id: ARTICLE,
  title: 'Wi-Fi',
  room: 'Living room',
  content: 'Network NexG, code on the router.',
  steps: '',
};

/** A house as the phone's House Builder exports it, with fields the backend doesn't know about. */
function house(rooms = 1) {
  return {
    version: 1,
    name: 'Kilimani flat',
    units: 'meters',
    totalArea: 12 * rooms,
    rooms: Array.from({ length: rooms }, (_, index) => ({
      id: `room-${index}`,
      name: index ? `Bedroom ${index}` : 'Living room',
      x: index * 4,
      y: 0,
      w: 4,
      d: 3,
      h: 2.7,
      color: '#f4f1ea',
      corners: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      area: 12,
      doors: [
        { id: `door-${index}`, wall: 2, at: 0.5, width: 0.9, to: 'outside', main: index === 0 },
      ],
      windows: [],
      items: [{ id: `sofa-${index}`, preset: 'sofa', x: 1, y: 1, rot: 0 }],
      pins: [{ cat: 'wifi', sub: 'Router', x: 2, y: 2, note: 'Code on the back.' }],
    })),
  };
}

function guideAccess(saved: { document: unknown; revision: number } | null) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: 1,
    error: null,
  }));
  const from = vi.fn((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () =>
        table === 'unit' ? { data: { id: UNIT }, error: null } : { data: saved, error: null },
    };
    return chain;
  });
  return {
    rpc,
    access: {
      db: { rpc, from },
      hostId: HOST,
      unitScope: null,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

const saveHouse = (record: unknown, expectedVersion = 3) => ({
  type: 'save-house',
  collection: 'units',
  id: UNIT,
  expectedVersion,
  record,
});

function sentDocument(rpc: ReturnType<typeof guideAccess>['rpc']) {
  expect(rpc).toHaveBeenCalledTimes(1);
  const [name, args] = rpc.mock.calls[0]!;
  expect(name).toBe('rpc_host_workspace_guide_commit');
  expect(args).toMatchObject({ p_unit_id: UNIT, p_revision: 3, p_action: 'draft' });
  return args.p_document as Record<string, unknown>;
}

describe('the 3D house in the guide', () => {
  it('saves the house into the draft and keeps the instructions', async () => {
    const { access, rpc } = guideAccess({
      document: { articles: [article], planId: null },
      revision: 3,
    });
    const result = await runHostCommand(access, saveHouse({ house: house(2) }));
    expect(result).toEqual({ message: '3D house saved to the guide draft.' });
    const document = sentDocument(rpc);
    expect(document.articles).toEqual([article]);
    expect(document.house).toEqual(house(2));
  });

  it('takes the house out of the guide when it is null', async () => {
    const { access, rpc } = guideAccess({
      document: { articles: [article], house: house() },
      revision: 3,
    });
    const result = await runHostCommand(access, saveHouse({ house: null }));
    expect(result).toEqual({ message: '3D house removed from the guide draft.' });
    const document = sentDocument(rpc);
    expect('house' in document).toBe(false);
    expect(document.articles).toEqual([article]);
  });

  it('keeps the house when an instruction is edited', async () => {
    const { access, rpc } = guideAccess({
      document: { articles: [], house: house() },
      revision: 3,
    });
    await runHostCommand(access, {
      type: 'save',
      collection: 'articles',
      expectedVersion: 3,
      record: {
        unitId: UNIT,
        title: 'Water heater',
        content: 'Switch on 20 minutes before a shower.',
      },
    });
    expect(sentDocument(rpc).house).toEqual(house());
  });

  it('refuses a house that would break the builder', async () => {
    const broken = house();
    broken.rooms[0]!.w = 0;
    const { access, rpc } = guideAccess({ document: { articles: [] }, revision: 3 });
    await expect(runHostCommand(access, saveHouse({ house: broken }))).rejects.toMatchObject({
      status: 400,
      message: 'Check the 3D house: a room, door, window, item or amenity is not valid.',
    });
    await expect(runHostCommand(access, saveHouse({ house: house(41) }))).rejects.toMatchObject({
      status: 400,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a house over 200,000 characters', async () => {
    const large = house(4);
    large.rooms.forEach((room) => {
      room.pins = Array.from({ length: 60 }, (_, index) => ({
        cat: 'other',
        sub: `Note ${index}`,
        x: 1,
        y: 1,
        note: 'x'.repeat(1000),
      }));
    });
    const { access, rpc } = guideAccess({ document: { articles: [] }, revision: 3 });
    await expect(runHostCommand(access, saveHouse({ house: large }))).rejects.toMatchObject({
      status: 400,
      message: 'This 3D house is too large to save. Remove some furniture or rooms.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a save over a newer guide', async () => {
    const { access, rpc } = guideAccess({ document: { articles: [] }, revision: 4 });
    await expect(runHostCommand(access, saveHouse({ house: house() }))).rejects.toMatchObject({
      status: 409,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads a guide whose saved house no longer passes as having no house', () => {
    const parsed = guideDocument.parse({
      articles: [article],
      house: { version: 1, name: 'Flat', rooms: 'none' },
    });
    expect(parsed.articles).toHaveLength(1);
    expect(parsed.house).toBeNull();
  });
});
