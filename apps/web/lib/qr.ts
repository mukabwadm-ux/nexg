import QRCode from 'qrcode';

/**
 * Drawing the card.
 *
 * The QR encodes the canonical URL and nothing else — no query
 * parameters a print shop could mangle, no third-party redirector
 * that could expire. Error-correction level H so the NexG mark can
 * sit in the middle and a card that has been wiped down a hundred
 * times still scans.
 *
 * Everything here is pure: given a code it returns the same bytes, so
 * a card reprinted next year is the card that is already on the
 * fridge.
 */

export const QR_ORIGIN = 'https://nexgapp.com';

export function qrUrl(code: string): string {
  return `${QR_ORIGIN}/q/${code.toUpperCase()}`;
}

/** The gold is only legible on the dark squares at this size. */
const INK = '#141414';
const PAPER = '#FFFFFF';

/**
 * The scannable square, as SVG.
 *
 * `margin: 2` is the quiet zone. Printers trim, and a QR with no
 * quiet zone is a QR that works on screen and fails on card.
 */
export async function qrSvg(code: string, opts?: { size?: number }): Promise<string> {
  const box = opts?.size ?? 512;

  const svg = await QRCode.toString(qrUrl(code), {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: box,
    color: { dark: INK, light: PAPER },
  });

  /*
   * The centre mark, drawn in the SVG's own units.
   *
   * This matters and is easy to get wrong: the generated SVG has a
   * pixel width but a viewBox measured in QR *modules* — 37 units
   * across for a code this size, not 512. A badge positioned in
   * pixels lands entirely off the canvas and silently does nothing,
   * which is what the first version of this did.
   *
   * Level H tolerates about 30% loss; this plate covers roughly 5%
   * of the area, dead centre, away from the three finder patterns.
   * It is drawn opaque rather than as an overlay, because a
   * half-covered module reads worse to a scanner than a missing one.
   */
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  if (!viewBox) return svg;

  const units = Number(viewBox[1]);
  const plate = Math.max(5, Math.round(units * 0.22));
  const x = (units - plate) / 2;
  const r = plate * 0.2;

  const mark =
    `<g>` +
    `<rect x="${x}" y="${x}" width="${plate}" height="${plate}" rx="${r}" fill="${PAPER}"/>` +
    `<rect x="${x + 0.6}" y="${x + 0.6}" width="${plate - 1.2}" height="${plate - 1.2}" ` +
    `rx="${r * 0.85}" fill="${INK}"/>` +
    `<text x="${units / 2}" y="${units / 2}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Manrope, Arial, sans-serif" font-weight="800" ` +
    `font-size="${plate * 0.46}" fill="#D4A72C">NX</text>` +
    `</g>`;

  return svg.replace('</svg>', `${mark}</svg>`);
}

/** The same square as PNG bytes, for anything that cannot take SVG. */
export async function qrPng(code: string, size = 1200): Promise<Buffer> {
  return QRCode.toBuffer(qrUrl(code), {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: size,
    type: 'png',
    color: { dark: INK, light: PAPER },
  });
}

/**
 * A code is six characters from a 30-letter alphabet with no
 * look-alikes. Checked here as well as in the database so a typo in
 * the URL bar is a 404 rather than a round trip.
 */
export const CODE_PATTERN = /^NXG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

export function normaliseCode(raw: string): string | null {
  const code = decodeURIComponent(raw ?? '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '');
  /* People type it without the prefix. Accept that rather than
     making them guess. */
  const full = code.startsWith('NXG-') ? code : `NXG-${code}`;
  return CODE_PATTERN.test(full) ? full : null;
}

export const PLACEMENT_LABEL: Record<string, string> = {
  counter: 'Kitchen counter',
  fridge: 'Fridge',
  door: 'By the door',
  welcome_book: 'Welcome book',
  bedside: 'Bedside',
  lobby: 'Lobby',
  pool: 'Pool',
  other: 'Other',
};
