import type { VpsStayReadRequest, createVpsStayAvailabilityReader } from './vpsAvailability.js';

type ExactReader = ReturnType<typeof createVpsStayAvailabilityReader>;
type AvailableUnit = Awaited<ReturnType<ExactReader['read']>>;
export interface VpsStaySearchRequest {
  /** Stable key for the normalized source-owned filters. Not a page cursor. */
  scopeKey: string; checkIn: string; checkOut: string; adults: number; children: number;
}
export interface VpsStayUnitBinding { propertyId: string; unitId: string; offeringId: string }
export interface CompleteVpsStaySnapshot {
  authority: 'nexg-booking-engine';
  /** Must resolve filtering against the complete publication universe in this snapshot. */
  enumerate(input: VpsStaySearchRequest, maxUnits: number, signal: AbortSignal): Promise<{
    request: VpsStaySearchRequest; complete: boolean; units: VpsStayUnitBinding[];
  }>;
  /** Existing exact reader, wired to the SAME coherent snapshot, never a legacy source. */
  availability: ExactReader;
}
export interface VpsStaySearchPort {
  authority: 'nexg-booking-engine';
  withSnapshot<T>(run: (snapshot: CompleteVpsStaySnapshot) => Promise<T>, signal: AbortSignal): Promise<T>;
}
export type VpsStaySearchResult =
  | {status:'unavailable';complete:false;units:[];reason:'trusted_complete_source_missing'}
  | {status:'incomplete';complete:false;units:[];reason:'source_incomplete'|'limit_exceeded'}
  | {status:'ok';complete:true;units:AvailableUnit[];matchedUnits:number;checkedUnits:number;held:false;booking:'not_checked';coordinates:'not_supplied'};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const keys=['scopeKey','checkIn','checkOut','adults','children'] as const;
const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
 &&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const abort=(s:AbortSignal)=>{if(s.aborted)throw new Error('ABORTED');};
function validate(input:VpsStaySearchRequest){
 if(!input||Object.keys(input).length!==keys.length||typeof input.scopeKey!=='string'||!input.scopeKey.trim()||input.scopeKey.length>2000||
 !validDate(input.checkIn)||!validDate(input.checkOut)||!Number.isSafeInteger(input.adults)||input.adults<1||
 !Number.isSafeInteger(input.children)||input.children<0||input.adults+input.children>40)throw new Error('INVALID_STAY_SEARCH');
 const nights=(Date.parse(input.checkOut)-Date.parse(input.checkIn))/86400000;
 if(!Number.isInteger(nights)||nights<1||nights>90)throw new Error('INVALID_STAY_SEARCH');
}
/** No global availability claim without complete source-local filtering and coherent reads.
 * This is not a route and does not assemble a universe from paginated catalogue pages.
 */
export function createVpsStaySearch(port?:VpsStaySearchPort,maxUnits=200,now:()=>number=Date.now){
 if(!Number.isSafeInteger(maxUnits)||maxUnits<1||maxUnits>1000)throw new Error('INVALID_SEARCH_BOUND');
 return async(value:VpsStaySearchRequest,signal:AbortSignal):Promise<VpsStaySearchResult>=>{
  abort(signal);validate(value);const input={...value};
  if(!port||port.authority!=='nexg-booking-engine'||typeof port.withSnapshot!=='function')
   return {status:'unavailable',complete:false,units:[],reason:'trusted_complete_source_missing'};
  return port.withSnapshot(async (snapshot):Promise<VpsStaySearchResult>=>{
   abort(signal);
   if(snapshot.authority!=='nexg-booking-engine'||!snapshot.availability.capabilities.enabled||
      snapshot.availability.capabilities.authority!=='nexg-booking-engine')throw new Error('INVALID_STAY_AUTHORITY');
   const found=await snapshot.enumerate({...input},maxUnits,signal);abort(signal);
   if(!found||!found.request||Object.keys(found.request).length!==keys.length||keys.some(k=>found.request[k]!==input[k])||
      typeof found.complete!=='boolean'||!Array.isArray(found.units))throw new Error('UNVERIFIED_STAY_ENUMERATION');
   if(!found.complete)return {status:'incomplete',complete:false,units:[],reason:'source_incomplete'};
   if(found.units.length>maxUnits)return {status:'incomplete',complete:false,units:[],reason:'limit_exceeded'};
   const ids=new Set<string>();
   // Validate all bindings before performing any availability read.
   const bindings=found.units.map(unit=>{
    if(!unit||!uuid(unit.propertyId)||!uuid(unit.unitId)||!uuid(unit.offeringId)||ids.has(unit.unitId.toLowerCase()))
     throw new Error('UNVERIFIED_STAY_BINDING');
    ids.add(unit.unitId.toLowerCase());return {...unit};
   });
   const units:AvailableUnit[]=[];const observed:string[]=[];
   for(const binding of bindings){
    abort(signal);
    const request:VpsStayReadRequest={propertyId:binding.propertyId,unitId:binding.unitId,
      checkIn:input.checkIn,checkOut:input.checkOut,adults:input.adults,children:input.children};
    const result=await snapshot.availability.read(request,signal);abort(signal);
    if(result.offeringId!==binding.offeringId)throw new Error('CHANGED_STAY_BINDING');
    observed.push(result.observedAt);if(result.available)units.push(result);
   }
   const completedAt=now();
   if(!Number.isFinite(completedAt)||observed.some(at=>completedAt-Date.parse(at)>60_000||Date.parse(at)-completedAt>5_000))
    throw new Error('STALE_STAY_SEARCH');
   // One canonical array for downstream list/map. No synthetic lat/lng and no room holds.
   units.sort((a,b)=>a.propertyId.localeCompare(b.propertyId)||a.unitId.localeCompare(b.unitId));
   return {status:'ok',complete:true,units,matchedUnits:units.length,checkedUnits:bindings.length,
     held:false,booking:'not_checked',coordinates:'not_supplied'};
  },signal);
 };
}
