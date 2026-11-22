import { describe, expect, it } from 'vitest';

import {
  cleanAvailable,
  cleanCategory,
  cleanPrice,
  headerKey,
  normaliseTable,
  readTable,
  suggestMapping,
  type Table,
} from './any-csv';

const POS = [
  '﻿Mama Oliech Grill - item list',
  'Exported 20/11/2026;;;;;;',
  'Item Code;Item Name;Department;Retail Price;Qty On Hand;Status;Supplier;',
  'A1;Tilapia fry;MAINS;KES 1,200.00;14;Active;Lake Fish Co;',
  'A2;  Ugali ;sides;150;80;Active;;',
  'A1;Tilapia fry;MAINS;KES 1,250.00;12;Active;Lake Fish Co;',
  'A3;Chapati;Sides;80.50;40;Inactive;;',
  'A4;;Sides;100;5;Active;;',
  ';;;;;;;',
].join('\r\n');

function table(): Table {
  const t = readTable(POS);
  if ('error' in t) throw new Error(t.error);
  return t;
}

describe('upload any CSV: reading', () => {
  it('finds the header below a title, with semicolons, a BOM and a blank trailing column', () => {
    const t = table();
    expect(t.delimiter).toBe(';');
    expect(t.headerRow).toBe(3);
    expect(t.headers).toEqual([
      'Item Code',
      'Item Name',
      'Department',
      'Retail Price',
      'Qty On Hand',
      'Status',
      'Supplier',
    ]);
    expect(t.rows.map((r) => r.rowNo)).toEqual([4, 5, 6, 7, 8]);
  });

  it('matches POS column names to NexG fields', () => {
    const m = suggestMapping(table().headers);
    expect(m).toMatchObject({
      sku: 0,
      name: 1,
      category: 2,
      price: 3,
      stock: 4,
      available: 5,
      description: null,
    });
  });

  it('gives the same key to the same columns in another order', () => {
    expect(headerKey(['Price', 'Item Name'])).toBe(headerKey(['item name', 'PRICE']));
  });
});

describe('upload any CSV: cleaning', () => {
  it('reads shilling prices, refuses cents and words', () => {
    expect(cleanPrice('KES 1,200.00')).toEqual({ price: '1200' });
    expect(cleanPrice('Ksh 950')).toEqual({ price: '950' });
    expect(cleanPrice('80.50')).toHaveProperty('problem');
    expect(cleanPrice('free')).toHaveProperty('problem');
    expect(cleanPrice('')).toBeNull();
  });

  it('reads availability words', () => {
    expect(cleanAvailable('In stock')).toBe(true);
    expect(cleanAvailable('Inactive')).toBe(false);
    expect(cleanAvailable('maybe')).toBeNull();
  });

  it('tidies shouting and lower-case categories', () => {
    expect(cleanCategory('  HOT  DRINKS ')).toBe('Hot drinks');
    expect(cleanCategory('sides')).toBe('Sides');
    expect(cleanCategory('Nyama Choma')).toBe('Nyama Choma');
  });
});

describe('upload any CSV: normalising', () => {
  it('merges duplicates by SKU, keeps unmatched columns and sends bad rows to attention', () => {
    const t = table();
    const n = normaliseTable(t, suggestMapping(t.headers));
    expect(n.merged).toBe(1);
    expect(n.sources.map((s) => s.sourceRows)).toEqual([[4, 6], [5]]);
    expect(n.sources[0]!.extras).toEqual({ Supplier: 'Lake Fish Co' });
    expect(n.sources[0]!.stock).toBe('12');
    expect(n.csv.split('\r\n')[1]).toBe('Mains,Tilapia fry,,1250,yes');
    expect(n.attention.map((a) => a.sourceRow)).toEqual([7, 8]);
    expect(n.extraColumns).toEqual(['Supplier']);
  });

  it('takes the merchant’s corrections from "needs attention"', () => {
    const t = table();
    const n = normaliseTable(t, suggestMapping(t.headers), {
      7: { price: '80' },
      8: { name: 'Mandazi' },
    });
    expect(n.attention).toEqual([]);
    expect(n.sources).toHaveLength(4);
  });
});
