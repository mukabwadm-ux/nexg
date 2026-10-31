import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBookingInstant } from '../src/time.js';
test('booking instants represent Kenya and UTC offsets consistently', () => {
  assert.equal(
    parseBookingInstant('2030-01-01T09:00:00+03:00'),
    parseBookingInstant('2030-01-01T06:00:00Z'),
  );
});
test('timezone-less and impossible calendar inputs are rejected', () => {
  for (const input of [
    '2030-01-01T09:00:00',
    '2030-02-30T09:00:00+03:00',
    '2030-13-01T09:00:00+03:00',
    '2030-01-01T24:00:00+03:00',
    'January 1 2030Z',
  ])
    assert.throws(() => parseBookingInstant(input));
});
test('real leap dates remain accepted', () => {
  assert.equal(
    parseBookingInstant('2032-02-29T09:00:00+03:00'),
    Date.parse('2032-02-29T09:00:00+03:00'),
  );
});
