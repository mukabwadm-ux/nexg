import { createHash } from 'node:crypto';

import {
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { create as createQr } from 'qrcode';

import { formatPhone } from '../document';
import { PAGE_H, PAGE_W, drawString, printable, widthOf, wrapText, type Fonts } from '../pdf';
import { DOC_LOGO_PNG_BASE64, DOC_MARK_PNG_BASE64 } from './assets.generated';
import type { DocumentCompany } from './company';
import { ICONS, type IconName } from './icons';

/**
 * The drawing kit for NexG's branded finance documents, after the owner's
 * mockups: the logo, a gold divider and the company block across the top,
 * a big bold title with the reference under it, cream cards, black table
 * heads, cream total bars, a faint gold pin at the bottom right and a
 * gold-and-black slanted bar at the foot.
 *
 * pdf-lib and the standard Helvetica fonts only, like the agreements, so it
 * runs in a serverless function and the same document gives the same
 * bytes. Positions here are measured from the top of the page (pdf-lib's
 * own run from the bottom); `y` is always a text baseline or a box's top.
 */

export { PAGE_H, PAGE_W };

const hex = (value: string): Color => {
  const n = Number.parseInt(value.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export const C = {
  gold: hex('#D2AF26'),
  goldDeep: hex('#B99A21'),
  goldLight: hex('#E0C767'),
  /* Gold for text on light grounds (the site's text-gold-text). */
  goldText: hex('#826D18'),
  cream: hex('#FBF5E6'),
  creamDeep: hex('#F6EACB'),
  creamLine: hex('#EFE0B6'),
  ink: hex('#141414'),
  black: hex('#1C1C1C'),
  muted: hex('#5E5E5E'),
  rule: hex('#DADADA'),
  zebra: hex('#F3F3F3'),
  panel: hex('#F4F4F4'),
  track: hex('#EBEBEB'),
  white: rgb(1, 1, 1),
  green: hex('#2E9440'),
  greenDeep: hex('#23772F'),
} as const;

/** Side margin, after the mockups' cards and bars. */
export const EDGE = 22;
export const LEFT = EDGE;
export const RIGHT = PAGE_W - EDGE;
export const WIDTH = RIGHT - LEFT;
/** Where the body starts, under the header's gold rule. */
export const BODY_TOP = 158;
/** The lowest a body may reach before the foot of the page. */
export const BODY_BOTTOM = 770;

type Align = 'left' | 'right' | 'center';
type Weight = 'regular' | 'bold' | 'italic' | 'boldItalic';

export interface TextOptions {
  size?: number;
  weight?: Weight;
  color?: Color;
  align?: Align;
  /** Set smaller rather than run past this width. */
  maxWidth?: number;
  /** Extra space between letters, in points. */
  tracking?: number;
}

/* ---------------------------------------------------------------- formats */

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

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1724815 → "17,248.15". Exact: cents are never divided as floats. */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${group(String(Math.trunc(abs / 100)))}.${String(abs % 100).padStart(2, '0')}`;
}

/** Whole shillings without cents: 10000000 → "100,000"; 1050 → "10.50". */
export function moneyShort(cents: number): string {
  if (Math.round(cents) % 100 !== 0) return money(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}${group(String(Math.abs(Math.round(cents)) / 100))}`;
}

export const kes = (cents: number) => `KES ${moneyShort(cents)}`;

/** "2026-11-24" → "24 November 2026" (or "24 Nov 2026" when short). */
export function day(value: string, short = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2]!;
  return `${Number(m[3])} ${short ? month.slice(0, 3) : month} ${m[1]}`;
}

/** "2026-11-16", "2026-11-22" → "16–22 November 2026". */
export function dayRange(from: string, to: string): string {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
  if (!a || !b) return `${day(from)} - ${day(to)}`;
  if (from.slice(0, 10) === to.slice(0, 10)) return day(from);
  if (a[1] === b[1] && a[2] === b[2]) return `${Number(a[3])}–${day(to)}`;
  if (a[1] === b[1]) return `${day(from).replace(` ${a[1]}`, '')} – ${day(to)}`;
  return `${day(from)} – ${day(to)}`;
}

/** "2026-11" → "November 2026". */
export function monthName(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : month;
}

/* ----------------------------------------------------------------- canvas */

export class Canvas {
  constructor(
    readonly pdf: PDFDocument,
    readonly page: PDFPage,
    readonly fonts: Fonts,
    readonly assets: Assets,
  ) {}

  font(weight: Weight = 'regular'): PDFFont {
    return this.fonts[weight];
  }

  width(text: string, size: number, weight: Weight = 'regular', tracking = 0): number {
    const font = this.font(weight);
    const shown = printable(text, font);
    return widthOf(font, shown, size) + tracking * Math.max(0, [...shown].length - 1);
  }

  /** Text on a baseline `y` from the top; returns the width drawn. */
  text(value: string, x: number, y: number, options: TextOptions = {}): number {
    const weight = options.weight ?? 'regular';
    const font = this.font(weight);
    const tracking = options.tracking ?? 0;
    let size = options.size ?? 10;
    let width = this.width(value, size, weight, tracking);
    if (options.maxWidth && width > options.maxWidth) {
      size = Math.max(5, (size * options.maxWidth) / width);
      width = this.width(value, size, weight, tracking);
    }
    const align = options.align ?? 'left';
    const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    const color = options.color ?? C.ink;
    if (!tracking) {
      drawString(this.page, value, { x: left, y: PAGE_H - y, size, font, color });
    } else {
      let at = left;
      for (const ch of printable(value, font)) {
        drawString(this.page, ch, { x: at, y: PAGE_H - y, size, font, color });
        at += widthOf(font, ch, size) + tracking;
      }
    }
    return width;
  }

  /** Plain text wrapped to a width, one string per line. */
  paragraphLines(value: string, width: number, size: number, bold = false): string[] {
    return wrapText(value, width, this.fonts, size, bold);
  }

  /** Text wrapped to a width, one line every `leading`; returns the lines drawn. */
  paragraph(
    value: string,
    x: number,
    y: number,
    width: number,
    options: TextOptions & { leading?: number } = {},
  ): number {
    const size = options.size ?? 10;
    const lines = wrapText(value, width, this.fonts, size, options.weight === 'bold');
    lines.forEach((line, i) =>
      this.text(line, x, y + i * (options.leading ?? size * 1.3), {
        ...options,
        maxWidth: undefined,
      }),
    );
    return lines.length;
  }

  /** A label in bold and its value after it, on one baseline. */
  labelled(label: string, value: string, x: number, y: number, size: number, maxWidth?: number) {
    const lw = this.text(label, x, y, { size, weight: 'bold' });
    this.text(` ${value}`, x + lw, y, { size, maxWidth: maxWidth ? maxWidth - lw : undefined });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Color = C.rule, thickness = 0.6) {
    this.page.drawLine({
      start: { x: x1, y: PAGE_H - y1 },
      end: { x: x2, y: PAGE_H - y2 },
      thickness,
      color,
    });
  }

  rect(x: number, y: number, w: number, h: number, color: Color, opacity = 1) {
    this.page.drawRectangle({ x, y: PAGE_H - y - h, width: w, height: h, color, opacity });
  }

  /** A rounded box; `corners` picks which corners are round (tl, tr, br, bl). */
  box(
    x: number,
    y: number,
    w: number,
    h: number,
    options: {
      fill?: Color;
      border?: Color;
      borderWidth?: number;
      radius?: number;
      corners?: [boolean, boolean, boolean, boolean];
      opacity?: number;
    },
  ) {
    const r = Math.min(options.radius ?? 0, w / 2, h / 2);
    const [tl = 0, tr = 0, br = 0, bl = 0] = (options.corners ?? [true, true, true, true]).map(
      (c) => (c ? r : 0),
    );
    const path =
      `M${tl} 0H${w - tr}` +
      (tr ? `A${tr} ${tr} 0 0 1 ${w} ${tr}` : '') +
      `V${h - br}` +
      (br ? `A${br} ${br} 0 0 1 ${w - br} ${h}` : '') +
      `H${bl}` +
      (bl ? `A${bl} ${bl} 0 0 1 0 ${h - bl}` : '') +
      `V${tl}` +
      (tl ? `A${tl} ${tl} 0 0 1 ${tl} 0` : '') +
      'Z';
    this.page.drawSvgPath(path, {
      x,
      y: PAGE_H - y,
      color: options.fill,
      borderColor: options.border,
      borderWidth: options.border ? (options.borderWidth ?? 0.8) : 0,
      opacity: options.opacity,
      borderOpacity: options.opacity,
    });
  }

  /** A rounded box filled with a left-to-right gradient. */
  gradientBox(x: number, y: number, w: number, h: number, radius: number, from: Color, to: Color) {
    const bottom = PAGE_H - y - h;
    const r = Math.min(radius, w / 2, h / 2);
    const k = 0.5523 * r;
    this.page.pushOperators(
      pushGraphicsState(),
      moveTo(x + r, bottom),
      lineTo(x + w - r, bottom),
      appendBezierCurve(x + w - r + k, bottom, x + w, bottom + r - k, x + w, bottom + r),
      lineTo(x + w, bottom + h - r),
      appendBezierCurve(
        x + w,
        bottom + h - r + k,
        x + w - r + k,
        bottom + h,
        x + w - r,
        bottom + h,
      ),
      lineTo(x + r, bottom + h),
      appendBezierCurve(x + r - k, bottom + h, x, bottom + h - r + k, x, bottom + h - r),
      lineTo(x, bottom + r),
      appendBezierCurve(x, bottom + r - k, x + r - k, bottom, x + r, bottom),
      closePath(),
      clip(),
      endPath(),
    );
    const steps = 48;
    const [a, b] = [channels(from), channels(to)];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      this.page.drawRectangle({
        x: x + (w * i) / steps,
        y: bottom,
        width: w / steps + 0.6,
        height: h,
        color: rgb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t),
      });
    }
    this.page.pushOperators(popGraphicsState());
  }

  /** An SVG path in page coordinates measured from the top. */
  path(d: string, color: Color, opacity = 1) {
    this.page.drawSvgPath(d, { x: 0, y: PAGE_H, color, opacity });
  }

  /** A closed shape from points measured from the top of the page. */
  polygon(points: [number, number][], color: Color, opacity = 1) {
    const [first, ...rest] = points;
    if (!first) return;
    const path = `M${first[0]} ${first[1]}` + rest.map(([px, py]) => `L${px} ${py}`).join('') + 'Z';
    this.page.drawSvgPath(path, { x: 0, y: PAGE_H, color, opacity });
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    color: Color,
    border?: { color: Color; width: number },
  ) {
    this.page.drawCircle({
      x: cx,
      y: PAGE_H - cy,
      size: r,
      color,
      borderColor: border?.color,
      borderWidth: border?.width ?? 0,
    });
  }

  /** A line icon `size` points square with its top-left at (x, y). */
  icon(name: IconName, x: number, y: number, size: number, color: Color = C.goldText, stroke = 2) {
    for (const d of ICONS[name]) {
      this.page.drawSvgPath(d, {
        x,
        y: PAGE_H - y,
        scale: size / 24,
        borderColor: color,
        borderWidth: stroke,
        borderLineCap: LineCapStyle.Round,
      });
    }
  }

  image(image: PDFImage, x: number, y: number, w: number, h: number, opacity = 1) {
    this.page.drawImage(image, { x, y: PAGE_H - y - h, width: w, height: h, opacity });
  }

  /** A QR code `size` points square with its top-left at (x, y), no quiet zone. */
  qr(value: string, x: number, y: number, size: number, color: Color = C.ink) {
    const qr = createQr(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const cell = size / n;
    for (let row = 0; row < n; row++) {
      let start = -1;
      for (let col = 0; col <= n; col++) {
        const dark = col < n && qr.modules.get(row, col);
        if (dark && start < 0) start = col;
        if (!dark && start >= 0) {
          this.rect(
            x + start * cell,
            y + row * cell,
            (col - start) * cell + 0.05,
            cell + 0.05,
            color,
          );
          start = -1;
        }
      }
    }
  }
}

function channels(color: Color): [number, number, number] {
  const c = color as unknown as { red: number; green: number; blue: number };
  return [c.red, c.green, c.blue];
}

/* ---------------------------------------------------------------- document */

export interface Assets {
  logo: PDFImage;
  mark: PDFImage;
}

export interface Book {
  pdf: PDFDocument;
  fonts: Fonts;
  assets: Assets;
  pages: Canvas[];
  addPage(): Canvas;
}

export async function newBook(): Promise<Book> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const assets: Assets = {
    logo: await pdf.embedPng(Buffer.from(DOC_LOGO_PNG_BASE64, 'base64')),
    mark: await pdf.embedPng(Buffer.from(DOC_MARK_PNG_BASE64, 'base64')),
  };
  const book: Book = {
    pdf,
    fonts,
    assets,
    pages: [],
    addPage() {
      const canvas = new Canvas(pdf, pdf.addPage([PAGE_W, PAGE_H]), fonts, assets);
      book.pages.push(canvas);
      return canvas;
    },
  };
  return book;
}

export interface RenderedDocument {
  bytes: Uint8Array;
  sha256: string;
  pages: number;
}

export async function finish(
  book: Book,
  meta: {
    title: string;
    subject: string;
    reference: string;
    createdAt: Date;
    company: DocumentCompany;
  },
): Promise<RenderedDocument> {
  const { pdf } = book;
  pdf.setTitle(meta.title);
  pdf.setAuthor(meta.company.legalName);
  pdf.setSubject(meta.subject);
  pdf.setKeywords([meta.reference]);
  pdf.setCreator('NexG');
  pdf.setProducer('NexG');
  pdf.setCreationDate(meta.createdAt);
  pdf.setModificationDate(meta.createdAt);
  const bytes = await pdf.save();
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pages: book.pages.length,
  };
}

/** The phone as printed: +254700000000 → "+254 700 000 000"; a placeholder as it is. */
export function phoneText(company: DocumentCompany): string {
  return company.phone.startsWith('+') ? formatPhone(company.phone) : company.phone;
}

/* ---------------------------------------------------------- page furniture */

/**
 * The header on every page: the NexG logo on the left, a gold divider, the
 * company block (name, KRA PIN, address, website, email and phone), and a
 * gold rule across the page under them.
 */
export function drawHeader(c: Canvas, company: DocumentCompany) {
  const logoH = 98;
  const logoW = (c.assets.logo.width / c.assets.logo.height) * logoH;
  c.image(c.assets.logo, (LEFT + 304) / 2 - logoW / 2, 32, logoW, logoH);

  const divider = 304;
  c.line(divider, 34, divider, 128, C.gold, 1.6);

  const x = divider + 18;
  const textX = x + 16;
  const room = RIGHT - textX;
  c.text(company.legalName, x, 48, { size: 13.5, weight: 'bold', maxWidth: RIGHT - x });
  const rows: [IconName, string[]][] = [
    ['idCard', [`KRA PIN: ${company.kraPin}`]],
    ['pin', [company.addressLine1, company.addressLine2]],
    ['globe', [company.website]],
    ['mail', [company.email]],
    ['phone', [phoneText(company)]],
  ];
  let y = 64.5;
  for (const [icon, lines] of rows) {
    c.icon(icon, x, y - 8.2, 10, C.goldText, 2);
    for (const line of lines) {
      c.text(line, textX, y, { size: 9, color: C.ink, maxWidth: room });
      y += 12;
    }
    y += 1.2;
  }
  c.line(LEFT, 141, RIGHT, 141, C.gold, 1.6);
}

/** The faint gold pin, `w` points wide with its top-left at (x, y). */
export function drawWatermark(c: Canvas, x: number, y: number, w: number) {
  const mark = c.assets.mark;
  c.image(mark, x, y, w, (mark.height / mark.width) * w, 0.16);
}

/** The gold-and-black slanted bar across the foot of the page, `y` its top. */
export function drawFootBar(c: Canvas, y = 813, height = 9) {
  const split = LEFT + WIDTH * 0.62;
  const slant = height * 1.4;
  c.gradientBox(LEFT, y, split - LEFT, height, 0, C.goldDeep, C.gold);
  c.polygon(
    [
      [split - 1, y],
      [split + slant, y],
      [split + slant - slant, y + height],
      [split - 1, y + height],
    ],
    C.gold,
  );
  c.polygon(
    [
      [split + slant + 5, y - 1.5],
      [RIGHT, y - 1.5],
      [RIGHT, y + height],
      [split + 5, y + height],
    ],
    C.black,
  );
}

/**
 * The corporate line at the very foot: company, KRA PIN, address, website,
 * email and phone, with the page number when there is more than one.
 */
export function drawCorporateLine(
  c: Canvas,
  company: DocumentCompany,
  y: number,
  page?: { n: number; of: number },
) {
  const parts = [
    company.legalName,
    `KRA PIN ${company.kraPin}`,
    `${company.addressLine1}, ${company.addressLine2.replace(/, Kenya$/, '')}`,
    company.website,
    company.email,
    phoneText(company),
  ];
  if (page && page.of > 1) parts.push(`Page ${page.n} of ${page.of}`);
  c.text(parts.join('  ·  '), PAGE_W / 2, y, {
    size: 6.6,
    color: C.muted,
    align: 'center',
    maxWidth: WIDTH,
  });
}

/** The line that says the document is computer-generated and where to check it. */
export function drawVerifyLine(c: Canvas, what: string, reference: string, y: number) {
  c.text(`${what}  •  Verify at nexgapp.com/verify/${reference}`, PAGE_W / 2, y, {
    size: 9,
    weight: 'italic',
    color: C.ink,
    align: 'center',
    maxWidth: WIDTH,
  });
}

/** A QR code on a white tile with gold corner brackets, `size` points square. */
export function drawQrTile(
  c: Canvas,
  value: string,
  x: number,
  y: number,
  size: number,
  caption?: string,
) {
  c.box(x, y, size, size, { fill: C.white, radius: 4 });
  const pad = size * 0.08;
  c.qr(value, x + pad, y + pad, size - 2 * pad);
  const arm = size * 0.22;
  const t = 1.8;
  const o = -2;
  const corners: [number, number, number, number][] = [
    [x + o, y + o, 1, 1],
    [x + size - o, y + o, -1, 1],
    [x + o, y + size - o, 1, -1],
    [x + size - o, y + size - o, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    c.line(cx, cy, cx + dx * arm, cy, C.gold, t);
    c.line(cx, cy, cx, cy + dy * arm, C.gold, t);
  }
  if (caption)
    c.text(caption, x + size / 2, y + size + 9, { size: 6.5, color: C.muted, align: 'center' });
}

/** A heading's gold tab: the small upright bar before a section title. */
export function drawTab(c: Canvas, x: number, y: number, h: number) {
  c.rect(x, y, 8, h, C.gold);
}
