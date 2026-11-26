import type {BookingEngine} from './engine.js';
import {BookingError,type Identity} from './types.js';
import {stayHoldView} from './stays.js';
import {parseBookingInstant} from './time.js';

/** Internal provenance, loaded by the scoped reader below; never accept from HTTP. */
export interface StayActivitySource {
 businessId:string;createdBy:string;hold:ReturnType<typeof stayHoldView>;
}
const unavailable=():never=>{throw new BookingError(404,'Confirmed Stay activity not found.','stay_activity_unavailable');};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

/** Private accepted-booking projection, not a catalogue/location/display-name lookup. */
export function projectStayActivity(identity:Identity,source:StayActivitySource){
 const h=source?.hold;
 if(identity.role!=='customer'||!identity.userId||source?.businessId!==identity.businessId||source?.createdBy!==identity.userId||
  !h||h.status!=='confirmed'||h.paymentStatus!=='paid'||h.paymentReconciliationRequired!==false||h.refundDue!==false||h.currency!=='KES'||
  ![h.id,h.quoteId,h.propertyId,h.unitId,h.offeringId].every(id=>typeof id==='string'&&uuid.test(id))||
  !Number.isSafeInteger(h.totalMinor)||h.totalMinor<=0||!Number.isSafeInteger(h.nightlyMinor)||h.nightlyMinor<=0||
  !Number.isSafeInteger(h.nights)||h.nights<1||h.nights>90||h.totalMinor!==h.nights*h.nightlyMinor||
  !Number.isSafeInteger(h.adults)||h.adults<1||!Number.isSafeInteger(h.children)||h.children<0||h.adults+h.children>40||
  typeof h.checkIn!=='string'||typeof h.checkOut!=='string'||!/^\d{4}-\d\d-\d\d$/.test(h.checkIn)||!/^\d{4}-\d\d-\d\d$/.test(h.checkOut))unavailable();
 const instant=(value:unknown):number=>{try{return parseBookingInstant(value);}catch{return unavailable();}};
 const start=instant(h.startTime),end=instant(h.endTime),dayIn=instant(h.checkIn+'T00:00:00+03:00'),dayOut=instant(h.checkOut+'T00:00:00+03:00');
 const localDate=(instant:number)=>new Date(instant+3*3600000).toISOString().slice(0,10);
 if(end<=start||(dayOut-dayIn)/86400000!==h.nights||localDate(start)!==h.checkIn||localDate(end)!==h.checkOut)unavailable();
 return {id:'stay:'+h.id,kind:'stay' as const,source:'nexg-booking-engine' as const,bookingId:h.id,bookingReference:h.id,
  quoteId:h.quoteId,propertyId:h.propertyId,unitId:h.unitId,offeringId:h.offeringId,status:'confirmed' as const,paymentStatus:'paid' as const,
  checkIn:h.checkIn,checkOut:h.checkOut,startTime:h.startTime,endTime:h.endTime,timeZone:'Africa/Nairobi' as const,
  nights:h.nights,adults:h.adults,children:h.children,totalMinor:h.totalMinor,currency:'KES' as const};
}

/** Reads one owned, genuinely settled reservation. No writes, fallbacks or global Activity activation. */
export async function readStayActivity(engine:BookingEngine,identity:Identity,bookingId:string){
 if(identity.role!=='customer'||typeof bookingId!=='string'||!uuid.test(bookingId))unavailable();
 const c=engine.managementContext(),row=await c.own('reservations',bookingId,identity);
 if(row.businessId!==identity.businessId||row.nexg?.createdBy!==identity.userId||row.nexg?.model!=='ASSET_INTERVAL'||row.nexg?.stayHold?.contractVersion!==1)unavailable();
 return projectStayActivity(identity,{businessId:row.businessId,createdBy:row.nexg.createdBy,hold:stayHoldView(row,c.now())});
}
