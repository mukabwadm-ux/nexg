import { verifyUrl, type DocumentCompany } from './company';
import {
  C,
  LEFT,
  PAGE_W,
  RIGHT,
  WIDTH,
  day,
  drawCorporateLine,
  drawFootBar,
  drawHeader,
  drawQrTile,
  drawVerifyLine,
  finish,
  money,
  newBook,
  type Canvas,
  type RenderedDocument,
} from './kit';
import type { IconName } from './icons';

/**
 * The branded payment receipt, after the owner's mockup: "PAYMENT RECEIPT"
 * centred with its reference, a cream card with the green tick, the amount
 * received and its status, the payment's details row by row, and a thank
 * you. The QR code in the card's corner verifies it.
 */

export interface ReceiptDocument {
  reference: string;
  checkCode?: string | null;
  /** YYYY-MM-DD: when the receipt was first issued. */
  issueDate: string;
  receivedFrom: string;
  /** YYYY-MM-DD. */
  paidOn: string;
  method: 'mpesa' | 'bank';
  transactionId: string;
  invoiceNumber: string;
  amountCents: number;
  /** The amount's share before VAT, and its VAT. */
  netCents: number;
  vatCents: number;
  /** What is still owed on the invoice after this payment. */
  balanceCents: number;
  company: DocumentCompany;
  createdAt?: Date;
}

const CENTER = PAGE_W / 2;

function drawHero(c: Canvas, doc: ReceiptDocument) {
  const top = 228;
  const h = 203;
  const bottom = top + h;
  c.box(LEFT, top, WIDTH, h, { fill: C.cream, radius: 16 });
  /* Gold waves in the bottom corners. */
  c.path(
    `M${LEFT} ${bottom - 52}C${LEFT + 50} ${bottom - 30} ${LEFT + 120} ${bottom - 8} ${LEFT + 200} ${bottom}` +
      `L${LEFT + 16} ${bottom}A16 16 0 0 1 ${LEFT} ${bottom - 16}Z`,
    C.goldLight,
    0.55,
  );
  c.path(
    `M${LEFT} ${bottom - 30}C${LEFT + 40} ${bottom - 14} ${LEFT + 90} ${bottom - 4} ${LEFT + 150} ${bottom}` +
      `L${LEFT + 16} ${bottom}A16 16 0 0 1 ${LEFT} ${bottom - 16}Z`,
    C.gold,
  );
  c.path(
    `M${RIGHT} ${bottom - 52}C${RIGHT - 50} ${bottom - 30} ${RIGHT - 120} ${bottom - 8} ${RIGHT - 200} ${bottom}` +
      `L${RIGHT - 16} ${bottom}A16 16 0 0 0 ${RIGHT} ${bottom - 16}Z`,
    C.goldLight,
    0.55,
  );
  c.path(
    `M${RIGHT} ${bottom - 30}C${RIGHT - 40} ${bottom - 14} ${RIGHT - 90} ${bottom - 4} ${RIGHT - 150} ${bottom}` +
      `L${RIGHT - 16} ${bottom}A16 16 0 0 0 ${RIGHT} ${bottom - 16}Z`,
    C.gold,
  );

  c.circle(CENTER, 270, 35, C.green, { color: C.white, width: 4 });
  c.icon('check', CENTER - 19, 251, 38, C.white, 3.2);

  drawQrTile(c, verifyUrl(doc.reference, doc.checkCode), RIGHT - 70, 244, 52, 'Scan to verify');

  c.text('Amount received', CENTER, 325, { size: 20, align: 'center' });
  c.text(`KES ${money(doc.amountCents)}`, CENTER, 369, {
    size: 44,
    weight: 'bold',
    align: 'center',
    maxWidth: 380,
  });

  const status = doc.balanceCents <= 0 ? 'Payment successful' : 'Part payment received';
  const pillW = Math.max(222, c.width(status, 17, 'bold') + 60);
  c.box(CENTER - pillW / 2, 386, pillW, 31, { fill: C.green, radius: 15.5 });
  c.text(status, CENTER, 407.5, { size: 17, weight: 'bold', color: C.white, align: 'center' });
}

function drawRows(c: Canvas, doc: ReceiptDocument) {
  const rows: [IconName, string, string][] = [
    ['user', 'Received from', doc.receivedFrom],
    ['calendar', 'Payment date', day(doc.paidOn, true)],
    ['phoneDevice', 'Payment method', doc.method === 'mpesa' ? 'M-PESA' : 'Bank transfer'],
    ['transfer', 'Transaction ID', doc.transactionId],
    ['file', 'Related invoice', doc.invoiceNumber],
    ['coins', 'Amount before VAT', `KES ${money(doc.netCents)}`],
    ['percent', 'VAT', `KES ${money(doc.vatCents)}`],
    ['scale', 'Outstanding balance', `KES ${money(Math.max(0, doc.balanceCents))}`],
  ];
  const top = 446;
  const h = 27;
  rows.forEach(([icon, label, value], i) => {
    const y = top + i * h;
    if (i % 2 === 0) c.box(LEFT, y, WIDTH, h - 1, { fill: C.zebra, radius: 6 });
    const base = y + 18;
    c.icon(icon, 46, y + 5, 16, C.goldText, 1.9);
    c.text(label, 92, base, { size: 13.5, weight: 'bold' });
    c.text('|', 284, base, { size: 13.5, color: C.muted });
    const last = i === rows.length - 1;
    const paid = last && doc.balanceCents <= 0;
    c.text(value, 305, base, {
      size: last ? 15 : 13.5,
      weight: last ? 'bold' : 'regular',
      color: paid ? C.green : C.ink,
      maxWidth: RIGHT - 312,
    });
  });
  c.line(LEFT, top + rows.length * h + 6, RIGHT, top + rows.length * h + 6, C.rule, 1);
}

export async function renderReceipt(doc: ReceiptDocument): Promise<RenderedDocument> {
  const book = await newBook();
  const c = book.addPage();
  drawHeader(c, doc.company);

  c.text('PAYMENT RECEIPT', CENTER, 184, { size: 36, weight: 'bold', align: 'center' });
  const ref = `Reference: ${doc.reference}`;
  const rw = c.width(ref, 13);
  c.text(ref, CENTER, 209, { size: 13, align: 'center' });
  c.line(55, 205, CENTER - rw / 2 - 16, 205, C.gold, 1.6);
  c.line(CENTER + rw / 2 + 16, 205, PAGE_W - 55, 205, C.gold, 1.6);

  drawHero(c, doc);
  drawRows(c, doc);

  c.icon('handshake', CENTER - 17, 680, 34, C.goldText, 1.6);
  c.line(38, 697, CENTER - 32, 697, C.gold, 1.6);
  c.line(CENTER + 32, 697, PAGE_W - 38, 697, C.gold, 1.6);
  c.text('Thank you for choosing NEXG.', CENTER, 739, {
    size: 21,
    weight: 'boldItalic',
    align: 'center',
  });
  c.text(`Issued ${day(doc.issueDate)} by ${doc.company.legalName}`, CENTER, 757, {
    size: 9.5,
    color: C.muted,
    align: 'center',
  });

  drawVerifyLine(c, 'Computer-generated receipt, valid without a signature', doc.reference, 789);
  drawCorporateLine(c, doc.company, 803.5);
  drawFootBar(c, 813);

  return finish(book, {
    title: `Payment Receipt ${doc.reference}`,
    subject: `Payment receipt ${doc.reference} for invoice ${doc.invoiceNumber}`,
    reference: doc.reference,
    createdAt: doc.createdAt ?? new Date(`${doc.issueDate.slice(0, 10)}T09:00:00Z`),
    company: doc.company,
  });
}
