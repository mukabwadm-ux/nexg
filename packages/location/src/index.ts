/**
 * The site-wide delivery location layer.
 *
 * One store, one chip, one sheet, one confirm view — rendered by
 * the global header so that Home, Explore, merchant pages,
 * Experiences, Hotels, Help, Careers, Legal, the QR landing and
 * the installed PWA all show the same place and change it the
 * same way.
 *
 * `./geolocation` is the only module that touches the browser
 * API, and an ESLint rule keeps it that way.
 */
export { LocationProvider, useLocation, chipStateFor } from './store';
export type { LocationActions } from './store';
export { DeliverToChip, describe } from './chip';
export { LocationSheet } from './sheet';
export { LocationBanner } from './banners';
export { ConfirmPin } from './confirm-pin';
export { UseMyLocation } from './use-my-location';
/*
 * `readPositionOnce` is exported so that nothing outside this
 * package has a reason to reach for `navigator.geolocation`
 * itself. Merchant onboarding needs a branch pin rather than a
 * guest's delivery place, so `<UseMyLocation />` is the wrong
 * shape for it — and when the only sanctioned route is the
 * wrong shape, the rule gets worked around instead of followed.
 * This is the same single call site, reusable.
 */
export {
  accuracyBand,
  consentState,
  readPositionOnce,
  ACCURACY_NEEDS_CONFIRMING_M,
} from './geolocation';
export type { ConsentState, Fix, FixResult } from './geolocation';
export type {
  ChipState,
  Coverage,
  LocationState,
  Place,
  ResolutionStep,
  SavedPlace,
} from './types';
