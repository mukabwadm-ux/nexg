/**
 * Does the card actually scan?
 *
 *   node apps/web/scripts/verify-qr.mjs
 *
 * Everything else about this feature can be right while the one
 * thing that matters is wrong, and a QR you cannot read looks
 * perfect in a screenshot. So this encodes a real code, occludes it
 * the way the printed card does, and decodes it the way a phone
 * would.
 *
 * The centre mark is modelled rather than rasterised. In the SVG it
 * is an opaque plate covering the middle 22% of the width — about 5%
 * of the area — so blanking that same square on the bitmap is an
 * accurate stand-in, and it saves pulling an SVG rasteriser into the
 * dependency tree for one assertion.
 *
 * The damage cases are not theoretical. A card lives on a kitchen
 * counter for a year: it gets wiped, sun-bleached, and has a coffee
 * cup put on it. Error-correction level H is chosen so that still
 * reads, and these are the assertions that prove the choice was
 * right rather than merely intended.
 */
import { readFileSync } from 'node:fs';

import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';

/*
 * The mark is read out of the generated TypeScript rather than
 * imported from it: importing a .ts file needs an experimental node
 * flag, and a verification script that only runs with the right
 * flag is one that stops being run.
 */
const QR_MARK_PNG = /'(data:image\/png;base64,[^']+)'/.exec(
  readFileSync(new URL('../lib/qr-mark.ts', import.meta.url), 'utf8'),
)?.[1];

if (!QR_MARK_PNG) {
  throw new Error('No mark in lib/qr-mark.ts — run scripts/build-brand-assets.py');
}

const CODES = ['NXG-4B7K2Q', 'NXG-TMZ5KN', 'NXG-ZZZZZZ', 'NXG-23456789'.slice(0, 10)];
/* The same origin the cards encode, so this verifies the real
   string rather than one that was true when it was written. */
const ORIGIN = (
  process.env.NEXT_PUBLIC_QR_ORIGIN ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://nexg-sepia.vercel.app'
).replace(/\/+$/, '');

function read(buffer) {
  const png = PNG.sync.read(buffer);
  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return found?.data ?? null;
}

/**
 * White out a square, as a fraction of the width, at a named spot.
 *
 * Where the damage lands matters more than how much of it there is.
 * Level H recovers about 30% of the *data* codewords — it does not
 * protect the three finder patterns in the corners, because those
 * are what tells a scanner there is a code here at all. Lose one and
 * the phone never starts decoding, whatever the error correction.
 * That is a property of QR, not of this implementation, and the
 * cases below are chosen to test each thing separately rather than
 * blame the wrong one.
 */
function occlude(buffer, { fraction, at }) {
  const png = PNG.sync.read(buffer);
  const side = Math.round(png.width * fraction);

  /* Fractions of the width for the top-left of the bite. */
  const spot = {
    centre: [(1 - fraction) / 2, (1 - fraction) / 2],
    /* Bottom-right data region: no finder pattern lives here. */
    data: [0.58, 0.58],
    /* Straight through the top-left finder. */
    finder: [0.08, 0.08],
  }[at];

  const x0 = Math.round(png.width * spot[0]);
  const y0 = Math.round(png.height * spot[1]);

  for (let y = y0; y < y0 + side && y < png.height; y++) {
    for (let x = x0; x < x0 + side && x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      png.data[i] = 255;
      png.data[i + 1] = 255;
      png.data[i + 2] = 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const render = (code) =>
  QRCode.toBuffer(`${ORIGIN}/q/${code}`, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 512,
    type: 'png',
  });

let failures = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n        got ${actual}\n        want ${expected}`}`);
};

for (const code of CODES.slice(0, 2)) {
  const want = `${ORIGIN}/q/${code}`;
  const png = await render(code);

  check(`${code} · clean`, read(png), want);

  /* The centre mark, as drawn. */
  check(
    `${code} · with the NX mark over the middle 22%`,
    read(occlude(png, { fraction: 0.22, at: 'centre' })),
    want,
  );

  /*
   * A year on a counter: the mark, plus a wipe mark across the data.
   *
   * 10%, not the 30% the level-H specification implies. That figure
   * is codeword recovery under a decoder doing full Reed-Solomon
   * work; jsQR gives up earlier than a phone camera does, and 10%
   * is where this decoder was measured to still read reliably
   * rather than where the spec says it should. Asserting 30% here
   * would be quoting a number nothing in this repository has shown.
   */
  check(
    `${code} · mark plus a 10% scuff across the data`,
    read(occlude(occlude(png, { fraction: 0.22, at: 'centre' }), { fraction: 0.1, at: 'data' })),
    want,
  );
}

/*
 * The failure mode, which matters more than the threshold. Past
 * recovery the right behaviour is to read nothing — a card that
 * decoded to a *different* URL would send a guest to somebody
 * else's flat, and no amount of error correction would tell them.
 */
{
  const png = await render('NXG-4B7K2Q');
  const wrecked = read(occlude(png, { fraction: 0.3, at: 'data' }));
  check(
    'a card damaged past recovery reads as nothing, never as the wrong address',
    wrecked === null || wrecked === `${ORIGIN}/q/NXG-4B7K2Q`,
    true,
  );

  /*
   * And the limit, recorded rather than discovered later by a host
   * whose cards stopped working. The card layout keeps the label and
   * the text code clear of the square's corners for this reason.
   */
  const noFinder = read(occlude(png, { fraction: 0.15, at: 'finder' }));
  check(
    'damage over a finder pattern makes the card unreadable — level H does not cover the corners',
    noFinder,
    null,
  );
}


/*
 * And the real thing.
 *
 * Everything above models the mark as a blanked square, which is a
 * fair stand-in and is not the actual output. This composites the
 * NexG mark exactly as `qrPng` does — white roundel, box-filtered
 * logo, alpha blend — and decodes that. If the branding ever stops
 * scanning, this is the assertion that goes red.
 */
function stamp(qrBuffer) {
  const target = PNG.sync.read(qrBuffer);
  const mark = PNG.sync.read(
    Buffer.from(QR_MARK_PNG.slice(QR_MARK_PNG.indexOf(',') + 1), 'base64'),
  );

  const plate = Math.round(target.width * 0.22);
  const inset = Math.round(plate * 0.12);
  const x0 = Math.round((target.width - plate) / 2);
  const y0 = Math.round((target.height - plate) / 2);
  const radius = plate * 0.2;

  for (let y = 0; y < plate; y++) {
    for (let x = 0; x < plate; x++) {
      const dx = x < radius ? radius - x : x > plate - radius ? x - (plate - radius) : 0;
      const dy = y < radius ? radius - y : y > plate - radius ? y - (plate - radius) : 0;
      if (dx * dx + dy * dy > radius * radius) continue;
      const i = ((y0 + y) * target.width + (x0 + x)) << 2;
      target.data[i] = 255; target.data[i + 1] = 255;
      target.data[i + 2] = 255; target.data[i + 3] = 255;
    }
  }

  const box = plate - inset * 2;
  const scale = mark.width / box;
  for (let y = 0; y < box; y++) {
    for (let x = 0; x < box; x++) {
      const sx0 = Math.floor(x * scale), sy0 = Math.floor(y * scale);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * scale));
      const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1 && sy < mark.height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < mark.width; sx++) {
          const j = (sy * mark.width + sx) << 2;
          const al = mark.data[j + 3] / 255;
          r += mark.data[j] * al; g += mark.data[j + 1] * al; b += mark.data[j + 2] * al;
          a += al; n += 1;
        }
      }
      if (n === 0) continue;
      const alpha = a / n;
      if (alpha <= 0.004) continue;
      const i = ((y0 + inset + y) * target.width + (x0 + inset + x)) << 2;
      target.data[i] = Math.round((r / a) * alpha + target.data[i] * (1 - alpha));
      target.data[i + 1] = Math.round((g / a) * alpha + target.data[i + 1] * (1 - alpha));
      target.data[i + 2] = Math.round((b / a) * alpha + target.data[i + 2] * (1 - alpha));
      target.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(target);
}

for (const code of CODES.slice(0, 2)) {
  const want = `${ORIGIN}/q/${code}`;
  const branded = stamp(await render(code));

  check(`${code} · with the real NexG mark composited`, read(branded), want);

  /* Branded AND scuffed, which is the card after a year. */
  check(
    `${code} · branded, plus a 10% scuff across the data`,
    read(occlude(branded, { fraction: 0.1, at: 'data' })),
    want,
  );
}

/* The mark must actually be there. A silently-missing logo would
   pass every scan test above, because a plain QR scans best. */
{
  const plain = PNG.sync.read(await render('NXG-4B7K2Q'));
  const branded = PNG.sync.read(stamp(await render('NXG-4B7K2Q')));
  let differing = 0;
  for (let i = 0; i < plain.data.length; i += 4) {
    if (plain.data[i] !== branded.data[i]) differing += 1;
  }
  const pctChanged = (differing / (plain.width * plain.height)) * 100;
  check(
    `the mark is actually drawn (${pctChanged.toFixed(1)}% of pixels changed)`,
    pctChanged > 1 && pctChanged < 10,
    true,
  );
}

console.log(failures === 0 ? '\nAll QR checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
