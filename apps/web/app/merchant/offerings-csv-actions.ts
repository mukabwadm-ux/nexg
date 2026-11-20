'use server';

import { randomUUID } from 'node:crypto';

import type { Json } from '@nexg/db';
import { revalidatePath } from 'next/cache';

import { loadSetupOfferings } from '@/app/merchant/offering-setup-actions';
import {
  headerKey,
  normaliseTable,
  readTable,
  sanitizeMapping,
  suggestMapping,
  type AttentionRow,
  type ColumnMapping,
  type RowFixes,
  type SourceRow,
  type Table,
} from '@/components/merchant/offerings/any-csv';
import {
  OFFERINGS_CSV_MAX_BYTES,
  planOfferingsImport,
  type ImportTarget,
  type OfferingsImportPlan,
  type PlannedRow,
  type RowError,
} from '@/components/merchant/offerings/csv';
import { profiles } from '@/components/merchant/offerings/model';
import { isMissingWorkspaceSetupRpc, merchantActionClient } from '@/lib/merchant-action-access';
import { merchantCatalogueRows } from '@/lib/merchant-catalogue-rows';

/** A planned row as the preview shows it: everything but the saved offering. */
export type PreviewRow = Omit<PlannedRow, 'item'> & { sourceRows: number[] };

export interface ImportInput {
  csv: string;
  fileName?: string;
  profileId: string;
  /** Field → column index; omitted on the first look, which suggests one. */
  mapping?: ColumnMapping;
  fixes?: RowFixes;
}

export type OfferingsCsvPreview =
  | {
      ok: true;
      headers: string[];
      /** The first rows of the file as written, to help match columns. */
      sample: string[][];
      headerRow: number;
      mapping: ColumnMapping;
      /** The mapping came from this merchant's last import of the same columns. */
      remembered: boolean;
      extraColumns: string[];
      rows: PreviewRow[];
      /** Problems with the whole file; nothing imports while there are any. */
      errors: RowError[];
      attention: AttentionRow[];
      creates: number;
      updates: number;
      unchanged: number;
      merged: number;
    }
  | { ok: false; message: string };

export type OfferingsCsvImportResult =
  | {
      ok: true;
      message: string;
      created: number;
      updated: number;
      published: number;
      unpublished: number;
      attention: AttentionRow[];
    }
  | { ok: false; message: string; errors?: RowError[] };

type Client = Awaited<ReturnType<typeof merchantActionClient>>['client'];

interface Planned {
  client: Client;
  merchantId: string;
  table: Table;
  mapping: ColumnMapping;
  remembered: boolean;
  sources: SourceRow[];
  extraColumns: string[];
  merged: number;
  plan: OfferingsImportPlan;
  attention: AttentionRow[];
  fileErrors: RowError[];
}

/**
 * Reads the merchant's file, matches its columns (the mapping sent, else the
 * one saved for these column names, else the built-in names), cleans it into
 * the offerings template and plans the import against the current offerings.
 * The preview and the import both come from this.
 */
async function plan(
  input: ImportInput,
): Promise<({ ok: true } & Planned) | { ok: false; message: string }> {
  if (typeof input?.csv !== 'string' || !input.csv.trim())
    return { ok: false, message: 'Choose a CSV file to import.' };
  if (input.csv.length > OFFERINGS_CSV_MAX_BYTES)
    return {
      ok: false,
      message: `The file is larger than ${OFFERINGS_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
    };
  const profile = profiles.find((entry) => entry.id === input?.profileId);
  if (!profile) return { ok: false, message: 'Choose the business activity to import into.' };

  const table = readTable(input.csv);
  if ('error' in table) return { ok: false, message: table.error };
  if (!table.rows.length) return { ok: false, message: 'The file has column names but no rows.' };

  const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });

  let mapping: ColumnMapping;
  let remembered = false;
  if (input.mapping) mapping = sanitizeMapping(input.mapping, table.headers.length);
  else {
    const saved = await client.rpc('rpc_merchant_import_mapping_read', {
      p_merchant_id: merchantId,
      p_header_key: headerKey(table.headers),
    });
    if (!saved.error && saved.data) {
      mapping = sanitizeMapping(saved.data, table.headers.length);
      remembered = true;
    } else mapping = suggestMapping(table.headers);
  }

  const normalised = normaliseTable(table, mapping, input.fixes ?? {});

  const offerings = await loadSetupOfferings();
  if (!offerings.ok) return { ok: false, message: offerings.message };
  const editable = new Set(offerings.items.map((item) => item.id));
  const targets: ImportTarget[] = [
    ...offerings.items.map((offering) => ({
      id: offering.id,
      name: offering.name,
      category: offering.section ?? '',
      offering,
    })),
    // Older catalogue entries: matched so a row cannot quietly duplicate one.
    ...(await merchantCatalogueRows(client, merchantId))
      .filter((row) => !editable.has(row.id))
      .map((row) => ({ id: row.id, name: row.name, category: row.section })),
  ];

  const fileErrors: RowError[] = [];
  if (mapping.name === null)
    fileErrors.push({ row: 1, message: 'Choose the column that holds each item’s name.' });
  const planned =
    normalised.sources.length > 0
      ? planOfferingsImport(normalised.csv, { profile, targets, newId: randomUUID })
      : { rows: [], errors: [], creates: 0, updates: 0, unchanged: 0 };

  // A row the importer refuses goes to "needs attention" under its own row number.
  const sourceOf = (templateRow: number) => normalised.sources[templateRow - 2];
  const rawOf = (rowNo: number) => {
    const found = table.rows.find((r) => r.rowNo === rowNo);
    return Object.fromEntries(table.headers.map((h, i) => [h, found?.cells[i] ?? '']));
  };
  const attention = [...normalised.attention];
  for (const error of planned.errors) {
    const source = error.row === 1 ? undefined : sourceOf(error.row);
    if (!source) fileErrors.push(error);
    else
      for (const sourceRow of source.sourceRows)
        attention.push({ sourceRow, message: error.message, raw: rawOf(sourceRow) });
  }
  attention.sort((a, b) => a.sourceRow - b.sourceRow);

  return {
    ok: true,
    client,
    merchantId,
    table,
    mapping,
    remembered,
    sources: normalised.sources,
    extraColumns: normalised.extraColumns,
    merged: normalised.merged,
    plan: planned,
    attention,
    fileErrors,
  };
}

export async function previewOfferingsCsv(input: ImportInput): Promise<OfferingsCsvPreview> {
  try {
    const p = await plan(input);
    if (!p.ok) return p;
    return {
      ok: true,
      headers: p.table.headers,
      sample: p.table.rows.slice(0, 3).map((r) => r.cells),
      headerRow: p.table.headerRow,
      mapping: p.mapping,
      remembered: p.remembered,
      extraColumns: p.extraColumns,
      rows: p.plan.rows.map(({ item: _item, ...row }) => ({
        ...row,
        sourceRows: p.sources[row.row - 2]?.sourceRows ?? [],
      })),
      errors: p.fileErrors,
      attention: p.attention,
      creates: p.plan.creates,
      updates: p.plan.updates,
      unchanged: p.plan.unchanged,
      merged: p.merged,
    };
  } catch {
    return { ok: false, message: 'The file could not be checked. Please try again.' };
  }
}

export async function importOfferingsCsv(input: ImportInput): Promise<OfferingsCsvImportResult> {
  try {
    if (!input.mapping) return { ok: false, message: 'Confirm which column is which first.' };
    const p = await plan(input);
    if (!p.ok) return p;
    if (p.fileErrors.length)
      return {
        ok: false,
        message: 'Nothing was imported. Fix the problems with the file first.',
        errors: p.fileErrors,
      };
    if (p.mapping.price === null && p.plan.rows.some((r) => r.priceMode === 'fixed'))
      return { ok: false, message: 'Choose the price column first.' };

    const changes = p.plan.rows.filter((row) => row.item);

    // Keep the file exactly as uploaded, privately, with the batch.
    const fileName = (input.fileName || 'import.csv').slice(0, 255);
    let storagePath: string | null = `${p.merchantId}/${randomUUID()}.csv`;
    const stored = await p.client.storage
      .from('merchant-imports')
      .upload(storagePath, new Blob([input.csv], { type: 'text/csv' }), {
        contentType: 'text/csv',
        upsert: false,
      });
    if (stored.error) storagePath = null;

    // Every row of the file, with what happened to it.
    const outcome = new Map<
      number,
      { status: string; message: string | null; itemId: string | null }
    >();
    for (const row of p.plan.rows) {
      const source = p.sources[row.row - 2];
      for (const sourceRow of source?.sourceRows ?? [])
        outcome.set(sourceRow, {
          status: row.action === 'unchanged' ? 'unchanged' : 'imported',
          message: row.notes.join(' ') || null,
          itemId: row.item?.id ?? null,
        });
    }
    for (const a of p.attention)
      outcome.set(a.sourceRow, { status: 'attention', message: a.message, itemId: null });
    const rows = p.table.rows.slice(0, 2000).map(({ rowNo, cells }) => {
      const o = outcome.get(rowNo) ?? {
        status: 'attention',
        message: 'Not imported.',
        itemId: null,
      };
      return {
        row_no: rowNo,
        raw: Object.fromEntries(p.table.headers.map((h, i) => [h, cells[i] ?? ''])),
        status: o.status,
        message: o.message,
        item_id: o.itemId,
      };
    });
    const extras = p.plan.rows
      .filter((row) => row.item)
      .map((row) => {
        const source = p.sources[row.row - 2];
        const kept = { ...(source?.extras ?? {}) };
        if (source?.sku) kept['SKU'] = source.sku;
        if (source?.stock) kept['Stock'] = source.stock;
        return { item_id: row.item!.id, extras: kept };
      })
      .filter((e) => Object.keys(e.extras).length > 0);

    const { data, error } = await p.client.rpc('rpc_merchant_offerings_import_any', {
      p_merchant_id: p.merchantId,
      p_rows: changes.map((row) => ({ data: row.item, publish: row.publish })) as unknown as Json,
      p_batch: {
        file_name: fileName,
        storage_path: storagePath,
        header_key: headerKey(p.table.headers),
        headers: p.table.headers,
        mapping: p.mapping,
        rows,
        extras,
      } as unknown as Json,
    });
    if (error)
      return {
        ok: false,
        message: isMissingWorkspaceSetupRpc(error)
          ? 'Importing any spreadsheet is not switched on yet. Nothing was imported; please try again later.'
          : error.code === '40001'
            ? 'An offering changed while you were importing. Check the file again, then import.'
            : error.code === '42501'
              ? 'Only the business owner can import offerings.'
              : `Nothing was imported: ${error.message}`,
      };
    const done = data as {
      created: number;
      updated: number;
      published: number;
      unpublished: number;
      attention: number;
    };
    revalidatePath('/merchant/offerings');
    revalidatePath('/merchant');
    return {
      ok: true,
      message: [
        `Imported: ${done.created} added, ${done.updated} updated`,
        done.published ? `${done.published} published` : '',
        done.unpublished ? `${done.unpublished} unpublished` : '',
        p.attention.length
          ? `${p.attention.length} row${p.attention.length === 1 ? '' : 's'} need attention`
          : '',
      ]
        .filter(Boolean)
        .join(', ')
        .concat('.'),
      created: done.created,
      updated: done.updated,
      published: done.published,
      unpublished: done.unpublished,
      attention: p.attention,
    };
  } catch {
    return { ok: false, message: 'The import could not be completed. Nothing was changed.' };
  }
}

export interface ImportBatch {
  id: string;
  file_name: string;
  created_at: string;
  created: number;
  updated: number;
  attention: number;
  undone_at: string | null;
  undone_removed: number | null;
  can_undo: boolean;
  attention_rows: { row: number; message: string; raw: Record<string, string> }[];
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const { data, error } = await client.rpc('rpc_merchant_import_batches', {
      p_merchant_id: merchantId,
    });
    return error ? [] : ((data as unknown as ImportBatch[]) ?? []);
  } catch {
    return [];
  }
}

export async function undoImportBatch(batchId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { client } = await merchantActionClient({ access: 'workspace-setup' });
    const { data, error } = await client.rpc('rpc_merchant_import_batch_undo', {
      p_batch_id: batchId,
    });
    if (error) return { ok: false, message: error.message };
    const done = data as { removed: number; kept: number };
    revalidatePath('/merchant/offerings');
    return {
      ok: true,
      message:
        `Undone: ${done.removed} new offering${done.removed === 1 ? '' : 's'} removed.` +
        (done.kept ? ` ${done.kept} kept because they were published or ordered since.` : ''),
    };
  } catch {
    return { ok: false, message: 'The import could not be undone. Please try again.' };
  }
}
