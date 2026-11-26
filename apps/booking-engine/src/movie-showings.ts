import { requireManager } from './auth.js';
import { BookingError, type Identity } from './types.js';
import type { BookingEngine } from './engine.js';
import type { MoviesOccurrence } from './movies.js';
import { hasNativeMovieAuthority } from './movie-authority.js';
import { createHash } from 'node:crypto';
import { parseBookingInstant } from './time.js';

/** Trusted first publication records inventory, but never opens ticket sales. */
export interface MovieShowingPublication {
  occurrenceId: string; offeringId: string; expectedOfferingVersion: number;
  showingId: string; screenId: string; filmId: string;
  startTime: string; endTime: string;
  seats: MoviesOccurrence['seats']; pricesMinor: MoviesOccurrence['pricesMinor'];
}

export async function publishMovieShowing(engine: BookingEngine, identity: Identity, raw: MovieShowingPublication, key: string) {
  requireManager(identity);
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const fields = ['occurrenceId','offeringId','expectedOfferingVersion','showingId','screenId','filmId','startTime','endTime','seats','pricesMinor'];
  if (!identity.userId) throw new BookingError(403, 'A trusted manager is required.', 'forbidden');
  if (!raw || Object.keys(raw).some(k=>!fields.includes(k)) ||
      ![raw.occurrenceId,raw.offeringId,raw.showingId,raw.screenId,raw.filmId].every(id=>typeof id==='string'&&uuid.test(id)) ||
      !Number.isSafeInteger(raw.expectedOfferingVersion) || raw.expectedOfferingVersion<1 ||
      !Array.isArray(raw.seats) || raw.seats.length<1 || raw.seats.length>5000 ||
      raw.seats.some(s=>!s || typeof s!=='object' || Object.keys(s).some(k=>!['code','type','resourceId'].includes(k)) ||
        typeof s.code!=='string' || !s.code.trim() || s.code!==s.code.trim() || s.code.length>12 ||
        !['standard','vip','wheelchair'].includes(s.type) || !uuid.test(s.resourceId)) ||
      new Set(raw.seats.map(s=>s.code)).size!==raw.seats.length || new Set(raw.seats.map(s=>s.resourceId)).size!==raw.seats.length ||
      !raw.pricesMinor || typeof raw.pricesMinor!=='object' || Array.isArray(raw.pricesMinor) ||
      Object.entries(raw.pricesMinor).some(([k,v])=>!['standard','vip','wheelchair'].includes(k)||!Number.isSafeInteger(v)||Number(v)<=0) ||
      raw.seats.some(s=>!raw.pricesMinor[s.type]))
    throw new BookingError(422, 'Supply exact immutable showing identity, distinct seats and positive prices.', 'invalid_movie_publication');
  const start=parseBookingInstant(raw.startTime), end=parseBookingInstant(raw.endTime);
  const input={...raw,startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),
    seats:raw.seats.map(s=>({...s})).sort((a,b)=>a.code.localeCompare(b.code)),pricesMinor:{...raw.pricesMinor}};
  const c=engine.managementContext();
  return c.command(identity,key,'movies.showing.publish',input,async req=>{
    const config=(await c.all('businesses',identity,req))[0]?.configuration;
    if(config?.categoryKey!=='experiences'||config?.subcategoryId!=='cinemas'||config?.published!==true)
      throw new BookingError(409,'A published cinema owner is required.','movie_owner_required');
    const service=await c.own('services',input.offeringId,identity,req), locationId=service.nexg?.locationId??'primary';
    if((service.nexg?.version??1)!==input.expectedOfferingVersion)
      throw new BookingError(409,'The offering changed. Refresh before publishing.','version_conflict');
    if(service.active!==true||service.nexg?.bookingEnabled!==true||service.nexg?.model!=='SESSION_CAPACITY'||
      service.durationType!=='fixed'||end-start!==service.duration*60000||start<=c.now()+600000||
      start<c.now()+(service.nexg.leadTimeMinutes??0)*60000||
      (service.nexg.horizonDays&&start>c.now()+service.nexg.horizonDays*86400000))
      throw new BookingError(409,'Use an active cinema offering and an eligible exact showing window.','movie_publication_required');
    if(!hasNativeMovieAuthority(config,{businessId:identity.businessId,offeringId:input.offeringId,occurrenceId:input.occurrenceId,locationId}))
      throw new BookingError(409,'Explicit native cinema ownership is required.','movie_authority_required');
    const resourceIds=input.seats.map(s=>s.resourceId).sort();
    if(!Array.isArray(service.nexg.resourceIds)||resourceIds.some(id=>!service.nexg.resourceIds.includes(id)))
      throw new BookingError(409,'Seats must belong to the exact offering.','movie_inventory_required');
    const resources=await Promise.all(resourceIds.map(id=>c.own('resources',id,identity,req)));
    if(resources.some(r=>r.active!==true||r.quantity!==1||r.capacityMode!=='per-reservation'||r.resourceType!=='asset'||
      r.nexg?.locationId!==locationId||!r.nexg?.schedule||!c.scheduleAllows(service,r,start,end)))
      throw new BookingError(409,'Each seat must be an active, scheduled, exclusive resource in this branch.','movie_resource_required');
    const rows=await c.all('booking-sessions',identity,req);
    if(rows.some(r=>r.publicId===input.occurrenceId||r.movies?.showingId===input.showingId))
      throw new BookingError(409,'This showing identity already exists. Use revision instead.','movie_duplicate_showing');
    const layout=JSON.stringify(input.seats);
    if(rows.some(r=>r.movies?.screenId===input.screenId&&(r.locationId!==locationId||
      !Array.isArray(r.movies.seats)||JSON.stringify([...r.movies.seats].sort((a,b)=>a.code.localeCompare(b.code)))!==layout)))
      throw new BookingError(409,'An established screen cannot change its branch or seat map.','movie_inventory_required');
    if(rows.some(r=>Date.parse(r.startTime)<end&&Date.parse(r.endTime)>start&&
      (r.movies?.screenId===input.screenId||(Array.isArray(r.resourceIds)&&r.resourceIds.some((id:string)=>resourceIds.includes(id))))))
      throw new BookingError(409,'This screen or seat inventory already has an overlapping showing.','movie_showing_overlap');
    const allocated=new Set(resources.map(r=>String(r.id)));
    const relation=(r:any)=>String(typeof r==='object'?r?.id:r);
    if((await c.all('reservations',identity,req)).some(r=>
      (r.status==='confirmed'||(r.status==='held'&&(!r.nexg?.expiresAt||Date.parse(r.nexg.expiresAt)>c.now())))&&
      Date.parse(r.startTime)<end&&Date.parse(r.endTime)>start&&
      (allocated.has(relation(r.resource))||(r.items??[]).some((i:any)=>allocated.has(relation(i.resource)))||
       (r.nexg?.resourceIds??[]).some((id:string)=>resourceIds.includes(id)))))
      throw new BookingError(409,'Seat inventory has a live overlapping commitment.','movie_showing_overlap');
    const movies:MoviesOccurrence={contractVersion:1,merchantId:identity.businessId,filmId:input.filmId,
      showingId:input.showingId,screenId:input.screenId,seats:input.seats,pricesMinor:input.pricesMinor};
    await c.create('booking-sessions',{publicId:input.occurrenceId,sessionKey:createHash('sha256').update(`${identity.businessId}:${input.offeringId}:${input.startTime}:${input.endTime}`).digest('hex'),
      offeringId:input.offeringId,locationId,startTime:input.startTime,endTime:input.endTime,capacity:input.seats.length,
      resourceIds,published:false,version:1,movies},identity,req);
    await c.audit(identity,req,'movie.showing.published',input.occurrenceId,{published:false,version:1});
    return {occurrenceId:input.occurrenceId,showingId:input.showingId,screenId:input.screenId,published:false,version:1};
  });
}

/** Internal revision only. Identity, film, window and layout are immutable here.
 * Rescheduling/remapping needs a separate commitment-resolution workflow. */
export interface MovieShowingRevision {
  occurrenceId: string;
  showingId: string;
  screenId: string;
  expectedVersion: number;
  published: boolean;
  pricesMinor: MoviesOccurrence['pricesMinor'];
}

export async function reviseMovieShowing(engine: BookingEngine, identity: Identity, input: MovieShowingRevision, key: string) {
  requireManager(identity);
  const fields = ['occurrenceId', 'showingId', 'screenId', 'expectedVersion', 'published', 'pricesMinor'];
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (!identity.userId) throw new BookingError(403, 'A scoped authenticated manager is required.', 'forbidden');
  if (!input || Object.keys(input).some(k => !fields.includes(k)) ||
      ![input.occurrenceId, input.showingId, input.screenId].every(id => typeof id === 'string' && uuid.test(id)) ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || typeof input.published !== 'boolean' ||
      !input.pricesMinor || typeof input.pricesMinor !== 'object' || Array.isArray(input.pricesMinor) ||
      !Object.keys(input.pricesMinor).length || Object.entries(input.pricesMinor).some(([k,v]) =>
        !['standard','vip','wheelchair'].includes(k) || !Number.isSafeInteger(v) || Number(v) <= 0))
    throw new BookingError(422, 'Only reviewed prices and sales publication can be revised; showing identity, film, window and seats are immutable.', 'invalid_movie_revision');
  const c = engine.managementContext();
  return c.command(identity, key, 'movies.showing.revise', input, async req => {
    const business = (await c.all('businesses', identity, req))[0];
    const config = business?.configuration;
    if (config?.categoryKey !== 'experiences' || config?.subcategoryId !== 'cinemas' || config?.published !== true)
      throw new BookingError(409, 'A published cinema owner is required.', 'movie_owner_required');
    const row = (await c.all('booking-sessions', identity, req)).find(r => r.publicId === input.occurrenceId);
    if (!row) throw new BookingError(404, 'Showing not found.', 'not_found');
    if (identity.branches && !identity.branches.includes(row.locationId ?? 'primary'))
      throw new BookingError(403, 'This showing is outside your branch.', 'forbidden');
    const service = await c.own('services', row.offeringId, identity, req);
    const movie = row.movies as MoviesOccurrence | undefined;
    if (!movie || movie.contractVersion !== 1 || movie.merchantId !== identity.businessId ||
        movie.showingId !== input.showingId || movie.screenId !== input.screenId ||
        service.nexg?.model !== 'SESSION_CAPACITY' || service.nexg.locationId !== row.locationId ||
        !Array.isArray(movie.seats) || !movie.seats.length || movie.seats.some(s => !s || !input.pricesMinor[s.type]))
      throw new BookingError(409, 'Revise the exact existing owner showing and cover every seat price.', 'movie_publication_required');
    if (!hasNativeMovieAuthority(config, { businessId: identity.businessId, offeringId: service.publicId,
      occurrenceId: row.publicId, locationId: row.locationId }))
      throw new BookingError(409, 'Explicit native ownership is required to revise this showing.', 'movie_authority_required');
    if (row.version !== input.expectedVersion)
      throw new BookingError(409, 'The showing changed. Refresh before saving.', 'version_conflict');
    if (input.published && (service.active !== true || service.nexg.bookingEnabled !== true))
      throw new BookingError(409, 'Activate the offering before opening sales.', 'movie_publication_required');
    const version = row.version + 1;
    // No reservation mutation: accepted amount and hold expiry remain immutable.
    await c.update('booking-sessions', row.id, { published: input.published, version,
      movies: { ...movie, pricesMinor: { ...input.pricesMinor } } }, identity, req);
    await c.audit(identity, req, 'movie.showing.revised', row.publicId, { version, published: input.published });
    return { occurrenceId: row.publicId, showingId: movie.showingId, screenId: movie.screenId,
      published: input.published, pricesMinor: { ...input.pricesMinor }, version };
  });
}
