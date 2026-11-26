/** Exact-unit advisory read only. No HTTP route, enumeration, hold, quote or legacy fallback.
 * Wire read only to the VPS core's readStayAvailability under its coherent transaction.
 */
export interface VpsStayReadRequest {
  propertyId: string; unitId: string; checkIn: string; checkOut: string; adults: number; children: number;
}
export interface VpsStayReadResult extends VpsStayReadRequest {
  offeringId: string; nights: number; available: boolean; totalMinor: number; nightlyMinor: number;
  currency: 'KES'; observedAt: string;
}
export interface VpsStayAvailabilityPort {
  authority: 'nexg-booking-engine';
  read(input: VpsStayReadRequest, signal: AbortSignal): Promise<unknown>;
}
const keys = ['propertyId','unitId','checkIn','checkOut','adults','children'] as const;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v;
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const fail = (code: string): never => { throw new Error(code); };
function request(value: unknown): VpsStayReadRequest {
  if (!object(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k as typeof keys[number]))
    || !uuid(value.propertyId) || !uuid(value.unitId) || !date(value.checkIn) || !date(value.checkOut)
    || !integer(value.adults,1,40) || !integer(value.children,0,39) || value.adults + value.children > 40)
    return fail('INVALID_STAY_REQUEST');
  const nights = (Date.parse(value.checkOut)-Date.parse(value.checkIn))/86400000;
  if (!integer(nights,1,90)) return fail('INVALID_STAY_REQUEST');
  return {propertyId:value.propertyId,unitId:value.unitId,checkIn:value.checkIn,checkOut:value.checkOut,adults:value.adults,children:value.children};
}
function result(value: unknown, input: VpsStayReadRequest, now: number): VpsStayReadResult {
  if (!object(value) || keys.some(k => value[k] !== input[k]) || !uuid(value.offeringId)
    || typeof value.available !== 'boolean' || value.currency !== 'KES'
    || value.nights !== (Date.parse(input.checkOut)-Date.parse(input.checkIn))/86400000
    || !integer(value.nightlyMinor,1) || !integer(value.totalMinor,1)
    || !Number.isSafeInteger(value.nightlyMinor * (value.nights as number)) || value.totalMinor !== value.nightlyMinor * (value.nights as number)
    || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))
    || !Number.isFinite(now) || now-Date.parse(value.observedAt)>60_000 || Date.parse(value.observedAt)-now>5_000)
    return fail('UNVERIFIED_STAY_AVAILABILITY');
  // Explicit projection: do not forward arbitrary source fields as booking/confirmation facts.
  return {...input,offeringId:value.offeringId,nights:value.nights as number,available:value.available,
    nightlyMinor:value.nightlyMinor,totalMinor:value.totalMinor,currency:'KES',observedAt:value.observedAt};
}
export function createVpsStayAvailabilityReader(port?: VpsStayAvailabilityPort, now: () => number = Date.now) {
  const enabled = port?.authority === 'nexg-booking-engine' && typeof port.read === 'function';
  return {
    capabilities: {enabled, authority: enabled ? 'nexg-booking-engine' : null,
      enumeration:false, holds:false, booking:false, sourceAvailability:'not_checked'} as const,
    async read(value: unknown, signal: AbortSignal) {
      if (!enabled || !port) return fail('STAY_AVAILABILITY_UNAVAILABLE');
      if (signal.aborted) return fail('ABORTED');
      const input=request(value); // snapshot before asynchronous work; caller mutation cannot change the echo check
      const response=await port.read({...input},signal);
      if (signal.aborted) return fail('ABORTED');
      const verified=result(response,input,now());
      return {...verified,authority:'nexg-booking-engine' as const,held:false as const,booking:'not_checked' as const};
    },
  };
}
