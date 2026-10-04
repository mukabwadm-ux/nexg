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
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';

const CODES = ['NXG-4B7K2Q', 'NXG-TMZ5KN', 'NXG-ZZZZZZ', 'NXG-23456789'.slice(0, 10)];
const ORIGIN = 'https://nexgapp.com';

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

console.log(failures === 0 ? '\nAll QR checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
