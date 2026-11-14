import { describe, expect, it } from 'vitest';

import { parseCsv, toCsv } from '@/lib/catalogue-csv';

import {
  OFFERINGS_CSV_COLUMNS,
  OFFERINGS_CSV_MAX_ROWS,
  offeringsExportCsv,
  offeringsTemplateCsv,
  planOfferingsImport,
  type ImportTarget,
} from './csv';
import { createOffering, profiles, type Offering } from './model';

const shop = profiles.find((p) => p.id === 'adult_products')!; // products: fixed or unit prices
const cakes = profiles.find((p) => p.id === 'cakes')!; // made to order: quote first
const banking = profiles.find((p) => p.id === 'banking')!; // regulated enquiry: no prices

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

/** A product draft as the editor saves it, complete enough to publish when asked. */
function product(name: string, section: string, extra: Partial<Offering> = {}): Offering {
  const item = createOffering(shop, shop.schema, newId());
  return {
    ...item,
    name,
    section,
    description: 'A product description.',
    price: '500',
    priceMode: 'fixed',
    version: 2,
    fields: { ...item.fields, sale_unit: 'item', stock_policy: 'Counted every morning.' },
    availabilityLinked: true,
    ...extra,
  };
}
const target = (offering: Offering): ImportTarget => ({
  id: offering.id,
  name: offering.name,
  category: offering.section ?? '',
  offering,
});
const csv = (...rows: string[][]) => toCsv([[...OFFERINGS_CSV_COLUMNS], ...rows]);
const plan = (text: string, targets: ImportTarget[] = [], profile = shop) =>
  planOfferingsImport(text, { profile, targets, newId });

describe('the template', () => {
  it('has the import columns and example rows that import cleanly', () => {
    const text = offeringsTemplateCsv(shop);
    expect(parseCsv(text).rows[0]).toEqual([...OFFERINGS_CSV_COLUMNS]);
    const result = plan(text);
    expect(result.errors).toEqual([]);
    expect(result.creates).toBe(2);
    expect(result.rows.every((r) => r.item?.profileId === shop.id)).toBe(true);
  });

  it('leaves prices blank for an activity priced by enquiry', () => {
    const [, first] = parseCsv(offeringsTemplateCsv(banking)).rows;
    expect(first![3]).toBe('');
    expect(plan(offeringsTemplateCsv(banking), [], banking).errors).toEqual([]);
  });
});

describe('matching', () => {
  it('updates the offering with the same name in the same category, ignoring case and spaces', () => {
    const tea = product('Masala tea', 'Drinks');
    const result = plan(csv(['  drinks ', 'MASALA   tea', 'Spiced.', '120', '']), [target(tea)]);
    expect(result.errors).toEqual([]);
    expect(result.updates).toBe(1);
    expect(result.rows[0]!.item!.id).toBe(tea.id);
    expect(result.rows[0]!.item!.version).toBe(tea.version);
  });

  it('adds a new offering when the same name is in another category', () => {
    const tea = product('Masala tea', 'Drinks');
    const result = plan(csv(['Breakfast', 'Masala tea', '', '120', '']), [target(tea)]);
    expect(result.creates).toBe(1);
    expect(result.rows[0]!.item!.id).not.toBe(tea.id);
  });

  it('changes nothing when a row matches its offering exactly, so a second import adds no copies', () => {
    const tea = product('Masala tea', 'Drinks', { publication: 'published' });
    const exported = offeringsExportCsv([tea]);
    const result = plan(exported, [target(tea)]);
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ creates: 0, updates: 0, unchanged: 1 });
    expect(result.rows[0]!.item).toBeUndefined();
  });

  it('refuses a row that matches two offerings', () => {
    const a = product('Juice', 'Drinks');
    const b = product('juice', 'drinks');
    const result = plan(csv(['Drinks', 'Juice', '', '100', '']), [target(a), target(b)]);
    expect(result.errors[0]!.message).toMatch(/2 of your offerings in Drinks are called "Juice"/);
  });

  it('refuses to duplicate an older catalogue entry the editor cannot change', () => {
    const result = plan(csv(['Menu', 'Chicken biryani', '', '950', '']), [
      { id: newId(), name: 'Chicken biryani', category: 'Menu' },
    ]);
    expect(result.errors).toEqual([
      {
        row: 2,
        message:
          '"Chicken biryani" in Menu is an older catalogue entry that Offerings cannot change. Leave this row out or give it another name.',
      },
    ]);
  });

  it('refuses the same offering twice in one file', () => {
    const result = plan(csv(['Mains', 'Stew', '', '100', ''], ['mains', 'stew', '', '120', '']));
    expect(result.errors).toEqual([{ row: 3, message: 'Row 2 already has "stew" in mains.' }]);
  });
});

describe('row checks', () => {
  it('names every problem with its row', () => {
    const result = plan(
      csv(
        ['', 'No category', '', '100', ''],
        ['Mains', '', '', '100', ''],
        ['Mains', 'Bad price', '', 'free', ''],
        ['Mains', 'Bad flag', '', '100', 'maybe'],
        ['Mains', 'x'.repeat(151), '', '100', ''],
        ['Mains', 'Long text', 'd'.repeat(401), '100', ''],
        ['Mains', 'Extra', '', '100', 'no', 'surplus'],
      ),
    );
    expect(result.errors.map((e) => [e.row, e.message])).toEqual([
      [2, 'Category is required.'],
      [3, 'Name is required.'],
      [4, 'Price must be a whole number of shillings from 1 to 1,000,000, such as 1500.'],
      [5, 'Available must be yes or no.'],
      [6, 'Name must be 150 characters or fewer.'],
      [7, 'Description must be 400 characters or fewer (it has 401).'],
      [8, 'This row has more cells than there are columns. Check for an unquoted comma.'],
    ]);
    expect(result.rows).toEqual([]);
  });

  it('reads prices written the way people write them', () => {
    const result = plan(
      csv(
        ['A', 'One', '', '1,250', ''],
        ['A', 'Two', '', 'KES 900', ''],
        ['A', 'Three', '', '75.00', ''],
      ),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.price)).toEqual(['1250', '900', '75']);
  });

  it('needs a price unless the activity prices by quote or enquiry', () => {
    expect(plan(csv(['A', 'No price', '', '', ''])).errors[0]!.message).toBe(
      'Enter a price: a whole number of shillings from 1 to 1,000,000.',
    );
    const quoted = plan(csv(['Cakes', 'Wedding cake', '', '', '']), [], cakes);
    expect(quoted.errors).toEqual([]);
    expect(quoted.rows[0]).toMatchObject({ priceMode: 'quote', price: '' });
    const fixed = plan(csv(['Cakes', 'Cupcakes', '', '600', '']), [], cakes);
    expect(fixed.rows[0]!.item!.priceMode).toBe('fixed');
    expect(
      plan(csv(['Accounts', 'Savings', '', '100', '']), [], banking).errors[0]!.message,
    ).toMatch(/priced by enquiry/);
  });

  it('checks the header', () => {
    expect(plan('category,name,price\r\nA,B,1\r\n').errors.map((e) => e.message)).toEqual([
      'Unknown column: price. The columns are category, name, description, price_kes, available.',
      'The "price_kes" column is missing.',
    ]);
    expect(plan(csv()).errors[0]!.message).toBe('The file has headers but no offerings.');
    expect(plan('').errors[0]!.message).toBe('The file is empty. Start from the template.');
  });

  it('takes up to the import limit in one file', () => {
    const many = Array.from({ length: OFFERINGS_CSV_MAX_ROWS + 1 }, (_, i) => [
      'Bulk',
      `Item ${i}`,
      '',
      '10',
      '',
    ]);
    expect(plan(csv(...many)).errors[0]!.message).toBe(
      `The file has ${OFFERINGS_CSV_MAX_ROWS + 1} offerings; import up to ${OFFERINGS_CSV_MAX_ROWS} at a time.`,
    );
    expect(plan(csv(...many.slice(1))).creates).toBe(OFFERINGS_CSV_MAX_ROWS);
  });

  it('keeps fields a file leaves out', () => {
    const tea = product('Masala tea', 'Drinks', { description: 'Kept as it is.' });
    const result = plan('category,name,price_kes\r\nDrinks,Masala tea,150\r\n', [target(tea)]);
    expect(result.rows[0]!.item).toMatchObject({ description: 'Kept as it is.', price: '150' });
  });

  it('undoes the apostrophe an export puts before a formula-like cell', () => {
    const result = plan(csv(['Drinks', "'=Tea", '', '100', '']));
    expect(result.rows[0]!.name).toBe('=Tea');
  });
});

describe('publication', () => {
  it('saves new offerings as drafts and says why one cannot be published yet', () => {
    const result = plan(csv(['Mains', 'Stew', 'Beef stew.', '100', 'yes']));
    expect(result.rows[0]).toMatchObject({ action: 'create', published: false, publish: null });
    expect(result.rows[0]!.notes[0]).toMatch(/^Stays a draft until it is complete: /);
  });

  it('publishes a complete draft when the row says available', () => {
    const tea = product('Masala tea', 'Drinks');
    const result = plan(csv(['Drinks', 'Masala tea', 'A product description.', '500', 'yes']), [
      target(tea),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ action: 'update', publish: true, published: true });
  });

  it('unpublishes a published offering when the row says no', () => {
    const tea = product('Masala tea', 'Drinks', { publication: 'published' });
    const result = plan(csv(['Drinks', 'Masala tea', 'A product description.', '500', 'no']), [
      target(tea),
    ]);
    expect(result.rows[0]).toMatchObject({ action: 'update', publish: false, published: false });
  });

  it('keeps a published offering published, and refuses a row that would leave it incomplete', () => {
    const tea = product('Masala tea', 'Drinks', { publication: 'published' });
    const kept = plan(csv(['Drinks', 'Masala tea', 'Now with ginger.', '550', '']), [target(tea)]);
    expect(kept.rows[0]).toMatchObject({ action: 'update', publish: null, published: true });
    const emptied = plan(csv(['Drinks', 'Masala tea', '', '550', '']), [target(tea)]);
    expect(emptied.errors[0]!.message).toBe(
      'This offering is published, so it must stay complete: Describe what the customer receives. Fix the row, or set available to no to unpublish it.',
    );
  });
});

describe('the export', () => {
  it('writes one row per offering in the import format, leaving out archived ones', () => {
    const rows = parseCsv(
      offeringsExportCsv([
        product('Masala tea', 'Drinks', { publication: 'published' }),
        product('Old tea', 'Drinks', { publication: 'archived' }),
      ]),
    ).rows;
    expect(rows).toEqual([
      [...OFFERINGS_CSV_COLUMNS],
      ['Drinks', 'Masala tea', 'A product description.', '500', 'yes'],
    ]);
  });
});
