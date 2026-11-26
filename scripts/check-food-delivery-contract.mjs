/** Offline actual SQL fixture. Simplified public views; mocked geometry/zone/distance ONLY.
 * Does not prove full migration, RLS, real PostGIS or live rollout. No server/network. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const fallback=path.resolve(root,'../nexg-stays-native-checkout-20261115/node_modules/.pnpm/@electric-sql+pglite@0.5.14/node_modules/@electric-sql/pglite/dist/index.js');
let modulePath;try{modulePath=require.resolve('@electric-sql/pglite');}catch{modulePath=fallback;}
const {PGlite}=await import(pathToFileURL(modulePath).href); const db=new PGlite();
const read=name=>readFile(path.join(root,'supabase/migrations',name),'utf8');
const fn=(sql,name)=>{const m=sql.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'));assert.ok(m,name);return m[0];};
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;let count=0;
const mid=uid(1),iid=uid(2),bid=uid(3),cid=uid(4),rid=uid(5);
try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema extensions;create domain extensions.geography as text;
create function extensions.st_makepoint(double precision,double precision) returns text language sql immutable as $$select $1::text||','||$2::text$$;
create function extensions.st_setsrid(text,integer) returns text language sql immutable as $$select $1$$;
create table city(id uuid,country text);create table merchant(id uuid,parent_merchant_id uuid,city_id uuid,category text,category_key text,answers jsonb,accepting_orders boolean,closed_early_at timestamptz,published boolean);
create table merchant_branch(id uuid,merchant_id uuid,is_primary boolean,location extensions.geography);
create table catalogue_item(id uuid,merchant_id uuid,available boolean,price_kes numeric,published boolean);
create view merchant_public as select id from merchant where published;
create view catalogue_public as select id,merchant_id from catalogue_item where published;
create table merchant_hours(merchant_id uuid,day_of_week integer,weekday_convention text,opens time,closes time,closed boolean);
create table merchant_hours_override(merchant_id uuid,branch_id uuid,date date,opens time,closes time,closed boolean);
create table merchant_chain_setting(parent_id uuid,shared_hours boolean);
create table merchant_holiday_hours(merchant_id uuid,holiday_id uuid,closed boolean,opens time,closes time);
create table holiday_calendar(id uuid,date date,city_id uuid,country text);
create table city_hours_exception(city_id uuid,date date,enabled boolean,applies_to_categories text[],default_close time);
create table fixture_route(zone_ok boolean,city_id uuid,distance_ok boolean);
create function public.fn_zone_serviceable(extensions.geography) returns jsonb language sql stable as $$select jsonb_build_object('ok',zone_ok,'city_id',city_id) from public.fixture_route$$;
create function public.fn_delivery_band(uuid,extensions.geography,extensions.geography) returns jsonb language sql stable as $$select jsonb_build_object('ok',distance_ok) from public.fixture_route$$;
insert into city values('${cid}','KE');insert into fixture_route values(true,'${cid}',true);
insert into merchant values('${mid}',null,'${cid}','restaurants_food','restaurants_food','{"fulfillment_methods":["delivery"]}',true,null,true);
insert into merchant_branch values('${bid}','${mid}',true,'mock-branch');
insert into catalogue_item values('${iid}','${mid}',true,500,true);`);
await db.exec(fn(await read('20261216000100_holiday_custom_hours.sql'),'fn_merchant_effective_hours'));
await db.exec(fn(await read('20261129000100_customer_booking.sql'),'fn_booking_open_at'));
await db.exec(fn(await read('20261223000400_checkout_licence_and_hours.sql'),'fn_merchant_open_for_orders'));
await db.exec(await read('20261224000200_discovery_food_delivery_read.sql'));
const bind=async(item=iid)=> (await db.query('select public.rpc_discovery_food_branch_v1($1,$2,$3) as result',[mid,item,rid])).rows[0].result;
const binding=await bind();assert.equal(binding.branchId,bid);assert.equal(binding.state,'bound');assert.equal(binding.requestId,rid);console.log(`ok ${++count} exact public primary branch bound`);
assert.equal((await bind(uid(99))).reason,'not_public');console.log(`ok ${++count} no cross-item branch disclosure`);
for(const sql of [`update merchant set published=false`,`update merchant_branch set is_primary=false`,`insert into merchant_branch values('${uid(33)}','${mid}',true,'other')`,`update merchant set category_key='other'`]){
 await db.exec('begin');try{await db.exec(sql);const r=await bind();assert.equal(r.state,'unknown');assert.equal(r.branchId,null);console.log(`ok ${++count} unverified binding withheld`);}finally{await db.exec('rollback');}
}
const call=async(overrides=[])=>{const args=[mid,iid,bid,rid,-1.29,36.8];for(const [i,v] of overrides)args[i]=v;return (await db.query('select public.rpc_discovery_food_delivery_v1($1,$2,$3,$4,$5,$6) as result',args)).rows[0].result;};
const check=async(reason,changes='',overrides=[])=>{await db.exec('begin');try{if(changes)await db.exec(changes);const r=await call(overrides);assert.equal(r.reason,reason);assert.equal(r.requestId,rid);assert.equal(r.pickup,'unsupported');assert.deepEqual(Object.keys(r).sort(),['contractVersion','scope','observedAt','complete','merchantId','itemId','branchId','requestId','stock','quote','pickup','state','reason'].sort());console.log(`ok ${++count} ${reason}`);}finally{await db.exec('rollback');}};
await check('hours_not_verified');
await db.exec(`insert into merchant_hours select '${mid}',n,null,'00:00','00:00',false from generate_series(0,6)n;`);
await check('hours_not_verified', `delete from merchant_hours where day_of_week=extract(dow from (now() at time zone 'Africa/Nairobi')::date);update merchant_hours set closed=true;`);
await check('route_and_hours_verified');await check('not_public',`update merchant set published=false`);await check('not_public','',[[1,uid(99)]]);
await check('branch_not_verified','',[[2,uid(99)]]);await check('branch_not_verified','update merchant_branch set is_primary=false');
await check('destination_required','',[[4,null],[5,null]]);await check('branch_location_required','update merchant_branch set location=null');
await check('delivery_mode_not_verified',`update merchant set answers='{}'`);
await check('delivery_not_offered',`update merchant set answers='{"fulfillment_methods":["customer_pickup"]}'`);
await check('item_delivery_restrictions_unresolved',`update merchant set answers=answers||'{"unsafe_delivery_items":"soup"}'`);
await check('item_not_orderable','update catalogue_item set available=null');await check('item_not_orderable','update catalogue_item set price_kes=null');
await check('orders_paused','update merchant set accepting_orders=false');await check('orders_not_verified','update merchant set accepting_orders=null');
await check('destination_not_serviceable','update fixture_route set zone_ok=false');await check('different_service_city',`update fixture_route set city_id='${uid(99)}'`);await check('outside_delivery_distance','update fixture_route set distance_ok=false');
await check('closed','update merchant set closed_early_at=now()');
await check('closed',`insert into holiday_calendar values('${uid(8)}',(now() at time zone 'Africa/Nairobi')::date,'${cid}','KE');insert into merchant_holiday_hours values('${mid}','${uid(8)}',true,null,null);`);
await check('branch_hours_not_verified',`insert into merchant_hours_override values('${mid}','${bid}',(now() at time zone 'Africa/Nairobi')::date,null,null,true)`);
await assert.rejects(()=>call([[4,null]]),e=>e.code==='22023');console.log(`ok ${++count} partial pin rejected`);
console.log(`${count}/${count} actual RPC fixture checks passed; routing is mocked, pickup unsupported.`);
}finally{await db.close();}
