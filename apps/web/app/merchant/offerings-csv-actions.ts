'use server';

import { randomUUID } from 'node:crypto';

import type { Json } from '@nexg/db';
import { revalidatePath } from 'next/cache';

import { loadSetupOfferings } from '@/app/merchant/offering-setup-actions';
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
export type PreviewRow = Omit<PlannedRow, 'item'>;

export type OfferingsCsvPreview =
  | {
      ok: true;
      rows: PreviewRow[];
      errors: RowError[];
      creates: number;
      updates: number;
      unchanged: number;
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
    }
  | { ok: false; message: string; errors?: RowError[] };

/**
 * Plans an import against the merchant's current offerings, read here on the
 * server. The preview and the import both come from this, so the import does
 * exactly what the merchant was shown, or refuses if the catalogue moved on.
 */
async function plan(input: { csv: string; profileId: string }): Promise<
  | {
      ok: true;
      client: Awaited<ReturnType<typeof merchantActionClient>>['client'];
      merchantId: string;
      plan: OfferingsImportPlan;
    }
  | { ok: false; message: string }
> {
  if (typeof input?.csv !== 'string' || !input.csv.trim())
    return { ok: false, message: 'Choose a CSV file to import.' };
  if (input.csv.length > OFFERINGS_CSV_MAX_BYTES)
    return {
      ok: false,
      message: `The file is larger than ${OFFERINGS_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
    };
  const profile = profiles.find((entry) => entry.id === input?.profileId);
  if (!profile) return { ok: false, message: 'Choose the business activity to import into.' };

  const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
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
  return {
    ok: true,
    client,
    merchantId,
    plan: planOfferingsImport(input.csv, { profile, targets, newId: randomUUID }),
  };
}

export async function previewOfferingsCsv(input: {
  csv: string;
  profileId: string;
}): Promise<OfferingsCsvPreview> {
  try {
    const planned = await plan(input);
    if (!planned.ok) return planned;
    const { rows, errors, creates, updates, unchanged } = planned.plan;
    return {
      ok: true,
      rows: rows.map(({ item: _item, ...row }) => row),
      errors,
      creates,
      updates,
      unchanged,
    };
  } catch {
    return { ok: false, message: 'The file could not be checked. Please try again.' };
  }
}

export async function importOfferingsCsv(input: {
  csv: string;
  profileId: string;
}): Promise<OfferingsCsvImportResult> {
  try {
    const planned = await plan(input);
    if (!planned.ok) return planned;
    const { rows, errors } = planned.plan;
    if (errors.length)
      return {
        ok: false,
        message: 'Nothing was imported. Fix the rows below and try again.',
        errors,
      };
    const changes = rows.filter((row) => row.item);
    if (!changes.length)
      return {
        ok: true,
        message: 'Nothing to change: your offerings already match the file.',
        created: 0,
        updated: 0,
        published: 0,
        unpublished: 0,
      };

    const { data, error } = await planned.client.rpc('rpc_merchant_setup_offerings_import', {
      p_merchant_id: planned.merchantId,
      p_rows: changes.map((row) => ({ data: row.item, publish: row.publish })) as unknown as Json,
    });
    if (error)
      return {
        ok: false,
        message:
          // The site can be live before its database change is applied.
          isMissingWorkspaceSetupRpc(error)
            ? 'Importing offerings is not switched on yet. Nothing was imported; please try again later.'
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
    };
    revalidatePath('/merchant/offerings');
    revalidatePath('/merchant');
    return {
      ok: true,
      message: [
        `Imported: ${done.created} added, ${done.updated} updated`,
        done.published ? `${done.published} published` : '',
        done.unpublished ? `${done.unpublished} unpublished` : '',
      ]
        .filter(Boolean)
        .join(', ')
        .concat('.'),
      ...done,
    };
  } catch {
    return { ok: false, message: 'The import could not be completed. Nothing was changed.' };
  }
}
