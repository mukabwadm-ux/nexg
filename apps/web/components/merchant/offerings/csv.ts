/**
 * Offerings CSV: the template, the export and the import plan.
 *
 * One format for all three, so a merchant can export, edit in Excel or
 * Google Sheets, and import the same file back. Each row is one offering in
 * a catalogue category (the editor's "Catalogue section"):
 *
 *   category, name, description, price_kes, available
 *
 * Matching is by name within a category, ignoring case and extra spaces.
 * A merchant's own spreadsheet has no ids, so this is the rule that makes
 * importing the same file twice update offerings instead of adding copies,
 * whether or not it came from an export. Renaming an offering or moving it
 * to another category is done in the editor: in a file, a new name or
 * category is a new offering.
 *
 * Pure (no Supabase, no DOM): the server plans every import itself from the
 * raw text, and the preview the merchant sees is that same plan.
 */

import { parseCsv, toCsv, unguardCsvCell } from '@/lib/catalogue-csv';

import { createOffering, validateOffering, type Offering, type OfferingProfile } from './model';
import { schemas } from './schemas';

export const OFFERINGS_CSV_COLUMNS = [
  'category',
  'name',
  'description',
  'price_kes',
  'available',
] as const;
type Column = (typeof OFFERINGS_CSV_COLUMNS)[number];
const REQUIRED: readonly Column[] = ['category', 'name', 'price_kes'];

/** The import command saves at most this many offerings in one go. */
export const OFFERINGS_CSV_MAX_ROWS = 500;
/** Under the 1 MB server-action body limit. */
export const OFFERINGS_CSV_MAX_BYTES = 512 * 1024;

const MAX_CATEGORY = 80;
const MAX_NAME = 150;
const MAX_DESCRIPTION = 400;
const MAX_PRICE = 1_000_000;

/** What the import can match a row against. */
export interface ImportTarget {
  id: string;
  name: string;
  /** The catalogue category it is in. */
  category: string;
  /** An offering the editor opens; otherwise an older catalogue entry. */
  offering?: Offering;
}

export interface RowError {
  /** Spreadsheet row number: the header is row 1, and 1 means the file. */
  row: number;
  message: string;
}

export interface PlannedRow {
  row: number;
  action: 'create' | 'update' | 'unchanged';
  category: string;
  name: string;
  /** Whole shillings, or blank for an offering priced by quote or enquiry. */
  price: string;
  priceMode: Offering['priceMode'];
  /** Published after the import. */
  published: boolean;
  /** Set the catalogue switch: true publishes, false unpublishes, null keeps. */
  publish: boolean | null;
  /** What the merchant should know about this row. */
  notes: string[];
  /** The offering as it will be saved. Absent when unchanged. */
  item?: Offering;
}

export interface OfferingsImportPlan {
  rows: PlannedRow[];
  errors: RowError[];
  creates: number;
  updates: number;
  unchanged: number;
}

const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const key = (category: string, name: string) => `${norm(category)}\u0000${norm(name)}`;

function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'on'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(v)) return false;
  return null;
}

/** "1,250", "KES 1250" and "1250.00" all read as 1250. */
function parsePrice(value: string): number | null {
  const cleaned = value.replace(/kes|ksh|,|\s/gi, '');
  if (!/^\d+(\.0{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 && n <= MAX_PRICE ? n : null;
}

const priced = (item: Offering) => item.priceMode === 'fixed' || item.priceMode === 'unit';

// ─────────────────────────────────────────────────── template & export

/** Headers and two example rows to overwrite, priced the way the activity's offerings are. */
export function offeringsTemplateCsv(profile: OfferingProfile): string {
  const schema = schemas[profile.schema];
  const enquiryOnly = !!schema && !schema.priceModes.some((m) => m === 'fixed' || m === 'unit');
  const label = schema?.label ?? 'Offering';
  return toCsv([
    [...OFFERINGS_CSV_COLUMNS],
    [
      'Popular',
      `${profile.name} ${label.toLowerCase()}`,
      'What the customer gets, in a sentence or two.',
      enquiryOnly ? '' : '2500',
      'no',
    ],
    [
      'Specials',
      `${profile.name} ${label.toLowerCase()} for two`,
      'A second example. Delete both rows and add your own.',
      enquiryOnly ? '' : '4500',
      'no',
    ],
  ]);
}

export function offeringsExportCsv(offerings: readonly Offering[]): string {
  return toCsv([
    [...OFFERINGS_CSV_COLUMNS],
    ...offerings
      .filter((o) => o.publication !== 'archived')
      .map((o) => [
        o.section ?? '',
        o.name,
        o.description,
        priced(o) ? o.price : '',
        o.publication === 'published' ? 'yes' : 'no',
      ]),
  ]);
}

// ──────────────────────────────────────────────────────────── import

/**
 * Checks a file against the merchant's offerings and says, row by row, what
 * an import would do. Nothing is saved here.
 *
 * `profile` is the business activity new offerings are added to; a matched
 * offering keeps its own. `newId` names a new offering.
 */
export function planOfferingsImport(
  text: string,
  {
    profile,
    targets,
    newId,
  }: {
    profile: OfferingProfile;
    targets: readonly ImportTarget[];
    newId: () => string;
  },
): OfferingsImportPlan {
  const plan: OfferingsImportPlan = { rows: [], errors: [], creates: 0, updates: 0, unchanged: 0 };
  const fail = (row: number, message: string) => plan.errors.push({ row, message });

  if (new TextEncoder().encode(text).length > OFFERINGS_CSV_MAX_BYTES) {
    fail(
      1,
      `The file is larger than ${OFFERINGS_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
    );
    return plan;
  }
  const parsed = parseCsv(text);
  if (parsed.error) {
    fail(1, parsed.error);
    return plan;
  }
  const [header, ...body] = parsed.rows;
  if (!header) {
    fail(1, 'The file is empty. Start from the template.');
    return plan;
  }

  const columns = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const known = new Set<string>(OFFERINGS_CSV_COLUMNS);
  const unknown = columns.filter((c) => c && !known.has(c));
  if (unknown.length)
    fail(
      1,
      `Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. The columns are ${OFFERINGS_CSV_COLUMNS.join(', ')}.`,
    );
  const dupes = columns.filter((c, i) => c && columns.indexOf(c) !== i);
  if (dupes.length) fail(1, `Column listed twice: ${[...new Set(dupes)].join(', ')}.`);
  for (const required of REQUIRED)
    if (!columns.includes(required)) fail(1, `The "${required}" column is missing.`);
  if (plan.errors.length) return plan;

  const rows = body
    .map((cells, index) => ({ cells, rowNo: index + 2 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''));
  if (!rows.length) {
    fail(1, 'The file has headers but no offerings.');
    return plan;
  }
  if (rows.length > OFFERINGS_CSV_MAX_ROWS) {
    fail(
      1,
      `The file has ${rows.length} offerings; import up to ${OFFERINGS_CSV_MAX_ROWS} at a time.`,
    );
    return plan;
  }

  const has = (c: Column) => columns.includes(c);
  const byKey = new Map<string, ImportTarget[]>();
  for (const target of targets) {
    const k = key(target.category, target.name);
    byKey.set(k, [...(byKey.get(k) ?? []), target]);
  }
  const seen = new Map<string, number>();

  for (const { cells, rowNo } of rows) {
    const cell = (c: Column) => {
      const at = columns.indexOf(c);
      return at < 0 ? '' : unguardCsvCell((cells[at] ?? '').trim());
    };
    if (cells.length > columns.length && cells.slice(columns.length).some((c) => c.trim())) {
      fail(rowNo, 'This row has more cells than there are columns. Check for an unquoted comma.');
      continue;
    }
    const errors: string[] = [];
    const notes: string[] = [];

    const category = cell('category').replace(/\s+/g, ' ');
    if (!category) errors.push('Category is required.');
    else if (category.length > MAX_CATEGORY)
      errors.push(`Category must be ${MAX_CATEGORY} characters or fewer.`);

    const name = cell('name').replace(/\s+/g, ' ');
    if (!name) errors.push('Name is required.');
    else if (name.length > MAX_NAME) errors.push(`Name must be ${MAX_NAME} characters or fewer.`);

    const description = has('description') ? cell('description') : undefined;
    if (description !== undefined && description.length > MAX_DESCRIPTION)
      errors.push(
        `Description must be ${MAX_DESCRIPTION} characters or fewer (it has ${description.length}).`,
      );

    const rawAvailable = has('available') ? cell('available') : '';
    const available = rawAvailable ? parseBool(rawAvailable) : null;
    if (rawAvailable && available === null) errors.push('Available must be yes or no.');

    const rawPrice = cell('price_kes');
    const price = rawPrice ? parsePrice(rawPrice) : null;
    if (rawPrice && price === null)
      errors.push('Price must be a whole number of shillings from 1 to 1,000,000, such as 1500.');

    // The offering this row updates, if any.
    let target: ImportTarget | undefined;
    if (category && name) {
      const k = key(category, name);
      const earlier = seen.get(k);
      if (earlier) errors.push(`Row ${earlier} already has "${name}" in ${category}.`);
      else seen.set(k, rowNo);
      const matches = byKey.get(k) ?? [];
      if (matches.length > 1)
        errors.push(
          `${matches.length} of your offerings in ${category} are called "${name}". Rename one in Offerings, then import again.`,
        );
      else if (matches[0] && !matches[0].offering)
        errors.push(
          `"${name}" in ${category} is an older catalogue entry that Offerings cannot change. Leave this row out or give it another name.`,
        );
      else target = matches[0];
    }

    const current = target?.offering;
    const schema = schemas[current?.schemaId ?? profile.schema];
    let item: Offering | undefined;
    if (!schema) errors.push('This activity has no offering type to import into.');
    else if (!errors.length) {
      item = current
        ? { ...structuredClone(current), publication: 'draft' }
        : { ...createOffering(profile, profile.schema, newId()) };
      delete item.image;
      item.name = name;
      item.section = category;
      if (description !== undefined) item.description = description;

      if (price !== null) {
        if (schema.priceModes.includes('fixed') || schema.priceModes.includes('unit')) {
          item.priceMode =
            current?.priceMode === 'unit' || !schema.priceModes.includes('fixed')
              ? 'unit'
              : 'fixed';
          item.price = String(price);
        } else
          errors.push(
            `${schema.plural} are priced by enquiry. Leave price_kes blank for this row.`,
          );
      } else {
        const open = (['quote', 'enquiry'] as const).find((m) => schema.priceModes.includes(m));
        if (!open) errors.push('Enter a price: a whole number of shillings from 1 to 1,000,000.');
        else {
          item.priceMode = open;
          item.price = '';
        }
      }

      const issues = validateOffering(item);
      if (issues.length) errors.push(issues[0]!.message);
    }

    if (errors.length || !item) {
      for (const message of errors) fail(rowNo, message);
      continue;
    }

    // Publication: yes publishes when the offering is complete, no unpublishes,
    // blank keeps it. A published offering must stay complete.
    const wasPublished = current?.publication === 'published';
    let publish: boolean | null = null;
    if (available === false) {
      if (wasPublished) {
        publish = false;
        notes.push('Will be unpublished. Guests stop seeing it.');
      }
    } else {
      const missing = validateOffering({ ...item, publication: 'published' }, true);
      if (wasPublished) {
        if (missing.length) {
          fail(
            rowNo,
            `This offering is published, so it must stay complete: ${missing[0]!.message} Fix the row, or set available to no to unpublish it.`,
          );
          continue;
        }
      } else if (available === true) {
        if (missing.length)
          notes.push(
            `Stays a draft until it is complete: ${missing[0]!.message} Then publish it in Offerings.`,
          );
        else {
          publish = true;
          notes.push('Will be published.');
        }
      }
    }
    const published = publish ?? wasPublished;

    let action: PlannedRow['action'] = current ? 'update' : 'create';
    if (
      current &&
      publish === null &&
      current.name === item.name &&
      current.description === item.description &&
      current.price === item.price &&
      current.priceMode === item.priceMode &&
      norm(current.section ?? '') === norm(item.section ?? '')
    )
      action = 'unchanged';

    plan.rows.push({
      row: rowNo,
      action,
      category,
      name,
      price: priced(item) ? item.price : '',
      priceMode: item.priceMode,
      published,
      publish,
      notes,
      ...(action === 'unchanged' ? {} : { item }),
    });
    if (action === 'create') plan.creates += 1;
    else if (action === 'update') plan.updates += 1;
    else plan.unchanged += 1;
  }

  return plan;
}
