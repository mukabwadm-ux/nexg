import QRCode from 'qrcode';

import { QR_MARK_PNG } from './qr-mark';

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

/**
 * Where a scanned card lands.
 *
 * This is the single most expensive constant in the codebase to get
 * wrong, because a printed card cannot be changed. The first version
 * hardcoded `nexgapp.com` — the canonical brand domain — and that
 * domain is served by something else entirely, so every card
 * generated pointed at a site that records nothing and the scans
 * vanished with no error anywhere.
 *
 * It now comes from the environment, and the fallback is the origin
 * this app is actually deployed at rather than the one it would like
 * to own. Set NEXT_PUBLIC_QR_ORIGIN to the branded domain once
 * `/q/*` on that domain reaches this application — and before any
 * quantity of cards is printed, because after that it is a reprint
 * rather than a config change.
 */
export const QR_ORIGIN = (
  process.env.NEXT_PUBLIC_QR_ORIGIN ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://nexg-sepia.vercel.app'
).replace(/\/+$/, '');

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
   * The NexG mark, drawn in the SVG's own units.
   *
   * This matters and is easy to get wrong: the generated SVG has a
   * pixel width but a viewBox measured in QR *modules* — 37 units
   * across for a code this size, not 512. A badge positioned in
   * pixels lands entirely off the canvas and silently does nothing,
   * which is what the first version of this did.
   *
   * Level H tolerates about 30% loss; this plate covers roughly 5%
   * of the area, dead centre, away from the three finder patterns.
   * The white plate is drawn first and the mark sits on it, because
   * the logo has transparent gaps and a half-covered module reads
   * worse to a scanner than a cleanly missing one.
   *
   * `apps/web/scripts/verify-qr.mjs` proves a code still decodes
   * with this exact square blanked out. Make the plate bigger and
   * that check has to be re-run, not assumed.
   */
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  if (!viewBox) return svg;

  const units = Number(viewBox[1]);
  const plate = Math.max(5, Math.round(units * 0.22));
  const x = (units - plate) / 2;
  const r = plate * 0.2;
  /* The mark sits inside the plate with a little air, so the white
     reads as a deliberate roundel rather than a printing fault. */
  const inset = plate * 0.12;

  const mark =
    `<g>` +
    `<rect x="${x}" y="${x}" width="${plate}" height="${plate}" rx="${r}" fill="${PAPER}"/>` +
    `<image href="${QR_MARK_PNG}" x="${x + inset}" y="${x + inset}" ` +
    `width="${plate - inset * 2}" height="${plate - inset * 2}" ` +
    `preserveAspectRatio="xMidYMid meet"/>` +
    `</g>`;

  return svg.replace('</svg>', `${mark}</svg>`);
}

/**
 * The same square as PNG bytes, with the same mark on it.
 *
 * The SVG gets its logo from an `<image>` tag; a bitmap has no such
 * luxury, so the plate and the mark are composited pixel by pixel.
 * It would be easy to skip — the printable card uses the SVG — and
 * that is exactly how you end up with a downloaded PNG that is
 * subtly not the card, which somebody then prints.
 */
export async function qrPng(code: string, size = 1200): Promise<Buffer> {
  const base = await QRCode.toBuffer(qrUrl(code), {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: size,
    type: 'png',
    color: { dark: INK, light: PAPER },
  });

  return stampMark(base);
}

/* Both measured as a fraction of the width, and kept in step with
   the SVG above: the two outputs have to be the same card. */
const PLATE_RATIO = 0.22;
const INSET_RATIO = 0.12;

/**
 * Draw the white roundel and the mark into the middle of a QR
 * bitmap.
 *
 * Hand-rolled because the alternative is an image-processing
 * dependency for one composite — and `pngjs` is already here for
 * the scan verifier, so the only thing missing was the resample and
 * the alpha blend.
 */
async function stampMark(qr: Buffer): Promise<Buffer> {
  const { PNG } = await import('pngjs');

  const target = PNG.sync.read(qr);
  const mark = PNG.sync.read(
    Buffer.from(QR_MARK_PNG.slice(QR_MARK_PNG.indexOf(',') + 1), 'base64'),
  );

  const plate = Math.round(target.width * PLATE_RATIO);
  const inset = Math.round(plate * INSET_RATIO);
  const x0 = Math.round((target.width - plate) / 2);
  const y0 = Math.round((target.height - plate) / 2);
  const radius = plate * 0.2;

  /* The roundel. Corners are tested against the arc centre so the
     QR modules show through them, which is what makes it read as a
     deliberate badge rather than a white square somebody dropped. */
  for (let y = 0; y < plate; y++) {
    for (let x = 0; x < plate; x++) {
      const dx = x < radius ? radius - x : x > plate - radius ? x - (plate - radius) : 0;
      const dy = y < radius ? radius - y : y > plate - radius ? y - (plate - radius) : 0;
      if (dx * dx + dy * dy > radius * radius) continue;

      const i = ((y0 + y) * target.width + (x0 + x)) << 2;
      target.data[i] = 255;
      target.data[i + 1] = 255;
      target.data[i + 2] = 255;
      target.data[i + 3] = 255;
    }
  }

  /* The mark, box-filtered down. Nearest-neighbour at this scale
     turns the thin speed lines into a dotted mess. */
  const box = plate - inset * 2;
  const scale = mark.width / box;

  for (let y = 0; y < box; y++) {
    for (let x = 0; x < box; x++) {
      const sx0 = Math.floor(x * scale);
      const sy0 = Math.floor(y * scale);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * scale));
      const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * scale));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;

      for (let sy = sy0; sy < sy1 && sy < mark.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < mark.width; sx++) {
          const j = (sy * mark.width + sx) << 2;
          const alpha = mark.data[j + 3]! / 255;
          /* Premultiplied, so a transparent black pixel does not
             drag the average towards black. */
          r += mark.data[j]! * alpha;
          g += mark.data[j + 1]! * alpha;
          b += mark.data[j + 2]! * alpha;
          a += alpha;
          n += 1;
        }
      }
      if (n === 0) continue;

      const alpha = a / n;
      if (alpha <= 0.004) continue;

      const i = ((y0 + inset + y) * target.width + (x0 + inset + x)) << 2;
      const sr = r / a;
      const sg = g / a;
      const sb = b / a;

      target.data[i] = Math.round(sr * alpha + target.data[i]! * (1 - alpha));
      target.data[i + 1] = Math.round(sg * alpha + target.data[i + 1]! * (1 - alpha));
      target.data[i + 2] = Math.round(sb * alpha + target.data[i + 2]! * (1 - alpha));
      target.data[i + 3] = 255;
    }
  }

  return PNG.sync.write(target);
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
