import { BookingError, type Customer } from './types.js';

/** Internal-only intent. Public routes must not accept trusted owner state/contact. */
export interface MovieHoldInput {
  showingId: string;
  screenId: string;
  occurrenceId: string;
  offeringId: string;
  seatIds: string[];
  requestId: string;
  expectedTotalMinor: number;
}
export interface MoviesOccurrence {
  contractVersion: 1;
  merchantId: string;
  filmId: string;
  showingId: string;
  screenId: string;
  pricesMinor: Partial<Record<'standard' | 'vip' | 'wheelchair', number>>;
  seats: { code: string; type: 'standard' | 'vip' | 'wheelchair'; resourceId: string }[];
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function movieHoldIntent(input: MovieHoldInput) {
  if (!input || !['showingId','screenId','occurrenceId','offeringId','requestId'].every(k=>typeof (input as any)[k]==='string' && uuid.test((input as any)[k])) ||
      !Array.isArray(input.seatIds) || input.seatIds.length<1 || input.seatIds.length>10 ||
      input.seatIds.some(s=>typeof s!=='string'||!s.trim()||s.trim().length>12) || new Set(input.seatIds).size!==input.seatIds.length ||
      !Number.isSafeInteger(input.expectedTotalMinor)||input.expectedTotalMinor<=0)
    throw new BookingError(422,'Choose 1–10 distinct source seat codes and a reviewed total.','invalid_movie_intent');
  return {showingId:input.showingId,screenId:input.screenId,occurrenceId:input.occurrenceId,offeringId:input.offeringId,seatIds:[...input.seatIds].sort(),requestId:input.requestId.toLowerCase(),expectedTotalMinor:input.expectedTotalMinor};
}
/** The current Reserve guest contract requires actual contact. No anonymous fallback. */
export function movieHoldCustomer(customer?: Customer): Customer {
  if (!customer || typeof customer.name!=='string' || !customer.name.trim() || customer.name.length>200 ||
      (!customer.email && !customer.phone) ||
      (customer.email!==undefined && (typeof customer.email!=='string'||customer.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) ||
      (customer.phone!==undefined && (typeof customer.phone!=='string'||!customer.phone.trim()||customer.phone.length>100)))
    throw new BookingError(422,'Resolve real customer name and contact before holding seats.','movie_customer_required');
  return {name:customer.name.trim(),...(customer.email?{email:customer.email}:{}),...(customer.phone?{phone:customer.phone}:{})};
}
export function movieHoldView(doc: Record<string,any>, now: number) {
  const n=doc.nexg, movie=n.movieHold;
  return {id:doc.publicId,status:doc.status==='held' && Date.parse(n.expiresAt)<=now?'expired':doc.status,
    showingId:movie.showingId,screenId:movie.screenId,filmId:movie.filmId,occurrenceId:movie.occurrenceId,
    seatIds:[...movie.seatIds],quantity:movie.seatIds.length,totalMinor:movie.totalMinor,currency:'KES',
    startTime:doc.startTime,endTime:doc.endTime,expiresAt:n.expiresAt,version:n.version};
}
