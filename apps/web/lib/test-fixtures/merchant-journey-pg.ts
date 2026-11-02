import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type Row = Record<string, unknown>;
type Database = {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Row[] }>;
  close(): Promise<void>;
};
type Result = { data: unknown; error: null | { code?: string; message?: string; hint?: string } };
type SourceQuery = PromiseLike<Result> & {
  select(value: string): SourceQuery;
  eq(column: string, value: string): SourceQuery;
  is(column: string, value: null): SourceQuery;
  order(column: string): SourceQuery;
  limit(value: number): SourceQuery;
  abortSignal(value: AbortSignal): SourceQuery;
};
export type Actor = 'owner' | 'stranger' | 'staff' | 'revokedOwner';
const columns = {
  catalogue_item: ['id', 'merchant_id', 'name', 'price_kes', 'available'],
  merchant_branch: ['id', 'merchant_id', 'name', 'address_text', 'latitude', 'longitude', 'is_primary', 'deleted_at', 'closed_at', 'paused_at'],
  merchant_hours: ['id', 'merchant_id', 'branch_id', 'day_of_week', 'service', 'opens', 'closes', 'closed'],
  document: ['id', 'owner_type', 'owner_id', 'requirement_id', 'side', 'status', 'reviewed_at', 'expires_at', 'superseded_at'],
} as const;
type Table = keyof typeof columns;
const rpcArguments: Record<string, string[]> = {
  rpc_merchant_application_start: ['p_operation_id', 'p_payload', 'p_merchant_id'],
  rpc_merchant_application_save: ['p_merchant_id', 'p_expected_revision', 'p_operation_id', 'p_payload'],
  rpc_merchant_application_submit: ['p_merchant_id', 'p_expected_revision', 'p_operation_id'],
  rpc_merchant_application_read: ['p_merchant_id'],
  rpc_merchant_application_payout_read: ['p_merchant_id'],
  rpc_merchant_application_payout_save: ['p_merchant_id', 'p_expected_version', 'p_operation_id', 'p_payout'],
  rpc_merchant_workspace_access: ['p_merchant_id'],
  rpc_merchant_application_review: ['p_merchant_id', 'p_expected_revision', 'p_operation_id', 'p_decision', 'p_reason'],
};
const migration = async (name: string) => (await readFile(new URL(`../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
function between(source: string, start: string, end: string) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  if (begin < 0 || finish < 0) throw new Error(`Historical fixture fragment missing: ${start}`);
  return source.slice(begin, finish);
}

/** A test-only SQL bridge. SQL identifiers are allowlisted; values are parameters.
 * It has no application rules. Every command runs the actual migration RPC body.
 * Its synthetic Auth claims never come from a browser or an unverified JWT.
 */
export async function merchantJourneyDatabase(directory: string) {
  const toolPath = process.env.PHASE4_PGLITE_PATH;
  if (!toolPath) throw new Error('Set PHASE4_PGLITE_PATH to the existing isolated PGlite dist/index.js.');
  const { PGlite } = await import(/* @vite-ignore */ pathToFileURL(toolPath).href);
  let pg: Database = new PGlite(directory);
  const ids = Object.fromEntries(['owner', 'stranger', 'staff', 'ownerSession', 'strangerSession', 'staffSession', 'staffId'].map((key) => [key, randomUUID()]));
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }
  const admin = (sql: string, parameters: unknown[] = []) => serialize(async () => {
    await pg.exec('reset role');
    return pg.query(sql, parameters);
  });
  function asActor(actor: Actor, sql: string, parameters: unknown[] = []) {
    return serialize(async () => {
      const name = actor === 'revokedOwner' ? 'owner' : actor;
      await pg.exec('reset role');
      await pg.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
        sub: ids[name], session_id: actor === 'revokedOwner' ? randomUUID() : ids[`${name}Session`], is_anonymous: false,
      })]);
      await pg.exec('set role authenticated');
      return pg.query(sql, parameters);
    });
  }
  const result = async (work: () => Promise<unknown>): Promise<Result> => {
    try { return { data: await work(), error: null }; }
    catch (error) {
      const problem = error as { code?: string; message?: string; hint?: string };
      return { data: null, error: { code: problem.code, message: problem.message, hint: problem.hint } };
    }
  };
  function rpc(actor: Actor, name: string, args: Row, signal?: AbortSignal): Promise<Result> {
    const keys = rpcArguments[name];
    if (!keys || Object.keys(args).some((key) => !keys.includes(key))) throw new Error('RPC outside journey allowlist');
    return result(async () => {
      signal?.throwIfAborted();
      const response = await asActor(actor, `select public.${name}(${keys.map((_, index) => `$${index + 1}`).join(',')}) as value`, keys.map((key) => args[key] ?? null));
      return response.rows[0]!.value;
    });
  }
  function client(actor: Actor, unavailableTable?: Table) {
    return {
      rpc: (name: string, args: Row) => rpc(actor, name, args),
      from: (table: Table) => {
        if (!Object.hasOwn(columns, table)) throw new Error('Table outside journey allowlist');
        const allowed: readonly string[] = columns[table];
        let selected: string[] = [], limit = 0, ordered = false, signal: AbortSignal | undefined;
        const filters: { column: string; value: string | null }[] = [];
        const query: SourceQuery = {
          select(value: string) { selected = value.split(','); if (selected.some((key) => !allowed.includes(key))) throw new Error('Column outside journey allowlist'); return query; },
          eq(column: string, value: string) { if (!allowed.includes(column)) throw new Error('Filter outside journey allowlist'); filters.push({ column, value }); return query; },
          is(column: string, value: null) { if (!['deleted_at', 'superseded_at'].includes(column) || value !== null) throw new Error('Null filter outside journey allowlist'); filters.push({ column, value }); return query; },
          order(column: string) { if (column !== 'id') throw new Error('Sort outside journey allowlist'); ordered = true; return query; },
          limit(value: number) { if (!Number.isInteger(value) || value < 1 || value > 501) throw new Error('Unbounded journey query'); limit = value; return query; },
          abortSignal(value: AbortSignal) { signal = value; return query; },
          then<T = Result, U = never>(fulfilled?: ((value: Result) => T | PromiseLike<T>) | null, rejected?: ((reason: unknown) => U | PromiseLike<U>) | null) {
            return result(async () => {
              signal?.throwIfAborted();
              if (table === unavailableTable) throw new Error('Deliberate owner section failure');
              if (!selected.length || !limit || !ordered || !filters.length) throw new Error('Incomplete bounded journey query');
              const parameters: unknown[] = [];
              const where = filters.map(({ column, value }) => value === null ? `"${column}" is null` : (parameters.push(value), `"${column}"=$${parameters.length}`));
              parameters.push(limit);
              // PostgreSQL's JSON encoder gives dates/times the same wire types
              // as PostgREST, rather than PGlite's JavaScript Date objects.
              const response = await asActor(actor, `select to_jsonb(saved_row) as value from (select ${selected.map((key) => `"${key}"`).join(',')} from public."${table}" where ${where.join(' and ')} order by id limit $${parameters.length}) saved_row`, parameters);
              return response.rows.map((row) => row.value);
            }).then(fulfilled, rejected);
          },
        };
        return query;
      },
    };
  }
  await pg.exec(await readFile(new URL('./merchant-journey-base.sql', import.meta.url), 'utf8'));
  // Existing catalogue/branches/hours/document definitions and owner policies are
  // loaded from their migrations, rather than restating their business rules.
  const merchant = await migration('20260101000600_merchant');
  await pg.exec(between(merchant, 'create table public.merchant_branch (', '-- ------------------------------------------------------------- merchant_user'));
  await pg.exec('alter table public.merchant_branch add column deleted_at timestamptz, add column closed_at timestamptz, add column paused_at timestamptz; alter table public.merchant_branch enable row level security;');
  await pg.exec(await migration('20260101003200_catalogue'));
  const boards = await migration('20260101020300_what_the_merchant_boards_read');
  await pg.exec(between(boards, 'alter table public.merchant_hours', '/**'));
  const documents = await migration('20260101000700_documents');
  await pg.exec(between(documents, 'create table public.document_requirement (', '-- ------------------------------------------------- seed:'));
  const sides = await migration('20260101004400_rider_onboarding');
  await pg.exec(between(sides, 'alter table public.document\n', '-- ------------------------------------------------- rider document requirements'));
  await pg.exec('alter table public.document enable row level security;');
  const rls = await migration('20260101001300_rls');
  for (const name of ['merchant_branch_read_own', 'merchant_branch_write_own', 'document_read_own', 'document_insert_own']) {
    const begin = rls.indexOf(`create policy ${name} `);
    if (begin < 0) throw new Error(`Historical owner policy missing: ${name}`);
    await pg.exec(rls.slice(begin, rls.indexOf(';', begin) + 1));
  }
  await pg.exec('grant all on public.catalogue_section,public.catalogue_item,public.merchant_branch,public.merchant_hours to authenticated; grant select,insert on public.document to authenticated;');
  const guard = await migration('20260101004000_merchant_phone_code');
  await pg.exec(between(guard, 'create or replace function public.tg_merchant_protected_columns()', '-- A log of everything'));
  await pg.exec('create trigger merchant_protected_columns before update on public.merchant for each row execute function public.tg_merchant_protected_columns();');
  await pg.exec(await migration('20261102000100_merchant_application'));
  for (const name of ['owner', 'stranger', 'staff']) {
    await admin('insert into auth.users(id) values($1)', [ids[name]]);
    await admin('insert into auth.sessions(id,user_id) values($1,$2)', [ids[`${name}Session`], ids[name]]);
  }
  await admin("insert into public.staff_user values($1,$2,'active')", [ids.staffId, ids.staff]);
  await admin("insert into public.role_grant(staff_user_id,role_id,city_id) select $1,id,null from public.role where key='merchant_ops'", [ids.staffId]);
  return {
    ids, admin, asActor, rpc, client,
    async reopen() { await queue; await pg.close(); pg = new PGlite(directory); },
    async close() { await queue; await pg.close(); },
  };
}
