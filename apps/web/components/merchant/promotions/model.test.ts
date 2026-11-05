import { describe, expect, it } from 'vitest';
import {
  availableSchemas,
  createOffering,
  discountedMinor,
  moneyMinor,
  profiles,
  seedCatalogue,
} from '../offerings/model';
import { localOfferingsSource } from '../offerings/source';
import { schemas } from '../offerings/schemas';
import {
  campaignState,
  contextFor,
  emptyCampaign,
  isHistory,
  localInstant,
  publicSnapshot,
  validateCampaign,
} from './model';
import { localPromotionSource, newCampaignId } from './source';

function memoryStorage() {
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
}
const profile = profiles.find((p) => p.id === 'makeup')!;

describe('adaptive promotions', () => {
  it('resolves every registered specialty through its actual offering schema', () => {
    expect(profiles).toHaveLength(141);
    expect(new Set(profiles.map((p) => p.categoryId)).size).toBe(22);
    const models = new Set<string>();
    for (const entry of profiles) {
      const item = seedCatalogue(entry).offerings[0]!;
      const context = contextFor(item);
      expect(context.model).toBe(schemas[item.schemaId]!.model);
      expect(context.action).toBeTruthy();
      expect(context.unit).toBeTruthy();
      for (const model of entry.models) models.add(model);
    }
    expect(models.size).toBe(15);
  });

  it('adapts to every compatible editor schema instead of assuming the default activity', () => {
    const checked = new Set<string>();
    for (const specialty of profiles) {
      for (const schemaId of availableSchemas(specialty)) {
        const item = createOffering(specialty, schemaId, `offering-${specialty.id}-${schemaId}`);
        const campaign = emptyCampaign(specialty, item.id, 'draft');
        expect(contextFor(item).model).toBe(schemas[schemaId]!.model);
        expect(publicSnapshot(campaign, item)?.action).toBe(schemas[schemaId]!.action);
        checked.add(schemaId);
      }
    }
    expect(checked.size).toBe(18);
  });

  it('applies, pauses, resumes and ends one shared offering discount across reloads', async () => {
    const storage = memoryStorage(),
      source = localPromotionSource(storage);
    let loaded = await source.load(profile);
    const offering = loaded.catalogue.offerings.find((o) => o.name === 'Bridal makeup')!;
    expect(offering.publication).toBe('published');
    const draft = {
      ...emptyCampaign(profile, offering.id, newCampaignId()),
      name: 'Weekday offer',
      rule: { kind: 'percentage' as const, value: '10', startsAt: '', endsAt: '' },
    };
    let result = await source.change(profile, {
      campaign: draft,
      action: 'activate',
      expectedRevision: loaded.data.revision,
      expectedOfferingVersion: offering.version,
    });
    expect(
      campaignState(
        result.campaign,
        result.catalogue.offerings.find((o) => o.id === offering.id),
      ),
    ).toBe('Active');
    const shared = await localOfferingsSource(storage).load(profile);
    expect(shared.offerings.find((o) => o.id === offering.id)?.discount).toEqual({
      ...draft.rule,
      enabled: true,
    });
    expect(discountedMinor(shared.offerings.find((o) => o.id === offering.id)!, 850000)).toBe(
      765000,
    );
    loaded = await source.load(profile);
    result = await source.change(profile, {
      campaign: result.campaign,
      action: 'pause',
      expectedRevision: loaded.data.revision,
    });
    expect(result.catalogue.offerings.find((o) => o.id === offering.id)?.discount?.enabled).toBe(
      false,
    );
    expect(
      campaignState(
        result.campaign,
        result.catalogue.offerings.find((o) => o.id === offering.id),
      ),
    ).toBe('Paused');
    const pausedPreview = publicSnapshot(
      result.campaign,
      result.catalogue.offerings.find((o) => o.id === offering.id),
    );
    expect(pausedPreview?.priceMinor).toBe(850000);
    expect(pausedPreview?.benefit).toBe('Offer paused');
    result = await source.change(profile, {
      campaign: result.campaign,
      action: 'resume',
      expectedRevision: result.data.revision,
    });
    expect(result.catalogue.offerings.find((o) => o.id === offering.id)?.discount?.enabled).toBe(
      true,
    );
    result = await source.change(profile, {
      campaign: result.campaign,
      action: 'end',
      expectedRevision: result.data.revision,
    });
    expect(result.catalogue.offerings.find((o) => o.id === offering.id)?.discount?.enabled).toBe(
      false,
    );
    expect(
      isHistory(
        campaignState(
          result.campaign,
          result.catalogue.offerings.find((o) => o.id === offering.id),
        ),
      ),
    ).toBe(true);
    expect(result.campaign.archivedPreview?.priceMinor).toBe(765000);
    expect(
      (await source.load(profile)).data.campaigns
        .find((c) => c.id === draft.id)
        ?.history.map((h) => h.action),
    ).toEqual(['Promotion ended', 'Offer resumed', 'Offer paused', 'Offer activated in sample']);
  });

  it('does not overwrite a changed or externally owned discount', async () => {
    const storage = memoryStorage(),
      source = localPromotionSource(storage),
      start = await source.load(profile);
    const item = start.catalogue.offerings.find((o) => o.name === 'Bridal makeup')!;
    const draft = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Offer',
      rule: { kind: 'percentage' as const, value: '10', startsAt: '', endsAt: '' },
    };
    const active = await source.change(profile, {
      campaign: draft,
      action: 'activate',
      expectedRevision: start.data.revision,
      expectedOfferingVersion: item.version,
    });
    const stored = JSON.parse(storage.getItem(`nexg.offerings.preview.v1.${profile.id}`)!);
    const changed = stored.offerings.find((o: { id: string }) => o.id === item.id);
    changed.discount.value = '25';
    changed.version++;
    storage.setItem(`nexg.offerings.preview.v1.${profile.id}`, JSON.stringify(stored));
    await expect(
      source.change(profile, {
        campaign: active.campaign,
        action: 'pause',
        expectedRevision: active.data.revision,
      }),
    ).rejects.toThrow('discount changed');
    expect(
      (await localOfferingsSource(storage).load(profile)).offerings.find((o) => o.id === item.id)
        ?.discount?.value,
    ).toBe('25');
    const external = { ...item, sources: { ...item.sources, price: 'external' as const } };
    expect(validateCampaign(draft, external, true)).toContain(
      'The price is managed by a connected system. Manage its discount there.',
    );
  });

  it('allows a new offer after the previous owner ends but not while another owner is paused', async () => {
    const storage = memoryStorage(),
      source = localPromotionSource(storage),
      start = await source.load(profile);
    const item = start.catalogue.offerings.find((o) => o.name === 'Bridal makeup')!;
    const draft = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Offer',
      rule: { kind: 'percentage' as const, value: '10', startsAt: '', endsAt: '' },
    };
    const active = await source.change(profile, {
      campaign: draft,
      action: 'activate',
      expectedRevision: start.data.revision,
      expectedOfferingVersion: item.version,
    });
    const ended = await source.change(profile, {
      campaign: active.campaign,
      action: 'end',
      expectedRevision: active.data.revision,
    });
    const copied = await source.change(profile, {
      campaign: ended.campaign,
      action: 'duplicate',
      expectedRevision: ended.data.revision,
    });
    const currentItem = copied.catalogue.offerings.find((o) => o.id === item.id)!;
    const activeAgain = await source.change(profile, {
      campaign: copied.campaign,
      action: 'activate',
      expectedRevision: copied.data.revision,
      expectedOfferingVersion: currentItem.version,
    });
    const paused = await source.change(profile, {
      campaign: activeAgain.campaign,
      action: 'pause',
      expectedRevision: activeAgain.data.revision,
    });
    const another = await source.change(profile, {
      campaign: ended.campaign,
      action: 'duplicate',
      expectedRevision: paused.data.revision,
    });
    const pausedItem = another.catalogue.offerings.find((o) => o.id === item.id)!;
    await expect(
      source.change(profile, {
        campaign: another.campaign,
        action: 'activate',
        expectedRevision: another.data.revision,
        expectedOfferingVersion: pausedItem.version,
      }),
    ).rejects.toThrow('already has a discount');
    expect(campaignState(paused.campaign, pausedItem)).toBe('Paused');
  });

  it('keeps expired campaigns in history when a later discount replaces the rule', () => {
    const item = seedCatalogue(profile).offerings[0]!;
    const campaign = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Expired',
      phase: 'running' as const,
      rule: { kind: 'percentage' as const, value: '10', startsAt: '', endsAt: '2025-01-01T00:00' },
      appliedRule: {
        enabled: true,
        kind: 'percentage' as const,
        value: '10',
        startsAt: '',
        endsAt: '2025-01-01T00:00',
      },
    };
    expect(
      campaignState(
        campaign,
        { ...item, discount: { ...campaign.appliedRule, value: '20' } },
        Date.parse('2026-01-01T00:00:00Z'),
      ),
    ).toBe('Ended');
  });

  it('refuses to exceed the preview storage limit without corrupting existing data', async () => {
    const storage = memoryStorage(),
      source = localPromotionSource(storage),
      start = await source.load(profile);
    const template = start.data.campaigns[0]!;
    const catalogue = {
      ...start.catalogue,
      promotionsPreview: {
        version: 1 as const,
        revision: 0,
        campaigns: Array.from({ length: 500 }, (_, index) => ({
          ...template,
          id: `entry-${index}`,
        })),
      },
    };
    await localOfferingsSource(storage).replace(profile, catalogue);
    const key = `nexg.offerings.preview.v1.${profile.id}`;
    const before = storage.getItem(key);
    const draft = { ...emptyCampaign(profile, '', newCampaignId()), name: 'One too many' };
    await expect(
      source.change(profile, { campaign: draft, action: 'save', expectedRevision: 0 }),
    ).rejects.toThrow('promotion limit');
    expect(storage.getItem(key)).toBe(before);
    expect((await source.load(profile)).data.campaigns).toHaveLength(500);
  });

  it('rejects unknown quote prices, impossible dates and invalid money', () => {
    const item = { ...seedCatalogue(profile).offerings[1]!, priceMode: 'quote' as const };
    const draft = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Offer',
      rule: { kind: 'percentage' as const, value: '101', startsAt: '2026-02-30T10:00', endsAt: '' },
    };
    const issues = validateCampaign(draft, item, true);
    expect(issues.some((message) => message.includes('known fixed or unit price'))).toBe(true);
    expect(issues.some((message) => message.includes('up to 100%'))).toBe(true);
    expect(issues.some((message) => message.includes('valid start and end'))).toBe(true);
    expect(Number.isNaN(localInstant('2026-02-30T10:00'))).toBe(true);
    expect(moneyMinor('12.345')).toBeNull();
  });

  it('keeps featured sample requests pending and never changes the offering price', async () => {
    const storage = memoryStorage(),
      source = localPromotionSource(storage),
      start = await source.load(profile);
    const item = start.catalogue.offerings[1]!;
    const campaign = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Featured',
      kind: 'featured' as const,
    };
    const requested = await source.change(profile, {
      campaign,
      action: 'request',
      expectedRevision: start.data.revision,
    });
    expect(campaignState(requested.campaign, item)).toBe('Awaiting confirmation');
    expect(requested.catalogue.offerings.find((o) => o.id === item.id)?.discount).toBeUndefined();
    const withdrawn = await source.change(profile, {
      campaign: requested.campaign,
      action: 'withdraw',
      expectedRevision: requested.data.revision,
    });
    expect(campaignState(withdrawn.campaign, item)).toBe('Cancelled');
  });

  it('previews the selected variant, compatible choices and category-relevant details', () => {
    const item = {
      ...seedCatalogue(profile).offerings[1]!,
      fields: { duration_minutes: 120, private_customer_note: 'never shown' },
      variants: [
        { id: 'medium', name: 'Medium', sku: 'private-sku', price: '2000' },
        { id: 'large', name: 'Large', sku: 'other-sku', price: '2500' },
      ],
      optionGroups: [
        {
          id: 'colour',
          name: 'colour',
          minimum: 0,
          maximum: 1,
          choices: [
            { id: 'navy', name: 'Navy', extra: '150', variantIds: ['medium'] },
            { id: 'ivory', name: 'Ivory', extra: '0', variantIds: ['large'] },
          ],
        },
      ],
    };
    const campaign = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Offer',
      rule: { kind: 'percentage' as const, value: '10', startsAt: '', endsAt: '' },
    };
    const snapshot = publicSnapshot(campaign, item, Date.parse('2026-10-31T12:00:00Z'), 'medium')!;
    expect(snapshot.priceMinor).toBe(180000);
    expect(snapshot.details).toContainEqual({ label: 'Selected option', value: 'Medium' });
    expect(snapshot.details).toContainEqual({ label: 'Duration (minutes)', value: '120' });
    expect(snapshot.details).toContainEqual({
      label: 'Available colour',
      value: 'Navy (+KES 150)',
    });
    expect(JSON.stringify(snapshot)).not.toContain('Ivory');
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });

  it('rejects stale work and excludes operational/private fields from snapshots', async () => {
    const storage = memoryStorage(),
      source = localPromotionSource(storage),
      start = await source.load(profile);
    const item = {
      ...start.catalogue.offerings[1]!,
      fields: { ...start.catalogue.offerings[1]!.fields, private_customer_note: 'secret' },
    };
    const draft = {
      ...emptyCampaign(profile, item.id, newCampaignId()),
      name: 'Offer',
      rule: { kind: 'percentage' as const, value: '10', startsAt: '', endsAt: '' },
    };
    expect(JSON.stringify(publicSnapshot(draft, item))).not.toContain('secret');
    await source.change(profile, {
      campaign: draft,
      action: 'save',
      expectedRevision: start.data.revision,
    });
    await expect(
      source.change(profile, {
        campaign: draft,
        action: 'save',
        expectedRevision: start.data.revision,
      }),
    ).rejects.toThrow('another tab');
  });
});
