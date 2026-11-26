import { normalizeBookingAnswers } from '@nexg/booking-config';

export interface MovieAuthorityScope {
  businessId: string; offeringId: string; occurrenceId: string; locationId: string;
}
/** One rule for reads and writes: every applicable inventory/price binding must
 * name this native owner. A native binding never overrides a conflicting source. */
export function hasNativeMovieAuthority(config: Record<string, any>, scope: MovieAuthorityScope): boolean {
  const bindings = normalizeBookingAnswers({ ...config, subcategoryId: config.subcategoryId, scope: {
    businessId: scope.businessId, offeringId: scope.offeringId,
    sessionId: scope.occurrenceId, locationId: scope.locationId,
  } }).values['integration.data_authority'];
  if (!Array.isArray(bindings)) return false;
  const classes = ['reservations','availability','resources','pricing'];
  const keys = ['business_id','activity_id','offering_id','session_id','location_id'];
  const covered = new Set<string>();
  for (const binding of bindings) {
    if (!binding || !classes.includes(binding.data_class)) continue;
    const s = binding.scope;
    // Missing/invalid scope cannot safely establish a disjoint external source.
    if (!s || typeof s !== 'object' || Array.isArray(s) || !s.business_id) return false;
    if (s.business_id !== scope.businessId ||
        (s.activity_id && s.activity_id !== 'cinemas') ||
        (s.offering_id && s.offering_id !== scope.offeringId) ||
        (s.session_id && s.session_id !== scope.occurrenceId) ||
        (s.location_id && s.location_id !== scope.locationId)) continue;
    if (Object.keys(s).some(k => !keys.includes(k)) ||
        binding.authority !== 'NEXG_AUTHORITATIVE' || binding.owner_reference !== 'nexg-booking-engine') return false;
    covered.add(binding.data_class);
  }
  return classes.every(dataClass => covered.has(dataClass));
}
