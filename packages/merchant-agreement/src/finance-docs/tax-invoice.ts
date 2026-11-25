import type { DocumentCompany } from './company';
import { verifyUrl } from './company';
import {
  C,
  LEFT,
  RIGHT,
  WIDTH,
  day,
  drawCorporateLine,
  drawFootBar,
  drawHeader,
  drawQrTile,
  drawVerifyLine,
  drawWatermark,
  finish,
  kes,
  money,
  newBook,
  type Canvas,
  type RenderedDocument,
} from './kit';

/**
 * The branded tax invoice, after the owner's mockup: header, "TAX INVOICE"
 * with its reference and dates, a cream BILL TO card, a black-headed table
 * of lines, subtotal and VAT, a total payable bar, then the QR code that
 * verifies it with the eTIMS number, how to pay and the payment reference.
 * Long invoices run onto more pages; the totals close the last one.
 */

export type TaxInvoiceVatRate = 'standard' | 'zero' | 'exempt';

export interface TaxInvoiceLine {
  description: string;
  quantity: number;
  /** Excluding VAT. */
  unitPriceCents: number;
  vatRate: TaxInvoiceVatRate;
  vatPct: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export interface TaxInvoiceDocument {
  number: string;
  /** YYYY-MM-DD. */
  issueDate: string;
  dueDate: string;
  billTo: {
    legalName: string;
    tradingName?: string | null;
    kraPin?: string | null;
    address?: string | null;
    email?: string | null;
  };
  lines: TaxInvoiceLine[];
  netCents: number;
  vatCents: number;
  grossCents: number;
  notes?: string | null;
  kraStatus?: string | null;
  kraReference?: string | null;
  paymentInstructions?: string | null;
  /** Printed in the QR code: unlocks the details on the verify page. */
  checkCode?: string | null;
  company: DocumentCompany;
  createdAt?: Date;
}

const ROW_MIN = 33;
const TABLE_HEAD = 31;
const COL_NUM = 45;
const COL_DESC = 89;
const DIV_1 = 72;
const DIV_2 = 417;
const AMOUNT_RIGHT = 558;
/* Room the totals, the bar and the QR block need under the table. */
const CLOSING = 268;
const PAGE_LIMIT = 735;

function quantity(q: number): string {
  const [whole = '0', fraction = ''] = q.toFixed(3).split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (trimmed ? `.${trimmed}` : '');
}

function rateLabel(line: TaxInvoiceLine): string {
  if (line.vatRate === 'exempt') return 'VAT exempt';
  if (line.vatRate === 'zero') return 'VAT 0%';
  return `VAT ${Math.round(line.vatPct * 100) / 100}%`;
}

function vatLabel(lines: TaxInvoiceLine[]): string {
  const rates = [
    ...new Set(lines.map((l) => (l.vatRate === 'standard' ? `${l.vatPct}` : l.vatRate))),
  ];
  const only = rates.length === 1 ? lines[0] : undefined;
  if (only?.vatRate === 'standard') return `VAT (${Math.round(only.vatPct * 100) / 100}%)`;
  return 'VAT';
}

function drawTitle(c: Canvas, doc: TaxInvoiceDocument, continued: boolean) {
  c.text(continued ? 'TAX INVOICE (continued)' : 'TAX INVOICE', 34, 209, {
    size: continued ? 24 : 35,
    weight: 'bold',
    maxWidth: 310,
  });
  const lw = c.text('Reference: ', 35, 231, { size: 12.5 });
  c.text(doc.number, 35 + lw, 231, { size: 12.5, weight: 'bold', maxWidth: 300 - lw });

  c.line(359, 172, 359, 241, C.gold, 1.4);
  const rows: [Parameters<Canvas['icon']>[0], string, string][] = [
    ['calendar', 'Issued:', day(doc.issueDate, true)],
    ['calendar', 'Due:', day(doc.dueDate, true)],
    ['coins', 'Currency:', 'KES'],
  ];
  rows.forEach(([icon, label, value], i) => {
    const y = 190 + i * 23;
    c.icon(icon, 386, y - 11.5, 14.5, C.goldText, 2);
    c.labelled(label, value, 412, y, 12.5, RIGHT - 412);
  });
}

function drawBillTo(c: Canvas, doc: TaxInvoiceDocument): number {
  const bill = doc.billTo;
  const top = 271;
  const extra: [Parameters<Canvas['icon']>[0], string][] = [
    ['card', `Customer KRA PIN: ${bill.kraPin?.trim() || 'Not given'}`],
  ];
  if (bill.tradingName && bill.tradingName.trim() !== bill.legalName.trim())
    extra.push(['store', `Trading as ${bill.tradingName}`]);
  if (bill.address?.trim()) extra.push(['pin', bill.address.trim()]);
  if (bill.email?.trim()) extra.push(['mail', bill.email.trim()]);
  const bottom = Math.max(364, 319 + extra.length * 22 + 12);

  c.box(LEFT, top, WIDTH, bottom - top, { fill: C.cream, radius: 10 });
  c.box(41, 262, 96, 27, { fill: C.gold, radius: 3 });
  c.text('BILL TO', 89, 280.5, { size: 12.5, weight: 'bold', align: 'center' });

  c.icon('building', 46, 305, 18, C.ink, 1.8);
  c.text(bill.legalName, 80, 319, { size: 16.5, weight: 'bold', maxWidth: RIGHT - 100 });
  extra.forEach(([icon, text], i) => {
    const y = 342 + i * 22;
    c.icon(icon, 46, y - 12.5, 16, C.ink, 1.8);
    c.text(text, 80, y, { size: 12, maxWidth: RIGHT - 100 });
  });
  return bottom;
}

function drawTableHead(c: Canvas, top: number) {
  c.box(LEFT, top, WIDTH, TABLE_HEAD, {
    fill: C.black,
    radius: 9,
    corners: [true, true, false, false],
  });
  const y = top + 20;
  c.text('#', COL_NUM, y, { size: 12.5, weight: 'bold', color: C.white });
  c.text('Description', COL_DESC, y, { size: 12.5, weight: 'bold', color: C.white });
  c.text('Amount (KES)', AMOUNT_RIGHT, y, {
    size: 12.5,
    weight: 'bold',
    color: C.white,
    align: 'right',
  });
}

interface PlacedRow {
  line: TaxInvoiceLine;
  index: number;
  desc: string[];
  height: number;
}

function measureRows(c: Canvas, lines: TaxInvoiceLine[]): PlacedRow[] {
  return lines.map((line, index) => {
    const desc = c.paragraphLines(line.description, DIV_2 - COL_DESC - 10, 12);
    return { line, index, desc, height: Math.max(ROW_MIN, 14 + desc.length * 14.5 + 13) };
  });
}

function drawRows(c: Canvas, rows: PlacedRow[], top: number): number {
  let y = top;
  for (const row of rows) {
    const first = y + 18;
    c.text(String(row.index + 1), COL_NUM, first, { size: 12 });
    row.desc.forEach((text, i) => c.text(text, COL_DESC, first + i * 14.5, { size: 12 }));
    const l = row.line;
    c.text(
      `${quantity(l.quantity)} × ${money(l.unitPriceCents)}  ·  ${rateLabel(l)}  ·  VAT ${money(l.vatCents)}`,
      COL_DESC,
      first + row.desc.length * 14.5 - 1.5,
      { size: 8.5, color: C.muted, maxWidth: DIV_2 - COL_DESC - 10 },
    );
    c.text(money(l.netCents), AMOUNT_RIGHT, first, {
      size: 12,
      align: 'right',
      maxWidth: RIGHT - DIV_2 - 30,
    });
    y += row.height;
    c.line(LEFT, y, RIGHT, y, C.rule, 0.8);
  }
  /* The frame: sides, the two column rules, and round bottom corners. */
  c.box(LEFT, top, WIDTH, y - top, {
    border: C.rule,
    borderWidth: 0.9,
    radius: 9,
    corners: [false, false, true, true],
  });
  c.line(DIV_1, top, DIV_1, y, C.rule, 0.8);
  c.line(DIV_2, top, DIV_2, y, C.rule, 0.8);
  return y;
}

function drawClosing(c: Canvas, doc: TaxInvoiceDocument, tableEnd: number) {
  /* Subtotal and VAT on the right. */
  let y = tableEnd + 29;
  const labelX = 258;
  c.text('Subtotal', labelX, y, { size: 12.5, weight: 'bold' });
  c.text(money(doc.netCents), AMOUNT_RIGHT, y, { size: 12.5, align: 'right' });
  y += 21;
  c.text(vatLabel(doc.lines), labelX, y, { size: 12.5 });
  c.text(money(doc.vatCents), AMOUNT_RIGHT, y, { size: 12.5, align: 'right' });
  y += 19;
  c.line(labelX, y, RIGHT, y, C.muted, 0.7);

  /* The total payable bar: cream, then gold behind a slanted edge. */
  const bar = y + 13;
  const h = 46;
  c.box(210, bar, RIGHT - 210, h, { fill: C.creamDeep, radius: 8 });
  c.gradientBox(362, bar, RIGHT - 362, h, 8, C.gold, C.goldDeep);
  c.polygon(
    [
      [358, bar],
      [389, bar],
      [369, bar + h],
      [358, bar + h],
    ],
    C.creamDeep,
  );
  c.text('Total payable', 228, bar + 29.5, { size: 18, weight: 'bold' });
  c.text(kes(doc.grossCents), 552, bar + 32, {
    size: 25,
    weight: 'bold',
    align: 'right',
    maxWidth: 175,
  });

  /* The QR code that verifies it, and how to pay. */
  const qrTop = bar + h + 29;
  drawQrTile(c, verifyUrl(doc.number, doc.checkCode), 27, qrTop, 100, 'Scan to verify');
  c.line(148, qrTop + 8, 148, qrTop + 96, C.gold, 1.4);

  const status = (doc.kraStatus ?? 'pending').replace(/_/g, ' ');
  const rows: [Parameters<Canvas['icon']>[0], string, string][] = [
    [
      'file',
      'eTIMS invoice number:',
      doc.kraReference?.trim() || `Pending (KRA status: ${status})`,
    ],
    ['card', 'Payment instructions:', doc.paymentInstructions?.trim() || 'M-PESA / Bank transfer'],
    ['link', 'Payment reference:', doc.number],
    ['shield', 'Verify:', `nexgapp.com/verify/${doc.number}`],
  ];
  let ry = qrTop + 17;
  for (const [icon, label, value] of rows) {
    c.icon(icon, 162, ry - 11.5, 15, C.goldText, 2);
    const lw = c.text(label, 188, ry, { size: 11.5, weight: 'bold' });
    const lines = c.paragraphLines(value, RIGHT - 188 - lw - 4, 11.5);
    lines.forEach((text, i) =>
      c.text(text, i === 0 ? 188 + lw + 4 : 188, ry + i * 14, { size: 11.5 }),
    );
    ry += 14 * lines.length + 12;
  }
  if (doc.notes?.trim()) {
    const lines = c.paragraphLines(`Notes: ${doc.notes.trim()}`, RIGHT - 162, 9);
    lines
      .slice(0, 3)
      .forEach((text, i) => c.text(text, 162, ry + i * 11.5, { size: 9, color: C.muted }));
  }
  drawWatermark(c, 452, qrTop - 6, 126);
}

function drawFooter(c: Canvas, doc: TaxInvoiceDocument, n: number, of: number) {
  const company = doc.company;
  c.line(LEFT + 13, 743, RIGHT - 13, 743, C.gold, 1.2);
  const address = `${company.addressLine1}, ${company.addressLine2}`;
  const aw = c.width(address, 11);
  const ax = 210 - aw / 2;
  c.icon('pin', ax - 19, 753, 14, C.gold, 2.2);
  c.text(address, ax, 765, { size: 11 });
  c.line(392, 752, 392, 770, C.gold, 1.2);
  c.icon('globe', 410, 753, 14, C.goldText, 2);
  c.text(company.website, 431, 765, { size: 11 });
  drawVerifyLine(c, 'Computer-generated tax invoice, valid without a signature', doc.number, 789);
  drawCorporateLine(c, company, 803.5, { n, of });
  drawFootBar(c, 813);
}

export async function renderTaxInvoice(doc: TaxInvoiceDocument): Promise<RenderedDocument> {
  const book = await newBook();
  let c = book.addPage();
  drawHeader(c, doc.company);
  drawTitle(c, doc, false);
  let top = drawBillTo(c, doc) + 25;

  const rows = measureRows(c, doc.lines);
  let i = 0;
  for (;;) {
    drawTableHead(c, top);
    const start = top + TABLE_HEAD;
    let end = start;
    const here: PlacedRow[] = [];
    while (i < rows.length && end + rows[i]!.height <= PAGE_LIMIT) {
      here.push(rows[i]!);
      end += rows[i]!.height;
      i++;
    }
    const tableEnd = drawRows(c, here, start);
    if (i >= rows.length && tableEnd + CLOSING <= PAGE_LIMIT) {
      drawClosing(c, doc, tableEnd);
      break;
    }
    c = book.addPage();
    drawHeader(c, doc.company);
    drawTitle(c, doc, true);
    if (i >= rows.length) {
      drawClosing(c, doc, 230);
      break;
    }
    top = 262;
  }

  book.pages.forEach((page, n) => drawFooter(page, doc, n + 1, book.pages.length));
  const created = doc.createdAt ?? new Date(`${doc.issueDate.slice(0, 10)}T09:00:00Z`);
  return finish(book, {
    title: `Tax Invoice ${doc.number}`,
    subject: `Tax invoice ${doc.number} to ${doc.billTo.legalName}`,
    reference: doc.number,
    createdAt: created,
    company: doc.company,
  });
}
