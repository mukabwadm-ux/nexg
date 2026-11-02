import { describe, expect, it } from 'vitest';
import {
  activityIssues,
  blockingImpact,
  category,
  createActivity,
  extendBusinessProfiles,
  fields,
  profiles,
  seedBusiness,
  validateBusiness,
} from './model';
import { BusinessConflict, localBusinessSource, readDraft, writeDraft } from './source';
const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
describe('Business frontend configuration', () => {
  it('validates representative configured samples and every source question for all 128 specialties', () => {
    expect(profiles).toHaveLength(128);
    expect(new Set(profiles.map((p) => p.categoryId)).size).toBe(21);
    for (const profile of profiles) {
      expect(validateBusiness(seedBusiness(profile.id)), profile.id).toEqual([]);
      for (const id of profile.questions) expect(fields[id], id).toBeDefined();
    }
  });
  it('keeps selected activities and required coverage separate in a hybrid business', () => {
    const data = seedBusiness();
    expect(data.activities.filter((a) => a.enabled)).toHaveLength(2);
    const visit = data.activities.find((a) => a.id === 'home-visits')!;
    expect(visit.enabled).toBe(false);
    expect(activityIssues(visit, data)).toContain('Define your service area.');
    expect(activityIssues({ ...visit, coverage: 'Westlands' }, data)).toEqual([]);
    const rental = seedBusiness('self_drive').activities[0]!;
    expect(rental.driver).toBe(false);
    expect(rental.model).toBe('ASSET_INTERVAL');
    expect(rental.methods).not.toContain('PASSENGER_TRANSFER');
  });
  it('accepts a digital activity without forcing a physical venue', () => {
    const activity = createActivity(category('haircare')!, 'APPOINTMENT', 'remote');
    activity.methods = ['DIGITAL'];
    activity.locationIds = [];
    expect(activityIssues(activity, { locations: [] })).toEqual([]);
  });
  it('preserves existing obligations and the last active owner', () => {
    const data = seedBusiness();
    const next = structuredClone(data);
    next.activities[0]!.enabled = false;
    expect(blockingImpact(data, next)).toBe(true);
    next.members = next.members.filter((m) => m.role !== 'Owner');
    expect(validateBusiness(next)).toContain('Keep at least one active owner.');
  });
  it('requires registered question IDs and models for future definitions', () => {
    const p = { ...profiles[0]!, id: 'future-specialty', name: 'Future specialty' };
    expect(extendBusinessProfiles([p])).toHaveLength(129);
    expect(() => extendBusinessProfiles([{ ...p, questions: ['UNKNOWN'] }])).toThrow();
    expect(() => extendBusinessProfiles([profiles[0]!])).toThrow();
  });
  it('keeps unavailable external ownership and rental driver requirements explicit', () => {
    const data = seedBusiness('self_drive');
    const rental = data.activities[0]!;
    expect(data.members.some((m) => m.role === 'Driver')).toBe(false);
    expect(
      activityIssues({ ...rental, source: 'External', sourceConfirmed: false }, data),
    ).toContain('Connect this activity source in Settings before enabling it.');
    expect(activityIssues({ ...rental, driver: true, resourceCount: 0 }, data)).toContain(
      'Link eligible vehicle and driver resources in Availability.',
    );
  });
});
describe('Business local source', () => {
  it('persists updates, isolates specialties and rejects stale revisions', async () => {
    const storage = memory();
    const source = localBusinessSource(storage);
    const data = await source.load('haircare');
    const changed = { ...data, profile: { ...data.profile, name: 'Changed sample' } };
    const saved = await source.save(changed, data.revision, 'Changed name');
    expect(saved.revision).toBe(13);
    expect((await source.load('haircare')).profile.name).toBe('Changed sample');
    expect((await source.load('self_drive')).profile.name).not.toBe('Changed sample');
    await expect(source.save(changed, data.revision, 'Stale save')).rejects.toBeInstanceOf(
      BusinessConflict,
    );
  });
  it('recovers independent drafts without changing confirmed facts', async () => {
    const storage = memory();
    writeDraft(storage, 'haircare', {
      section: 'profile',
      id: 'profile',
      baseRevision: 12,
      value: { name: 'Unfinished' },
    });
    writeDraft(storage, 'haircare', {
      section: 'activities',
      id: 'new',
      baseRevision: 12,
      value: { name: 'Activity draft' },
    });
    expect(readDraft(storage, 'haircare')?.value).toEqual({ name: 'Unfinished' });
    expect(readDraft(storage, 'haircare', 'activities', 'new')?.value).toEqual({
      name: 'Activity draft',
    });
    expect((await localBusinessSource(storage).load('haircare')).profile.name).toBe(
      'Nairobi Collective',
    );
    writeDraft(storage, 'haircare', null);
    expect(readDraft(storage, 'haircare')).toBeNull();
    expect(readDraft(storage, 'haircare', 'activities', 'new')).not.toBeNull();
  });
  it('does not silently reset incompatible storage or claim document verification', async () => {
    const storage = memory();
    storage.setItem('nexg.business.preview.v1.haircare', '{broken');
    await expect(localBusinessSource(storage).load('haircare')).rejects.toThrow('unreadable');
    const source = localBusinessSource(memory());
    const data = await source.load('haircare');
    const d = data.documents[1]!;
    const saved = await source.save(
      {
        ...data,
        documents: data.documents.map((x) =>
          x.id === d.id ? { ...x, replacement: 'Review pending' as const } : x,
        ),
      },
      data.revision,
      'Replacement',
    );
    expect(saved.documents[1]!.current).toBe('Verified');
    expect(saved.documents[1]!.replacement).toBe('Review pending');
  });
  it('preserves customer reviews, verified evidence and invitation acceptance ownership', async () => {
    const source = localBusinessSource(memory());
    const data = await source.load('haircare');
    await expect(
      source.save({ ...data, accountStatus: 'Paused' }, 12, 'Change approval'),
    ).rejects.toThrow('review owner');
    await expect(
      source.save(
        {
          ...data,
          reviews: data.reviews.map((r, i) => (i ? r : { ...r, text: 'Changed customer text' })),
        },
        12,
        'Edit review',
      ),
    ).rejects.toThrow('read-only');
    await expect(
      source.save(
        {
          ...data,
          documents: data.documents.map((d, i) => (i === 2 ? { ...d, current: 'Verified' } : d)),
        },
        12,
        'Self verify',
      ),
    ).rejects.toThrow('document owner');
    await expect(
      source.save(
        {
          ...data,
          members: data.members.map((m) => (m.id === 'john' ? { ...m, state: 'Active' } : m)),
        },
        12,
        'Accept invitation',
      ),
    ).rejects.toThrow('identity owner');
  });
});
