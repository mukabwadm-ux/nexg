'use server';

import { revalidatePath } from 'next/cache';

import { CATALOGUE_CSV_MAX_BYTES, planCatalogueImport, type RowError } from '@/lib/catalogue-csv';
import { merchantActionClient } from '@/lib/merchant-action-access';

export interface CatalogueImportResult {
  ok: boolean;
  message: string;
  errors?: RowError[];
  created?: number;
  updated?: number;
}

/**
 * Import a catalogue CSV.
 *
 * The browser has already shown a preview, but this re-reads the merchant's
 * own items and re-plans from the raw text, so a tampered or stale preview
 * cannot write anything the plan would refuse. Writes go through the same
 * `catalogue_item` / `catalogue_section` paths as the rest of the Catalogue
 * page, with the signed-in merchant's session, so row security
 * (`catalogue_item_write_own`) still decides what can be touched, and every
 * update is also pinned to this merchant's id.
 */
export async function importCatalogueCsv(input: {
  merchantId: string;
  csv: string;
}): Promise<CatalogueImportResult> {
  const { client, merchantId } = await merchantActionClient({
    access: 'setup',
    merchantId: input?.merchantId,
  });
  if (typeof input?.csv !== 'string' || !input.csv) {
    return { ok: false, message: 'Choose a CSV file to import.' };
  }
  if (input.csv.length > CATALOGUE_CSV_MAX_BYTES) {
    return { ok: false, message: 'The file is too large. Split it into smaller files.' };
  }

  const [{ data: itemRows, error: itemError }, { data: sectionRows, error: sectionError }] =
    await Promise.all([
      client.from('catalogue_item').select('id, name').eq('merchant_id', merchantId),
      client
        .from('catalogue_section')
        .select('id, name')
        .eq('merchant_id', merchantId)
        .order('sort'),
    ]);
  if (itemError || sectionError) {
    return {
      ok: false,
      message: `Your catalogue could not be read: ${(itemError ?? sectionError)!.message}`,
    };
  }

  const plan = planCatalogueImport(input.csv, itemRows ?? []);
  if (plan.errors.length) {
    return {
      ok: false,
      message: 'Nothing was imported. Fix the rows below and try again.',
      errors: plan.errors,
    };
  }

  /* Sections by name, created on first use. New items with no section go
     to the first existing section, or a new "Menu", as Add products does. */
  const sections = new Map((sectionRows ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]));
  const sectionId = async (name: string | undefined): Promise<string> => {
    const wanted = name?.trim() || (sectionRows?.[0]?.name ?? 'Menu');
    const key = wanted.toLowerCase();
    const known = sections.get(key);
    if (known) return known;
    const { data, error } = await client
      .from('catalogue_section')
      .insert({ merchant_id: merchantId, name: wanted })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? `Could not add the section ${wanted}.`);
    sections.set(key, data.id);
    return data.id;
  };

  let created = 0;
  let updated = 0;
  try {
    const inserts = [];
    for (const row of plan.rows.filter((r) => r.action === 'create')) {
      inserts.push({
        ...row.fields,
        name: row.fields.name!,
        price_kes: row.fields.price_kes!,
        merchant_id: merchantId,
        section_id: await sectionId(row.section),
      });
    }
    for (let i = 0; i < inserts.length; i += 200) {
      const batch = inserts.slice(i, i + 200);
      const { error } = await client.from('catalogue_item').insert(batch);
      if (error) throw new Error(error.message);
      created += batch.length;
    }

    for (const row of plan.rows.filter((r) => r.action === 'update')) {
      const patch = {
        ...row.fields,
        ...(row.section ? { section_id: await sectionId(row.section) } : {}),
      };
      const { data, error } = await client
        .from('catalogue_item')
        .update(patch)
        .eq('id', row.id!)
        .eq('merchant_id', merchantId)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`Row ${row.row}: ${error.message}`);
      if (!data) throw new Error(`Row ${row.row}: this product is no longer in your catalogue.`);
      updated += 1;
    }
  } catch (e) {
    revalidatePath('/merchant/menu');
    const done =
      created || updated
        ? ` ${created} added and ${updated} updated before it stopped; the rest were not changed.`
        : '';
    return {
      ok: false,
      message: `The import stopped: ${e instanceof Error ? e.message : 'unknown error'}.${done}`,
      created,
      updated,
    };
  }

  revalidatePath('/merchant/menu');
  revalidatePath('/discover');
  return {
    ok: true,
    message: `Imported: ${created} added, ${updated} updated.`,
    created,
    updated,
  };
}
