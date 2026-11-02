import {
  blockingImpact,
  businessSchema,
  category,
  seedBusiness,
  validateBusiness,
  type Business,
} from './model';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class BusinessConflict extends Error {
  constructor() {
    super(
      'This business changed in another tab. Reload the current version, then reapply your draft.',
    );
  }
}
export interface BusinessSource {
  load(profileId: string): Promise<Business>;
  save(data: Business, expectedRevision: number, action: string): Promise<Business>;
  reset(profileId: string): Promise<Business>;
}
const key = (id: string) => `nexg.business.preview.v1.${id}`;
export function localBusinessSource(storage: StorageLike): BusinessSource {
  function load(id: string): Business {
    const raw = storage.getItem(key(id));
    if (!raw) return seedBusiness(id);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(
        'Saved sample data is unreadable. Export a recovery copy or reset this sample.',
      );
    }
    const parsed = businessSchema.safeParse(value);
    if (!parsed.success || parsed.data.profileId !== id || validateBusiness(parsed.data).length)
      throw new Error('Saved sample data is incompatible. Reset this sample to recover.');
    return parsed.data;
  }
  return {
    async load(id) {
      return load(id);
    },
    async save(data, expectedRevision, action) {
      const current = load(data.profileId);
      if (current.revision !== expectedRevision) throw new BusinessConflict();
      const issues = validateBusiness(data);
      if (issues.length) throw new Error(issues.join(' '));
      if (data.accountStatus !== current.accountStatus)
        throw new Error('Account approval is managed by its review owner.');
      if (blockingImpact(current, data))
        throw new Error('Existing commitments require an operational review.');
      for (const activity of data.activities)
        for (const id of Object.keys(activity.answers))
          if (!category(activity.profileId)?.questions.includes(id))
            throw new Error('This answer does not belong to the selected specialty scope.');
      if (data.profile.contact !== current.profile.contact)
        throw new Error('Confirmed contact changes require the review-request flow.');
      for (const member of data.members) {
        const old = current.members.find((m) => m.id === member.id);
        if (member.state === 'Active' && (!old || old.state === 'Invitation pending'))
          throw new Error('Invitation acceptance must come from the identity owner.');
      }
      for (const document of data.documents) {
        const old = current.documents.find((d) => d.id === document.id);
        if (
          old &&
          (document.current !== old.current ||
            document.version !== old.version ||
            document.filename !== old.filename)
        )
          throw new Error('Current evidence and verification are managed by the document owner.');
        if (!old && document.current !== 'Needed')
          throw new Error('New supporting evidence begins as Needed.');
      }
      for (const review of data.reviews) {
        const old = current.reviews.find((r) => r.id === review.id);
        if (!old || review.text !== old.text || review.rating !== old.rating)
          throw new Error('Customer reviews are read-only.');
      }
      const answers = data.activities.flatMap((a) => Object.entries(a.answers));
      if (answers.length) {
        const { validateBookingAnswer } = await import('@nexg/booking-config');
        for (const [id, value] of answers) {
          const result = validateBookingAnswer(id, value);
          if (!result.valid) throw new Error(result.issues.map((i) => i.message).join(' '));
        }
      }
      const saved = {
        ...data,
        revision: expectedRevision + 1,
        history: [
          ...current.history,
          { revision: expectedRevision + 1, at: new Date().toISOString(), action },
        ].slice(-100),
      };
      if (load(data.profileId).revision !== expectedRevision) throw new BusinessConflict();
      storage.setItem(key(data.profileId), JSON.stringify(saved));
      if (typeof window !== 'undefined')
        window.dispatchEvent(
          new CustomEvent('nexg:business-preview-changed', {
            detail: { profileId: data.profileId, revision: saved.revision },
          }),
        );
      return saved;
    },
    async reset(id) {
      storage.removeItem(key(id));
      storage.removeItem(`${key(id)}.draft`);
      return seedBusiness(id);
    },
  };
}
export type BusinessDraft = { section: string; id: string; value: unknown; baseRevision: number };
export function readDraft(
  storage: StorageLike,
  id: string,
  section = 'profile',
  recordId = 'profile',
): BusinessDraft | null {
  const raw = storage.getItem(`${key(id)}.draft`);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Record<string, BusinessDraft>;
    const value = saved[`${section}:${recordId}`];
    if (
      value &&
      typeof value.section === 'string' &&
      typeof value.id === 'string' &&
      typeof value.baseRevision === 'number' &&
      value.value !== undefined
    )
      return value;
  } catch {
    /* Leave the confirmed sample recoverable. */
  }
  return null;
}
export function writeDraft(
  storage: StorageLike,
  id: string,
  draft: BusinessDraft | null,
  section = 'profile',
  recordId = 'profile',
) {
  const target = `${key(id)}.draft`;
  let saved: Record<string, BusinessDraft> = {};
  const raw = storage.getItem(target);
  if (raw) {
    try {
      saved = JSON.parse(raw) as Record<string, BusinessDraft>;
    } catch {
      saved = {};
    }
  }
  if (draft) saved[`${draft.section}:${draft.id}`] = draft;
  else delete saved[`${section}:${recordId}`];
  storage.setItem(target, JSON.stringify(saved));
}
