import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  saveSetupOffering: vi.fn(),
  saveSetupOfferingPublication: vi.fn(),
  loadSetupOfferings: vi.fn(),
}));
vi.mock('@/app/merchant/offering-setup-actions', () => actions);
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));

import { liveOfferingsSource } from './live-source';
import { createOffering, profiles, type Offering } from './model';
import { saveOfferingPublication } from './publication';

const profile = profiles.find((p) => p.id === 'adult_products')!;
const draft: Offering = {
  ...createOffering(profile, profile.schema, '00000000-0000-4000-8000-000000000001'),
  name: 'Gift box',
};
const published: Offering = { ...draft, publication: 'published' };

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveSetupOffering.mockImplementation(async (item: Offering) => ({ ok: true, item }));
  actions.saveSetupOfferingPublication.mockImplementation(
    async (item: Offering, publish: boolean) => ({
      ok: true,
      item: { ...item, publication: publish ? 'published' : 'draft' },
    }),
  );
});

describe('saving an offering with its publication', () => {
  it('saves a draft as a draft', async () => {
    await saveOfferingPublication(draft);
    expect(actions.saveSetupOffering).toHaveBeenCalledWith(draft);
    expect(actions.saveSetupOfferingPublication).not.toHaveBeenCalled();
  });

  it('publishes, keeps a published offering published, and unpublishes', async () => {
    expect((await saveOfferingPublication(draft, 'published')).publication).toBe('published');
    expect(actions.saveSetupOfferingPublication).toHaveBeenLastCalledWith(draft, true);
    await saveOfferingPublication(published);
    expect(actions.saveSetupOfferingPublication).toHaveBeenLastCalledWith(published, true);
    expect((await saveOfferingPublication(published, 'draft')).publication).toBe('draft');
    expect(actions.saveSetupOfferingPublication).toHaveBeenLastCalledWith(published, false);
  });

  it('passes on the reason a save failed', async () => {
    actions.saveSetupOfferingPublication.mockResolvedValueOnce({
      ok: false,
      message: 'Describe what the customer receives.',
    });
    await expect(saveOfferingPublication(draft, 'published')).rejects.toThrow(
      'Describe what the customer receives.',
    );
  });
});

describe('the Offerings page in the sidebar', () => {
  const source = (canEditDrafts: boolean) =>
    liveOfferingsSource({ rows: [], primaryActivity: profile.id, canEditDrafts }).source;

  it('publishes through the same save as the Offerings section on Home', async () => {
    const saved = await source(true).save(profile, draft, 'published');
    expect(actions.saveSetupOfferingPublication).toHaveBeenCalledWith(draft, true);
    expect(saved.publication).toBe('published');
  });

  it('saves changes to a published offering and can unpublish it', async () => {
    await source(true).save(profile, published);
    expect(actions.saveSetupOfferingPublication).toHaveBeenLastCalledWith(published, true);
    await source(true).save(profile, published, 'draft');
    expect(actions.saveSetupOfferingPublication).toHaveBeenLastCalledWith(published, false);
  });

  it('lets only the business owner save', async () => {
    await expect(source(false).save(profile, draft, 'published')).rejects.toThrow(
      'Only the business owner can change offerings.',
    );
    expect(actions.saveSetupOfferingPublication).not.toHaveBeenCalled();
  });
});
