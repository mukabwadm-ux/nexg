/**
 * Catalogue CSV: the template, the export, and the import plan.
 *
 * One format for all three, so a merchant can export, edit in Excel or
 * Google Sheets, and import the same file back. The columns are the
 * `catalogue_item` fields the Catalogue page edits; photos and options
 * are not in the file, because they are uploaded and configured in the
 * page itself.
 *
 * This module is pure (no Supabase, no DOM) so the browser can preview an
 * import and the server can re-check the very same plan before writing.
 * The server never trusts the browser's preview.
 *
 * Matching: a row with an `id` updates that item, and the id must belong
 * to this merchant. A row without one updates the item with exactly the
 * same name if there is a single such item, so re-importing the template
 * does not duplicate products; otherwise it adds a new item.
 */

export const CATALOGUE_CSV_COLUMNS = [
  'id',
  'section',
  'name',
  'description',
  'price_kes',
  'available',
  'age_restricted',
  'portion_size',
  'ingredients',
  'allergens',
  'dietary_labels',
  'prep_time_minutes',
  'availability_notes',
  'handling_notes',
  'storage_guidance',
] as const;

export type CatalogueCsvColumn = (typeof CATALOGUE_CSV_COLUMNS)[number];

/** Generous for a catalogue, and under the 1 MB server-action body limit. */
export const CATALOGUE_CSV_MAX_BYTES = 512 * 1024;
export const CATALOGUE_CSV_MAX_ROWS = 1000;

const MAX_NAME = 200;
const MAX_DESCRIPTION = 400; // catalogue_item_description_length
const MAX_TEXT = 1000;
const MAX_SECTION = 80;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM = 60;
const MAX_PRICE = 1_000_000; // catalogue_item_price_sane
const MAX_PREP_MINUTES = 24 * 60;

/** What the export reads from the page. */
export interface CatalogueCsvItem {
  id: string;
  name: string;
  description: string | null;
  price_kes: number | null;
  available: boolean;
  age_restricted: boolean;
  section_id?: string | null;
  portion_size?: string | null;
  ingredients?: string | null;
  allergens?: string[] | null;
  dietary_labels?: string[] | null;
  prep_time_minutes?: number | null;
  availability_notes?: string | null;
  handling_notes?: string | null;
  storage_guidance?: string | null;
}

/** The writable fields of one item. Only columns present in the file are set. */
export interface CatalogueItemFields {
  name?: string;
  description?: string | null;
  price_kes?: number;
  available?: boolean;
  age_restricted?: boolean;
  portion_size?: string | null;
  ingredients?: string | null;
  allergens?: string[];
  dietary_labels?: string[];
  prep_time_minutes?: number | null;
  availability_notes?: string | null;
  handling_notes?: string | null;
  storage_guidance?: string | null;
}

export interface PlannedRow {
  /** Spreadsheet row number: the header is row 1. */
  row: number;
  action: 'create' | 'update';
  /** The existing item, for an update. */
  id?: string;
  matchedBy?: 'id' | 'name';
  /** Section name from the file, if the column is present and filled. */
  section?: string;
  fields: CatalogueItemFields;
}

export interface RowError {
  /** Spreadsheet row number, or 1 for a problem with the header. */
  row: number;
  message: string;
}

export interface ImportPlan {
  rows: PlannedRow[];
  errors: RowError[];
  creates: number;
  updates: number;
}

// ─────────────────────────────────────────────────────────── CSV text

/**
 * RFC 4180 parsing: quoted fields, doubled quotes, commas and line breaks
 * inside quotes, CRLF or LF endings, and a leading UTF-8 BOM (Excel adds one).
 * Blank lines are dropped.
 */
export function parseCsv(text: string): { rows: string[][]; error?: string } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endRow = () => {
    row.push(field);
    field = '';
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      endRow();
      if (src[i + 1] === '\n') i += 1;
    } else if (c === '\n') {
      endRow();
    } else {
      field += c;
    }
    i += 1;
  }
  if (quoted) return { rows, error: 'A quoted field is never closed. Check for a stray " mark.' };
  if (field !== '' || row.length) endRow();
  return { rows };
}

/**
 * Cells a spreadsheet would run as a formula get a leading apostrophe on
 * export (CSV injection), and the apostrophe is removed again on import.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function unguardCsvCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

/** CSV text with a BOM so Excel opens it as UTF-8. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ─────────────────────────────────────────────────── template & export

const LIST_SEPARATOR = '; ';

/**
 * Headers plus example rows to overwrite. With the merchant's category
 * example (from the Catalogue page) the first row is that example and the
 * food-only columns are left blank; without one, two food examples show how
 * every column is filled.
 */
export function catalogueTemplateCsv(example?: {
  name: string;
  description: string;
  pricePlaceholder?: string;
}): string {
  const header = [...CATALOGUE_CSV_COLUMNS];
  if (example) {
    const price = parseKes((example.pricePlaceholder ?? '').replace(/^e.g.s*/i, '')) ?? 1000;
    return toCsv([
      header,
      [
        '',
        'Main',
        example.name,
        example.description,
        String(price),
        'yes',
        'no',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]);
  }
  return toCsv([
    header,
    [
      '',
      'Mains',
      'Chicken biryani',
      'Fragrant rice with spiced chicken, served with kachumbari.',
      '850',
      'yes',
      'no',
      '1 plate',
      'Rice; chicken; spices',
      'none',
      'halal',
      '20',
      '',
      '',
      '',
    ],
    [
      '',
      'Drinks',
      'Fresh passion juice',
      '500 ml, no added sugar.',
      '250',
      'yes',
      'no',
      '500 ml',
      'Passion fruit; water',
      '',
      'vegan; vegetarian',
      '5',
      'Weekdays only',
      'Keep chilled',
      'Refrigerate after opening',
    ],
  ]);
}

export function catalogueExportCsv(
  items: readonly CatalogueCsvItem[],
  sectionNames: ReadonlyMap<string, string>,
): string {
  const text = (v: string | null | undefined) => v ?? '';
  const rows: string[][] = [[...CATALOGUE_CSV_COLUMNS]];
  for (const item of items) {
    rows.push([
      item.id,
      item.section_id ? (sectionNames.get(item.section_id) ?? '') : '',
      item.name,
      text(item.description),
      item.price_kes == null ? '' : String(item.price_kes),
      item.available ? 'yes' : 'no',
      item.age_restricted ? 'yes' : 'no',
      text(item.portion_size),
      text(item.ingredients),
      (item.allergens ?? []).join(LIST_SEPARATOR),
      (item.dietary_labels ?? []).join(LIST_SEPARATOR),
      item.prep_time_minutes == null ? '' : String(item.prep_time_minutes),
      text(item.availability_notes),
      text(item.handling_notes),
      text(item.storage_guidance),
    ]);
  }
  return toCsv(rows);
}

// ──────────────────────────────────────────────────────────── import

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'on'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(v)) return false;
  return null;
}

function parseList(value: string): string[] {
  return value
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'none');
}

/** "1,250", "KES 1250", "1250.00" all read as 1250. */
function parseKes(value: string): number | null {
  const cleaned = value.replace(/kes|ksh|,|\s/gi, '');
  if (!/^\d+(\.0+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 && n <= MAX_PRICE ? n : null;
}

/**
 * Checks a CSV against the merchant's current items and says, row by row,
 * what an import would do. Nothing is written here.
 */
export function planCatalogueImport(
  text: string,
  existing: readonly { id: string; name: string }[],
): ImportPlan {
  const plan: ImportPlan = { rows: [], errors: [], creates: 0, updates: 0 };
  const fail = (row: number, message: string) => plan.errors.push({ row, message });

  if (new TextEncoder().encode(text).length > CATALOGUE_CSV_MAX_BYTES) {
    fail(
      1,
      `The file is larger than ${CATALOGUE_CSV_MAX_BYTES / 1024} KB. Split it into smaller files.`,
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
  const known = new Set<string>(CATALOGUE_CSV_COLUMNS);
  const unknown = columns.filter((c) => c && !known.has(c));
  if (unknown.length) {
    fail(
      1,
      `Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use the template's headers.`,
    );
  }
  const dupes = columns.filter((c, i) => c && columns.indexOf(c) !== i);
  if (dupes.length) fail(1, `Column listed twice: ${[...new Set(dupes)].join(', ')}.`);
  for (const required of ['name', 'price_kes'] as const) {
    if (!columns.includes(required)) fail(1, `The "${required}" column is missing.`);
  }
  if (plan.errors.length) return plan;

  if (body.length === 0) {
    fail(1, 'The file has headers but no products.');
    return plan;
  }
  if (body.length > CATALOGUE_CSV_MAX_ROWS) {
    fail(
      1,
      `The file has ${body.length} products; import up to ${CATALOGUE_CSV_MAX_ROWS} at a time.`,
    );
    return plan;
  }

  const has = (c: CatalogueCsvColumn) => columns.includes(c);
  const byId = new Map(existing.map((e) => [e.id.toLowerCase(), e]));
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const e of existing) {
    const key = e.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  const touched = new Map<string, number>();

  body.forEach((cells, index) => {
    const rowNo = index + 2;
    const cell = (c: CatalogueCsvColumn) => {
      const at = columns.indexOf(c);
      return at < 0 ? '' : unguardCsvCell((cells[at] ?? '').trim());
    };
    if (cells.every((c) => c.trim() === '')) return;
    if (cells.length > columns.length && cells.slice(columns.length).some((c) => c.trim())) {
      fail(rowNo, 'This row has more cells than there are columns. Check for an unquoted comma.');
      return;
    }

    const errors: string[] = [];
    const fields: CatalogueItemFields = {};

    const name = cell('name');
    if (!name) errors.push('Name is required.');
    else if (name.length > MAX_NAME) errors.push(`Name must be ${MAX_NAME} characters or fewer.`);
    else fields.name = name;

    const price = parseKes(cell('price_kes'));
    if (price === null)
      errors.push('Price must be a whole number of shillings from 1 to 1,000,000.');
    else fields.price_kes = price;

    if (has('description')) {
      const d = cell('description');
      if (d.length > MAX_DESCRIPTION) {
        errors.push(
          `Description must be ${MAX_DESCRIPTION} characters or fewer (it has ${d.length}).`,
        );
      } else fields.description = d || null;
    }

    for (const c of ['available', 'age_restricted'] as const) {
      if (!has(c)) continue;
      const raw = cell(c);
      if (!raw) continue; // blank keeps the current value, or the default for a new item
      const b = parseBool(raw);
      if (b === null)
        errors.push(`${c === 'available' ? 'Available' : 'Age restricted'} must be yes or no.`);
      else fields[c] = b;
    }

    for (const c of [
      'portion_size',
      'ingredients',
      'availability_notes',
      'handling_notes',
      'storage_guidance',
    ] as const) {
      if (!has(c)) continue;
      const v = cell(c);
      if (v.length > MAX_TEXT) errors.push(`${c} must be ${MAX_TEXT} characters or fewer.`);
      else fields[c] = v || null;
    }

    for (const c of ['allergens', 'dietary_labels'] as const) {
      if (!has(c)) continue;
      const list = parseList(cell(c));
      if (list.length > MAX_LIST_ITEMS) errors.push(`List at most ${MAX_LIST_ITEMS} ${c}.`);
      else if (list.some((v) => v.length > MAX_LIST_ITEM))
        errors.push(`Each entry in ${c} must be ${MAX_LIST_ITEM} characters or fewer.`);
      else fields[c] = list;
    }

    if (has('prep_time_minutes')) {
      const raw = cell('prep_time_minutes');
      if (!raw) fields.prep_time_minutes = null;
      else if (!/^\d+$/.test(raw) || Number(raw) > MAX_PREP_MINUTES)
        errors.push(`Prep time must be whole minutes from 0 to ${MAX_PREP_MINUTES}.`);
      else fields.prep_time_minutes = Number(raw);
    }

    const section = cell('section');
    if (section.length > MAX_SECTION)
      errors.push(`Section must be ${MAX_SECTION} characters or fewer.`);

    let action: PlannedRow['action'] = 'create';
    let id: string | undefined;
    let matchedBy: PlannedRow['matchedBy'];
    const rawId = cell('id');
    if (rawId) {
      const match = UUID.test(rawId) ? byId.get(rawId.toLowerCase()) : undefined;
      if (!match) {
        errors.push('This id is not one of your products. Leave id blank to add a new product.');
      } else {
        action = 'update';
        id = match.id;
        matchedBy = 'id';
      }
    } else if (name) {
      const sameName = byName.get(name.toLowerCase()) ?? [];
      if (sameName.length === 1) {
        action = 'update';
        id = sameName[0]!.id;
        matchedBy = 'name';
      } else if (sameName.length > 1) {
        errors.push(
          `${sameName.length} of your products are called "${name}". Add the id from an export so we know which one to update.`,
        );
      }
    }

    if (id) {
      const earlier = touched.get(id);
      if (earlier) errors.push(`Row ${earlier} already updates this product.`);
      else touched.set(id, rowNo);
    } else if (name && !errors.length) {
      const key = `new:${name.toLowerCase()}`;
      const earlier = touched.get(key);
      if (earlier) errors.push(`Row ${earlier} already adds a product called "${name}".`);
      else touched.set(key, rowNo);
    }

    if (errors.length) {
      for (const message of errors) fail(rowNo, message);
      return;
    }

    plan.rows.push({
      row: rowNo,
      action,
      ...(id ? { id, matchedBy } : {}),
      ...(section ? { section } : {}),
      fields,
    });
    if (action === 'create') plan.creates += 1;
    else plan.updates += 1;
  });

  if (!plan.rows.length && !plan.errors.length) fail(1, 'The file has headers but no products.');
  return plan;
}
