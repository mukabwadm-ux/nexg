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
export { accuracyBand, consentState, ACCURACY_NEEDS_CONFIRMING_M } from './geolocation';
export type { ConsentState, Fix, FixResult } from './geolocation';
export type {
  ChipState,
  Coverage,
  LocationState,
  Place,
  ResolutionStep,
  SavedPlace,
} from './types';
