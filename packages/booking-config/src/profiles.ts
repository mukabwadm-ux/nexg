import summaries from './data/profiles.json';
import { activityProfiles } from './activity-profiles';
import type { BookingProfileSummary } from './types';
export type { BookingProfileSummary, BookingModel } from './types';

const profiles: BookingProfileSummary[] = [
  ...(summaries as unknown as BookingProfileSummary[]),
  ...activityProfiles.map(({ categoryId, categoryName, subcategoryId, name, defaultModelId, candidateModelIds, specialtyNeeds, vocabulary }) => ({
    categoryId, categoryName, subcategoryId, name, defaultModelId, candidateModels: candidateModelIds, specialtyNeeds, vocabulary,
  })),
];
export { activityProfiles };
export function listBookingProfiles(): BookingProfileSummary[] {
  return profiles.map((profile) => ({
    ...profile,
    candidateModels: [...profile.candidateModels],
    vocabulary: { ...profile.vocabulary },
  }));
}
export function getBookingProfile(subcategoryId: string): BookingProfileSummary | undefined {
  return listBookingProfiles().find((profile) => profile.subcategoryId === subcategoryId);
}
