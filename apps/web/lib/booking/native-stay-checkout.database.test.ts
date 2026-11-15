import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const owner = 'd7500000-0000-4000-8000-000000000001';
const other = 'd7500000-0000-4000-8000-000000000002';
const property = 'd7520000-0000-4000-8000-00000000000a';
const unit = 'd7530000-0000-4000-8000-00000000000a';
const sample = 'd7530000-0000-4000-8000-00000000000b';
const unpriced = 'd7530000-0000-4000-8000-00000000000c';
const migrations = new URL('../../../../supabase/migrations/', import.meta.url);

function definition(sql: string, name: string) {
  const start = sql.indexOf('create or replace function public.' + name + '(');
  const end = sql.indexOf('$$;', start);
  if (start < 0 || end < 0) throw new Error('Missing production function: ' + name);
  return sql.slice(start, end + 3);
}

it('uses the production availability, hold and settlement functions without duplicate holds or payments', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      /* sql */ [
        'create role anon; create role authenticated; create schema auth; create schema audit; create schema authz;',
        'create table auth.users(id uuid primary key, email text, is_anonymous boolean);',
        'create function auth.uid() returns uuid language sql stable',
        "as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;",
        "create type public.actor_type as enum ('guest', 'system');",
        'create function audit.log(public.actor_type, text, text, p_actor_id uuid default null,',
        '  p_target_type text default null, p_target_id uuid default null, p_city_id uuid default null,',
        '  p_after jsonb default null, p_severity text default null, p_reason text default null)',
        '  returns void language plpgsql as $$ begin end; $$;',
        'create table public.host(id uuid primary key, time_zone text);',
        'create table public.property(id uuid primary key, check_in_from time, check_out_by time);',
        'create table public.unit(id uuid primary key, host_id uuid, property_id uuid, city_id uuid,',
        '  checkin_time time, checkout_time time, nightly_rate_kes bigint, min_nights integer,',
        '  max_guests integer, is_sample boolean not null default false);',
        'create view public.property_unit_public as select * from public.unit;',
        'create table public.stay(id uuid primary key default gen_random_uuid(), host_id uuid,',
        '  property_id uuid, unit_id uuid, guest_user_id uuid, guest_first_name text, party_adults integer,',
        '  party_children integer, check_in timestamptz, check_out timestamptz, source text, status text,',
        '  hold_expires_at timestamptz, rate_kes bigint, quote_total_kes bigint, updated_at timestamptz,',
        '  confirmed_at timestamptz, paid_kes bigint, commission_kes bigint, host_share_kes bigint,',
        '  payment_reference text, refund_due_at timestamptz);',
        'create table public.payment(id uuid primary key default gen_random_uuid(), reference text unique,',
        '   intent text, stay_id uuid, city_id uuid, amount_cents bigint, currency text, created_by uuid,',
        "   created_via text, expires_at timestamptz, updated_at timestamptz, state text default 'pending',",
        "   provider text not null default 'mpesa', provider_ref text, created_at timestamptz default clock_timestamp());",
        "create unique index on public.payment(stay_id) where state in ('pending', 'authorised');",
        'create table public.host_message(host_id uuid, direction text, channel text, subject text, body text);',
        'create function authz.require_daraja_callback_secret(secret text) returns void',
        "  language plpgsql as $$ begin if secret <> 'fixture-secret' then raise exception 'unauthorized'; end if; end; $$;",
        'create function public.rpc_payment_mpesa_prompt_wait(text) returns jsonb language sql',
        "  as $$ select jsonb_build_object('ok',true) $$;",
        'create function public.fn_payment_reference() returns text language sql',
        '  as $$ select gen_random_uuid()::text $$;',
      ].join('\n'),
    );
    const load = (file: string) => readFile(new URL(file, migrations), 'utf8');
    const [holdsSql, listingSql, paymentSql, dispatchSql, nativeSql] = await Promise.all([
      load('20261118000100_stay_holds_and_blocks.sql'),
      load('20261122000100_sample_listings.sql'),
      load('20261119000200_stay_checkout.sql'),
      load('20261220000100_mpesa_dispatch_claim.sql'),
      load('20261220000200_native_stay_checkout.sql'),
    ]);
    for (const name of [
      'fn_stay_window',
      'fn_stay_dates_check',
      'fn_stay_occupies',
      'fn_stay_release_expired_holds',
    ]) {
      await db.exec(definition(holdsSql, name));
    }
    for (const name of ['rpc_stay_search', 'rpc_stay_hold']) {
      await db.exec(definition(listingSql, name));
    }
    for (const name of [
      'rpc_payment_begin_stay',
      'fn_stay_commission_rate',
      'tg_payment_stay_settled',
    ]) {
      await db.exec(definition(paymentSql, name));
    }
    await db.exec(
      /* sql */ [
        'create trigger settle_stay after update of state on public.payment for each row',
        "  when (new.intent = 'stay' and new.state = 'paid' and old.state is distinct from 'paid')",
        '  execute function public.tg_payment_stay_settled();',
        "insert into auth.users values ('" + owner + "', 'stay-a@example.test', false),",
        "  ('" + other + "', 'stay-b@example.test', false);",
        "insert into public.host values ('d7510000-0000-4000-8000-00000000000a', 'Africa/Nairobi');",
        "insert into public.property values ('" + property + "', null, null);",
        'insert into public.unit(id, host_id, property_id, nightly_rate_kes, min_nights, max_guests, is_sample)',
        "  values ('" +
          unit +
          "', 'd7510000-0000-4000-8000-00000000000a', '" +
          property +
          "', 7000, 1, 3, false),",
        "  ('" +
          sample +
          "', 'd7510000-0000-4000-8000-00000000000a', '" +
          property +
          "', 7000, 1, 3, true),",
        "  ('" +
          unpriced +
          "', 'd7510000-0000-4000-8000-00000000000a', '" +
          property +
          "', null, 1, 3, false);",
        'grant usage on schema public to authenticated, anon;',
      ].join('\n'),
    );
    await db.exec(dispatchSql);
    await db.exec(nativeSql);

    function actor(userId: string) {
      return db.query("select set_config('test.uid', $1, false)", [userId]);
    }
    async function result<T>(statement: string, ...params: unknown[]): Promise<T> {
      const response = await db.query<{ value: T }>('select ' + statement + ' as value', params);
      const row = response.rows[0];
      if (!row) throw new Error('The SQL fixture received no result row.');
      return row.value;
    }
    const counts = () => result<number>('(select count(*)::int from public.stay)');
    const quote = (unitId = unit, offset = 10) =>
      result<{ quoteId: string }>(
        "public.rpc_native_stay_quote($1, $2, (now() at time zone 'Africa/Nairobi')::date + $3::int," +
          " (now() at time zone 'Africa/Nairobi')::date + $3::int + 2, 2, 1)",
        property,
        unitId,
        offset,
      );
    const hold = (id: string, guest = 'Amina') =>
      result<{ stayId: string }>('public.rpc_native_stay_hold($1, $2)', id, guest);
    const status = (id: string) => result('public.rpc_native_stay_status($1)', id);
    const payment = (id: string) =>
      result<{ reference: string }>('public.rpc_native_stay_payment_begin($1)', id);

    await expect(quote()).rejects.toMatchObject({ code: '42501' });
    await db.exec('set role anon');
    await expect(quote()).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    await actor(owner);

    await expect(quote(sample)).rejects.toMatchObject({ code: 'NX001' });
    await expect(quote(unpriced)).rejects.toMatchObject({ code: 'NX001' });
    const priced = await quote();
    expect(priced).toMatchObject({
      propertyId: property,
      unitId: unit,
      adults: 2,
      children: 1,
      nights: 2,
      currency: 'KES',
      nightlyMinor: 700000,
      roomSubtotalMinor: 1400000,
      taxesMinor: 0,
      totalMinor: 1400000,
    });
    expect(await counts()).toBe(0);
    await expect(status(priced.quoteId)).rejects.toMatchObject({ code: 'NX004' });
    await db.query('update public.unit set nightly_rate_kes = 8000 where id = $1', [unit]);
    await expect(hold(priced.quoteId)).rejects.toMatchObject({ code: 'NX003' });
    expect(await counts()).toBe(0);

    await db.query(
      "update public.native_stay_checkout set expires_at = now() - interval '1 second' where id = $1",
      [priced.quoteId],
    );
    await expect(status(priced.quoteId)).rejects.toMatchObject({ code: 'NX002' });
    await expect(hold(priced.quoteId)).rejects.toMatchObject({ code: 'NX002' });

    const competing = await quote();
    const fresh = await quote();
    const first = await hold(fresh.quoteId);
    await expect(hold(fresh.quoteId)).resolves.toEqual(first);
    expect(await counts()).toBe(1);
    await expect(hold(fresh.quoteId, 'Not the same guest')).rejects.toMatchObject({
      code: 'NX005',
    });
    await expect(hold(competing.quoteId)).rejects.toMatchObject({ code: 'NX001' });
    expect(await status(fresh.quoteId)).toMatchObject({
      operationId: fresh.quoteId,
      stayId: first.stayId,
      status: 'held',
      paymentStatus: 'unpaid',
      refundDue: false,
      totalMinor: 1600000,
    });

    await actor(other);
    await expect(hold(fresh.quoteId)).rejects.toMatchObject({ code: 'NX004' });
    await expect(status(fresh.quoteId)).rejects.toMatchObject({ code: 'NX004' });
    await expect(payment(fresh.quoteId)).rejects.toMatchObject({ code: 'NX004' });
    await actor(owner);
    const begun = await payment(fresh.quoteId);
    expect(begun).toMatchObject({
      dispatch: true,
      amountMinor: 1600000,
      checkout: { paymentStatus: 'pending', status: 'held', reference: begun.reference },
    });
    expect(await payment(fresh.quoteId)).toEqual({
      checkout: { ...((await status(fresh.quoteId)) as object) },
    });
    expect(await result<number>('(select count(*)::int from public.payment)')).toBe(1);

    await db.query(
      "update public.payment set state = 'authorised', provider = 'mpesa' where reference = $1",
      [begun.reference],
    );
    expect(await status(fresh.quoteId)).toMatchObject({
      status: 'held',
      paymentStatus: 'pending',
      providerPending: true,
      reference: begun.reference,
    });
    await db.query("update public.payment set state = 'paid' where reference = $1", [
      begun.reference,
    ]);
    expect(await status(fresh.quoteId)).toMatchObject({
      status: 'booked',
      paymentStatus: 'paid',
      refundDue: false,
      reference: begun.reference,
    });
    expect(await result<number>('(select count(*)::int from public.host_message)')).toBe(1);
    expect(await payment(fresh.quoteId)).not.toHaveProperty('dispatch');

    const stranded = await quote(unit, 30);
    const strandedHold = await hold(stranded.quoteId);
    const stagedPayment = await payment(stranded.quoteId);
    const expire = async (reference: string, stayId: string) => {
      await db.query(
        "update public.payment set expires_at = now() - interval '1 second' where reference = $1",
        [reference],
      );
      await db.query(
        "update public.stay set hold_expires_at = now() - interval '1 second' where id = $1",
        [stayId],
      );
    };
    const claim = (reference: string) =>
      result('public.rpc_payment_mpesa_prompt_claim($1, $2)', reference, 'fixture-secret');
    await expire(stagedPayment.reference, strandedHold.stayId);
    expect(await claim(stagedPayment.reference)).toMatchObject({ ok: false });
    expect(await status(stranded.quoteId)).toMatchObject({
      status: 'expired',
      paymentStatus: 'failed',
    });

    const ambiguous = await quote(unit, 40);
    const ambiguousHold = await hold(ambiguous.quoteId);
    const ambiguousPayment = await payment(ambiguous.quoteId);
    expect(await claim(ambiguousPayment.reference)).toMatchObject({ ok: true });
    expect(await claim(ambiguousPayment.reference)).toMatchObject({ ok: false });
    await expire(ambiguousPayment.reference, ambiguousHold.stayId);
    expect(await status(ambiguous.quoteId)).toMatchObject({
      status: 'expired',
      paymentStatus: 'pending',
    });
  } finally {
    await db.close();
  }
}, 90_000);
