'use server';

import { createHash } from 'node:crypto';

import type { Json } from '@nexg/db';
import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import {
  decodeStatement,
  describeRowErrors,
  readStatement,
  STATEMENT_BUCKET,
  STATEMENT_MAX_BYTES,
  STATEMENT_SOURCES,
  type BankColumnMap,
  type StatementSource,
} from '@/lib/statement-csv';
import { createClient } from '@/lib/supabase/server';

/**
 * Statement imports for Finance → Reconciliations.
 *
 * The browser uploads the file to the finance-statements bucket itself
 * (server actions take at most 1 MB). The import then reads the stored file
 * back with the signed-in person's own session, hashes it and reads it again
 * here, never trusting the browser's preview. The rules (full Finance, the
 * file in the caller's own folder, one import per file and source) and the
 * audit entries live in the rpc_fin_statement_* functions.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

export interface ImportOutcome extends Outcome {
  id?: string;
  number?: string;
}

export interface ImportInput {
  source: StatementSource;
  accountLabel: string;
  periodFrom: string;
  periodTo: string;
  /** Where the browser uploaded the file: <user id>/<uuid>/<name>. */
  path: string;
  fileName: string;
  /** Bank only: the columns chosen on screen. */
  columns: BankColumnMap | null;
}

const OPEN_RESULTS = [
  'suggested',
  'amount_differs',
  'state_differs',
  'not_in_nexg',
  'not_on_statement',
  'duplicate',
];

function refresh() {
  revalidatePath('/finance/reconciliation');
}

function done(error: { message: string } | null, message: string): Outcome {
  return error ? { ok: false, message: error.message } : { ok: true, message };
}

export async function importStatement(input: ImportInput): Promise<ImportOutcome> {
  const staff = await requireStaff();
  const finance = requireModule(staff, 'finance');
  if (!staff.isSuperAdmin && finance.level !== 'full')
    return { ok: false, message: 'Only people with full Finance access can import statements.' };
  const source = STATEMENT_SOURCES[input.source];
  if (!source) return { ok: false, message: 'Choose where the statement comes from.' };

  const supabase = createClient();
  const { data: file, error: missing } = await supabase.storage
    .from(STATEMENT_BUCKET)
    .download(input.path);
  if (missing || !file)
    return { ok: false, message: 'The statement file did not arrive. Upload it again.' };
  if (file.size > STATEMENT_MAX_BYTES)
    return { ok: false, message: 'Keep the statement under 20 MB: split it by date.' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reading = readStatement(decodeStatement(bytes), {
    format: source.format,
    columns: source.format === 'bank' ? input.columns : null,
  });
  if (reading.errors.length) return { ok: false, message: describeRowErrors(reading.errors) };

  const { data, error } = await supabase.rpc('rpc_fin_statement_import', {
    p_source: input.source,
    p_account_label: input.accountLabel,
    p_period_from: input.periodFrom,
    p_period_to: input.periodTo,
    p_file_path: input.path,
    p_file_name: input.fileName,
    p_file_sha256: sha256,
    p_size_bytes: bytes.byteLength,
    p_format: source.format,
    p_lines: reading.lines as unknown as Json,
  });
  if (error) return { ok: false, message: error.message };
  refresh();

  const result = data as { id: string; number: string; counts: Record<string, number> | null };
  const counts = result.counts ?? {};
  const open = OPEN_RESULTS.reduce((n, r) => n + (counts[r] ?? 0), 0);
  return {
    ok: true,
    id: result.id,
    number: result.number,
    message: `${result.number} imported: ${reading.lines.length.toLocaleString('en-KE')} lines, ${(
      counts.matched ?? 0
    ).toLocaleString('en-KE')} matched, ${open.toLocaleString('en-KE')} to resolve.`,
  };
}

export async function resolveStatementItem(input: {
  matchId: string;
  action: 'match' | 'confirm' | 'explain';
  recordType?: string | null;
  recordId?: string | null;
  note?: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_fin_statement_resolve', {
    p_match_id: input.matchId,
    p_action: input.action,
    p_record_type: input.recordType ?? undefined,
    p_record_id: input.recordId ?? undefined,
    p_note: input.note?.trim() || undefined,
  });
  refresh();
  return done(
    error,
    input.action === 'match'
      ? 'Matched'
      : input.action === 'confirm'
        ? 'Match confirmed'
        : 'Explained',
  );
}

export async function closeStatement(importId: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_fin_statement_close', {
    p_import_id: importId,
  });
  refresh();
  return done(error, 'Reconciliation closed');
}

export async function voidStatement(importId: string, reason: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_fin_statement_void', {
    p_import_id: importId,
    p_reason: reason,
  });
  refresh();
  return done(error, 'Import voided');
}

export interface FoundRecord {
  record_type: string;
  record_id: string;
  reference: string | null;
  label: string | null;
  receipt: string | null;
  amount_cents: number | null;
  state: string | null;
  at: string | null;
  /** The row of this statement it is already matched to, if any. */
  matched_to_row: number | null;
}

/** NexG records a statement line could be matched to by hand. */
export async function findStatementRecords(
  matchId: string,
  query: string,
): Promise<Outcome & { records?: FoundRecord[] }> {
  const { data, error } = await createClient().rpc('rpc_fin_statement_find', {
    p_match_id: matchId,
    p_query: query.trim() || undefined,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, records: (data ?? []) as unknown as FoundRecord[] };
}

/** The uploaded file, through a link that lasts a minute, for people who reach Finance. */
export async function statementFileLink(path: string): Promise<Outcome & { url?: string }> {
  const { data, error } = await createClient()
    .storage.from(STATEMENT_BUCKET)
    .createSignedUrl(path, 60, { download: true });
  if (error || !data)
    return { ok: false, message: error?.message ?? 'The file could not be opened.' };
  return { ok: true, url: data.signedUrl };
}
