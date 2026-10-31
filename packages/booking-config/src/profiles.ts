import summaries from './data/profiles.json';
import type { BookingProfileSummary } from './types';
export type { BookingProfileSummary, BookingModel } from './types';

const profiles = summaries as unknown as BookingProfileSummary[];
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
