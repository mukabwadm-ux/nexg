/**
 * Statement CSV: M-PESA organisation statements and bank statements, read
 * into the lines Finance → Reconciliations matches against NexG's records.
 *
 * Pure (no Supabase, no DOM), so the browser can preview a file and the
 * server can read the stored file again before importing it. The server
 * never trusts the browser's reading.
 *
 * M-PESA: the Org Portal export opens with a few lines about the
 * organisation and the period, then a header row starting "Receipt No.",
 * then one line per transaction, newest first. Columns are found by name in
 * any order; only a receipt, a time and an amount column are required.
 * Charges are lines of their own, often with the receipt of the transaction
 * they were charged on.
 *
 * Bank: every bank lays its CSV out differently, so the columns are a map
 * (date, description, reference, money in and money out or one signed
 * amount, balance), worked out from the header's names and adjustable on
 * screen.
 *
 * Times are Nairobi time (UTC+3, no daylight saving). Amounts are cents.
 * Phone numbers in the text are cut to their last three digits here, and
 * again by the database.
 */

export type StatementSource = 'mpesa_paybill' | 'mpesa_till' | 'mpesa_b2c' | 'bank';
export type StatementFormat = 'mpesa' | 'bank';
export type LineKind =
  | 'collection'
  | 'payout'
  | 'charge'
  | 'transfer'
  | 'reversal'
  | 'failed'
  | 'other';

export const STATEMENT_BUCKET = 'finance-statements';
export const STATEMENT_MAX_BYTES = 20 * 1024 * 1024;
export const STATEMENT_MAX_LINES = 20_000;
export const STATEMENT_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];

export const STATEMENT_SOURCES: Record<
  StatementSource,
  { label: string; format: StatementFormat; account: string; hint: string }
> = {
  mpesa_paybill: {
    label: 'M-PESA Paybill',
    format: 'mpesa',
    account: 'M-PESA Paybill',
    hint: 'Customer payments, STK prompts, Paybill payments and rider deposits.',
  },
  mpesa_till: {
    label: 'M-PESA Till',
    format: 'mpesa',
    account: 'M-PESA Till',
    hint: 'Buy Goods payments into a till.',
  },
  mpesa_b2c: {
    label: 'M-PESA B2C (Payouts)',
    format: 'mpesa',
    account: 'M-PESA B2C',
    hint: 'Refunds, money sent back and payouts sent by M-PESA.',
  },
  bank: {
    label: 'Bank Account',
    format: 'bank',
    account: 'Bank Account',
    hint: 'Bank payments, bank payouts and office expenses paid by transfer.',
  },
};

/** One statement line, in the shape rpc_fin_statement_import takes. */
export interface StatementLine {
  /** The line's row in the file, counted the way a spreadsheet counts. */
  line_no: number;
  receipt: string | null;
  completed_at: string;
  initiated_at: string | null;
  details: string | null;
  other_party: string | null;
  phone_tail: string | null;
  account_ref: string | null;
  status_text: string | null;
  reason_type: string | null;
  direction: 'in' | 'out';
  amount_cents: number;
  balance_cents: number | null;
  linked_receipt: string | null;
  kind: LineKind;
  raw: string[];
}

/** Bank columns by their position in the header row; null when not in the file. */
export interface BankColumnMap {
  date: number | null;
  description: number | null;
  reference: number | null;
  moneyIn: number | null;
  moneyOut: number | null;
  /** One signed amount instead of money in and money out. */
  amount: number | null;
  balance: number | null;
}

export const BANK_FIELDS: { key: keyof BankColumnMap; label: string; required?: boolean }[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description' },
  { key: 'reference', label: 'Reference' },
  { key: 'moneyIn', label: 'Money In' },
  { key: 'moneyOut', label: 'Money Out' },
  { key: 'amount', label: 'Amount (±)' },
  { key: 'balance', label: 'Balance' },
];

export interface RowError {
  /** The row in the file the problem is on. */
  row: number;
  message: string;
}

export interface StatementReading {
  format: StatementFormat | null;
  /** The header row as printed, and where it is. */
  header: string[];
  headerRow: number | null;
  /** Bank only: the columns the lines were read with. */
  columns: BankColumnMap | null;
  lines: StatementLine[];
  /** Any error stops the import. */
  errors: RowError[];
}

// ─────────────────────────────────────────────────────────────── CSV text

/**
 * RFC 4180 parsing: quoted fields, doubled quotes, separators and line
 * breaks inside quotes, CRLF or LF endings, and a leading UTF-8 BOM (Excel
 * adds one). Blank lines are dropped; rowNumbers keeps each row's place in
 * the file, blank lines counted, the way a spreadsheet numbers rows.
 * (Copied from apps/web/lib/catalogue-csv.ts, which the console cannot
 * import, with the row numbers and the separator added.)
 */
export function parseCsv(
  text: string,
  separator: string = ',',
): { rows: string[][]; rowNumbers: number[]; error?: string } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let record = 0;
  let i = 0;

  const endRow = () => {
    row.push(field);
    field = '';
    record += 1;
    if (!(row.length === 1 && row[0] === '')) {
      rows.push(row);
      rowNumbers.push(record);
    }
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
    } else if (c === separator) {
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
  if (quoted)
    return {
      rows,
      rowNumbers,
      error: 'A quoted field is never closed. Check for a stray " mark.',
    };
  if (field !== '' || row.length) endRow();
  return { rows, rowNumbers };
}

/** Commas, semicolons or tabs: whichever the first lines use most. */
export function detectSeparator(text: string): ',' | ';' | '\t' {
  const head = text.slice(0, 20_000).split(/\r?\n/).slice(0, 40);
  const count = (sep: string) => head.reduce((n, line) => n + line.split(sep).length - 1, 0);
  const comma = count(',');
  const semicolon = count(';');
  const tab = count('\t');
  if (tab > comma && tab >= semicolon) return '\t';
  if (semicolon > comma) return ';';
  return ',';
}

/**
 * The file's bytes as text: UTF-8 (with or without a BOM), UTF-16 with a
 * BOM, or Windows-1252, which older Excel and some banks still write.
 */
export function decodeStatement(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ───────────────────────────────────────────────────────── cells and values

/** A header cell for matching: lower case, no units or punctuation. */
function norm(cell: string | undefined): string {
  return (cell ?? '')
    .toLowerCase()
    .replace(/\((kes|ksh|kshs)\)/g, ' ')
    .replace(/\b(kes|ksh|kshs)\b/g, ' ')
    .replace(/[.:#*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellAt(row: string[], index: number | null | undefined): string {
  if (index == null || index < 0) return '';
  return (row[index] ?? '').trim();
}

/**
 * KES as printed ("1,234.50", "-500.00", "(500.00)", "KES 1,200", "250.00 DR")
 * to cents. Null for an empty cell, NaN when it is not an amount.
 */
export function parseMoney(text: string | undefined): number | null {
  let t = (text ?? '').trim();
  if (!t || t === '-' || t === '—') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1).trim();
  }
  const side = t.match(/\s*(CR|DR)\.?$/i);
  if (side) {
    if (side[1]!.toUpperCase() === 'DR') sign = -sign;
    t = t.slice(0, side.index).trim();
  }
  const signed = () => {
    if (t.startsWith('-')) {
      sign = -sign;
      t = t.slice(1).trim();
    } else if (t.endsWith('-')) {
      sign = -sign;
      t = t.slice(0, -1).trim();
    } else if (t.startsWith('+')) {
      t = t.slice(1).trim();
    }
  };
  signed();
  t = t.replace(/^(kes|kshs|ksh)\.?\s*/i, '');
  signed();
  t = t.replace(/[,\s']/g, '');
  const m = t.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return NaN;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return sign * cents;
}

/** An M-PESA receipt or bank reference: upper case, no spaces. */
export function normaliseReceipt(text: string | undefined | null): string | null {
  const t = (text ?? '').toUpperCase().replace(/\s/g, '');
  return t || null;
}

/** An account typed into M-PESA, compacted the way fn_compact_reference does. */
export function compactReference(text: string | undefined | null): string | null {
  const t = (text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t || null;
}

const PHONE_RUN = /(?<![A-Za-z0-9])[0-9*]{6,}([0-9]{3})(?![0-9])/g;
const PHONE = /(?<![A-Za-z0-9])\+?[0-9][0-9*xX•·]{5,}([0-9]{3})(?![0-9])/;

/** Phone numbers down to their last three digits: "254712345678" → "···678". */
export function maskPhones(text: string): string {
  return text.replace(PHONE_RUN, '···$1');
}

/** The last three digits of the first phone number in the texts. */
export function phoneTail(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t?.match(PHONE);
    if (m) return m[1]!;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────── dates

type DateOrder = 'dmy' | 'mdy';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const TIME_AT_END = /(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp]\.?[Mm]\.?)?\s*$/;
const NUMERIC_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/;

/**
 * Day before month unless the file shows otherwise: Kenyan statements print
 * 18/11/2026, Excel set to US English rewrites it 11/18/2026.
 */
function dateOrder(samples: string[]): DateOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const s of samples) {
    const m = s.trim().replace(TIME_AT_END, '').trim().match(NUMERIC_DATE);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  return monthFirst && !dayFirst ? 'mdy' : 'dmy';
}

/**
 * A statement's date and time (Nairobi) to an ISO instant; null when it is
 * not one. "18-11-2026 14:05:33", "2026-11-18 14:05", "18/11/2026",
 * "11/18/2026 2:05:33 PM", "18 Nov 2026 14:05", "Nov 18, 2026 2:05 PM".
 */
export function parseStatementDate(text: string, order: DateOrder = 'dmy'): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  let h = 0;
  let min = 0;
  let s = 0;
  let datePart = t;
  const time = t.match(TIME_AT_END);
  if (time) {
    h = Number(time[1]);
    min = Number(time[2]);
    s = Number(time[3] ?? 0);
    const half = time[4]?.toLowerCase().replace(/\./g, '');
    if (half) {
      if (h < 1 || h > 12) return null;
      if (half === 'am' && h === 12) h = 0;
      if (half === 'pm' && h !== 12) h += 12;
    }
    datePart = t.slice(0, time.index).trim();
  }

  let y: number;
  let mo: number;
  let d: number;
  let m: RegExpMatchArray | null;
  if ((m = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = datePart.match(NUMERIC_DATE))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    [d, mo] = order === 'mdy' ? [b, a] : [a, b];
    y = Number(m[3]);
  } else if ((m = datePart.match(/^(\d{1,2})[\s-/]+([A-Za-z]{3,9})\.?[\s-/,]+(\d{4}|\d{2})$/))) {
    d = Number(m[1]);
    mo = MONTHS[m[2]!.toLowerCase().slice(0, 3)] ?? 0;
    y = Number(m[3]);
  } else if ((m = datePart.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    mo = MONTHS[m[1]!.toLowerCase().slice(0, 3)] ?? 0;
    d = Number(m[2]);
    y = Number(m[3]);
  } else {
    return null;
  }
  if (y < 100) y += 2000;

  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(Date.UTC(y, mo - 1, d, h - 3, min, s)).toISOString();
}

/** The Nairobi calendar day of an instant. */
export function nairobiDay(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────────── M-PESA

type MpesaField =
  | 'receipt'
  | 'completed'
  | 'initiated'
  | 'details'
  | 'status'
  | 'paidIn'
  | 'withdrawn'
  | 'amount'
  | 'balance'
  | 'reasonType'
  | 'otherParty'
  | 'linked'
  | 'account';

const MPESA_HEADERS: Record<MpesaField, RegExp> = {
  receipt: /^receipt( no| number)?$/,
  completed: /^completion (time|date)$|^completed( at| on)?$/,
  initiated: /^initiation (time|date)$|^initiated( at| on)?$/,
  details: /^details$|^description$/,
  status: /^(transaction )?status$/,
  paidIn: /^paid in$|^money in$/,
  withdrawn: /^withdrawn$|^withdrawal$|^paid out$|^money out$/,
  amount: /^amount$|^transaction amount$/,
  balance: /^balance$/,
  reasonType: /^reason type$|^transaction type$/,
  otherParty: /^other party( info)?$/,
  linked: /^linked transaction( id)?$/,
  account: /^a\/c( no)?$|^account( no| number)?$/,
};

function isMpesaHeader(row: string[]): boolean {
  const cells = row.map(norm);
  return (
    cells.some((c) => MPESA_HEADERS.receipt.test(c)) &&
    cells.some((c) => MPESA_HEADERS.completed.test(c) || MPESA_HEADERS.initiated.test(c))
  );
}

/** What an M-PESA line is, from its status, reason type and details. */
function mpesaKind(
  status: string,
  reason: string,
  details: string,
  direction: 'in' | 'out',
): LineKind {
  if (status && !/^complete/i.test(status)) return 'failed';
  const what = `${reason} ${details}`.toLowerCase();
  if (/\bcharges?\b/.test((reason || details).toLowerCase())) return 'charge';
  if (/revers/.test(what)) return 'reversal';
  if (
    /funds? transfer|transfer (from|to|of)|working account|utility account|settlement|move funds|\bmmf\b|to bank|from bank|withdraw(al)? to/.test(
      what,
    )
  )
    return 'transfer';
  if (direction === 'in')
    return /pay ?bill|buy goods|merchant payment|customer|deposit|c2b|till|online/.test(what)
      ? 'collection'
      : 'other';
  return /business payment|b2c|b2b|salary|promotion|payment to|pay ?bill|buy goods/.test(what)
    ? 'payout'
    : 'other';
}

const ACCOUNT_IN_DETAILS =
  /\bAcc(?:ount)?\b\.?(?:\s*No\b\.?)?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]*)/i;
const PARTY_IN_DETAILS = /\b(?:from|to)\s+(.+?)(?:\s+Acc(?:ount)?\.?(?:\s.*)?)?$/i;

function readMpesa(rows: string[][], numbers: number[]): StatementReading {
  const at = rows.slice(0, 60).findIndex(isMpesaHeader);
  if (at < 0)
    return {
      format: 'mpesa',
      header: [],
      headerRow: null,
      columns: null,
      lines: [],
      errors: [
        {
          row: 1,
          message:
            'No “Receipt No.” header row with a completion time: this is not an M-PESA statement export.',
        },
      ],
    };
  const header = rows[at]!;
  const headerRow = numbers[at]!;
  const cells = header.map(norm);
  const col = (f: MpesaField) => cells.findIndex((c) => MPESA_HEADERS[f].test(c));
  const c = {
    receipt: col('receipt'),
    completed: col('completed'),
    initiated: col('initiated'),
    details: col('details'),
    status: col('status'),
    paidIn: col('paidIn'),
    withdrawn: col('withdrawn'),
    amount: col('amount'),
    balance: col('balance'),
    reasonType: col('reasonType'),
    otherParty: col('otherParty'),
    linked: col('linked'),
    account: col('account'),
  };
  const errors: RowError[] = [];
  if (c.paidIn < 0 && c.withdrawn < 0 && c.amount < 0)
    errors.push({ row: headerRow, message: 'There is no “Paid In” or “Withdrawn” column.' });
  if (errors.length)
    return { format: 'mpesa', header, headerRow, columns: null, lines: [], errors };

  const body = rows.slice(at + 1);
  const bodyNumbers = numbers.slice(at + 1);
  const timeOf = (row: string[]) => cellAt(row, c.completed) || cellAt(row, c.initiated);
  const order = dateOrder(body.map(timeOf));
  const lines: StatementLine[] = [];

  body.forEach((row, index) => {
    const rowNo = bodyNumbers[index]!;
    if (row.every((cell) => !cell.trim())) return;
    const receiptText = cellAt(row, c.receipt);
    const timeText = timeOf(row);
    /* A total or a note under the lines: no receipt and no time. */
    if (!receiptText && !timeText) return;
    if (!timeText) {
      errors.push({ row: rowNo, message: `Receipt ${receiptText} has no completion time.` });
      return;
    }
    const completed = parseStatementDate(timeText, order);
    if (!completed) {
      errors.push({ row: rowNo, message: `“${timeText}” is not a date and time.` });
      return;
    }
    const initiatedText = cellAt(row, c.initiated);
    const initiated = initiatedText ? parseStatementDate(initiatedText, order) : null;

    let paidIn: number | null;
    let withdrawn: number | null;
    if (c.paidIn >= 0 || c.withdrawn >= 0) {
      paidIn = parseMoney(cellAt(row, c.paidIn));
      withdrawn = parseMoney(cellAt(row, c.withdrawn));
    } else {
      const amount = parseMoney(cellAt(row, c.amount));
      paidIn = amount != null && amount > 0 ? amount : null;
      withdrawn = amount != null && amount < 0 ? amount : null;
    }
    if (Number.isNaN(paidIn) || Number.isNaN(withdrawn)) {
      const bad = Number.isNaN(paidIn) ? cellAt(row, c.paidIn) : cellAt(row, c.withdrawn);
      errors.push({ row: rowNo, message: `“${bad}” is not an amount.` });
      return;
    }
    const inCents = Math.abs(paidIn ?? 0);
    const outCents = Math.abs(withdrawn ?? 0);
    if (inCents > 0 && outCents > 0) {
      errors.push({ row: rowNo, message: 'The line has money both paid in and withdrawn.' });
      return;
    }
    const direction: 'in' | 'out' = outCents > 0 ? 'out' : 'in';
    const balance = parseMoney(cellAt(row, c.balance));

    const status = cellAt(row, c.status);
    const reason = cellAt(row, c.reasonType);
    const details = cellAt(row, c.details);
    const party = cellAt(row, c.otherParty) || details.match(PARTY_IN_DETAILS)?.[1]?.trim() || '';
    const account = cellAt(row, c.account) || details.match(ACCOUNT_IN_DETAILS)?.[1] || '';

    lines.push({
      line_no: rowNo,
      receipt: normaliseReceipt(receiptText),
      completed_at: completed,
      initiated_at: initiated,
      details: details ? maskPhones(details).slice(0, 500) : null,
      other_party: party ? maskPhones(party).slice(0, 200) : null,
      phone_tail: phoneTail(party, details),
      account_ref: compactReference(account),
      status_text: status ? status.slice(0, 40) : null,
      reason_type: reason ? reason.slice(0, 120) : null,
      direction,
      amount_cents: direction === 'out' ? outCents : inCents,
      balance_cents: balance == null || Number.isNaN(balance) ? null : balance,
      linked_receipt: normaliseReceipt(cellAt(row, c.linked)),
      kind: mpesaKind(status, reason, details, direction),
      raw: row.map((cell) => maskPhones(cell).slice(0, 500)),
    });
  });

  return { format: 'mpesa', header, headerRow, columns: null, lines, errors };
}

// ──────────────────────────────────────────────────────────────── banks

const BANK_HEADERS: [keyof BankColumnMap, RegExp][] = [
  ['date', /^((transaction|trans|txn|tran|posting|post|booking) date|date|date posted|tran date)$/],
  ['date', /^value date$/],
  [
    'description',
    /^(narration|narrative|description|details|particulars|remarks|memo|transaction (details|description|narration|particulars)|payee|beneficiary)$/,
  ],
  [
    'reference',
    /^(reference|ref|ref no|reference no|reference number|transaction (ref|reference|id|ref no)|trans id|txn id|tran id|cheque( no| number)?|chq( no)?|customer reference|bank reference|receipt( no)?)$/,
  ],
  [
    'moneyIn',
    /^(credit|credits|credit amount|money in|paid in|deposit|deposits|cr|amount in|receipts)$/,
  ],
  [
    'moneyOut',
    /^(debit|debits|debit amount|money out|paid out|withdrawal|withdrawals|dr|amount out|payments)$/,
  ],
  ['amount', /^(amount|transaction amount|amt)$/],
  [
    'balance',
    /^(balance|running balance|closing balance|ledger balance|available balance|book balance)$/,
  ],
];

/** The bank columns a header row names, by their position. */
export function detectBankColumns(header: string[]): BankColumnMap {
  const cells = header.map(norm);
  const map: BankColumnMap = {
    date: null,
    description: null,
    reference: null,
    moneyIn: null,
    moneyOut: null,
    amount: null,
    balance: null,
  };
  const used = new Set<number>();
  for (const [key, pattern] of BANK_HEADERS) {
    if (map[key] != null) continue;
    const i = cells.findIndex((c, n) => !used.has(n) && pattern.test(c));
    if (i >= 0) {
      map[key] = i;
      used.add(i);
    }
  }
  return map;
}

function bankMapUsable(map: BankColumnMap): boolean {
  return map.date != null && (map.moneyIn != null || map.moneyOut != null || map.amount != null);
}

function findBankHeader(rows: string[][]): { index: number; map: BankColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const map = detectBankColumns(rows[i]!);
    if (bankMapUsable(map)) return { index: i, map };
  }
  return null;
}

function bankKind(description: string, direction: 'in' | 'out'): LineKind {
  const d = description.toLowerCase();
  if (
    direction === 'out' &&
    /\b(charges?|fees?|commission|excise duty|ledger fee|levy|stamp duty)\b/.test(d)
  )
    return 'charge';
  if (/revers/.test(d)) return 'reversal';
  return direction === 'in' ? 'collection' : 'payout';
}

const BALANCE_ROW = /balance|b\/f|c\/f|brought forward|carried forward|opening|closing/i;
const ORDER_REFERENCE = /\bNX-?\d{6}-?\d{4}\b/i;

function readBank(
  rows: string[][],
  numbers: number[],
  given: BankColumnMap | null,
): StatementReading {
  const found = findBankHeader(rows);
  if (!found)
    return {
      format: 'bank',
      header: [],
      headerRow: null,
      columns: null,
      lines: [],
      errors: [
        {
          row: 1,
          message:
            'No header row with a date and an amount column was found. Check the file is the bank’s CSV export.',
        },
      ],
    };
  const header = rows[found.index]!;
  const headerRow = numbers[found.index]!;
  const map = given ?? found.map;
  const errors: RowError[] = [];
  const inRange = (i: number | null) => i == null || (i >= 0 && i < header.length);
  if (!Object.values(map).every(inRange))
    errors.push({ row: headerRow, message: 'A chosen column is not in the file.' });
  if (map.date == null)
    errors.push({ row: headerRow, message: 'Choose the column with the date.' });
  if (map.moneyIn == null && map.moneyOut == null && map.amount == null)
    errors.push({ row: headerRow, message: 'Choose the columns with the amounts.' });
  if (errors.length) return { format: 'bank', header, headerRow, columns: map, lines: [], errors };

  const body = rows.slice(found.index + 1);
  const bodyNumbers = numbers.slice(found.index + 1);
  const order = dateOrder(body.map((row) => cellAt(row, map.date)));
  const lines: StatementLine[] = [];

  body.forEach((row, index) => {
    const rowNo = bodyNumbers[index]!;
    if (row.every((cell) => !cell.trim())) return;
    const dateText = cellAt(row, map.date);
    const description = cellAt(row, map.description);
    const texts =
      map.amount != null
        ? [cellAt(row, map.amount)]
        : [cellAt(row, map.moneyIn), cellAt(row, map.moneyOut)];
    const noAmount = texts.every((t) => !t || parseMoney(t) === 0);
    if (!dateText) {
      if (noAmount) return;
      errors.push({ row: rowNo, message: 'The line has no date.' });
      return;
    }
    const completed = parseStatementDate(dateText, order);
    if (!completed) {
      if (noAmount) return;
      errors.push({ row: rowNo, message: `“${dateText}” is not a date.` });
      return;
    }

    let direction: 'in' | 'out';
    let cents: number;
    if (map.amount != null) {
      const v = parseMoney(cellAt(row, map.amount));
      if (Number.isNaN(v)) {
        errors.push({ row: rowNo, message: `“${cellAt(row, map.amount)}” is not an amount.` });
        return;
      }
      direction = (v ?? 0) < 0 ? 'out' : 'in';
      cents = Math.abs(v ?? 0);
    } else {
      const inV = parseMoney(cellAt(row, map.moneyIn));
      const outV = parseMoney(cellAt(row, map.moneyOut));
      if (Number.isNaN(inV) || Number.isNaN(outV)) {
        const bad = Number.isNaN(inV) ? cellAt(row, map.moneyIn) : cellAt(row, map.moneyOut);
        errors.push({ row: rowNo, message: `“${bad}” is not an amount.` });
        return;
      }
      const inCents = Math.abs(inV ?? 0);
      const outCents = Math.abs(outV ?? 0);
      if (inCents > 0 && outCents > 0) {
        errors.push({ row: rowNo, message: 'The line has money both in and out.' });
        return;
      }
      direction = outCents > 0 ? 'out' : 'in';
      cents = direction === 'out' ? outCents : inCents;
    }
    if (cents === 0) {
      /* An opening or closing balance printed as a line. */
      if (BALANCE_ROW.test(description) || noAmount) return;
    }
    const balance = parseMoney(cellAt(row, map.balance));

    lines.push({
      line_no: rowNo,
      receipt: normaliseReceipt(cellAt(row, map.reference)),
      completed_at: completed,
      initiated_at: null,
      details: description ? maskPhones(description).slice(0, 500) : null,
      other_party: null,
      phone_tail: null,
      account_ref: compactReference(description.match(ORDER_REFERENCE)?.[0]),
      status_text: null,
      reason_type: null,
      direction,
      amount_cents: cents,
      balance_cents: balance == null || Number.isNaN(balance) ? null : balance,
      linked_receipt: null,
      kind: bankKind(description, direction),
      raw: row.map((cell) => maskPhones(cell).slice(0, 500)),
    });
  });

  return { format: 'bank', header, headerRow, columns: map, lines, errors };
}

// ─────────────────────────────────────────────────────────────── reading

/** Which kind of statement the rows look like, if either. */
export function detectFormat(rows: string[][]): StatementFormat | null {
  if (rows.slice(0, 60).some(isMpesaHeader)) return 'mpesa';
  return findBankHeader(rows) ? 'bank' : null;
}

/** The same, straight from the file's text. */
export function detectStatementFormat(text: string): StatementFormat | null {
  return detectFormat(parseCsv(text, detectSeparator(text)).rows);
}

/**
 * Reads a statement file. The format comes from the source chosen (or is
 * worked out); a bank file uses the columns given, or those its header
 * names.
 */
export function readStatement(
  text: string,
  options: { format?: StatementFormat | null; columns?: BankColumnMap | null } = {},
): StatementReading {
  const empty = (message: string, row = 1): StatementReading => ({
    format: options.format ?? null,
    header: [],
    headerRow: null,
    columns: null,
    lines: [],
    errors: [{ row, message }],
  });
  const { rows, rowNumbers, error } = parseCsv(text, detectSeparator(text));
  if (error) return empty(error, (rowNumbers[rowNumbers.length - 1] ?? 0) + 1);
  if (rows.length === 0) return empty('The file is empty.');
  const format = options.format ?? detectFormat(rows);
  if (!format)
    return empty(
      'This is not a statement the console can read: no M-PESA “Receipt No.” header and no bank header with a date and an amount.',
    );
  const reading =
    format === 'mpesa'
      ? readMpesa(rows, rowNumbers)
      : readBank(rows, rowNumbers, options.columns ?? null);
  if (reading.lines.length > STATEMENT_MAX_LINES)
    reading.errors.unshift({
      row: reading.headerRow ?? 1,
      message: `Up to ${STATEMENT_MAX_LINES.toLocaleString('en-KE')} lines per import: split the statement by date.`,
    });
  if (reading.errors.length === 0 && reading.lines.length === 0)
    reading.errors.push({ row: reading.headerRow ?? 1, message: 'The statement has no lines.' });
  return reading;
}

export interface StatementSummary {
  lines: number;
  paidInCents: number;
  withdrawnCents: number;
  openingCents: number | null;
  closingCents: number | null;
  /** The first and last Nairobi days of the lines. */
  firstDay: string | null;
  lastDay: string | null;
  /** Lines whose day falls outside the period chosen. */
  outsidePeriod: number;
  kinds: Partial<Record<LineKind, number>>;
}

/**
 * What the preview shows: totals (a failed line moves no money), the
 * balances before the first line and after the last, and the dates covered.
 * The database works the same figures out again on import.
 */
export function summariseStatement(
  lines: StatementLine[],
  period?: { from: string; to: string } | null,
): StatementSummary {
  const moved = lines.filter((l) => l.kind !== 'failed');
  const sum = (dir: 'in' | 'out') =>
    moved.filter((l) => l.direction === dir).reduce((s, l) => s + l.amount_cents, 0);
  /* M-PESA prints the newest line first, most banks the oldest: the file's
     order breaks ties between lines in the same second. */
  const first = lines[0];
  const last = lines[lines.length - 1];
  const newestFirst = Boolean(first && last && first.completed_at > last.completed_at);
  const chronological = moved
    .filter((l) => l.balance_cents != null)
    .sort((a, b) =>
      a.completed_at === b.completed_at
        ? newestFirst
          ? b.line_no - a.line_no
          : a.line_no - b.line_no
        : a.completed_at < b.completed_at
          ? -1
          : 1,
    );
  const oldest = chronological[0];
  const newest = chronological[chronological.length - 1];
  const days = lines.map((l) => nairobiDay(l.completed_at)).sort();
  const kinds: Partial<Record<LineKind, number>> = {};
  for (const l of lines) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
  return {
    lines: lines.length,
    paidInCents: sum('in'),
    withdrawnCents: sum('out'),
    openingCents: oldest
      ? oldest.balance_cents! -
        (oldest.direction === 'in' ? oldest.amount_cents : -oldest.amount_cents)
      : null,
    closingCents: newest ? newest.balance_cents : null,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    outsidePeriod: period ? days.filter((d) => d < period.from || d > period.to).length : 0,
    kinds,
  };
}

/** Row errors as one sentence for a toast: the first few, with their rows. */
export function describeRowErrors(errors: RowError[], max = 3): string {
  const shown = errors.slice(0, max).map((e) => `Row ${e.row}: ${e.message}`);
  const more = errors.length - shown.length;
  return `${shown.join(' ')}${more > 0 ? ` And ${more} more.` : ''}`;
}
