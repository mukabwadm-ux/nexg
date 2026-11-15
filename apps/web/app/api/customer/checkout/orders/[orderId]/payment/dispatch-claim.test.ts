import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('the database allows one prompt dispatch per window and refuses settled payments', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema authz;
      create function authz.require_daraja_callback_secret(value text)
      returns void language plpgsql as $$ begin
        if value <> 'test-dispatch-secret' then raise exception 'denied'; end if;
      end; $$;
      create table public.payment(id integer primary key, reference text not null unique, state text not null);
      create function public.rpc_payment_mpesa_prompt_wait(value text)
      returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;
      insert into public.payment values (1, 'PAY-1', 'pending'), (2, 'PAY-2', 'paid');
    `);
    const migration = await readFile(
      new URL(
        '../../../../../../../../../supabase/migrations/20261213000100_mpesa_dispatch_claim.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.exec(migration);
    const claim = async (reference: string) =>
      (
        await db.query<{ state: { ok: boolean; wait_seconds: number } }>(
          'select public.rpc_payment_mpesa_prompt_claim($1, $2) as state',
          [reference, 'test-dispatch-secret'],
        )
      ).rows[0]!.state;
    expect(await claim('PAY-1')).toEqual({ ok: true, wait_seconds: 0 });
    expect(await claim('PAY-1')).toMatchObject({ ok: false, wait_seconds: expect.any(Number) });
    expect((await claim('PAY-1')).wait_seconds).toBeGreaterThan(0);
    expect(await claim('PAY-2')).toMatchObject({ ok: false, wait_seconds: 0 });
    await expect(
      db.query('select public.rpc_payment_mpesa_prompt_claim($1, $2)', ['PAY-1', 'wrong-secret']),
    ).rejects.toThrow('denied');
  } finally {
    await db.close();
  }
}, 90_000);
