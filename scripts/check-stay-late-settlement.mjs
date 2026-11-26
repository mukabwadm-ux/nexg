/** Offline actual-SQL trigger regression. Reduced schema; independent VPS ledger fixture, not a running VPS. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {PGlite}=await import(pathToFileURL(path.join(root,'node_modules/.pnpm/@electric-sql+pglite@0.5.14/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();const read=p=>readFile(path.join(root,p),'utf8');
const migration=await read('supabase/migrations/20261119000200_stay_checkout.sql');
const base=await read('supabase/migrations/20261118000100_stay_holds_and_blocks.sql');
const fn=(s,name)=>{const m=s.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'));assert.ok(m,name);return m[0];};
const original=fn(migration,'tg_payment_stay_settled');
const candidate=original.replace("if v_stay.status in ('held', 'cancelled') and not v_clash then","if v_stay.status = 'held'\n     and v_stay.hold_expires_at > clock_timestamp()\n     and v_stay.refund_due_at is null\n     and not v_clash then").replace('refund_due_at = now()','refund_due_at = coalesce(refund_due_at, clock_timestamp())').replace("The guest paid after the stay''s dates had gone to somebody else.",'Legacy settlement could not safely confirm unexpired held inventory; review payment and reservation authority.');
assert.notEqual(candidate,original);
await mkdir(path.join(root,'docs/candidates'),{recursive:true});
await writeFile(path.join(root,'docs/candidates/stay-settlement-expiry-fence.sql'),'-- UNAPPLIED REVIEW CANDIDATE, NOT A DEPLOYMENT MIGRATION.\n-- Delayed pre-expiry payment callbacks may be refunded. No trusted paid-at policy yet.\n-- Still needs per-inventory ownership/cutover fencing; active legacy holds remain unsafe.\n'+candidate+'\n');
// Separate ownership candidate: original legacy semantics preserved for units not fenced.
const authoritySchema = `
create table public.stay_unit_authority_candidate (
 unit_id uuid primary key references public.unit(id),
 authority text not null check(authority in ('legacy','vps')),
 epoch bigint not null check(epoch>0), changed_at timestamptz not null default clock_timestamp()
);
create table public.stay_settlement_fence_candidate (
 payment_id uuid primary key references public.payment(id), stay_id uuid not null references public.stay(id),
 unit_id uuid not null references public.unit(id), authority_epoch bigint not null,
 amount_cents bigint not null, reference text not null, recorded_at timestamptz not null default clock_timestamp()
);
alter table public.stay_unit_authority_candidate enable row level security;
alter table public.stay_settlement_fence_candidate enable row level security;
revoke all on public.stay_unit_authority_candidate,public.stay_settlement_fence_candidate from public;
`;
const authorityBranch = `
  -- The unit lock above is the shared serialization point for a proposed cutover.
  -- Replay receipt remains binding even if someone later changes authority back.
  if exists(select 1 from public.stay_settlement_fence_candidate where payment_id = new.id) then
    return new;
  end if;
  select epoch into v_authority_epoch from public.stay_unit_authority_candidate
   where unit_id = v_stay.unit_id and authority = 'vps';
  if found then
    insert into public.stay_settlement_fence_candidate(payment_id,stay_id,unit_id,authority_epoch,amount_cents,reference)
    values(new.id,v_stay.id,v_stay.unit_id,v_authority_epoch,new.amount_cents,new.reference)
    on conflict(payment_id) do nothing;
    if not found then return new; end if;
    -- Keep pre-existing confirmed history; never create a new legacy confirmation.
    update public.stay set
      status = case when status in ('held','cancelled') then 'cancelled' else status end,
      refund_due_at = coalesce(refund_due_at,clock_timestamp()), updated_at = clock_timestamp(),
      paid_kes = coalesce(paid_kes,v_paid), payment_reference = coalesce(payment_reference,new.reference)
    where id = v_stay.id;
    perform audit.log('system'::public.actor_type,'hotels','stay.payment_refund_due',
      p_target_type=>'stay',p_target_id=>v_stay.id,p_city_id=>new.city_id,p_severity=>'high',
      p_reason=>'Legacy payment retained for reconciliation; unit reservation authority is VPS.',
      p_after=>jsonb_build_object('payment_id',new.id,'reference',new.reference,'paid_kes',v_paid,'authority_epoch',v_authority_epoch));
    return new;
  end if;
`;
const authorityCandidate = original.replace('  v_clash boolean;', '  v_clash boolean;\n  v_authority_epoch bigint;')
 .replace("  if v_stay.id is null or v_stay.status = 'booked' then", "  if v_stay.id is null then return new; end if;\n"+authorityBranch+"\n  if v_stay.status = 'booked' then");
assert.notEqual(authorityCandidate,original);
await writeFile(path.join(root,'docs/candidates/stay-settlement-authority-fence.sql'),
 '-- UNAPPLIED ARCHITECTURE/REGRESSION CANDIDATE, NOT A MIGRATION.\n-- No cutover command is provided; all inventory writers still need a coordinated protocol.\n-- Missing authority row deliberately retains existing legacy behavior.\n-- The payment ledger is authoritative for money; receipt is reconciliation metadata, not a second charge.\n'+authoritySchema+authorityCandidate+'\n');
let authorityReady=false;
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;const check=(v,label)=>{assert.ok(v,label);console.log(`ok ${++checks} - ${label}`);};
try {
 await db.exec(`create type public.actor_type as enum ('system','staff'); create schema audit; create schema authz;
 create function authz.staff_id() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000005'::uuid$$;
 create function authz.works_hospitality(uuid) returns boolean language sql as $$select true$$;
 create table public.unit(id uuid primary key);
 create table public.stay(id uuid primary key,unit_id uuid,host_id uuid,status text,hold_expires_at timestamptz,
 check_in timestamptz,check_out timestamptz,guest_first_name text,confirmed_at timestamptz,updated_at timestamptz,
 paid_kes bigint,commission_kes bigint,host_share_kes bigint,payment_reference text,refund_due_at timestamptz,refunded_at timestamptz,refund_reference text,refund_note text,refunded_by uuid);
 create table public.payment(id uuid primary key,stay_id uuid,amount_cents bigint,reference text,city_id uuid,intent text,state text,provider_paid_at timestamptz,updated_at timestamptz);
 create table public.host_message(host_id uuid,direction text,channel text,subject text,body text);
 create table audit.calls(action text,detail jsonb);
 create function audit.log(p_actor public.actor_type,p_module text,p_action text,p_target_type text default null,
 p_target_id uuid default null,p_city_id uuid default null,p_after jsonb default null,p_severity text default null,p_reason text default null,p_actor_id uuid default null)
 returns void language sql as $$insert into audit.calls values(p_action,p_after)$$;
 create table public.vps_reservations(resource_id uuid,start_time timestamptz,end_time timestamptz,status text);
 insert into public.unit values('${uid(1)}');`);
 await db.exec(fn(await read('supabase/migrations/20261120000100_stay_refunds.sql'),'rpc_stay_refund_record'));
 await db.exec(fn(base,'fn_stay_occupies'));await db.exec(fn(migration,'fn_stay_commission_rate'));await db.exec(original);
 await db.exec(`create trigger payment_stay_settled after update of state on public.payment for each row
 when(new.intent='stay' and new.state='paid' and old.state is distinct from 'paid') execute function public.tg_payment_stay_settled();`);
 async function reset(status='held',expired=true,vps=true,paidBefore=false){
  await db.exec(`truncate public.stay,public.payment,public.host_message,audit.calls,public.vps_reservations${authorityReady?',public.stay_settlement_fence_candidate,public.stay_unit_authority_candidate':''};
   insert into public.stay(id,unit_id,host_id,status,hold_expires_at,check_in,check_out,guest_first_name)
   values('${uid(2)}','${uid(1)}','${uid(3)}','${status}',now()+interval '${expired?'-5':'15'} minutes',now()+interval '1 day',now()+interval '3 days','Guest');
   insert into public.payment(id,stay_id,amount_cents,reference,city_id,intent,state,provider_paid_at) values('${uid(4)}','${uid(2)}',900000,'TEST-RECEIPT',null,'stay','pending',${paidBefore?"now()-interval '6 minutes'":"now()"});
   ${vps?`insert into public.vps_reservations values('${uid(1)}',now()+interval '1 day',now()+interval '3 days','confirmed');`:''}`);
 }
 const settle=()=>db.exec("update public.payment set state='paid'");
 const state=async()=> (await db.query('select s.*,p.state as payment_state from public.stay s join public.payment p on p.stay_id=s.id')).rows[0];
 const messages=async()=>Number((await db.query('select count(*) as n from public.host_message')).rows[0].n);
 await reset();await settle();check((await state()).status==='booked','BASELINE expired legacy hold re-confirms despite independent VPS interval');
 check(Number((await db.query("select count(*) as n from public.vps_reservations where status='confirmed'")).rows[0].n)===1,'BASELINE both ledgers claim same dates');
 await settle();check(await messages()===1,'same-state paid callback retry does not duplicate confirmation');
 await reset('cancelled');await settle();check((await state()).status==='booked','BASELINE cancelled legacy stay also re-confirms');
 await db.exec(candidate);
 await reset('held',false,false);await settle();check((await state()).status==='booked'&&await messages()===1,'candidate preserves uncontested pre-expiry payment');
 await reset();await settle();let s=await state();check(s.status==='cancelled'&&s.refund_due_at&&s.payment_state==='paid'&&Number(s.paid_kes)===9000,'candidate keeps payment paid and queues expired hold for reconciliation');
 const firstRefund=String(s.refund_due_at);await settle();check(String((await state()).refund_due_at)===firstRefund,'ordinary retry preserves refund marker');
 await db.exec("update public.payment set state='pending'; update public.payment set state='paid'");s=await state();check(s.status==='cancelled'&&String(s.refund_due_at)===firstRefund&&await messages()===0,'paid-transition retry cannot resurrect refund-due stay');
 await db.query("select public.rpc_stay_refund_record($1::uuid,'REFUND-RECORDED','fixture')",[uid(2)]);
 check((await state()).payment_state==='reversed','actual refund RPC reverses settled payment');
 await assert.rejects(db.query("select public.rpc_stay_refund_record($1::uuid,'DUPLICATE','fixture')",[uid(2)]));check(true,'actual refund RPC rejects duplicate refund recording');
 await db.exec("update public.payment set state='pending'; update public.payment set state='paid'");
 s=await state();check(s.refunded_at&&s.refund_reference==='REFUND-RECORDED'&&s.status==='cancelled','actual refund reconciliation fields survive forced paid-transition retry');
 await reset('cancelled',false,false);await settle();check((await state()).status==='cancelled'&&await messages()===0,'candidate never revives cancelled stay even before expiry');
 await reset('held',true,false,true);await settle();check((await state()).status==='cancelled','TRADEOFF paid-before-expiry delayed callback rejected; source ignores illustrative provider timestamp');
 await reset('held',false,true);await settle();check((await state()).status==='booked','REMAINING GAP unexpired legacy hold still confirms despite VPS ownership');
 await db.exec(authoritySchema+authorityCandidate);authorityReady=true;
 const fence=()=>db.exec(`insert into public.stay_unit_authority_candidate(unit_id,authority,epoch) values('${uid(1)}','vps',7)`);
 const receipts=async()=>Number((await db.query('select count(*) as n from public.stay_settlement_fence_candidate')).rows[0].n);
 await reset('held',true,false);await settle();check((await state()).status==='booked','AUTHORITY candidate preserves unmigrated legacy delayed-payment semantics');
 await reset('held',true,false);await db.exec(`insert into public.stay_unit_authority_candidate(unit_id,authority,epoch) values('${uid(1)}','legacy',1)`);await settle();
 check((await state()).status==='booked','explicit legacy authority remains unchanged');
 await reset('held',false,true);await fence();await settle();s=await state();
 check(s.status==='cancelled'&&s.payment_state==='paid'&&s.refund_due_at&&await messages()===0,'VPS authority fences even unexpired legacy hold without losing payment');
 check(await receipts()===1,'fenced payment has one durable reconciliation receipt');
 const receipt=(await db.query('select * from public.stay_settlement_fence_candidate')).rows[0];
 check(Number(receipt.amount_cents)===900000&&Number(receipt.authority_epoch)===7&&receipt.reference==='TEST-RECEIPT','receipt binds payment amount, reference and observed authority epoch');
 await settle();await db.exec("update public.payment set state='pending';update public.payment set state='paid'");
 check(await receipts()===1&&await messages()===0&&(await state()).status==='cancelled','normal and forced transition retries neither duplicate receipt nor confirm');
 check(Number((await db.query("select count(*) as n from audit.calls where action='stay.payment_refund_due'")).rows[0].n)===1,'fenced replay emits reconciliation audit exactly once');
 await db.exec("update public.stay_unit_authority_candidate set authority='legacy',epoch=8; update public.payment set state='pending';update public.payment set state='paid'");
 check((await state()).status==='cancelled'&&await receipts()===1,'recorded fence survives authority rollback and callback replay');
 await reset('cancelled',false,true);await fence();await settle();check((await state()).status==='cancelled'&&await receipts()===1,'VPS fence never revives a cancelled legacy stay');
 await db.query("select public.rpc_stay_refund_record($1::uuid,'FENCED-REFUND','fixture')",[uid(2)]);
 await db.exec("update public.payment set state='pending';update public.payment set state='paid'");
 s=await state();check(s.refund_reference==='FENCED-REFUND'&&s.refunded_at&&await receipts()===1&&s.status==='cancelled','actual refund reconciliation survives fenced replay');
 await reset('held',false,false);await db.exec(`insert into public.unit values('${uid(9)}') on conflict do nothing;insert into public.stay_unit_authority_candidate(unit_id,authority,epoch) values('${uid(9)}','vps',1)`);await settle();
 check((await state()).status==='booked','another unit VPS fence does not disable unmigrated unit');
 console.log(`${checks}/${checks} actual-trigger assertions passed; candidate UNAPPLIED. No full migration/provider/concurrency proof.`);
} finally {await db.close();}
