import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { categories, currentTaxonomyIds, findCategory, homepageCategories } from '../src/data/taxonomy';
import { webIcons } from '../src/data/webIcons.generated';

// Discovery's navigation is NexG's master category list (owner, 16 Nov 2026). These checks read files only.
interface MasterSubcategory { id: string; name: string; group?: string }
const master = JSON.parse(readFileSync('../packages/contracts/src/data/category-master.json', 'utf8')) as {
  categories: { id: string; name: string; subcategories: MasterSubcategory[] }[];
  retiredCategories: Record<string, string>;
};
const navigation = JSON.parse(readFileSync('docs/discovery/MASTER_NAVIGATION.json', 'utf8')) as {
  categories: { icon_reference: string; subcategories: { icon_reference: string | null }[] }[];
};

test('the navigation file is what the master list and the overlay produce today', () => {
  const run = spawnSync(process.execPath, ['scripts/taxonomy/build.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('Discovery shows the 21 master categories in master order, with their names and their subcategories', () => {
  assert.deepEqual(categories.map((category) => [category.supabaseKey, category.label]), master.categories.map((category) => [category.id, category.name]));
  assert.deepEqual(homepageCategories.map((category) => category.id), categories.map((category) => category.id));
  for (const [index, category] of categories.entries()) {
    assert.deepEqual(category.subcategories.map((subcategory) => [subcategory.supabaseKey, subcategory.label, subcategory.group]),
      master.categories[index]!.subcategories.map((subcategory) => [subcategory.id, subcategory.name, subcategory.group]), category.id);
  }
  // Wellness keeps the master list's group headings, in order.
  const groups = [...new Set(findCategory('wellness')!.subcategories.map((subcategory) => subcategory.group))];
  assert.deepEqual(groups, ['Spa & Massage', 'Salon Services', 'Barber Services', 'Fitness & Gym', 'Nutrition & Diet', 'Sports & Training',
    'Recovery & Relaxation', 'Wellness Programs', 'Wellness Products']);
  // Retired categories are gone, not hidden.
  for (const retired of ['Health', 'Financial Services', 'Flights', 'Play', 'Vehicle Services', 'Activities, Games & Sports', 'Health And Pharmacy', 'Beauty And Wellness']) {
    assert.ok(!categories.some((category) => category.label === retired), retired);
  }
});

test('every category draws a pack icon; a subcategory draws its own pack icon or else its category’s', () => {
  const pack = (reference: string) => webIcons.has(reference.replace(/^references\/icons-v1\.1\/NexG_Discovery_Icons\//, ''));
  for (const [index, category] of categories.entries()) {
    const entry = navigation.categories[index]!;
    assert.ok(pack(entry.icon_reference) && category.icon, category.id);
    for (const [position, subcategory] of category.subcategories.entries()) {
      const reference = entry.subcategories[position]!.icon_reference;
      if (reference) assert.ok(pack(reference), `${subcategory.id} names a pack icon`);
      assert.equal(subcategory.icon, reference ? subcategory.icon : category.icon, subcategory.id);
      assert.ok(subcategory.icon, subcategory.id);
    }
  }
});

test('old Discovery ids still open the page their stores moved to', () => {
  assert.deepEqual(currentTaxonomyIds('health-pharmacy'), { categoryId: 'pharmacy', subcategoryId: undefined });
  assert.deepEqual(currentTaxonomyIds('play'), { categoryId: 'games-sports', subcategoryId: undefined });
  assert.deepEqual(currentTaxonomyIds('beauty-wellness', 'beauty-wellness:massage'), { categoryId: 'wellness', subcategoryId: 'wellness:swedish-massage' });
  assert.deepEqual(currentTaxonomyIds('restaurants-food', 'restaurants-food:caf'), { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:cafes-bakeries-pastries' });
  assert.deepEqual(currentTaxonomyIds('restaurants-food', 'restaurants-food:catering'), { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:catering' });
  // Every category the master list retired has a Discovery page to land on.
  for (const target of Object.values(master.retiredCategories)) assert.ok(categories.some((category) => category.supabaseKey === target), target);
});
