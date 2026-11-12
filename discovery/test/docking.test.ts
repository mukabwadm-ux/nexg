import test from 'node:test';
import assert from 'node:assert/strict';
import { headerReachOf, isCompactHeader, sectionLanding, shouldDock } from '../src/components/storefronts/SectionNav';

// Discovery's bar on a phone (styles.css): 115px tall, and its 52px location row scrolls away. On its own it is at
// the very top, so its sticky top is -52px. On the NexG website it pins under the 61px site header: 61 - 52 = 9px.
const PHONE_BAR = { height: 115, collapse: 52 };
const SITE_HEADER = { phone: 61, laptop: 65 };

test('the pinned bar reaches its sticky top plus its height', () => {
  assert.equal(headerReachOf(PHONE_BAR.height, -PHONE_BAR.collapse), 63, 'on its own, only the search row stays');
  assert.equal(headerReachOf(PHONE_BAR.height, SITE_HEADER.phone - PHONE_BAR.collapse), 124, 'on the website, under the site header');
  assert.equal(headerReachOf(79, 0), 79, 'wider screens pin the whole bar');
  assert.equal(headerReachOf(79, SITE_HEADER.laptop), 144, 'and under the site header on the website');
  assert.equal(headerReachOf(79, Number.NaN), 79, 'an unreadable top counts as zero');
});

test('phones dock the store bar where it would meet the bar above, and only phones', () => {
  const reach = headerReachOf(PHONE_BAR.height, SITE_HEADER.phone - PHONE_BAR.collapse);
  assert.equal(shouldDock(true, 488, reach), false, 'below the hero: not yet');
  assert.equal(shouldDock(true, 125, reach), false, 'one pixel short of the bar');
  assert.equal(shouldDock(true, 124, reach), true, 'touching the bar docks it');
  assert.equal(shouldDock(true, -900, reach), true, 'deep in the list it stays docked');
  assert.equal(shouldDock(false, -900, 144), false, 'wider screens keep the bar and never dock');
});

test('a chip lands its section just under the store bar: docked at the top on phones, under the bars elsewhere', () => {
  assert.equal(sectionLanding(true, 124, 112, SITE_HEADER.phone), 185, 'phones on the website: 61px site header, 112px bar, 12px gap');
  assert.equal(sectionLanding(true, 63, 112), 124, 'Discovery on its own: the bar docks at the very top');
  assert.equal(sectionLanding(false, 144, 68), 224, 'laptops: under both headers (144px) and the 68px bar');
});

test('the phone bar settles into its search row once the location row has scrolled away', () => {
  assert.equal(isCompactHeader(true, PHONE_BAR.collapse, 0), false);
  assert.equal(isCompactHeader(true, PHONE_BAR.collapse, 51), false);
  assert.equal(isCompactHeader(true, PHONE_BAR.collapse, 52), true);
  assert.equal(isCompactHeader(false, 0, 2000), false, 'wider screens keep the full bar');
  assert.equal(isCompactHeader(true, 0, 2000), false, 'no collapsing rows, no compact row');
});
