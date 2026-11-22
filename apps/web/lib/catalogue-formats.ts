/**
 * JSON and XML for the catalogue and offerings importers.
 *
 * Both importers check CSV. Rather than a second set of rules per format, a
 * JSON or XML file is turned into the same CSV text first, and the existing
 * CSV checks run on that, in the browser preview and again on the server.
 * Each item becomes one row in file order, so item 1 is row 2 (the column
 * names are row 1) in every message.
 *
 * Accepted shapes, with the CSV column names as keys or tags:
 *   JSON  [{ "name": "Tea", "price_kes": 120 }, …]
 *         or { "items": [ … ] } (also "products", "offerings", "catalogue")
 *   XML   <catalogue><item><name>Tea</name><price_kes>120</price_kes></item>…</catalogue>
 * A list (allergens, dietary labels) can be a JSON array, repeated XML tags,
 * or one "a; b" value. true/false read as yes/no.
 *
 * Pure (no DOM, no Supabase). The XML reader is deliberately small: no DTDs,
 * no custom entities, no external anything.
 */

import { parseCsv, planCatalogueImport, type ImportPlan } from './catalogue-csv';

export type CatalogueFormat = 'csv' | 'json' | 'xml';

export const CATALOGUE_FORMATS: readonly CatalogueFormat[] = ['csv', 'json', 'xml'];

export const FORMAT_LABEL: Record<CatalogueFormat, string> = {
  csv: 'CSV',
  json: 'JSON',
  xml: 'XML',
};

export const FORMAT_MIME: Record<CatalogueFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
};

/** For a file input: every format both importers read. */
export const CATALOGUE_FILE_ACCEPT =
  '.csv,.txt,.json,.xml,text/csv,text/plain,application/json,application/xml,text/xml';

const LIST_SEPARATOR = '; ';
const ITEM_KEYS = ['items', 'products', 'offerings', 'catalogue', 'catalog'];
const BOM = /^\uFEFF/;

/** The file's format from its name, else from its first character. */
export function detectFormat(fileName: string | undefined, text: string): CatalogueFormat {
  const ext = /\.([a-z]+)$/i.exec(fileName ?? '')?.[1]?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'xml') return 'xml';
  if (ext === 'csv') return 'csv';
  const first = text.replace(BOM, '').trimStart()[0];
  if (first === '[' || first === '{') return 'json';
  if (first === '<') return 'xml';
  return 'csv';
}

export function isCatalogueFormat(value: unknown): value is CatalogueFormat {
  return value === 'csv' || value === 'json' || value === 'xml';
}

// ─────────────────────────────────────────────────────────── to CSV

type Record_ = Map<string, string>;

/** Every cell quoted, so commas and semicolons inside values never split a column. */
function writeCsv(rows: readonly (readonly string[])[]): string {
  return (
    rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n'
  );
}

function recordsToCsv(records: Record_[]): string {
  const columns: string[] = [];
  for (const record of records)
    for (const key of record.keys()) if (!columns.includes(key)) columns.push(key);
  return writeCsv([columns, ...records.map((r) => columns.map((c) => r.get(c) ?? ''))]);
}

function scalar(value: unknown): string | null {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return null;
}

function jsonToRecords(text: string): Record_[] | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message.replace(/^JSON\.parse: /, '') : '';
    return { error: `The JSON could not be read${detail ? `: ${detail}` : ''}.` };
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const key = Object.keys(data).find((k) => ITEM_KEYS.includes(k.toLowerCase()));
    data = key ? (data as Record<string, unknown>)[key] : undefined;
  }
  if (!Array.isArray(data))
    return {
      error: 'The JSON must be a list of items, or an object with an "items" list.',
    };

  const records: Record_[] = [];
  for (const [index, item] of data.entries()) {
    const where = `Item ${index + 1} (row ${index + 2})`;
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return { error: `${where} is not an object with fields like "name" and "price_kes".` };
    const record: Record_ = new Map();
    for (const [key, value] of Object.entries(item)) {
      if (Array.isArray(value)) {
        const parts = value.map(scalar);
        if (parts.some((p) => p === null))
          return { error: `${where}: "${key}" must be a list of plain values.` };
        record.set(key, (parts as string[]).join(LIST_SEPARATOR));
        continue;
      }
      const cell = scalar(value);
      if (cell === null)
        return { error: `${where}: "${key}" must be text, a number, true/false or a list.` };
      record.set(key, cell);
    }
    records.push(record);
  }
  return records;
}

// ──────────────────────────────────────────────────────────── XML

interface XmlNode {
  name: string;
  attrs: Map<string, string>;
  children: XmlNode[];
  text: string;
}

const NAME = /^[A-Za-z_][\w.-]*(?::[\w.-]+)?/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(raw: string, fail: (m: string) => never): string {
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, body: string) => {
    if (!match.endsWith(';')) fail(`"${match}" needs a closing ";". Write & as &amp;.`);
    if (body[0] === '#') {
      const code =
        body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff)
        fail(`"${match}" is not a character.`);
      return String.fromCodePoint(code);
    }
    const value = ENTITIES[body];
    if (value === undefined) fail(`"&${body};" is not supported. Write & as &amp;.`);
    return value!;
  });
}

/** Elements, attributes, text, CDATA, comments and the <?xml?> line. Nothing else. */
export function parseXml(source: string): XmlNode | { error: string } {
  const text = source.replace(BOM, '');
  let i = 0;
  const line = () => text.slice(0, i).split('\n').length;
  const fail = (message: string): never => {
    throw new XmlError(`XML line ${line()}: ${message}`);
  };

  const skipMisc = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i]!)) i += 1;
      if (text.startsWith('<?', i)) {
        const end = text.indexOf('?>', i);
        if (end < 0) fail('"<?" is never closed.');
        i = end + 2;
      } else if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i);
        if (end < 0) fail('A comment is never closed.');
        i = end + 3;
      } else if (text.startsWith('<!', i)) {
        fail('DOCTYPE and entity declarations are not accepted.');
      } else return;
    }
  };

  const element = (depth: number): XmlNode => {
    if (depth > 20) fail('The XML is nested too deeply.');
    i += 1; // <
    const name = NAME.exec(text.slice(i))?.[0];
    if (!name) fail('A tag has no name.');
    i += name!.length;
    const node: XmlNode = { name: name!, attrs: new Map(), children: [], text: '' };
    for (;;) {
      while (/\s/.test(text[i] ?? '')) i += 1;
      if (text.startsWith('/>', i)) {
        i += 2;
        return node;
      }
      if (text[i] === '>') {
        i += 1;
        break;
      }
      const attr = NAME.exec(text.slice(i))?.[0];
      if (!attr) fail(`<${name}> has a broken attribute.`);
      i += attr!.length;
      while (/\s/.test(text[i] ?? '')) i += 1;
      if (text[i] !== '=') fail(`Attribute "${attr}" needs a value.`);
      i += 1;
      while (/\s/.test(text[i] ?? '')) i += 1;
      const quote = text[i];
      if (quote !== '"' && quote !== "'") fail(`Attribute "${attr}" must be in quotes.`);
      const end = text.indexOf(quote!, i + 1);
      if (end < 0) fail(`Attribute "${attr}" is never closed.`);
      const raw = text.slice(i + 1, end);
      if (raw.includes('<')) fail(`Attribute "${attr}" contains "<".`);
      node.attrs.set(attr!, decodeEntities(raw, fail));
      i = end + 1;
    }
    for (;;) {
      if (i >= text.length) fail(`<${name}> is never closed.`);
      if (text.startsWith('</', i)) {
        i += 2;
        const close = NAME.exec(text.slice(i))?.[0];
        if (close !== name) fail(`<${name}> is closed by </${close ?? ''}>.`);
        i += close!.length;
        while (/\s/.test(text[i] ?? '')) i += 1;
        if (text[i] !== '>') fail(`</${name}> is broken.`);
        i += 1;
        return node;
      }
      if (text.startsWith('<![CDATA[', i)) {
        const end = text.indexOf(']]>', i);
        if (end < 0) fail('A CDATA section is never closed.');
        node.text += text.slice(i + 9, end);
        i = end + 3;
      } else if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i);
        if (end < 0) fail('A comment is never closed.');
        i = end + 3;
      } else if (text.startsWith('<!', i) || text.startsWith('<?', i)) {
        fail('Declarations are not accepted inside elements.');
      } else if (text[i] === '<') {
        node.children.push(element(depth + 1));
      } else {
        const next = text.indexOf('<', i);
        const end = next < 0 ? text.length : next;
        node.text += decodeEntities(text.slice(i, end), fail);
        i = end;
      }
    }
  };

  try {
    skipMisc();
    if (text[i] !== '<') fail('The file does not start with an XML tag.');
    const root = element(0);
    skipMisc();
    if (i < text.length) fail('There is content after the root element ends.');
    return root;
  } catch (e) {
    if (e instanceof XmlError) return { error: e.message };
    throw e;
  }
}

class XmlError extends Error {}

function xmlToRecords(text: string): Record_[] | { error: string } {
  const root = parseXml(text);
  if ('error' in root) return root;
  // <catalogue><items><item/>…</items></catalogue> or <catalogue><item/>…</catalogue>.
  let container = root;
  if (
    container.children.length === 1 &&
    ITEM_KEYS.includes(container.children[0]!.name.toLowerCase())
  )
    container = container.children[0]!;
  const records: Record_[] = [];
  for (const [index, item] of container.children.entries()) {
    const record: Record_ = new Map(item.attrs);
    const lists = new Map<string, string[]>();
    for (const field of item.children) {
      if (field.children.length && field.children.every((c) => !c.children.length)) {
        // <allergens><value>nuts</value><value>milk</value></allergens>
        lists.set(field.name, [
          ...(lists.get(field.name) ?? []),
          ...field.children.map((c) => c.text.trim()),
        ]);
        continue;
      }
      if (field.children.length)
        return {
          error: `Item ${index + 1} (row ${index + 2}): <${field.name}> is nested too deeply. Use one tag per field.`,
        };
      lists.set(field.name, [...(lists.get(field.name) ?? []), field.text.trim()]);
    }
    for (const [key, values] of lists) record.set(key, values.join(LIST_SEPARATOR));
    if (!item.children.length && !item.attrs.size && item.text.trim())
      return {
        error: `<${item.name}> holds plain text. Each item needs field tags such as <name> and <price_kes>.`,
      };
    records.push(record);
  }
  if (!records.length) return { error: 'The XML has no items.' };
  return records;
}

/**
 * The CSV text an importer checks. CSV comes back as it was; JSON and XML
 * are converted, or an error says what is wrong with the file.
 */
export function toImportCsv(
  text: string,
  format: CatalogueFormat,
): { csv: string } | { error: string } {
  if (format === 'csv') return { csv: text };
  const clean = text.replace(BOM, '');
  if (!clean.trim()) return { error: 'The file is empty.' };
  const records = format === 'json' ? jsonToRecords(clean) : xmlToRecords(clean);
  if ('error' in records) return records;
  if (!records.length) return { error: 'The file has no items.' };
  return { csv: recordsToCsv(records) };
}

// ──────────────────────────────────────────────── template & export

const LIST_COLUMNS = new Set(['allergens', 'dietary_labels']);

function csvToObjects(csv: string): { columns: string[]; items: Record<string, string>[] } {
  const { rows } = parseCsv(csv);
  const [header = [], ...body] = rows;
  const columns = header.map((h) => h.trim());
  return {
    columns,
    items: body.map((cells) =>
      Object.fromEntries(
        columns.map((c, n) => [c, (cells[n] ?? '').replace(/^'(?=[=+\-@\t\r])/, '')]),
      ),
    ),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A template or export, already built as CSV, in the chosen format. JSON keeps
 * every value as text except yes/no columns and lists; the importer reads both.
 */
export function fromCsvText(csv: string, format: CatalogueFormat, root = 'catalogue'): string {
  if (format === 'csv') return csv;
  const { columns, items } = csvToObjects(csv);
  const isList = (c: string) => LIST_COLUMNS.has(c);
  if (format === 'json') {
    const out = items.map((item) =>
      Object.fromEntries(
        columns.map((c) => {
          const v = item[c] ?? '';
          if (isList(c))
            return [
              c,
              v
                .split(/[;|]/)
                .map((s) => s.trim())
                .filter(Boolean),
            ];
          return [c, v];
        }),
      ),
    );
    return JSON.stringify({ items: out }, null, 2) + '\n';
  }
  const tag = (c: string) => (NAME.test(c) && NAME.exec(c)![0] === c ? c : 'field');
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${root}>`];
  for (const item of items) {
    lines.push('  <item>');
    for (const c of columns) {
      const v = item[c] ?? '';
      if (isList(c) && v.trim()) {
        const values = v
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        lines.push(
          `    <${tag(c)}>${values.map((x) => `<value>${escapeXml(x)}</value>`).join('')}</${tag(c)}>`,
        );
      } else lines.push(`    <${tag(c)}>${escapeXml(v)}</${tag(c)}>`);
    }
    lines.push('  </item>');
  }
  lines.push(`</${root}>`, '');
  return lines.join('\n');
}

/** The catalogue import plan for a file in any format: one set of checks for all three. */
export function planCatalogueFile(
  text: string,
  format: CatalogueFormat,
  existing: readonly { id: string; name: string }[],
): ImportPlan {
  const converted = toImportCsv(text, format);
  if ('error' in converted)
    return { rows: [], errors: [{ row: 1, message: converted.error }], creates: 0, updates: 0 };
  return planCatalogueImport(converted.csv, existing);
}
