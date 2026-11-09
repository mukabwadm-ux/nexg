import { describe, expect, it } from 'vitest';

import {
  CATALOGUE_CSV_COLUMNS,
  CATALOGUE_CSV_MAX_BYTES,
  CATALOGUE_CSV_MAX_ROWS,
  catalogueExportCsv,
  catalogueTemplateCsv,
  parseCsv,
  planCatalogueImport,
  toCsv,
} from './catalogue-csv';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const existing = [
  { id: ID_A, name: 'Chicken biryani' },
  { id: ID_B, name: 'Mango juice' },
];

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside quotes', () => {
    const { rows, error } = parseCsv('a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n');
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line\nbreak'],
    ]);
  });

  it('strips a UTF-8 BOM and keeps non-ASCII text', () => {
    const { rows } = parseCsv('﻿name,price_kes\nNyama choma — ½ kg,1200\n');
    expect(rows[0]).toEqual(['name', 'price_kes']);
    expect(rows[1]).toEqual(['Nyama choma — ½ kg', '1200']);
  });

  it('accepts LF, CRLF and a missing final newline, and drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r\n1,\r\n').rows).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('reports an unterminated quote', () => {
    expect(parseCsv('a\n"open').error).toMatch(/never closed/);
  });
});

describe('toCsv / export', () => {
  it('quotes where needed, guards formulas and adds a BOM', () => {
    const text = toCsv([['a,b', 'say "x"', '=SUM(A1)', 'plain']]);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('"a,b","say ""x""",\'=SUM(A1),plain');
  });

  it('round-trips an export back into an update of the same items', () => {
    const csv = catalogueExportCsv(
      [
        {
          id: ID_A,
          name: 'Chicken biryani',
          description: 'Rice, chicken, "spice"',
          price_kes: 850,
          available: true,
          age_restricted: false,
          section_id: 's1',
          allergens: ['nuts', 'dairy'],
          dietary_labels: [],
          prep_time_minutes: 20,
        },
        {
          id: ID_B,
          name: '=Mango juice',
          description: null,
          price_kes: 250,
          available: false,
          age_restricted: false,
          section_id: null,
        },
      ],
      new Map([['s1', 'Mains']]),
    );
    const plan = planCatalogueImport(csv, [existing[0]!, { id: ID_B, name: '=Mango juice' }]);
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toBe(2);
    expect(plan.creates).toBe(0);
    const [a, b] = plan.rows;
    expect(a).toMatchObject({ id: ID_A, matchedBy: 'id', section: 'Mains' });
    expect(a!.fields).toMatchObject({
      name: 'Chicken biryani',
      description: 'Rice, chicken, "spice"',
      price_kes: 850,
      available: true,
      allergens: ['nuts', 'dairy'],
      dietary_labels: [],
      prep_time_minutes: 20,
    });
    expect(b!.fields).toMatchObject({ name: '=Mango juice', available: false, description: null });
  });
});

describe('template', () => {
  it('has every column and imports cleanly as new items', () => {
    const csv = catalogueTemplateCsv();
    const header = parseCsv(csv).rows[0];
    expect(header).toEqual([...CATALOGUE_CSV_COLUMNS]);
    const plan = planCatalogueImport(csv, []);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toBe(2);
    expect(plan.rows[0]!.fields.allergens).toEqual([]); // "none" is not an allergen
  });

  it('uses the category example when given one', () => {
    const csv = catalogueTemplateCsv({
      name: 'Linen shirt',
      description: 'Breathable.',
      pricePlaceholder: 'e.g. 3,500',
    });
    const rows = parseCsv(csv).rows;
    expect(rows).toHaveLength(2);
    expect(rows[1]!.slice(2, 5)).toEqual(['Linen shirt', 'Breathable.', '3500']);
    expect(planCatalogueImport(csv, []).errors).toEqual([]);
  });
});

describe('planCatalogueImport', () => {
  it('needs name and price_kes columns and rejects unknown ones', () => {
    const plan = planCatalogueImport('title,cost\nTea,100\n', existing);
    const messages = plan.errors.map((e) => e.message).join(' ');
    expect(plan.errors.every((e) => e.row === 1)).toBe(true);
    expect(messages).toMatch(/Unknown columns: title, cost/);
    expect(messages).toMatch(/"name" column is missing/);
    expect(messages).toMatch(/"price_kes" column is missing/);
  });

  it('accepts a minimal file and friendly prices', () => {
    const plan = planCatalogueImport('Name,Price KES\nTea,"1,200"\nCoffee,KES 300\n', []);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => r.fields.price_kes)).toEqual([1200, 300]);
    // Columns not in the file are left alone.
    expect(plan.rows[0]!.fields).not.toHaveProperty('description');
  });

  it('reports errors by spreadsheet row number', () => {
    const plan = planCatalogueImport(
      [
        'name,price_kes,available,prep_time_minutes',
        'Tea,100,yes,5',
        ',100,yes,',
        'Cake,0,maybe,',
        'Bread,12.5,,2000',
      ].join('\n'),
      [],
    );
    expect(plan.creates).toBe(1);
    const byRow = (row: number) => plan.errors.filter((e) => e.row === row).map((e) => e.message);
    expect(byRow(3)).toEqual(['Name is required.']);
    expect(byRow(4)).toEqual([
      'Price must be a whole number of shillings from 1 to 1,000,000.',
      'Available must be yes or no.',
    ]);
    expect(byRow(5)).toHaveLength(2);
  });

  it('enforces the database description limit', () => {
    const plan = planCatalogueImport(
      `name,price_kes,description\nTea,100,${'x'.repeat(401)}\n`,
      [],
    );
    expect(plan.errors[0]).toMatchObject({ row: 2 });
    expect(plan.errors[0]!.message).toMatch(/400 characters/);
  });

  it('only updates ids that belong to this merchant', () => {
    const other = '33333333-3333-4333-8333-333333333333';
    const plan = planCatalogueImport(
      `id,name,price_kes\n${other},Tea,100\nnot-a-uuid,Tea,100\n`,
      existing,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('matches a blank id by unique name instead of duplicating', () => {
    const plan = planCatalogueImport('name,price_kes\nchicken biryani,900\nSamosa,80\n', existing);
    expect(plan.rows[0]).toMatchObject({ action: 'update', id: ID_A, matchedBy: 'name' });
    expect(plan.rows[1]).toMatchObject({ action: 'create' });
  });

  it('refuses an ambiguous name match and the same product twice', () => {
    const dupes = [
      ...existing,
      { id: '44444444-4444-4444-8444-444444444444', name: 'Mango juice' },
    ];
    const plan = planCatalogueImport(
      `id,name,price_kes\n,Mango juice,100\n${ID_A},A,1\n${ID_A},B,2\n,Samosa,80\n,samosa,90\n`,
      dupes,
    );
    expect(plan.errors.map((e) => e.row)).toEqual([2, 4, 6]);
  });

  it('flags a row with extra cells from an unquoted comma', () => {
    const plan = planCatalogueImport('name,price_kes\nTea, milk,100\n', []);
    expect(plan.errors[0]).toMatchObject({ row: 2 });
    expect(plan.errors[0]!.message).toMatch(/unquoted comma/);
  });

  it('limits size and row count', () => {
    const big = 'name,price_kes\n' + `Tea,100,${'x'.repeat(CATALOGUE_CSV_MAX_BYTES)}\n`;
    expect(planCatalogueImport(big, []).errors[0]!.message).toMatch(/larger than/);
    const many =
      'name,price_kes\n' +
      Array.from({ length: CATALOGUE_CSV_MAX_ROWS + 1 }, (_, i) => `Item ${i},100`).join('\n');
    expect(planCatalogueImport(many, []).errors[0]!.message).toMatch(/up to 1000/);
  });

  it('rejects an empty file or a header with no rows', () => {
    expect(planCatalogueImport('', []).errors[0]!.message).toMatch(/empty/);
    expect(planCatalogueImport('name,price_kes\n', []).errors[0]!.message).toMatch(/no products/);
  });
});
