import summaries from './data/profiles.json';
import type { BookingProfileSummary } from './types';
import { withSubcategoryVariants } from './variants';
export type { BookingProfileSummary, BookingModel } from './types';
export { baseSubcategoryId, subcategoryVariant, SUBCATEGORY_VARIANTS } from './variants';

const profiles = withSubcategoryVariants(
  summaries as unknown as BookingProfileSummary[],
  (profile) => profile.subcategoryId,
  (base, variant) => ({
    ...base,
    categoryId: variant.categoryId,
    subcategoryId: variant.subcategoryId,
    name: variant.name,
    specialtyNeeds: variant.specialtyNeeds,
  }),
);
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
