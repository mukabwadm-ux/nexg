/**
 * "Upload any CSV": turns a merchant's own spreadsheet (a POS export, a price
 * list, a stock sheet) into the offerings template the importer already checks
 * and saves (csv.ts). Phase 1, no AI: a delimiter-aware reader, a built-in list
 * of column names, deterministic cleaning and duplicate merging.
 *
 * Nothing in the file is thrown away. Columns NexG has no field for are kept
 * as each item's extra details, every raw row is kept with the import batch,
 * and a row that cannot be used goes to "needs attention" with the reason,
 * instead of failing the whole file.
 *
 * Pure (no Supabase, no DOM): the server runs the same steps again on import.
 */

import { toCsv, unguardCsvCell } from '@/lib/catalogue-csv';

import { OFFERINGS_CSV_COLUMNS } from './csv';

/** The NexG fields a column can fill. */
export const IMPORT_FIELDS = [
  'name',
  'price',
  'category',
  'description',
  'available',
  'sku',
  'stock',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: 'Name',
  price: 'Price (KES)',
  category: 'Category',
  description: 'Description',
  available: 'Available',
  sku: 'SKU or code (to match items)',
  stock: 'Stock on hand',
};

/** Field → column index in the file, or null when no column fills it. */
export type ColumnMapping = Record<ImportField, number | null>;

/** Column names seen in POS exports and spreadsheets, already normalised. */
const SYNONYMS: Record<ImportField, string[]> = {
  name: [
    'name',
    'item',
    'item name',
    'itemname',
    'product',
    'product name',
    'productname',
    'title',
    'service',
    'service name',
    'menu item',
    'dish',
    'offering',
  ],
  price: [
    'price',
    'price kes',
    'price_kes',
    'selling price',
    'sale price',
    'sales price',
    'retail price',
    'unit price',
    'price (kes)',
    'price ksh',
    'amount',
    'rate',
    'cost price',
    'mrp',
  ],
  category: [
    'category',
    'department',
    'dept',
    'group',
    'item group',
    'section',
    'menu section',
    'type',
    'class',
    'collection',
  ],
  description: ['description', 'details', 'notes', 'item description', 'long description', 'desc'],
  available: [
    'available',
    'status',
    'active',
    'in stock',
    'instock',
    'enabled',
    'visible',
    'published',
    'is active',
  ],
  sku: [
    'sku',
    'code',
    'item code',
    'product code',
    'barcode',
    'bar code',
    'plu',
    'upc',
    'ean',
    'id',
    'item id',
    'product id',
    'ref',
    'reference',
  ],
  stock: [
    'stock',
    'qty',
    'quantity',
    'on hand',
    'qty on hand',
    'stock level',
    'inventory',
    'units',
  ],
};

export const ANY_CSV_MAX_ROWS = 500;

const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

const tidyHeader = (value: string) =>
  value
    .replace(BOM, '')
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\(|\)$/g, '');

// ────────────────────────────────────────────────────────────── reading

export interface Table {
  /** Header cells, trimmed, as the merchant wrote them. */
  headers: string[];
  /** Data rows with their spreadsheet row numbers (1-based, header included). */
  rows: { rowNo: number; cells: string[] }[];
  delimiter: string;
  /** Spreadsheet row number of the header. */
  headerRow: number;
}

function guessDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n');
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    let inQuotes = false;
    let count = 0;
    for (const ch of sample) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count += 1;
    }
    if (count > bestScore) {
      best = d;
      bestScore = count;
    }
  }
  return best;
}

/** RFC 4180 with any delimiter; returns rows as arrays of cells. */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Reads any delimited file: strips a byte-order mark, picks the delimiter,
 * finds the header row (it need not be the first: titles and blank lines above
 * it are skipped) and drops blank trailing columns.
 */
export function readTable(text: string): Table | { error: string } {
  const clean = text.replace(BOM, '');
  if (!clean.trim()) return { error: 'The file is empty.' };
  const delimiter = guessDelimiter(clean);
  const all = parseDelimited(clean, delimiter);

  // The header is the row, among the first ten with two or more filled cells,
  // whose cells best match known column names; ties go to the earliest.
  let headerIndex = -1;
  let bestScore = -1;
  for (let i = 0; i < Math.min(all.length, 25); i += 1) {
    const filled = all[i]!.filter((c) => c.trim()).length;
    if (filled < 2) continue;
    const score = all[i]!.filter((c) =>
      IMPORT_FIELDS.some((f) => SYNONYMS[f].includes(tidyHeader(c))),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
    if (headerIndex >= 0 && i - headerIndex >= 10) break;
  }
  if (headerIndex < 0) return { error: 'No header row was found: the file needs column names.' };

  const rawHeaders = all[headerIndex]!.map((h) => h.trim());
  const body = all
    .slice(headerIndex + 1)
    .map((cells, index) => ({ rowNo: headerIndex + index + 2, cells }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''));

  // Keep a column when it has a name or any value.
  const width = Math.max(rawHeaders.length, ...body.map((r) => r.cells.length));
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1)
    if ((rawHeaders[c] ?? '').trim() || body.some((r) => (r.cells[c] ?? '').trim())) keep.push(c);

  const headers = keep.map((c, i) => rawHeaders[c]?.trim() || `Column ${i + 1}`);
  const rows = body.map(({ rowNo, cells }) => ({
    rowNo,
    cells: keep.map((c) => unguardCsvCell((cells[c] ?? '').trim())),
  }));
  return { headers, rows, delimiter, headerRow: headerIndex + 1 };
}

// ─────────────────────────────────────────────────────────── matching

/** A key for the set of column names, so a saved mapping finds the same POS export again. */
export function headerKey(headers: readonly string[]): string {
  return headers.map(tidyHeader).filter(Boolean).sort().join('|').slice(0, 2000);
}

/** Pre-fills the "match your columns" screen from the built-in names. */
export function suggestMapping(headers: readonly string[]): ColumnMapping {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
  const taken = new Set<number>();
  const tidy = headers.map(tidyHeader);
  for (const field of IMPORT_FIELDS) {
    // Exact names first, in the order the synonym list ranks them.
    for (const name of SYNONYMS[field]) {
      const at = tidy.findIndex((h, i) => h === name && !taken.has(i));
      if (at >= 0) {
        mapping[field] = at;
        taken.add(at);
        break;
      }
    }
  }
  // Then a column whose name contains a field word ("Retail Price incl VAT").
  for (const field of ['price', 'name', 'category'] as const) {
    if (mapping[field] !== null) continue;
    const word =
      field === 'name' ? /\b(name|item|product)\b/ : field === 'price' ? /price/ : /categ|depart/;
    const at = tidy.findIndex((h, i) => word.test(h) && !taken.has(i));
    if (at >= 0) {
      mapping[field] = at;
      taken.add(at);
    }
  }
  return mapping;
}

/** Keeps only valid, distinct column indexes for this file. */
export function sanitizeMapping(raw: unknown, width: number): ColumnMapping {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
  if (!raw || typeof raw !== 'object') return mapping;
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < width)
      if (!used.has(value)) {
        mapping[field] = value;
        used.add(value);
      }
  }
  return mapping;
}

// ─────────────────────────────────────────────────────────── cleaning

/** "KES 1,200.00", "Ksh1200", "1 200" → 1200; a price with cents is not whole shillings. */
export function cleanPrice(value: string): { price: string } | { problem: string } | null {
  const v = value.trim();
  if (!v || v === '-' || /^n\/?a$/i.test(v)) return null;
  const cleaned = v.replace(/kes|ksh|kshs|\/=|=|\s|,/gi, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { problem: `"${value}" is not a price.` };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return { problem: `"${value}" is not a price above zero.` };
  if (!Number.isInteger(n)) {
    if (Math.abs(n - Math.round(n)) < 0.005) return { price: String(Math.round(n)) };
    return { problem: `${value} has cents; prices are whole shillings.` };
  }
  if (n > 1_000_000) return { problem: `${value} is above KES 1,000,000.` };
  return { price: String(n) };
}

const TRUE = [
  'yes',
  'y',
  'true',
  '1',
  'on',
  'active',
  'available',
  'in stock',
  'instock',
  'enabled',
  'live',
  'published',
  'visible',
];
const FALSE = [
  'no',
  'n',
  'false',
  '0',
  'off',
  'inactive',
  'unavailable',
  'out of stock',
  'outofstock',
  'disabled',
  'hidden',
  'archived',
  'discontinued',
];

/** yes/no/1/0/in stock/active… → boolean; blank or unknown → null (the importer keeps the current state). */
export function cleanAvailable(value: string): boolean | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (TRUE.includes(v)) return true;
  if (FALSE.includes(v)) return false;
  return null;
}

/** "  HOT  DRINKS " and "hot drinks" → "Hot drinks"; mixed case is left as written. */
export function cleanCategory(value: string): string {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return '';
  if (v === v.toUpperCase() || v === v.toLowerCase())
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  return v;
}

// ─────────────────────────────────────────────────────── normalising

export interface SourceRow {
  /** Row number in the canonical template the importer checks (header is 1). */
  templateRow: number;
  /** Rows of the merchant's file merged into it. */
  sourceRows: number[];
  sku: string;
  stock: string;
  /** Unmatched columns, kept as the item's extra details. */
  extras: Record<string, string>;
}

export interface AttentionRow {
  sourceRow: number;
  message: string;
  /** The row as the merchant wrote it, keyed by column name. */
  raw: Record<string, string>;
}

/** Corrections typed into "needs attention", by source row. */
export type RowFixes = Record<number, Partial<Record<'name' | 'price' | 'category', string>>>;

export interface Normalised {
  /** The canonical offerings CSV (csv.ts columns). */
  csv: string;
  sources: SourceRow[];
  attention: AttentionRow[];
  /** Column names kept as extra details. */
  extraColumns: string[];
  merged: number;
}

export function normaliseTable(
  table: Table,
  mapping: ColumnMapping,
  fixes: RowFixes = {},
): Normalised {
  const mapped = new Set(Object.values(mapping).filter((v): v is number => v !== null));
  const extraColumns = table.headers.filter((_, i) => !mapped.has(i));
  const attention: AttentionRow[] = [];
  type Merged = {
    category: string;
    name: string;
    description: string;
    price: string;
    available: boolean | null;
    sku: string;
    stock: string;
    extras: Record<string, string>;
    sourceRows: number[];
  };
  const byKey = new Map<string, Merged>();
  const order: Merged[] = [];
  let merged = 0;

  for (const { rowNo, cells } of table.rows.slice(0, ANY_CSV_MAX_ROWS * 4)) {
    const raw = Object.fromEntries(table.headers.map((h, i) => [h, cells[i] ?? '']));
    const fix = fixes[rowNo] ?? {};
    const get = (field: ImportField) => {
      const at = mapping[field];
      return at === null ? '' : (cells[at] ?? '').trim();
    };
    const name = (fix.name ?? get('name')).replace(/\s+/g, ' ').trim();
    if (!name) {
      attention.push({
        sourceRow: rowNo,
        message: 'No name. Type one, or leave the row out.',
        raw,
      });
      continue;
    }
    const rawPrice = fix.price ?? get('price');
    const price = cleanPrice(rawPrice);
    if (price && 'problem' in price) {
      attention.push({ sourceRow: rowNo, message: price.problem, raw });
      continue;
    }
    const category = cleanCategory(fix.category ?? get('category')) || 'General';
    const sku = get('sku');
    const extras: Record<string, string> = {};
    table.headers.forEach((h, i) => {
      if (!mapped.has(i) && (cells[i] ?? '').trim()) extras[h] = (cells[i] ?? '').trim();
    });
    const row: Merged = {
      category,
      name,
      description: get('description').replace(/\s+/g, ' '),
      price: price ? price.price : '',
      available: cleanAvailable(get('available')),
      sku,
      stock: get('stock'),
      extras,
      sourceRows: [rowNo],
    };
    const key = sku
      ? `sku:${sku.toLowerCase()}`
      : `name:${category.toLowerCase()}\u0000${name.toLowerCase()}`;
    const earlier = byKey.get(key);
    if (earlier) {
      // The later row fills in or replaces what it has; nothing is lost.
      merged += 1;
      earlier.sourceRows.push(rowNo);
      if (row.description) earlier.description = row.description;
      if (row.price) earlier.price = row.price;
      if (row.available !== null) earlier.available = row.available;
      if (row.stock) earlier.stock = row.stock;
      Object.assign(earlier.extras, row.extras);
      continue;
    }
    byKey.set(key, row);
    order.push(row);
  }

  // Two different SKUs with the same name in a category would collide in the
  // importer, which matches by name: keep the first, send the rest to attention.
  const nameSeen = new Map<string, Merged>();
  const kept: Merged[] = [];
  for (const row of order) {
    const k = `${row.category.toLowerCase()}\u0000${row.name.toLowerCase()}`;
    const first = nameSeen.get(k);
    if (first) {
      for (const sourceRow of row.sourceRows)
        attention.push({
          sourceRow,
          message: `Same name as row ${first.sourceRows[0]} in ${row.category} but a different code. Rename one.`,
          raw: Object.fromEntries(
            table.headers.map((h, i) => [
              h,
              table.rows.find((r) => r.rowNo === sourceRow)?.cells[i] ?? '',
            ]),
          ),
        });
      continue;
    }
    nameSeen.set(k, row);
    kept.push(row);
  }

  const rows = kept.slice(0, ANY_CSV_MAX_ROWS);
  for (const row of kept.slice(ANY_CSV_MAX_ROWS))
    attention.push({
      sourceRow: row.sourceRows[0]!,
      message: `Only ${ANY_CSV_MAX_ROWS} items can be imported at a time. Import the rest in a second file.`,
      raw: {},
    });

  const csv = toCsv([
    [...OFFERINGS_CSV_COLUMNS],
    ...rows.map((r) => [
      r.category,
      r.name,
      r.description,
      r.price,
      r.available === null ? '' : r.available ? 'yes' : 'no',
    ]),
  ]);
  return {
    csv,
    sources: rows.map((r, i) => ({
      templateRow: i + 2,
      sourceRows: r.sourceRows,
      sku: r.sku,
      stock: r.stock,
      extras: r.extras,
    })),
    attention: attention.sort((a, b) => a.sourceRow - b.sourceRow),
    extraColumns,
    merged,
  };
}
