import test from 'node:test';
import assert from 'node:assert/strict';
import { headerReachOf, isCompactHeader, sectionLanding, shouldDock } from '../src/components/storefronts/SectionNav';

// Phone header (styles.css): 167px tall, its top 104px scroll away, so its last row reaches 63px down.
const PHONE_HEADER = { height: 167, stickyTop: -104 };

test('the pinned header reaches its height less the part that scrolls away', () => {
  assert.equal(headerReachOf(PHONE_HEADER.height, PHONE_HEADER.stickyTop), 63);
  assert.equal(headerReachOf(79, 0), 79, 'wider screens pin the whole header');
  assert.equal(headerReachOf(79, Number.NaN), 79, 'an unreadable top counts as zero');
  assert.equal(headerReachOf(79, 12), 79, 'a positive top never adds reach');
});

test('phones dock the store bar where it would meet the header, and only phones', () => {
  const reach = headerReachOf(PHONE_HEADER.height, PHONE_HEADER.stickyTop);
  assert.equal(shouldDock(true, 488, reach), false, 'below the hero: not yet');
  assert.equal(shouldDock(true, 64, reach), false, 'one pixel short of the header');
  assert.equal(shouldDock(true, 63, reach), true, 'touching the header docks it');
  assert.equal(shouldDock(true, -900, reach), true, 'deep in the list it stays docked');
  assert.equal(shouldDock(false, -900, 79), false, 'wider screens keep the header and never dock');
});

test('a chip lands its section just under the bar: docked at the top on phones, under the header elsewhere', () => {
  assert.equal(sectionLanding(true, 63, 112), 124, 'phones: 112px bar at the very top, then a 12px gap');
  assert.equal(sectionLanding(false, 79, 68), 159, 'laptops: under the 79px header and the 68px bar');
});

test('the phone header settles into one row once its top rows have scrolled away', () => {
  assert.equal(isCompactHeader(true, 104, 0), false);
  assert.equal(isCompactHeader(true, 104, 103), false);
  assert.equal(isCompactHeader(true, 104, 104), true);
  assert.equal(isCompactHeader(false, 0, 2000), false, 'wider screens keep the full header');
  assert.equal(isCompactHeader(true, 0, 2000), false, 'no collapsing rows, no compact row');
});
