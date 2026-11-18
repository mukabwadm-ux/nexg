import { createHash } from 'node:crypto';

import {
  PDFDocument,
  StandardFonts,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

import { formatPhone } from './document';
import { NEXG_LOGO_PNG_BASE64 } from './logo.generated';
import {
  COMPANY_NAME,
  COMPANY_NUMBER,
  GOLD,
  INK,
  MARGIN_X,
  MUTED,
  PAGE_H,
  PAGE_W,
  RULE,
  SHADE,
  drawLetterhead,
  drawString,
  printable,
  widthOf,
  wrapText,
  type Fonts,
  type Letterhead,
} from './pdf';

/**
 * A client tax invoice on the NexG letterhead, as a PDF: pdf-lib and the
 * standard Helvetica fonts only, like the agreements, so it renders in a
 * serverless function and the same invoice always gives the same bytes.
 *
 * A4: the letterhead, "TAX INVOICE" with its number and dates, who it is
 * billed to, the lines (quantity, unit price excluding VAT, VAT treatment,
 * net, VAT and total), the totals and a VAT summary by rate, notes, how to
 * pay, the KRA (eTIMS) status, and a footer with page numbers. Long
 * invoices run onto further pages with the table header repeated.
 */

export type InvoiceVatRate = 'standard' | 'zero' | 'exempt';

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  /** Excluding VAT. */
  unitPriceCents: number;
  vatRate: InvoiceVatRate;
  /** The rate applied: 16 for standard, 0 for zero-rated and exempt. */
  vatPct: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export interface InvoicePdfInput {
  number: string;
  /** YYYY-MM-DD. */
  issueDate: string;
  /** YYYY-MM-DD. */
  dueDate: string;
  billTo: {
    legalName: string;
    tradingName?: string | null;
    kraPin?: string | null;
    address?: string | null;
    email?: string | null;
  };
  lines: InvoicePdfLine[];
  netCents: number;
  vatCents: number;
  grossCents: number;
  notes?: string | null;
  /** The tax invoice's KRA status; "pending" until it is recorded. */
  kraStatus?: string | null;
  kraReference?: string | null;
  /** NexG's KRA PIN, printed with the invoice details when given. */
  supplierPin?: string | null;
  /** Replaces the default "how to pay" text. */
  paymentInstructions?: string | null;
  /** Document dates; the issue date when left out, so the bytes repeat. */
  createdAt?: Date;
}

export interface RenderedInvoice {
  bytes: Uint8Array;
  sha256: string;
  pages: number;
}

const LEFT = MARGIN_X;
const RIGHT = PAGE_W - MARGIN_X;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 84;
const TOP_FIRST = PAGE_H - 140;
const TOP_NEXT = PAGE_H - 84;

const BODY = 8.5;
const HEAD = 7.5;
const LEAD = 11;
const PAD_X = 4;
const PAD_Y = 4;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/* ---------------------------------------------------------------- formats */

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1724815 → "17,248.15". Exact: cents are never divided as floats. */
export function formatAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${group(String(Math.trunc(abs / 100)))}.${String(abs % 100).padStart(2, '0')}`;
}

/** 2 → "2", 1.5 → "1.5", 1000 → "1,000". */
function formatQuantity(quantity: number): string {
  const [whole = '0', fraction = ''] = quantity.toFixed(3).split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return group(whole) + (trimmed ? `.${trimmed}` : '');
}

/** "2026-11-19" → "19 November 2026". */
function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

function formatPct(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function rateLabel(line: Pick<InvoicePdfLine, 'vatRate' | 'vatPct'>): string {
  if (line.vatRate === 'exempt') return 'Exempt';
  if (line.vatRate === 'zero') return '0%';
  return `${formatPct(line.vatPct)}%`;
}

/* ------------------------------------------------------------------ drawing */

function textRight(
  page: PDFPage,
  text: string,
  right: number,
  y: number,
  size: number,
  font: PDFFont,
  color: Color = INK,
) {
  const shown = printable(text, font);
  drawString(page, shown, { x: right - widthOf(font, shown, size), y, size, font, color });
}

/* A figure wider than its column is set smaller rather than overprinting. */
function fitSize(font: PDFFont, text: string, size: number, room: number): number {
  const width = widthOf(font, printable(text, font), size);
  return width <= room ? size : Math.max(5, (size * room) / width);
}

class Cursor {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(private readonly pdf: PDFDocument) {
    this.add();
  }

  add() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = this.pages.length === 1 ? TOP_FIRST : TOP_NEXT;
  }

  /** A new page when `height` does not fit; true when one was added. */
  ensure(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.add();
    return true;
  }
}

/* The letterhead without its contact lines, for when none is on file. */
function drawBareLetterhead(page: PDFPage, fonts: Fonts, logo: PDFImage) {
  const top = PAGE_H - 34;
  const height = 64;
  page.drawImage(logo, {
    x: LEFT,
    y: top - height,
    width: (logo.width / logo.height) * height,
    height,
  });
  textRight(page, COMPANY_NAME.toUpperCase(), RIGHT, top - 11, 11, fonts.bold);
  textRight(page, `Company No. ${COMPANY_NUMBER}`, RIGHT, top - 25.5, 8.5, fonts.regular, MUTED);
  page.drawLine({
    start: { x: LEFT, y: top - 74 },
    end: { x: RIGHT, y: top - 74 },
    thickness: 1.4,
    color: GOLD,
  });
}

function drawRunningHead(page: PDFPage, fonts: Fonts, number: string, logo: PDFImage) {
  const top = PAGE_H - 34;
  const height = 28;
  page.drawImage(logo, {
    x: LEFT,
    y: top - height,
    width: (logo.width / logo.height) * height,
    height,
  });
  textRight(page, `Tax Invoice ${number}`, RIGHT, top - 18, 8.5, fonts.regular, MUTED);
  page.drawLine({
    start: { x: LEFT, y: top - 34 },
    end: { x: RIGHT, y: top - 34 },
    thickness: 0.6,
    color: GOLD,
  });
}

function drawFooter(page: PDFPage, fonts: Fonts, number: string, n: number, total: number) {
  const size = 8;
  const y = 44;
  page.drawLine({
    start: { x: LEFT, y: y + 12 },
    end: { x: RIGHT, y: y + 12 },
    thickness: 0.5,
    color: RULE,
  });
  drawString(page, `${COMPANY_NAME} | Tax Invoice ${number}`, {
    x: LEFT,
    y,
    size,
    font: fonts.regular,
    color: MUTED,
  });
  textRight(page, `Page ${n} of ${total}`, RIGHT, y, size, fonts.regular, MUTED);
  drawString(page, 'Issued electronically by NexG. Valid without a signature.', {
    x: LEFT,
    y: y - 11,
    size: 7,
    font: fonts.regular,
    color: MUTED,
  });
}

/* ------------------------------------------------------------------- table */

const COLUMNS: { label: string; width: number; value: (line: InvoicePdfLine) => string }[] = [
  { label: 'Qty', width: 32, value: (l) => formatQuantity(l.quantity) },
  { label: 'Unit Price', width: 64, value: (l) => formatAmount(l.unitPriceCents) },
  { label: 'VAT Rate', width: 42, value: rateLabel },
  { label: 'Net', width: 66, value: (l) => formatAmount(l.netCents) },
  { label: 'VAT', width: 58, value: (l) => formatAmount(l.vatCents) },
  { label: 'Total', width: 68, value: (l) => formatAmount(l.grossCents) },
];
const DESCRIPTION_W = WIDTH - COLUMNS.reduce((sum, c) => sum + c.width, 0);

function drawTableHead(cur: Cursor, fonts: Fonts) {
  const height = 18;
  cur.page.drawRectangle({ x: LEFT, y: cur.y - height, width: WIDTH, height, color: SHADE });
  const y = cur.y - 12;
  drawString(cur.page, 'Description', { x: LEFT + PAD_X, y, size: HEAD, font: fonts.bold });
  let x = LEFT + DESCRIPTION_W;
  for (const column of COLUMNS) {
    x += column.width;
    textRight(cur.page, column.label, x - PAD_X, y, HEAD, fonts.bold);
  }
  cur.y -= height;
}

function drawTable(cur: Cursor, fonts: Fonts, lines: InvoicePdfLine[]) {
  cur.ensure(18 + 2 * LEAD + 2 * PAD_Y);
  drawTableHead(cur, fonts);
  for (const line of lines) {
    const description = wrapText(line.description, DESCRIPTION_W - 2 * PAD_X, fonts, BODY);
    const height = Math.max(1, description.length) * LEAD + 2 * PAD_Y;
    if (cur.ensure(height)) drawTableHead(cur, fonts);
    const first = cur.y - PAD_Y - 8;
    description.forEach((text, i) =>
      drawString(cur.page, text, {
        x: LEFT + PAD_X,
        y: first - i * LEAD,
        size: BODY,
        font: fonts.regular,
      }),
    );
    let x = LEFT + DESCRIPTION_W;
    for (const column of COLUMNS) {
      x += column.width;
      const text = column.value(line);
      const size = fitSize(fonts.regular, text, BODY, column.width - 2 * PAD_X);
      textRight(cur.page, text, x - PAD_X, first, size, fonts.regular);
    }
    cur.y -= height;
    cur.page.drawLine({
      start: { x: LEFT, y: cur.y },
      end: { x: RIGHT, y: cur.y },
      thickness: 0.5,
      color: RULE,
    });
  }
}

/* --------------------------------------------------------------- sections */

function drawSection(cur: Cursor, fonts: Fonts, title: string, text: string) {
  const lines = wrapText(text, WIDTH, fonts, 9);
  cur.ensure(14 + Math.min(lines.length, 4) * 12);
  drawString(cur.page, title, { x: LEFT, y: cur.y - 9, size: 9, font: fonts.bold });
  cur.y -= 14;
  for (const line of lines) {
    cur.ensure(12);
    drawString(cur.page, line, { x: LEFT, y: cur.y - 9, size: 9, font: fonts.regular });
    cur.y -= 12;
  }
  cur.y -= 8;
}

/* The VAT on the invoice by treatment: what a buyer claims input VAT from. */
function vatSummary(lines: InvoicePdfLine[]): string[] {
  const out: string[] = [];
  const rates = [...new Set(lines.filter((l) => l.vatRate === 'standard').map((l) => l.vatPct))];
  for (const rate of rates.sort((a, b) => b - a)) {
    const at = lines.filter((l) => l.vatRate === 'standard' && l.vatPct === rate);
    const net = at.reduce((s, l) => s + l.netCents, 0);
    const vat = at.reduce((s, l) => s + l.vatCents, 0);
    out.push(
      `Standard rate ${formatPct(rate)}%: net ${formatAmount(net)}, VAT ${formatAmount(vat)}`,
    );
  }
  for (const [rate, label] of [
    ['zero', 'Zero-rated'],
    ['exempt', 'Exempt'],
  ] as const) {
    const at = lines.filter((l) => l.vatRate === rate);
    if (at.length)
      out.push(`${label}: net ${formatAmount(at.reduce((s, l) => s + l.netCents, 0))}, no VAT`);
  }
  return out;
}

/* ------------------------------------------------------------------- main */

export async function renderInvoicePdf(
  input: InvoicePdfInput,
  letterhead: Letterhead | null,
): Promise<RenderedInvoice> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const logo = await pdf.embedPng(Uint8Array.from(Buffer.from(NEXG_LOGO_PNG_BASE64, 'base64')));
  const cur = new Cursor(pdf);
  const bill = input.billTo;

  /* The title, and the invoice's details to its right. */
  const top = cur.y;
  drawString(cur.page, 'TAX INVOICE', { x: LEFT, y: top - 20, size: 20, font: fonts.bold });
  const details: [string, string][] = [
    ['Invoice No.', input.number],
    ['Issue Date', formatDay(input.issueDate)],
    ['Due Date', formatDay(input.dueDate)],
  ];
  if (input.supplierPin) details.push(['NexG KRA PIN', input.supplierPin]);
  let right = top - 9;
  for (const [label, value] of details) {
    drawString(cur.page, label, {
      x: RIGHT - 205,
      y: right,
      size: 8.5,
      font: fonts.regular,
      color: MUTED,
    });
    textRight(cur.page, value, RIGHT, right, 9, fonts.bold);
    right -= 14;
  }

  /* Who it is billed to, under the title. */
  let left = top - 46;
  drawString(cur.page, 'BILL TO', { x: LEFT, y: left, size: 7.5, font: fonts.bold, color: MUTED });
  left -= 13;
  for (const text of wrapText(bill.legalName, 250, fonts, 10.5, true)) {
    drawString(cur.page, text, { x: LEFT, y: left, size: 10.5, font: fonts.bold });
    left -= 13;
  }
  const extra: string[] = [];
  if (bill.tradingName && bill.tradingName.trim() !== bill.legalName.trim())
    extra.push(`Trading as ${bill.tradingName}`);
  if (bill.kraPin) extra.push(`KRA PIN ${bill.kraPin}`);
  if (bill.address) extra.push(bill.address);
  if (bill.email) extra.push(bill.email);
  for (const item of extra) {
    for (const text of wrapText(item, 250, fonts, 9)) {
      drawString(cur.page, text, { x: LEFT, y: left, size: 9, font: fonts.regular });
      left -= 11.5;
    }
  }
  cur.y = Math.min(left, right) - 14;

  drawString(cur.page, 'Amounts in Kenya shillings (KES). Unit prices exclude VAT.', {
    x: LEFT,
    y: cur.y,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
  cur.y -= 8;

  drawTable(cur, fonts, input.lines);

  /* Totals on the right, the VAT summary on the left. */
  const summary = vatSummary(input.lines);
  cur.y -= 12;
  cur.ensure(Math.max(64, 16 + summary.length * 12));
  const block = cur.y;
  let totals = block - 10;
  const totalsLeft = RIGHT - 210;
  for (const [label, cents] of [
    ['Net (excl. VAT)', input.netCents],
    ['VAT', input.vatCents],
  ] as const) {
    drawString(cur.page, label, { x: totalsLeft, y: totals, size: 9, font: fonts.regular });
    textRight(cur.page, formatAmount(cents), RIGHT, totals, 9, fonts.regular);
    totals -= 14;
  }
  cur.page.drawLine({
    start: { x: totalsLeft, y: totals + 8 },
    end: { x: RIGHT, y: totals + 8 },
    thickness: 1.2,
    color: GOLD,
  });
  totals -= 6;
  drawString(cur.page, 'Total (KES)', { x: totalsLeft, y: totals, size: 11, font: fonts.bold });
  textRight(cur.page, formatAmount(input.grossCents), RIGHT, totals, 11, fonts.bold);
  totals -= 14;

  let vat = block - 10;
  if (summary.length) {
    drawString(cur.page, 'VAT Summary', { x: LEFT, y: vat, size: 8.5, font: fonts.bold });
    vat -= 12;
    for (const line of summary) {
      for (const text of wrapText(line, totalsLeft - LEFT - 16, fonts, 8)) {
        drawString(cur.page, text, { x: LEFT, y: vat, size: 8, font: fonts.regular, color: MUTED });
        vat -= 11;
      }
    }
  }
  cur.y = Math.min(totals, vat) - 12;

  if (input.notes?.trim()) drawSection(cur, fonts, 'Notes', input.notes.trim());

  const contact = letterhead
    ? [letterhead.email, letterhead.phone && formatPhone(letterhead.phone)]
        .filter(Boolean)
        .join(' or ')
    : '';
  drawSection(
    cur,
    fonts,
    'How to Pay',
    input.paymentInstructions?.trim() ||
      `Please pay KES ${formatAmount(input.grossCents)} by ${formatDay(input.dueDate)}, quoting ${input.number} as the reference. Pay by bank transfer or M-PESA; for NexG's payment details, contact ${contact || 'NexG Finance'}.`,
  );

  const status = (input.kraStatus ?? 'pending').replace(/_/g, ' ');
  cur.ensure(12);
  drawString(
    cur.page,
    `eTIMS: ${status}${input.kraReference ? ` · KRA reference ${input.kraReference}` : ''}`,
    { x: LEFT, y: cur.y - 9, size: 8.5, font: fonts.regular, color: MUTED },
  );
  cur.y -= 14;

  const total = cur.pages.length;
  cur.pages.forEach((page, i) => {
    if (i === 0) {
      if (letterhead) drawLetterhead(page, fonts, letterhead, logo);
      else drawBareLetterhead(page, fonts, logo);
    } else drawRunningHead(page, fonts, input.number, logo);
    drawFooter(page, fonts, input.number, i + 1, total);
  });

  pdf.setTitle(`Tax Invoice ${input.number}`);
  pdf.setAuthor(COMPANY_NAME);
  pdf.setSubject(`Tax invoice ${input.number} to ${bill.legalName}`);
  pdf.setKeywords([input.number]);
  pdf.setCreator('NexG');
  pdf.setProducer('NexG');
  const created = input.createdAt ?? new Date(`${input.issueDate.slice(0, 10)}T09:00:00Z`);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  const bytes = await pdf.save();
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), pages: total };
}
