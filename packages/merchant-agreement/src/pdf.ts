import {
  PDFDocument,
  StandardFonts,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  setWordSpacing,
  showText,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFName,
  type PDFPage,
} from 'pdf-lib';

import {
  formatNairobi,
  formatPhone,
  type AgreementDocument,
  type ExecutionBlock,
  type ResolvedParagraph,
  type ResolvedRun,
  type ResolvedTable,
} from './document';

/**
 * Lays out an agreement on A4 and writes it as a PDF, with no browser:
 * pdf-lib only, so it runs in a serverless function.
 *
 * The page follows the Word originals: A4, 65 pt side margins, 10 pt text,
 * justified paragraphs, Word's clause numbering and indents. Text is set in
 * Helvetica, one of the PDF standard fonts, so nothing is embedded but the
 * logo and the signature. The first page carries the full NexG letterhead,
 * later pages a slim header, and every page a footer with the agreement,
 * its reference and "Page n of N".
 */

export const COMPANY_NAME = 'NexGenius Concierge Limited';
export const COMPANY_NUMBER = 'PVT-L51DZJ32';

export interface Letterhead {
  registeredOffice: string;
  /** "12345-00100", printed as "P.O. Box 12345-00100, Nairobi, Kenya". */
  poBox: string;
  phone: string;
  email: string;
  website: string;
}

export interface RenderOptions {
  /** The NexG letterhead; left out only to compare against the originals. */
  letterhead?: Letterhead;
  /** PNG bytes of the NexG logo. */
  logo?: Uint8Array;
  /** NexG's signature, applied in the execution block. */
  signature?: { bytes: Uint8Array; type: 'png' | 'jpg' };
  /** Printed in every footer. */
  reference?: string;
  version: string;
  /** Document properties. */
  metadata?: { subject?: string; createdAt?: Date; keywords?: string[] };
}

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN_X = 65;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const BOTTOM = 78;
const TOP_FIRST = PAGE_H - 140;
const TOP_NEXT = PAGE_H - 84;
const TOP_PLAIN = PAGE_H - 65;

const BODY = { size: 10, leading: 13.6 };
const TABLE = { size: 9, leading: 12, padX: 5, padY: 4 };

export const INK = rgb(0.08, 0.08, 0.08);
export const MUTED = rgb(0.4, 0.4, 0.4);
export const RULE = rgb(0.72, 0.72, 0.72);
export const GOLD = rgb(0.91, 0.64, 0.09);
export const SHADE = rgb(0.95, 0.95, 0.95);

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

/* ------------------------------------------------------------------ text */

interface Piece {
  text: string;
  font: PDFFont;
  size: number;
  underline: boolean;
  /** A ballot box drawn as a square, ticked or not. */
  box?: 'empty' | 'checked';
  width: number;
}

interface Word {
  pieces: Piece[];
  width: number;
}

interface Line {
  words: Word[];
  /** Width of the words plus ordinary spaces between them. */
  width: number;
  /** The last line of a paragraph, or one ended by a line break. */
  last: boolean;
}

let charset: Set<number> | null = null;

/*
 * The width a string is shown at. pdf-lib's widthOfTextAtSize applies the
 * font's kerning pairs, but text shown with Tj is not kerned, so measuring
 * whole strings made words narrower than they print and crowded the next
 * one. A string is the sum of its characters, each measured once per font.
 */
const widths = new WeakMap<PDFFont, Map<string, number>>();
export function widthOf(font: PDFFont, text: string, size: number): number {
  let byFont = widths.get(font);
  if (!byFont) widths.set(font, (byFont = new Map()));
  let units = 0;
  for (const ch of text) {
    let width = byFont.get(ch);
    if (width === undefined) byFont.set(ch, (width = font.widthOfTextAtSize(ch, 1000)));
    units += width;
  }
  return (units * size) / 1000;
}

/** Standard fonts speak WinAnsi only: map anything else to what they can print. */
export function printable(text: string, font: PDFFont): string {
  charset ??= new Set(font.getCharacterSet());
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (charset.has(code) || ch === '\n') {
      out += ch;
      continue;
    }
    if (ch === '\t') out += ' ';
    else if (/[\u2010\u2011\u2012\u2212]/.test(ch)) out += '-';
    else if (/[\u200b-\u200d\ufeff]/.test(ch)) continue;
    else {
      const plain = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      out += [...plain].every((c) => charset!.has(c.codePointAt(0)!)) && plain ? plain : '?';
    }
  }
  return out;
}

function fontFor(run: { bold: boolean; italic: boolean }, fonts: Fonts): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

type Token = Piece | 'space' | 'break';

function tokens(runs: ResolvedRun[], fonts: Fonts, size: number): Token[] {
  const out: Token[] = [];
  for (const run of runs) {
    const font = fontFor(run, fonts);
    for (const part of run.text.split(/(\n|[ \t]+|☐|☒)/)) {
      if (!part) continue;
      if (part === '\n') out.push('break');
      else if (/^[ \t]+$/.test(part)) out.push('space');
      else if (part === '☐' || part === '☒')
        out.push({
          text: part,
          font,
          size,
          underline: false,
          box: part === '☒' ? 'checked' : 'empty',
          width: size * 0.95,
        });
      else {
        const text = printable(part, font);
        out.push({
          text,
          font,
          size,
          underline: run.underline,
          width: widthOf(font, text, size),
        });
      }
    }
  }
  return out;
}

/* A word wider than the line is cut where it must be. */
function splitWord(word: Word, avail: number): [Word, Word] {
  const head: Piece[] = [];
  let width = 0;
  const pieces = [...word.pieces];
  while (pieces.length) {
    const piece = pieces[0]!;
    if (width + piece.width <= avail) {
      head.push(pieces.shift()!);
      width += piece.width;
      continue;
    }
    let cut = 0;
    const chars = [...piece.text];
    while (cut < chars.length) {
      const w = widthOf(piece.font, chars.slice(0, cut + 1).join(''), piece.size);
      if (width + w > avail) break;
      cut++;
    }
    if (cut === 0 && head.length === 0) cut = 1;
    if (cut > 0) {
      const text = chars.slice(0, cut).join('');
      const rest = chars.slice(cut).join('');
      const w = widthOf(piece.font, text, piece.size);
      head.push({ ...piece, text, width: w });
      width += w;
      pieces[0] = { ...piece, text: rest, width: widthOf(piece.font, rest, piece.size) };
      if (!rest) pieces.shift();
    }
    break;
  }
  const tail = pieces;
  return [
    { pieces: head, width },
    { pieces: tail, width: tail.reduce((n, p) => n + p.width, 0) },
  ];
}

function layoutLines(runs: ResolvedRun[], avail: number, fonts: Fonts, size: number): Line[] {
  const space = widthOf(fonts.regular, ' ', size);
  const words: (Word | 'break')[] = [];
  let current: Word | null = null;
  for (const token of tokens(runs, fonts, size)) {
    if (token === 'space' || token === 'break') {
      if (current) words.push(current);
      current = null;
      if (token === 'break') words.push('break');
      continue;
    }
    current ??= { pieces: [], width: 0 };
    current.pieces.push(token);
    current.width += token.width;
  }
  if (current) words.push(current);

  const lines: Line[] = [];
  let line: Line = { words: [], width: 0, last: false };
  const queue = [...words];
  while (queue.length) {
    const word = queue.shift()!;
    if (word === 'break') {
      lines.push({ ...line, last: true });
      line = { words: [], width: 0, last: false };
      continue;
    }
    const extra = line.words.length ? space : 0;
    if (line.width + extra + word.width <= avail) {
      line.words.push(word);
      line.width += extra + word.width;
      continue;
    }
    if (line.words.length === 0) {
      const [head, tail] = splitWord(word, avail);
      line.words.push(head);
      line.width = head.width;
      lines.push(line);
      line = { words: [], width: 0, last: false };
      if (tail.pieces.length) queue.unshift(tail);
      continue;
    }
    lines.push(line);
    line = { words: [], width: 0, last: false };
    queue.unshift(word);
  }
  if (line.words.length) lines.push(line);
  if (lines.length) lines[lines.length - 1]!.last = true;
  return lines;
}

/** Plain text wrapped to a width, one string per line, in printable characters. */
export function wrapText(
  text: string,
  width: number,
  fonts: Fonts,
  size: number,
  bold = false,
): string[] {
  const runs = [{ text, bold, italic: false, underline: false }];
  return layoutLines(runs, width, fonts, size).map((line) =>
    line.words.map((word) => word.pieces.map((p) => p.text).join('')).join(' '),
  );
}

/* Baseline of a line whose box starts at `top`. */
const baseline = (top: number, size: number, leading: number) =>
  top - (leading - 0.925 * size) / 2 - 0.718 * size;

/*
 * pdf-lib's drawText registers the font on the page again at every call, so
 * a long document collects thousands of font entries. Text here goes
 * through one entry per font and page instead.
 */
const fontKeys = new WeakMap<PDFPage, Map<PDFFont, PDFName>>();
function fontKey(page: PDFPage, font: PDFFont): PDFName {
  let byPage = fontKeys.get(page);
  if (!byPage) fontKeys.set(page, (byPage = new Map()));
  let key = byPage.get(font);
  if (!key) byPage.set(font, (key = page.node.newFontDictionary(font.name, font.ref)));
  return key;
}

interface Segment {
  font: PDFFont;
  size: number;
  text: string;
  x: number;
}

/* Text segments on one baseline; `wordSpacing` stretches every space in them. */
function showSegments(
  page: PDFPage,
  segments: Segment[],
  y: number,
  color: Color,
  wordSpacing = 0,
) {
  if (!segments.length) return;
  const ops = [pushGraphicsState(), beginText(), setFillingColor(color)];
  for (const s of segments) {
    if (!s.text) continue;
    ops.push(
      setFontAndSize(fontKey(page, s.font), s.size),
      setWordSpacing(wordSpacing),
      setTextMatrix(1, 0, 0, 1, s.x, y),
      showText(s.font.encodeText(s.text)),
    );
  }
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

export function drawString(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; size: number; font: PDFFont; color?: Color },
) {
  showSegments(
    page,
    [{ font: options.font, size: options.size, text: printable(text, options.font), x: options.x }],
    options.y,
    options.color ?? INK,
  );
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  size: number,
  checked: boolean,
) {
  const side = size * 0.72;
  const bx = x + (width - side) / 2;
  page.drawRectangle({
    x: bx,
    y: y - 0.5,
    width: side,
    height: side,
    borderColor: INK,
    borderWidth: 0.7,
  });
  if (!checked) return;
  const a = { x: bx + 1.4, y: y + 0.9 };
  const b = { x: bx + side - 1.4, y: y + side - 1.9 };
  page.drawLine({ start: a, end: b, thickness: 0.9, color: INK });
  page.drawLine({ start: { x: a.x, y: b.y }, end: { x: b.x, y: a.y }, thickness: 0.9, color: INK });
}

/*
 * One line of a paragraph. Runs of the same font are shown as one string
 * with real spaces, so the PDF reads, searches and copies as text; a
 * justified line stretches its spaces with the PDF word-spacing operator.
 */
function drawLine(
  page: PDFPage,
  line: Line,
  x: number,
  top: number,
  avail: number,
  align: ResolvedParagraph['align'],
  size: number,
  leading: number,
  space: number,
) {
  const gaps = line.words.length - 1;
  let stretch = 0;
  let start = x;
  if (align === 'justify' && !line.last && gaps > 0) stretch = (avail - line.width) / gaps;
  else if (align === 'center') start = x + (avail - line.width) / 2;
  else if (align === 'right') start = x + avail - line.width;
  const y = baseline(top, size, leading);
  const segments: Segment[] = [];
  const marks: (() => void)[] = [];
  // Underlined stretches, joined across the spaces between underlined words.
  const underlines: [number, number][] = [];
  let segment: Segment | null = null;
  let cursor = start;
  let lastUnderlined = false;
  line.words.forEach((word, index) => {
    for (const piece of word.pieces) {
      const at = cursor;
      if (piece.box) {
        marks.push(() => drawBox(page, at, y, piece.width, size, piece.box === 'checked'));
        segment = null;
      } else if (piece.text) {
        if (!segment || segment.font !== piece.font || segment.size !== piece.size) {
          segment = { font: piece.font, size: piece.size, text: '', x: at };
          segments.push(segment);
        }
        segment.text += piece.text;
      }
      const underlined = Boolean(piece.underline && piece.text && !piece.box);
      if (underlined) {
        const open = underlines[underlines.length - 1];
        if (lastUnderlined && open) open[1] = at + piece.width;
        else underlines.push([at, at + piece.width]);
      }
      lastUnderlined = underlined;
      cursor += piece.width;
    }
    if (index < gaps) {
      // The space belongs to the text before it; Tw stretches it in place.
      if (segment) (segment as Segment).text += ' ';
      cursor += space + stretch;
      const next = line.words[index + 1]?.pieces[0];
      if (!(lastUnderlined && next?.underline)) lastUnderlined = false;
    }
  });
  showSegments(page, segments, y, INK, stretch);
  for (const [from, to] of underlines)
    page.drawLine({
      start: { x: from, y: y - 1.6 },
      end: { x: to, y: y - 1.6 },
      thickness: 0.6,
      color: INK,
    });
  for (const mark of marks) mark();
}

/* ---------------------------------------------------------------- layout */

class Writer {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  private topOfPage = true;

  constructor(
    private readonly pdf: PDFDocument,
    readonly fonts: Fonts,
    private readonly firstTop: number,
    private readonly nextTop: number,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = this.pages.length === 1 ? this.firstTop : this.nextTop;
    this.topOfPage = true;
  }

  get atTop() {
    return this.topOfPage;
  }

  room() {
    return this.y - BOTTOM;
  }

  advance(height: number) {
    this.y -= height;
    if (height > 0) this.topOfPage = false;
  }

  /* Space before a block, dropped at the top of a page. */
  gap(height: number) {
    if (!this.topOfPage) this.y -= height;
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM && !this.topOfPage) this.newPage();
  }
}

function paragraphLines(p: ResolvedParagraph, width: number, fonts: Fonts, size: number) {
  return layoutLines(p.runs, Math.max(20, width - p.textAt), fonts, size);
}

function drawParagraph(w: Writer, p: ResolvedParagraph, next: ResolvedParagraph | null) {
  const { size, leading } = BODY;
  const fonts = w.fonts;
  const lines = paragraphLines(p, CONTENT_W, fonts, size);
  const space = widthOf(fonts.regular, ' ', size);
  if (p.pageBreak && !w.atTop) w.newPage();
  if (p.heading) w.gap(10);
  if (lines.length === 0) {
    w.ensure(leading);
    w.advance(leading);
    return;
  }
  // A heading stays with the first lines of what follows it.
  if (p.heading && next) {
    const following = Math.min(2, paragraphLines(next, CONTENT_W, fonts, size).length);
    w.ensure((lines.length + following) * leading + 8);
  }
  // No single line left alone at the foot of a page.
  if (lines.length > 1 && w.room() < 2 * leading) w.ensure(2 * leading);
  else w.ensure(leading);
  lines.forEach((line, index) => {
    // ...nor carried alone to the next one.
    if (index === lines.length - 2 && w.room() < 2 * leading && w.room() >= leading) w.newPage();
    w.ensure(leading);
    const top = w.y;
    if (index === 0 && p.label) {
      const font = p.heading ? fonts.bold : fonts.regular;
      drawString(w.page, p.label, {
        x: MARGIN_X + p.labelAt,
        y: baseline(top, size, leading),
        size,
        font,
        color: INK,
      });
    }
    drawLine(
      w.page,
      line,
      MARGIN_X + p.textAt,
      top,
      CONTENT_W - p.textAt,
      p.align,
      size,
      leading,
      space,
    );
    w.advance(leading);
  });
  w.advance(p.heading ? 4 : 6);
}

/* ----------------------------------------------------------------- tables */

type CellItem =
  | { kind: 'p'; p: ResolvedParagraph }
  | { kind: 'image'; image: PDFImage; width: number; height: number }
  | { kind: 'space'; height: number };

interface Row {
  cells: CellItem[][];
  header: boolean;
}

function itemHeight(item: CellItem, width: number, fonts: Fonts): number {
  if (item.kind === 'space') return item.height;
  if (item.kind === 'image') return item.height + 2;
  const lines = paragraphLines(item.p, width, fonts, TABLE.size);
  return Math.max(1, lines.length) * TABLE.leading;
}

function cellHeight(items: CellItem[], width: number, fonts: Fonts) {
  const inner = width - 2 * TABLE.padX;
  const body = items.reduce((n, item, i) => n + itemHeight(item, inner, fonts) + (i ? 2 : 0), 0);
  return body + 2 * TABLE.padY;
}

function drawRows(w: Writer, widths: number[], rows: Row[], repeatHeader: boolean) {
  const fonts = w.fonts;
  const space = widthOf(fonts.regular, ' ', TABLE.size);
  const header = repeatHeader && rows[0]?.header ? rows[0] : null;
  const drawRow = (row: Row) => {
    const height = Math.max(...row.cells.map((items, c) => cellHeight(items, widths[c]!, fonts)));
    if (w.y - height < BOTTOM && !w.atTop) {
      w.newPage();
      if (header && row !== header) drawRow(header);
    }
    let x = MARGIN_X;
    row.cells.forEach((items, c) => {
      const width = widths[c]!;
      if (row.header) w.page.drawRectangle({ x, y: w.y - height, width, height, color: SHADE });
      w.page.drawRectangle({
        x,
        y: w.y - height,
        width,
        height,
        borderColor: RULE,
        borderWidth: 0.5,
      });
      let top = w.y - TABLE.padY;
      const inner = width - 2 * TABLE.padX;
      items.forEach((item, i) => {
        if (i) top -= 2;
        if (item.kind === 'space') {
          top -= item.height;
          return;
        }
        if (item.kind === 'image') {
          w.page.drawImage(item.image, {
            x: x + TABLE.padX,
            y: top - item.height,
            width: item.width,
            height: item.height,
          });
          top -= item.height + 2;
          return;
        }
        const lines = paragraphLines(item.p, inner, fonts, TABLE.size);
        if (lines.length === 0) {
          top -= TABLE.leading;
          return;
        }
        for (const line of lines) {
          drawLine(
            w.page,
            line,
            x + TABLE.padX + item.p.textAt,
            top,
            inner - item.p.textAt,
            item.p.align,
            TABLE.size,
            TABLE.leading,
            space,
          );
          top -= TABLE.leading;
        }
      });
      x += width;
    });
    w.advance(height);
  };
  for (const row of rows) drawRow(row);
}

function drawTable(w: Writer, table: ResolvedTable) {
  const total = table.cols.reduce((a, b) => a + b, 0);
  const widths = table.cols.map((c) => (c / total) * CONTENT_W);
  const rows: Row[] = table.rows.map((cells, r) => ({
    header: r === 0 && table.role !== 'execution',
    cells: cells.map((paragraphs) => paragraphs.map((p) => ({ kind: 'p' as const, p }))),
  }));
  w.gap(4);
  drawRows(w, widths, rows, table.role !== 'execution');
  w.advance(8);
}

const para = (
  text: string | ResolvedRun[],
  options: Partial<Pick<ResolvedParagraph, 'align'>> & { bold?: boolean } = {},
): ResolvedParagraph => ({
  kind: 'p',
  heading: false,
  label: null,
  labelAt: 0,
  textAt: 0,
  align: options.align ?? 'left',
  pageBreak: false,
  runs:
    typeof text === 'string'
      ? [{ text, bold: Boolean(options.bold), italic: false, underline: false }]
      : text,
});

const run = (text: string, bold = false): ResolvedRun => ({
  text,
  bold,
  italic: false,
  underline: false,
});

/*
 * The execution block of a signed agreement, in the layout of the
 * original's table: NexG's signature with its signatory, then the
 * merchant's electronic acceptance. The original's "In the presence of …
 * ADVOCATE" rows become the electronic signature and acceptance records.
 */
function drawExecution(w: Writer, e: ExecutionBlock, signature: PDFImage | null) {
  const widths = [CONTENT_W * 0.36, CONTENT_W * 0.64];
  const signatureItems: CellItem[] = [];
  if (signature) {
    const scale = Math.min(150 / signature.width, 52 / signature.height, 1);
    signatureItems.push({
      kind: 'image',
      image: signature,
      width: signature.width * scale,
      height: signature.height * scale,
    });
  } else signatureItems.push({ kind: 'space', height: 40 });
  const rows: Row[] = [
    {
      header: false,
      cells: [
        [
          { kind: 'p', p: para([run('SIGNED', true), run(' for and on behalf of')]) },
          { kind: 'p', p: para(e.company.name, { bold: true }) },
        ],
        [
          ...signatureItems,
          { kind: 'p', p: para('..................................................') },
          { kind: 'p', p: para(`Name: ${e.company.signatoryName}`) },
          { kind: 'p', p: para(e.company.signatoryTitle) },
        ],
      ],
    },
    {
      header: false,
      cells: [
        [{ kind: 'p', p: para('Electronic signature') }],
        [
          {
            kind: 'p',
            p: para(
              `Signed electronically for ${e.company.name === 'NEXGENIUS CONCIERGE LIMITED' ? COMPANY_NAME : e.company.name} on ${formatNairobi(e.company.signedAt)}, on approval of the Merchant’s onboarding.`,
            ),
          },
        ],
      ],
    },
    {
      header: false,
      cells: [
        [
          { kind: 'p', p: para([run('SIGNED', true), run(' for and on behalf of the')]) },
          { kind: 'p', p: para('MERCHANT', { bold: true }) },
        ],
        [
          { kind: 'p', p: para('Accepted electronically (see the record below)') },
          { kind: 'p', p: para(`Name: ${e.merchant.signatoryName}`) },
          { kind: 'p', p: para(`Title: ${e.merchant.signatoryTitle}`) },
        ],
      ],
    },
    {
      header: false,
      cells: [
        [{ kind: 'p', p: para('Electronic acceptance record') }],
        [
          { kind: 'p', p: para(`Accepted by: ${e.acceptance.name}, ${e.acceptance.title}`) },
          { kind: 'p', p: para(`Account email: ${e.acceptance.accountEmail}`) },
          { kind: 'p', p: para(`Date and time: ${formatNairobi(e.acceptance.acceptedAt)}`) },
          {
            kind: 'p',
            p: para(
              `Agreement accepted: NexG Merchant Agreement – ${e.acceptance.category}, version ${e.acceptance.version}`,
            ),
          },
          {
            kind: 'p',
            p: para(
              `How: ticked “I have read and agree to the NexG Merchant Agreement for ${e.acceptance.categoryName ?? e.acceptance.category}” while signed in to NexG as the account above.`,
            ),
          },
          { kind: 'p', p: para(`Acceptance reference: ${e.acceptance.reference}`) },
        ],
      ],
    },
  ];
  w.gap(4);
  drawRows(w, widths, rows, false);
  w.advance(8);
}

/* -------------------------------------------------------- page furniture */

/**
 * The full NexG letterhead across the top of a first page: the logo on the
 * left, the company and its contact lines on the right, a gold rule under
 * them. Agreements and client invoices share it.
 */
export function drawLetterhead(
  page: PDFPage,
  fonts: Fonts,
  letterhead: Letterhead,
  logo: PDFImage | null,
) {
  const top = PAGE_H - 34;
  if (logo) {
    const height = 64;
    const width = (logo.width / logo.height) * height;
    page.drawImage(logo, { x: MARGIN_X, y: top - height, width, height });
  }
  const right = PAGE_W - MARGIN_X;
  const lines: { text: string; font: PDFFont; size: number; color: typeof INK }[] = [
    { text: COMPANY_NAME.toUpperCase(), font: fonts.bold, size: 11, color: INK },
    { text: letterhead.registeredOffice, font: fonts.regular, size: 8.5, color: MUTED },
    {
      text: `P.O. Box ${letterhead.poBox}, Nairobi, Kenya`,
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    },
    {
      text: [letterhead.phone && `Tel ${formatPhone(letterhead.phone)}`, letterhead.email]
        .filter(Boolean)
        .join('   ·   '),
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    },
    {
      text: [letterhead.website, `Company No. ${COMPANY_NUMBER}`].filter(Boolean).join('   ·   '),
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    },
  ];
  let y = top - 11;
  for (const line of lines) {
    if (!line.text) continue;
    // Long office addresses wrap, right-aligned, within 300 pt.
    const runs = [
      { text: line.text, bold: line.font === fonts.bold, italic: false, underline: false },
    ];
    for (const l of layoutLines(runs, 300, fonts, line.size)) {
      const text = l.words.map((word) => word.pieces.map((p) => p.text).join('')).join(' ');
      const width = widthOf(line.font, text, line.size);
      drawString(page, text, {
        x: right - width,
        y,
        size: line.size,
        font: line.font,
        color: line.color,
      });
      y -= line.size + 3.5;
    }
  }
  const ruleY = Math.min(top - 74, y - 2);
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: right, y: ruleY },
    thickness: 1.4,
    color: GOLD,
  });
}

function drawRunningHeader(page: PDFPage, fonts: Fonts, title: string, logo: PDFImage | null) {
  const top = PAGE_H - 34;
  if (logo) {
    const height = 28;
    page.drawImage(logo, {
      x: MARGIN_X,
      y: top - height,
      width: (logo.width / logo.height) * height,
      height,
    });
  }
  const text = `Merchant Agreement – ${title}`;
  const size = 8.5;
  drawString(page, text, {
    x: PAGE_W - MARGIN_X - widthOf(fonts.regular, text, size),
    y: top - 18,
    size,
    font: fonts.regular,
    color: MUTED,
  });
  page.drawLine({
    start: { x: MARGIN_X, y: top - 34 },
    end: { x: PAGE_W - MARGIN_X, y: top - 34 },
    thickness: 0.6,
    color: GOLD,
  });
}

function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  title: string,
  number: number,
  total: number,
  options: RenderOptions,
) {
  const size = 8;
  const y = 44;
  page.drawLine({
    start: { x: MARGIN_X, y: y + 12 },
    end: { x: PAGE_W - MARGIN_X, y: y + 12 },
    thickness: 0.5,
    color: RULE,
  });
  const left = `${COMPANY_NAME} | Merchant Agreement – ${title}`;
  drawString(page, left, { x: MARGIN_X, y, size, font: fonts.regular, color: MUTED });
  const right = `Page ${number} of ${total}`;
  drawString(page, right, {
    x: PAGE_W - MARGIN_X - widthOf(fonts.regular, right, size),
    y,
    size,
    font: fonts.regular,
    color: MUTED,
  });
  const details = [options.reference && `Ref ${options.reference}`, `Version ${options.version}`]
    .filter(Boolean)
    .join('   ·   ');
  drawString(page, details, { x: MARGIN_X, y: y - 11, size: 7, font: fonts.regular, color: MUTED });
}

/* ------------------------------------------------------------------ main */

export async function renderAgreementPdf(
  doc: AgreementDocument,
  options: RenderOptions,
): Promise<{ bytes: Uint8Array; pages: number }> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  charset = null;
  const logo = options.logo ? await pdf.embedPng(options.logo) : null;
  const signature = options.signature
    ? options.signature.type === 'png'
      ? await pdf.embedPng(options.signature.bytes)
      : await pdf.embedJpg(options.signature.bytes)
    : null;

  const letterhead = options.letterhead;
  const w = new Writer(
    pdf,
    fonts,
    letterhead ? TOP_FIRST : TOP_PLAIN,
    letterhead ? TOP_NEXT : TOP_PLAIN,
  );

  // The cover: the paragraphs before the first empty one, spaced down the page.
  const blocks = doc.blocks;
  const coverEnd = blocks.findIndex((b) => b.kind === 'p' && b.runs.every((r) => !r.text.trim()));
  w.advance(letterhead ? 70 : 110);
  for (const block of blocks.slice(0, Math.max(0, coverEnd))) {
    if (block.kind !== 'p') continue;
    const lines = layoutLines(block.runs, CONTENT_W, fonts, 12.5);
    for (const line of lines) {
      drawLine(
        w.page,
        line,
        MARGIN_X,
        w.y,
        CONTENT_W,
        'center',
        12.5,
        18,
        widthOf(fonts.regular, ' ', 12.5),
      );
      w.advance(18);
    }
    w.advance(30);
  }
  w.newPage();

  const rest = blocks.slice(coverEnd + 1);
  rest.forEach((block, index) => {
    if (block.kind === 'p') {
      const next = rest[index + 1];
      drawParagraph(w, block, next && next.kind === 'p' ? next : null);
    } else if (block.kind === 'table') drawTable(w, block);
    else drawExecution(w, block, signature);
  });

  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    if (letterhead) {
      if (i === 0) drawLetterhead(page, fonts, letterhead, logo);
      else drawRunningHeader(page, fonts, doc.title, logo);
    }
    drawFooter(page, fonts, doc.title, i + 1, total, options);
  });

  pdf.setTitle(`NexG Merchant Agreement – ${doc.title}`);
  pdf.setAuthor(COMPANY_NAME);
  pdf.setCreator('NexG');
  pdf.setProducer('NexG');
  if (options.metadata?.subject) pdf.setSubject(options.metadata.subject);
  if (options.metadata?.keywords) pdf.setKeywords(options.metadata.keywords);
  const created = options.metadata?.createdAt ?? new Date(0);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  return { bytes: await pdf.save(), pages: total };
}
