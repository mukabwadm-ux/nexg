/** Runs migrations 001 and 004 in an isolated PostgreSQL WASM database.
 * Auth and existing owner tables are a minimal fixture, not a Supabase deployment.
 * Install PGlite outside this checkout, set PHASE4_PGLITE_PATH to dist/index.js.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (!process.env.PHASE4_PGLITE_PATH) throw new Error('Set PHASE4_PGLITE_PATH to an isolated PGlite dist/index.js.');
const { PGlite } = await import(pathToFileURL(process.env.PHASE4_PGLITE_PATH).href);
const pg = new PGlite();
const ids = Object.fromEntries(['owner','stranger','staff','anonymous','staffId','city','otherCity','ownerSession','strangerSession','staffSession','anonymousSession','resumeOwner','resumeOwnerSession'].map(k=>[k,randomUUID()]));
let checks=0;
const scalar = async (sql,args=[]) => Object.values((await pg.query(sql,args)).rows[0])[0];
const check = (actual,expected,label) => {assert.deepEqual(actual,expected,label);checks++;};
const fails = async (sql,args,code,label) => {
  try {await pg.query(sql,args);assert.fail(`${label}: unexpectedly succeeded`);}
  catch(e) {assert.equal(e.code,code,`${label}: ${e.message}`);checks++;return e;}
};
const actor = async (name='owner',overrides={}) => {
  await pg.exec('reset role');
  await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids[name],session_id:ids[`${name}Session`],is_anonymous:false,...overrides})]);
  await pg.exec('set role authenticated');
};
const admin = async (sql,args=[]) => {await pg.exec('reset role');return pg.query(sql,args);};
const payload = {
  registryRevision:'nexg-booking-2026-10-31.1',
  business:{name:'Maua Cafe',firstName:'Amina',lastName:'Owino',email:'AMINA@example.test',phone:'+254712345678',branchCount:1,registered:true,sameBusinessPhone:true,businessPhone:'',marketing:false},
  categoryId:'restaurants_food',subcategories:['cafe'],answersBySubcategory:{},policies:{terms:true}
};
const changed = (fn) => {const p=structuredClone(payload);fn(p);return p;};
const start = (p=payload,op=randomUUID(),merchant=null) => scalar('select public.rpc_merchant_application_start($1,$2,$3)',[op,p,merchant]);
const save = (id,revision,p,op=randomUUID()) => scalar('select public.rpc_merchant_application_save($1,$2,$3,$4)',[id,revision,op,p]);
const submit = (id,revision,op=randomUUID()) => scalar('select public.rpc_merchant_application_submit($1,$2,$3)',[id,revision,op]);
const access = id => scalar('select public.rpc_merchant_workspace_access($1)',[id]);
try {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema authz; create schema audit; create schema extensions;
    -- Existing crypto dependency fixtures for the unchanged legacy resume RPCs.
    create function extensions.digest(p_value text,p_algorithm text) returns bytea language sql as $$ select sha256(convert_to(p_value,'UTF8')) $$;
    create function extensions.gen_random_bytes(p_size integer) returns bytea language sql as $$ select substring(sha256(convert_to(gen_random_uuid()::text,'UTF8')) from 1 for p_size) $$;
    create type public.actor_type as enum ('merchant_user','staff');
    create type public.partner_status as enum ('applied','documents_pending','under_review','live','paused','delisted','rejected');
    create type public.merchant_category as enum ('restaurants_food','adults_only','restaurant');
    create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default now(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create table public.staff_user(id uuid primary key,user_id uuid,status text);
    create table public.role(id uuid primary key default gen_random_uuid(),key text unique);
    create table public.role_grant(staff_user_id uuid,role_id uuid,city_id uuid,revoked_at timestamptz,expires_at timestamptz);
    create schema settings;
    create type settings.value_type as enum ('int');
    create type settings.scope_kind as enum ('global');
    create type settings.version_status as enum ('active');
    create table settings.definition(
      key text primary key,"group" text not null,scope_kind settings.scope_kind not null,
      value_type settings.value_type not null,constraints jsonb not null default '{}'::jsonb,
      unit text,label text not null,help text,sensitive boolean not null default false,
      can_be_immediate boolean not null default false,approval_pair text not null default 'single:ops_manager',
      reader_modules text[] not null default '{}',default_value jsonb,sort integer not null default 100);
    create table settings.version(
      key text not null references settings.definition(key),scope_kind settings.scope_kind not null,
      value jsonb,status settings.version_status not null,effective_from timestamptz not null default now(),
      reason text,activated_at timestamptz);
    create unique index settings_version_one_active_fixture
      on settings.version(key,scope_kind) where status='active';
    create view public.setting as
      select scope_kind::text as scope,key,value,effective_from from settings.version
      where status='active' and scope_kind='global';
    grant select on public.setting to anon,authenticated;
    create table public.category_config(category text primary key);
    create table public.merchant(
      id uuid primary key default gen_random_uuid(),trading_name text not null,contact_name text not null,
      contact_phone text not null check(contact_phone ~ '^\\+[1-9][0-9]{7,14}$'),contact_email text unique,
      category public.merchant_category,subcategory text,city_id uuid,status public.partner_status default 'applied',
      onboarding_step integer,submitted_at timestamptz,accepting_orders boolean not null default false,
      status_reason text,featured boolean default false,went_live_by uuid,went_live_at timestamptz,settlement_account jsonb,
      waitlisted_at timestamptz,credentials_sent_at timestamptz,password_set_at timestamptz,payout_name_lookup jsonb,
      requires_ops_mapping boolean default false,resume_token_hash text,resume_token_expires_at timestamptz,
      phone_code_hash text,phone_code_expires_at timestamptz,phone_code_attempts integer,phone_verified_at timestamptz,
      payout_account jsonb,payout_rail text);
    create table public.merchant_user(id uuid primary key default gen_random_uuid(),merchant_id uuid references public.merchant(id),user_id uuid references auth.users(id),role text,unique(merchant_id,user_id));
    create table public."order"(id uuid primary key default gen_random_uuid(),merchant_id uuid references public.merchant(id));
    create table public.order_item(id uuid primary key default gen_random_uuid(),order_id uuid references public."order"(id));
    alter table public.merchant enable row level security;
    alter table public.merchant_user enable row level security;
    alter table public."order" enable row level security;
    alter table public.order_item enable row level security;
    create function authz.is_merchant_member(p_merchant_id uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.merchant_user where merchant_id=p_merchant_id and user_id=auth.uid()) $$;
    create function authz.staff_id() returns uuid language sql stable security definer set search_path='' as $$
      select id from public.staff_user where user_id=auth.uid() and status='active' $$;
    create function authz.can_manage_merchants(uuid) returns boolean language sql stable security definer as $$ select false $$;
    create policy merchant_read_own on public.merchant for select to authenticated using(authz.is_merchant_member(id));
    create policy merchant_update_own on public.merchant for update to authenticated using(authz.is_merchant_member(id)) with check(authz.is_merchant_member(id));
    create policy merchant_insert_authenticated on public.merchant for insert to authenticated with check(true);
    create policy merchant_user_insert_self on public.merchant_user for insert to authenticated with check(user_id=auth.uid());
    create policy merchant_user_read_own on public.merchant_user for select to authenticated using(user_id=auth.uid());
    create policy order_read_own on public."order" for select to authenticated using(authz.is_merchant_member(merchant_id));
    create policy order_item_read_own on public.order_item for select to authenticated using(exists(select 1 from public."order" o where o.id=order_id));
    grant usage on schema public,auth,authz to anon,authenticated;
    grant all on public.merchant,public.merchant_user to authenticated;
    grant select on public."order",public.order_item to authenticated;
    create table audit.fixture_event(action text,after jsonb);
    create function audit.log(p_actor_type public.actor_type,p_module text,p_action text,p_actor_id uuid default null,
      p_target_type text default null,p_target_id uuid default null,p_after jsonb default null,p_reason text default null)
    returns bigint language plpgsql as $$ begin
      if current_setting('test.audit_fail',true)='true' then raise exception 'Fixture audit failure' using errcode='P0001'; end if;
      insert into audit.fixture_event values(p_action,p_after);return 1;end $$;
    insert into auth.users(id) values ('${ids.owner}'),('${ids.stranger}'),('${ids.staff}'),('${ids.resumeOwner}');
    insert into auth.users(id,is_anonymous) values ('${ids.anonymous}',true);
    insert into auth.sessions(id,user_id) values ('${ids.ownerSession}','${ids.owner}'),('${ids.strangerSession}','${ids.stranger}'),('${ids.staffSession}','${ids.staff}'),('${ids.anonymousSession}','${ids.anonymous}'),('${ids.resumeOwnerSession}','${ids.resumeOwner}');
    insert into public.staff_user values ('${ids.staffId}','${ids.staff}','active');
    insert into public.role(key) values ('merchant_ops'),('super_admin');
    insert into public.category_config values ('restaurants_food'),('adults_only'),('restaurant');
  `);
  // Exercise the actual existing protected-column function, not a stub of it.
  const oldGuard = await readFile(new URL('../supabase/migrations/20260101004000_merchant_phone_code.sql',import.meta.url),'utf8');
  const guardStart=oldGuard.indexOf('create or replace function public.tg_merchant_protected_columns()');
  const guardEnd=oldGuard.indexOf('\n$$;',guardStart)+4;
  await pg.exec(oldGuard.slice(guardStart,guardEnd));
  await pg.exec('create trigger merchant_protected_columns before update on public.merchant for each row execute function public.tg_merchant_protected_columns()');
  const legacyOnboarding=await readFile(new URL('../supabase/migrations/20260101003900_onboarding_rpcs.sql',import.meta.url),'utf8');
  for(const name of ['fn_merchant_draft_for_write','rpc_merchant_resume_token','rpc_merchant_resume_claim']) {
    const begin=legacyOnboarding.indexOf(`create or replace function public.${name}(`);
    await pg.exec(legacyOnboarding.slice(begin,legacyOnboarding.indexOf('\n$$;',begin)+4));
  }
  // Models completion of a legacy definer claim that already selected its token.
  await pg.exec(`create function public.fixture_resume_claim_after_token_select(p_merchant_id uuid)
    returns void language plpgsql security definer set search_path='' as $$ begin
      insert into public.merchant_user(merchant_id,user_id,role) values(p_merchant_id,auth.uid(),'owner')
      on conflict(merchant_id,user_id) do nothing; end $$;`);
  await pg.exec(await readFile(new URL('../supabase/migrations/20261102000100_merchant_application.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../supabase/migrations/20261102000400_merchant_anonymous_intake.sql',import.meta.url),'utf8'));
  check(await scalar('select count(*)::int from public.merchant_application_registry'),1,'generated registry loads');
  check(await scalar("select count(*)::int from settings.definition where key like 'merchant_session_%_hours'"),2,'session policies are declared in platform settings');
  check(await scalar("select (value #>> '{}')::int from public.setting where key='merchant_session_absolute_hours' and scope='global'"),24,'absolute session limit is exposed through the active settings view');
  check(await scalar("select (value #>> '{}')::int from public.setting where key='merchant_session_idle_hours' and scope='global'"),8,'idle session limit is exposed through the active settings view');
  check(await scalar("select jsonb_object_length from (select count(*)::int as jsonb_object_length from public.merchant_application_registry r,jsonb_object_keys(r.taxonomy)) s"),21,'all source categories load');
  check(await scalar("select prosecdef from pg_proc where oid='public.tg_merchant_protected_columns()'::regprocedure"),false,'protected guard remains invoker');
  await actor();
  const op=randomUUID();
  const first=await start(payload,op); const id=first.merchant_id;
  check(first.revision,1,'start creates revision one');
  check(first.payload.business.email,'amina@example.test','canonical validated request');
  check(await start(payload,op),first,'duplicate start replays original result');
  check(await scalar('select public.rpc_merchant_application_operation_read($1)',[op]),first,'timeout-after-commit start can recover its merchant identity');
  check(await scalar('select public.rpc_merchant_application_operation_read($1)',[randomUUID()]),null,'unknown operation returns null');
  check((await access(id)).operations,false,'draft operational access denied');
  check((await access(id)).setup,true,'draft setup remains allowed');
  check(await scalar('select count(*)::int from public.merchant_user where merchant_id=$1',[id]),1,'owner created atomically');
  const bad = [
    p=>p.status='live',p=>p.payout={accountNumber:'00123'},p=>p.operations={},p=>p.documents=[],
    p=>p.business.owner_id=ids.stranger,p=>p.business.phone='',p=>p.business.branchCount='1',
    p=>p.business.registered='yes',p=>p.business.businessPhone='garbage',p=>p.registryRevision='invented',
    p=>p.categoryId='restaurant',p=>p.subcategories=['adult_products'],p=>p.subcategories=['cafe','cafe'],
    p=>p.answersBySubcategory={invented:{}},p=>p.answersBySubcategory={cafe:{secret:'bad'}},
    p=>p.policies.acceptingOrders=true,p=>p.policies.terms=null,
    p=>p.answersBySubcategory={adult_products:{signature_required:'yes'}},
    p=>p.answersBySubcategory={sea_freight:{shipping_times:{minimum:1,maximum:2,unit:'day',calendar:'elapsed',verified:true}}},
  ];
  for(let i=0;i<bad.length;i++) await fails('select public.rpc_merchant_application_save($1,1,$2,$3)',[id,randomUUID(),changed(bad[i])],'22023',`strict DTO rejects invalid case ${i+1}`);
  await fails('select public.rpc_merchant_application_start($1,$2)',[op,changed(p=>p.business.name='Conflicting')],'23505','idempotency payload conflict');
  await actor('stranger');
  check(await scalar('select public.rpc_merchant_application_operation_read($1)',[op]),null,'another actor cannot discover a start receipt');
  await fails('select public.rpc_merchant_application_read($1)',[id],'42501','foreign read denied');
  await fails('select public.rpc_merchant_application_save($1,1,$2,$3)',[id,randomUUID(),payload],'42501','foreign write denied');
  await fails("insert into public.merchant_user(merchant_id,user_id,role) values($1,$2,'owner')",[id,ids.stranger],'42501','self membership bypass closed');
  await fails("insert into public.merchant(trading_name,contact_name,contact_phone) values('Fake','Fake','+254712345678')",[],'42501','direct merchant creation closed');
  await actor();
  const read=await scalar('select public.rpc_merchant_application_read($1)',[id]);
  check(read.merchant_id,id,'owner reloads draft');
  check(Object.hasOwn(read,'operation_id'),false,'read response omits inapplicable operation id');
  check(await scalar('select count(*)::int from public.merchant_application'),1,'application ownership RLS');
  await fails("update public.merchant set status='live' where id=$1",[id],'42501','direct status forgery denied');
  await fails("update public.merchant set contact_name='Forged' where id=$1",[id],'42501','direct captured identity forgery denied');
  const edited=changed(p=>{p.business.name='Edited Cafe';p.answersBySubcategory={adult_products:{signature_required:true}};});
  const saveOp=randomUUID();
  const saved=await save(id,1,edited,saveOp);
  check(saved.revision,2,'save increments revision and retains inactive answers');
  check(saved.payload.answersBySubcategory.adult_products.signature_required,true,'inactive typed answers retained');
  check(await save(id,1,edited,saveOp),saved,'duplicate save replays after revision changes');
  await fails('select public.rpc_merchant_application_save($1,1,$2,$3)',[id,randomUUID(),payload],'40001','stale writer fails');
  const submitted=await submit(id,2);
  check(submitted.review.state,'pending','basic-only submission succeeds without setup documents or payout');
  check(submitted.access.operations,false,'pending operational access denied');
  await admin('insert into public."order"(merchant_id) values($1)',[id]);
  const orderId=await scalar('select id from public."order" where merchant_id=$1',[id]);
  await pg.query('insert into public.order_item(order_id) values($1)',[orderId]);
  await actor();
  check(await scalar('select count(*)::int from public."order"'),0,'pending order RLS denies direct REST source');
  check(await scalar('select count(*)::int from public.order_item'),0,'pending related-order RLS denies child source');
  await admin('select 1');
  await fails("update public.merchant_application_submission set payload='{}' where merchant_id=$1",[id],'42501','submitted snapshot immutable');
  await actor('staff');
  await fails("select public.rpc_merchant_application_review($1,2,$2,'approved')",[id,randomUUID()],'42501','staff row alone cannot approve');
  await admin("insert into public.role_grant(staff_user_id,role_id,city_id) select $1,id,$2 from public.role where key='merchant_ops'",[ids.staffId,ids.otherCity]);
  await actor('staff');
  await fails("select public.rpc_merchant_application_review($1,2,$2,'approved')",[id,randomUUID()],'42501','city grant cannot review unassigned application');
  await admin('update public.role_grant set city_id=null');
  await actor();
  const afterSubmit=await save(id,2,changed(p=>p.business.name='New draft after submit'));
  check(afterSubmit.review.needs_resubmission,true,'editing a submission requires resubmission');
  await actor('staff');
  await fails("select public.rpc_merchant_application_review($1,2,$2,'approved')",[id,randomUUID()],'40001','stale reviewer fails');
  await actor();await submit(id,3);
  await actor('staff');
  const approved=await scalar("select public.rpc_merchant_application_review($1,3,$2,'approved')",[id,randomUUID()]);
  check(approved.review.state,'approved','authorized current review succeeds');
  check(approved.access.operations,true,'current submitted approval unlocks operational read access');
  await actor();
  const unchangedOp=randomUUID();
  const unchanged=await save(id,3,approved.payload,unchangedOp);
  check(unchanged.revision,3,'identical validated capture does not increase revision');
  check(unchanged.review.state,'approved','identical save preserves current approval');
  check(unchanged.review.needs_resubmission,false,'identical save does not require resubmission');
  check(unchanged.access.operations,true,'identical save preserves approved operational access');
  check(unchanged.operation_id,unchangedOp,'identical save records its own receipt');
  check(await save(id,3,approved.payload,unchangedOp),unchanged,'identical save receipt replays safely');
  const unchangedSubmitted=await submit(id,3);
  check(unchangedSubmitted.review.state,'approved','save-before-submit of unchanged registration preserves approval');
  await admin("update public.merchant_user set role='manager' where merchant_id=$1 and user_id=$2",[id,ids.owner]);
  await actor();
  const managerAccess=await access(id);
  await admin("update public.merchant_user set role='cashier' where merchant_id=$1 and user_id=$2",[id,ids.owner]);
  await actor();
  const revokedRoleAccess=await access(id);
  check([managerAccess.operations,revokedRoleAccess.state,revokedRoleAccess.setup,revokedRoleAccess.operations],
    [true,'blocked',false,false],'manager-to-cashier role revocation removes workspace access');
  await admin("update public.merchant_user set role='owner' where merchant_id=$1 and user_id=$2",[id,ids.owner]);
  await actor();
  check(await scalar('select count(*)::int from public."order"'),1,'approved owner can read operational records');
  check(await scalar('select count(*)::int from public.order_item'),1,'approved owner can read related operational records');
  await admin('select 1');
  check(await scalar('select authz.merchant_workspace_operations_allowed($1)',[id]),true,'machine state helper agrees with current approval');
  await admin('select 1');
  await fails("update public.merchant set status='live' where id=$1",[id],'42501','old privileged activation also blocked before Phase 7');
  await fails('update public.merchant set accepting_orders=true where id=$1',[id],'42501','accepting work stays blocked');
  await actor();
  await fails("update public.merchant set payout_account='{}',payout_rail='bank' where id=$1",[id],'42501','legacy direct payout bypass rejected after approval');
  const pay={rail:'mpesa_paybill',paybillNumber:'001234',accountReference:'00098'};
  const payOp=randomUUID();
  const receipt=await scalar('select public.rpc_merchant_application_payout_save($1,0,$2,$3)',[id,payOp,pay]);
  check(receipt.version,1,'private payout version increments');
  check(receipt.payout,undefined,'operation receipt excludes private account');
  check(await scalar('select public.rpc_merchant_application_payout_save($1,0,$2,$3)',[id,payOp,pay]),receipt,'payout retries replay safely');
  check((await scalar('select public.rpc_merchant_application_payout_read($1)',[id])).payout,pay,'payout preserves leading zeros');
  await fails('select public.rpc_merchant_application_payout_save($1,0,$2,$3)',[id,randomUUID(),pay],'40001','payout version conflict');
  await fails('select public.rpc_merchant_application_payout_save($1,1,$2,$3)',[id,randomUUID(),{...pay,verified:true}],'22023','payout protected field rejected');
  await fails('select public.rpc_merchant_application_payout_save($1,1,$2,$3)',[id,randomUUID(),{rail:'mobile_money',phone:'+254712345678'}],'22023','phone is not a destination rail');
  await actor('staff');
  await fails('select public.rpc_merchant_application_payout_read($1)',[id],'42501','application reviewers cannot read private payout');
  await admin('select 1');
  check(await scalar("select count(*)::int from audit.fixture_event where after::text like '%00098%'"),0,'audit excludes payout account');
  check(await scalar("select count(*)::int from public.merchant_application_operation where result::text like '%00098%'"),0,'operation journal excludes payout account');
  check(await scalar('select settlement_account is null and payout_account is null from public.merchant where id=$1',[id]),true,'declaration grants no finance verification or broad copy');
  await actor();
  const amended=await save(id,3,changed(p=>p.business.name='Approval changed'));
  check(amended.access.operations,false,'editing approved capture withdraws operational access');
  await submit(id,4);
  await actor('staff');
  await fails("select public.rpc_merchant_application_review($1,4,$2,'changes_requested','')",[id,randomUUID()],'22023','changes require a reason');
  const reviewOp=randomUUID();
  const changes=await scalar("select public.rpc_merchant_application_review($1,4,$2,'changes_requested','Confirm contact name')",[id,reviewOp]);
  check(changes.review.state,'changes_requested','scoped reviewer can request changes');
  check(changes.review.reason,'Confirm contact name','review reason persists');
  check(await scalar("select public.rpc_merchant_application_review($1,4,$2,'changes_requested','Confirm contact name')",[id,reviewOp]),changes,'review command replay is safe');
  await actor();
  check((await access(id)).setup,true,'changes requested preserves owner setup');
  check((await access(id)).operations,false,'changes requested denies operations');
  await actor();
  await scalar('select public.rpc_merchant_application_read($1)',[id]);
  await admin('select 1');
  check(await scalar('select count(*)::int from public.merchant_application_session_activity'),0,'reads do not extend session activity');
  await actor(); await scalar('select public.rpc_merchant_session_activity($1)',[id]);
  await admin('select 1');
  check(await scalar('select count(*)::int from public.merchant_application_session_activity'),1,'explicit activity mutates existing session only');
  await pg.query("update auth.sessions set created_at=now()-interval '25 hours' where id=$1",[ids.ownerSession]);
  await actor();
  check((await access(id)).setup,false,'absolute 24-hour expiry enforced');
  check(await scalar('select count(*)::int from public.merchant where id=$1',[id]),0,'expired new-flow session cannot bypass RPC through merchant table');
  await fails('select public.rpc_merchant_application_read($1)',[id],'42501','expired session cannot read application');
  await admin("update auth.sessions set created_at=now()-interval '1 hour' where id=$1",[ids.ownerSession]);
  await pg.query("update public.merchant_application_session_activity set last_activity_at=now()-interval '9 hours'");
  await actor();
  check((await access(id)).operations,false,'idle expiry denies operational access');
  await fails('select public.rpc_merchant_session_activity($1)',[id],'42501','expired idle session cannot revive itself');
  await admin('delete from public.merchant_application_session_activity');
  await actor('owner',{session_id:randomUUID()});
  await fails('select public.rpc_merchant_application_read($1)',[id],'42501','forged session identifier rejected');
  await actor('owner',{is_anonymous:true});
  await fails('select public.rpc_merchant_application_read($1)',[id],'42501','forged anonymous Auth claim rejected');
  await actor('anonymous',{is_anonymous:true});
  const anonymousApplication=await start(changed(p=>p.business.email='anonymous@example.test'));
  const anonymousId=anonymousApplication.merchant_id;
  check(anonymousApplication.access.setup,true,'anonymous applicant receives only owner setup access');
  check(anonymousApplication.access.operations,false,'anonymous applicant receives no operational access');
  check((await scalar('select public.rpc_merchant_application_read($1)',[anonymousId])).merchant_id,anonymousId,'anonymous owner can reload own application');
  const anonymousSaved=await save(anonymousId,1,changed(p=>{p.business.email='anonymous@example.test';p.business.name='Anonymous Cafe';}));
  check(anonymousSaved.revision,2,'anonymous owner can save the same application');
  const anonymousSubmitted=await submit(anonymousId,2);
  check(anonymousSubmitted.review.state,'pending','anonymous owner can submit for admin review');
  await fails('select public.rpc_merchant_application_payout_read($1)',[anonymousId],'42501','anonymous owner cannot read payout details');
  await fails('select public.rpc_merchant_session_activity($1)',[anonymousId],'42501','anonymous intake cannot extend a private account session');
  const anonymousOrder=randomUUID();
  await admin('insert into public."order"(id,merchant_id) values($1,$2)',[anonymousOrder,anonymousId]);
  await actor('staff');
  const anonymousApproved=await scalar("select public.rpc_merchant_application_review($1,2,$2,'approved',null)",[anonymousId,randomUUID()]);
  check(anonymousApproved.review.state,'approved','staff can review the anonymously submitted application');
  await actor('anonymous',{is_anonymous:true});
  check((await access(anonymousId)).operations,false,'review approval still does not grant an anonymous session operations');
  check(await scalar('select count(*)::int from public."order" where merchant_id=$1',[anonymousId]),0,'anonymous session remains blocked from approved operational records');
  await admin('update auth.users set is_anonymous=false where id=$1',[ids.anonymous]);
  await actor('anonymous',{is_anonymous:false});
  check((await access(anonymousId)).operations,true,'claiming the same Auth identity unlocks only approved operations');
  check(await scalar('select count(*)::int from public."order" where merchant_id=$1',[anonymousId]),1,'claimed account can read approved operational records');
  await actor();
  await actor();
  await fails('select public.fn_merchant_application_mirror($1,$2)',[id,payload],'42501','internal mutation helpers not executable');
  await pg.exec('reset role; set role anon');
  await fails('select public.rpc_merchant_application_read($1)',[id],'42501','anonymous RPC privilege denied');
  await admin('select 1');
  const legacy=randomUUID();
  await pg.query("insert into public.merchant(id,trading_name,contact_name,contact_phone) values($1,'Legacy','Legacy','+254711111111')",[legacy]);
  await pg.query("insert into public.merchant_user(merchant_id,user_id,role) values($1,$2,'owner')",[legacy,ids.owner]);
  await actor();
  check((await access(legacy)).state,'legacy','absence of application preserves legacy access');
  check((await access(legacy)).operations,true,'known legacy operational access preserved');
  await admin('update public.merchant_application_command_budget set remaining=60,updated_at=clock_timestamp()');
  await pg.query("select set_config('test.audit_fail','true',false)");
  const before=await scalar('select count(*)::int from public.merchant');
  await actor();
  await fails('select public.rpc_merchant_application_start($1,$2)',[randomUUID(),changed(p=>p.business.email='rollback@example.test')],'P0001','failed audit aborts whole start');
  await admin('select 1');
  check(await scalar('select count(*)::int from public.merchant'),before,'failed transaction leaves no partial merchant');
  await pg.query("select set_config('test.audit_fail','false',false)");
  await pg.query('update public.merchant_application_command_budget set remaining=60,updated_at=clock_timestamp()');
  await actor();
  const second=await start(changed(p=>p.business.email='second@example.test'));
  await start(changed(p=>p.business.email='third@example.test'));
  const dailyQuota=await fails('select public.rpc_merchant_application_start($1,$2)',[randomUUID(),changed(p=>p.business.email='fourth@example.test')],'P4290','distinct operation IDs cannot bypass rolling daily start quota');
  check(/^\d+$/.test(dailyQuota.hint) && Number(dailyQuota.hint)>86300 && Number(dailyQuota.hint)<=86400,true,'daily quota supplies safe integer seconds until oldest successful start expires');
  await admin('update public.merchant_application_command_budget set remaining=1,updated_at=clock_timestamp() where actor_id=$1',[ids.owner]);
  await actor();
  await scalar('select public.rpc_merchant_session_activity($1)',[id]);
  const tokenQuota=await fails('select public.rpc_merchant_session_activity($1)',[second.merchant_id],'P4290','actor command quota spans merchant IDs');
  check(/^\d+$/.test(tokenQuota.hint) && Number(tokenQuota.hint)>=1 && Number(tokenQuota.hint)<=2,true,'token quota supplies safe integer refill seconds');
  await fails("select authz.spend_merchant_application_command('save')",[],'42501','budget helper remains internal');
  await admin("update public.merchant_application_command_budget set remaining=3,updated_at=clock_timestamp()+interval '1 hour' where actor_id=$1",[ids.owner]);
  const futureBudgetTimestamp=await scalar('select updated_at::text from public.merchant_application_command_budget where actor_id=$1',[ids.owner]);
  await actor();
  await scalar('select public.rpc_merchant_session_activity($1)',[id]);
  await scalar('select public.rpc_merchant_session_activity($1)',[second.merchant_id]);
  await admin('select 1');
  check(await scalar('select remaining::double precision from public.merchant_application_command_budget where actor_id=$1',[ids.owner]),1,'future actor timestamp grants no refill on a second spend');
  check(await scalar('select updated_at::text from public.merchant_application_command_budget where actor_id=$1',[ids.owner]),futureBudgetTimestamp,'actor bucket timestamp never moves backward');
  await admin('select 1');
  const resumeDraft=randomUUID();
  await pg.query("insert into public.merchant(id,trading_name,contact_name,contact_phone) values($1,'Legacy resume','Legacy resume','+254722222222')",[resumeDraft]);
  await pg.query("insert into public.merchant_user(merchant_id,user_id,role) values($1,$2,'owner')",[resumeDraft,ids.resumeOwner]);
  await actor('stranger');
  await fails('select public.rpc_merchant_application_start($1,$2,$3)',[randomUUID(),payload,resumeDraft],'42501','token holder cannot opt in another account draft');
  await actor('resumeOwner');
  const oldResumeToken=await scalar('select public.rpc_merchant_resume_token($1)',[resumeDraft]);
  check(oldResumeToken.length,64,'legacy draft resume-token issuance remains available before opt-in');
  await start(changed(p=>p.business.email='resume-owner@example.test'),randomUUID(),resumeDraft);
  await admin('select 1');
  check(await scalar('select resume_token_hash is null and resume_token_expires_at is null from public.merchant where id=$1',[resumeDraft]),true,'owned binding atomically invalidates previous legacy resume token');
  await actor('resumeOwner');
  await fails('select public.rpc_merchant_resume_token($1)',[resumeDraft],'42501','opted-in application cannot issue a transferable legacy resume token');
  await admin('select 1');
  await fails("update public.merchant set resume_token_expires_at=now()+interval '1 day' where id=$1",[resumeDraft],'42501','opted-in application cannot restore legacy token expiry');
  await actor('stranger');
  await fails('select public.rpc_merchant_resume_claim($1)',[oldResumeToken],'P0002','invalidated legacy token cannot claim new-flow ownership');
  await fails('select public.fixture_resume_claim_after_token_select($1)',[resumeDraft],'42501','stale legacy definer claim cannot insert a new owner after opt-in');
  await actor('resumeOwner',{session_id:randomUUID()});
  await fails('select public.fixture_resume_claim_after_token_select($1)',[resumeDraft],'42501','membership guard requires a current session even for an existing owner');
  await admin('select 1');
  check(await scalar('select count(*)::int from public.merchant_user where merchant_id=$1 and user_id=$2',[resumeDraft,ids.stranger]),0,'resume attempts add no unauthorized application owner');
  await actor();
  const legacyToken=await scalar('select public.rpc_merchant_resume_token($1)',[legacy]);
  await actor('stranger');
  check((await scalar('select public.rpc_merchant_resume_claim($1)',[legacyToken])).merchant_id,legacy,'unchanged legacy merchants retain their existing resume claim flow');
  console.log(`PASS ${checks} application SQL checks. Migrations 001 and 004 executed against PGlite; deployed Supabase/Auth/PostgREST not exercised.`);
} catch(error) {
  console.error(`FAIL after ${checks} checks: ${error.code ?? 'assertion'} ${error.message}\n${error.where ?? ''}`);
  process.exitCode=1;
} finally {await pg.close();}
