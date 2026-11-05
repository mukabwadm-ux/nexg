import { z } from 'zod';
import { localOfferingsSource } from '../offerings/source';
import type { Offering, OfferingProfile } from '../offerings/model';
import {
  campaignState,
  emptyCampaign,
  initialPromotions,
  isHistory,
  localInstant,
  publicSnapshot,
  ruleMatches,
  storefrontSnapshot,
  validateCampaign,
  type Campaign,
  type DiscountRule,
  type PromotionCatalogue,
  type PromotionData,
} from './model';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PromotionAction =
  | 'save'
  | 'activate'
  | 'edit'
  | 'pause'
  | 'resume'
  | 'end'
  | 'duplicate'
  | 'request'
  | 'withdraw';
export interface PromotionSource {
  load(profile: OfferingProfile): Promise<{ catalogue: PromotionCatalogue; data: PromotionData }>;
  change(
    profile: OfferingProfile,
    input: {
      campaign: Campaign;
      action: PromotionAction;
      expectedRevision: number;
      expectedOfferingVersion?: number;
    },
  ): Promise<{ catalogue: PromotionCatalogue; data: PromotionData; campaign: Campaign }>;
}
const rule = z
  .object({
    kind: z.enum(['percentage', 'amount']),
    value: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .strict();
const applied = rule.extend({ enabled: z.boolean() }).strict();
const snapshot = z
  .object({
    name: z.string(),
    description: z.string(),
    image: z.string().optional(),
    unit: z.string(),
    action: z.string(),
    baseMinor: z.number().int().nonnegative().nullable(),
    priceMinor: z.number().int().nonnegative().nullable(),
    benefit: z.string(),
    terms: z.string(),
    details: z.array(z.object({ label: z.string(), value: z.string() }).strict()).optional(),
    isStorefront: z.boolean().optional(),
  })
  .strict();
const campaignSchema = z
  .object({
    id: z.string().min(1),
    profileId: z.string().min(1),
    version: z.number().int().min(1),
    name: z.string().min(1).max(120),
    kind: z.enum(['offer', 'featured']),
    offeringId: z.string(),
    phase: z.enum(['draft', 'running', 'paused', 'ended', 'requested', 'cancelled', 'rejected']),
    rule,
    appliedRule: applied.optional(),
    placement: z
      .object({
        surface: z.enum(['homepage', 'category', 'popular']),
        startsOn: z.string(),
        weeks: z.number().int(),
      })
      .strict()
      .optional(),
    archivedPreview: snapshot.optional(),
    updatedAt: z.string(),
    history: z
      .array(
        z.object({ at: z.string(), action: z.string(), version: z.number().int().min(1) }).strict(),
      )
      .max(100),
  })
  .strict();
const dataSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    campaigns: z.array(campaignSchema).max(500),
  })
  .strict();

/** UUIDv7 for newly created preview records, without a server-generated identity. */
export function newCampaignId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = BigInt(Date.now());
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(time & 255n);
    time >>= 8n;
  }
  bytes[6] = (bytes[6]! & 15) | 0x70;
  bytes[8] = (bytes[8]! & 63) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function localPromotionSource(
  storage: StorageLike,
  offerings = localOfferingsSource(storage),
  seed = initialPromotions,
): PromotionSource {
  async function load(profile: OfferingProfile) {
    const catalogue = (await offerings.load(profile)) as PromotionCatalogue;
    if (catalogue.promotionsPreview === undefined) {
      const initial = seed(profile, catalogue);
      await offerings.replace(profile, initial.catalogue);
      return initial;
    }
    const parsed = dataSchema.safeParse(catalogue.promotionsPreview);
    if (
      !parsed.success ||
      parsed.data.campaigns.some((c) => c.profileId !== profile.id) ||
      new Set(parsed.data.campaigns.map((c) => c.id)).size !== parsed.data.campaigns.length
    )
      throw new Error(
        'Saved promotions could not be read. Your existing offering data has not been changed.',
      );
    return { catalogue, data: parsed.data as PromotionData };
  }
  async function change(
    profile: OfferingProfile,
    input: {
      campaign: Campaign;
      action: PromotionAction;
      expectedRevision: number;
      expectedOfferingVersion?: number;
    },
  ) {
    const perform = async () => {
      const current = await load(profile);
      if (current.data.revision !== input.expectedRevision)
        throw new Error('Promotions changed in another tab. Reload before saving.');
      const previous = current.data.campaigns.find((c) => c.id === input.campaign.id);
      if (
        input.campaign.profileId !== profile.id ||
        (previous ? previous.version !== input.campaign.version : input.campaign.version !== 0)
      )
        throw new Error('This promotion changed or was removed. Reload before saving.');
      if (
        !previous &&
        input.action !== 'save' &&
        input.action !== 'activate' &&
        input.action !== 'request'
      )
        throw new Error('Save this promotion first.');
      const now = new Date().toISOString(),
        timestamp = Date.parse(now);
      let next = previous
        ? structuredClone(previous)
        : emptyCampaign(profile, '', input.campaign.id);
      let item = current.catalogue.offerings.find(
        (o) => o.id === (previous?.offeringId ?? input.campaign.offeringId),
      );
      let actionLabel = '';
      const changeItem = (value: DiscountRule) => {
        if (!item || item.sources.price !== 'nexg')
          throw new Error('The offering price is managed elsewhere.');
        const updated: Offering = {
          ...item,
          discount: value,
          version: item.version + 1,
          updatedAt: now,
          history: [
            {
              at: now,
              action: 'Promotion changed the sample offering discount',
              version: item.version + 1,
            },
            ...item.history,
          ].slice(0, 50),
        };
        current.catalogue.offerings = current.catalogue.offerings.map((o) =>
          o.id === updated.id ? updated : o,
        );
        item = updated;
        next.appliedRule = value;
      };
      const requireOwner = () => {
        if (!item || !ruleMatches(next, item))
          throw new Error(
            'The offering discount changed. Review it in Offerings before changing this promotion.',
          );
        if (item.sources.price !== 'nexg')
          throw new Error('The offering price is now managed by a connected system.');
      };
      if (['save', 'activate', 'request', 'edit'].includes(input.action)) {
        if (
          input.action === 'edit' &&
          (!previous || !['running', 'paused'].includes(previous.phase))
        )
          throw new Error('Only a current promotion can be edited.');
        if (input.action !== 'edit' && previous && previous.phase !== 'draft')
          throw new Error('This promotion is no longer a draft.');
        if (
          input.action === 'edit' &&
          (previous!.kind !== input.campaign.kind ||
            previous!.offeringId !== input.campaign.offeringId)
        )
          throw new Error('Create a new promotion to change the offering or type.');
        next = {
          ...next,
          name: input.campaign.name.trim(),
          kind: input.campaign.kind,
          offeringId: input.campaign.offeringId,
          rule: { ...input.campaign.rule },
          placement: input.campaign.placement ? { ...input.campaign.placement } : undefined,
        };
        item = current.catalogue.offerings.find((o) => o.id === next.offeringId);
        const issue = validateCampaign(
          next,
          item,
          input.action === 'activate' || input.action === 'edit' || input.action === 'request',
        );
        if (issue.length) throw new Error(issue[0]);
        if (input.action === 'save') actionLabel = 'Draft saved';
        if (input.action === 'request') {
          if (next.kind !== 'featured') throw new Error('Choose Featured placement to request it.');
          next.phase = 'requested';
          actionLabel = 'Sample placement request submitted';
        }
        if (input.action === 'activate' || input.action === 'edit') {
          if (next.kind !== 'offer' || !item)
            throw new Error('Choose a priced offering for this offer.');
          if (input.expectedOfferingVersion !== item.version)
            throw new Error('The offering changed. Reload before applying this promotion.');
          if (input.action === 'edit') requireOwner();
          else if (item.discount) {
            const owners = current.data.campaigns.filter(
              (campaign) =>
                campaign.id !== next.id &&
                campaign.offeringId === item!.id &&
                ruleMatches(campaign, item),
            );
            if (
              !owners.length ||
              owners.some((campaign) => !isHistory(campaignState(campaign, item, timestamp)))
            )
              throw new Error(
                'This offering already has a discount. Manage the existing discount in Offerings.',
              );
          }
          const end = localInstant(next.rule.endsAt);
          if (end !== null && end <= timestamp)
            throw new Error('Choose an end time in the future.');
          changeItem({
            ...next.rule,
            enabled: input.action === 'edit' ? previous!.phase === 'running' : true,
          });
          next.phase = input.action === 'edit' ? previous!.phase : 'running';
          actionLabel = input.action === 'edit' ? 'Offer updated' : 'Offer activated in sample';
        }
      } else if (input.action === 'duplicate') {
        if (!previous) throw new Error('This promotion no longer exists.');
        next = {
          ...emptyCampaign(profile, previous.offeringId, newCampaignId()),
          name: `${previous.name} copy`.slice(0, 120),
          kind: previous.kind,
          rule: { ...previous.rule },
          placement: previous.placement ? { ...previous.placement } : undefined,
          updatedAt: now,
        };
        actionLabel = 'Copied as a new draft';
      } else if (input.action === 'withdraw') {
        if (next.phase !== 'requested')
          throw new Error('Only a pending sample request can be withdrawn.');
        next.archivedPreview =
          publicSnapshot(next, item, timestamp) ??
          (!next.offeringId ? storefrontSnapshot(profile) : undefined);
        next.phase = 'cancelled';
        actionLabel = 'Sample request withdrawn';
      } else if (input.action === 'pause' || input.action === 'resume' || input.action === 'end') {
        if (input.action === 'pause' && next.phase !== 'running')
          throw new Error('Only a current offer can be paused.');
        if (input.action === 'resume' && next.phase !== 'paused')
          throw new Error('Only a paused offer can be resumed.');
        if (input.action === 'end' && !['running', 'paused', 'draft'].includes(next.phase))
          throw new Error('This promotion cannot be ended.');
        if (next.kind === 'offer' && next.appliedRule) {
          requireOwner();
          if (input.action === 'resume') {
            const issue = validateCampaign(next, item, true);
            const end = localInstant(next.rule.endsAt);
            if (issue.length) throw new Error(issue[0]);
            if (end !== null && end <= timestamp)
              throw new Error('The offer has ended. Duplicate it to set new dates.');
          }
          if (input.action === 'end' && campaignState(next, item, timestamp) === 'Active')
            next.archivedPreview = publicSnapshot(next, item, timestamp) ?? undefined;
          changeItem({ ...next.rule, enabled: input.action === 'resume' });
        }
        next.phase =
          input.action === 'pause' ? 'paused' : input.action === 'resume' ? 'running' : 'ended';
        actionLabel =
          input.action === 'pause'
            ? 'Offer paused'
            : input.action === 'resume'
              ? 'Offer resumed'
              : 'Promotion ended';
      }
      next.version = input.action === 'duplicate' ? 1 : (previous?.version ?? 0) + 1;
      next.updatedAt = now;
      next.history = [
        { at: now, action: actionLabel, version: next.version },
        ...(input.action === 'duplicate' ? [] : next.history),
      ].slice(0, 100);
      const campaigns =
        input.action === 'duplicate' || !previous
          ? [...current.data.campaigns, next]
          : current.data.campaigns.map((c) => (c.id === previous.id ? next : c));
      const data: PromotionData = { version: 1, revision: current.data.revision + 1, campaigns };
      if (!dataSchema.safeParse(data).success)
        throw new Error(
          'This sample has reached its promotion limit. Existing data has not been changed.',
        );
      const catalogue: PromotionCatalogue = { ...current.catalogue, promotionsPreview: data };
      await offerings.replace(profile, catalogue);
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('nexg:offerings-preview-changed'));
      return { catalogue, data, campaign: next };
    };
    const lock = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return lock ? lock.request(`nexg-promotions-preview-${profile.id}`, perform) : perform();
  }
  return { load, change };
}
