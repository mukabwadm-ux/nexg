// Runs the booking-engine part of the seed on the server, inside the booking
// engine's own container, so its bridge secret never leaves the server:
//
//   docker cp scripts/review-merchants <container>:/tmp/review-merchants
//   docker exec <container> node /tmp/review-merchants/engine-runner.mjs > links.json
//
// Prints one JSON array of { id, kind, offeringId } on stdout (progress goes to
// stderr); seed.mjs --engine-links links.json then links the catalogue items.

import { shops } from './shops.mjs';
import { itemsOf, itemId, merchantId } from './sql.mjs';
import { bridge, setUpShop } from './engine.mjs';

const secret = process.env.BOOKING_BRIDGE_SECRET;
const port = process.env.PORT ?? process.env.BOOKING_PORT ?? '3003';
if (!secret) throw new Error('BOOKING_BRIDGE_SECRET is not set in this container.');
const service = `http://127.0.0.1:${port}`;
const only = process.argv[2]?.split(',');
const links = [];
for (const s of shops) {
  if (only && !only.includes(s.slug)) continue;
  const items = itemsOf(s)
    .filter((i) => i.engine)
    .map((i) => ({ ...i, id: itemId(s, i) }));
  if (!items.length) continue;
  console.error(`Bookings: ${s.name}`);
  links.push(
    ...(await setUpShop(bridge(service, secret, merchantId(s)), s, items, (m) => console.error(m))),
  );
}
console.log(JSON.stringify(links));
