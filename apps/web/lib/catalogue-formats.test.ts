import { describe, expect, it } from 'vitest';

import { catalogueExportCsv, planCatalogueImport } from './catalogue-csv';
import { detectFormat, fromCsvText, parseXml, toImportCsv } from './catalogue-formats';

const csvOf = (text: string, format: 'json' | 'xml') => {
  const result = toImportCsv(text, format);
  if ('error' in result) throw new Error(result.error);
  return result.csv;
};

describe('detectFormat', () => {
  it('uses the extension, then the first character', () => {
    expect(detectFormat('menu.JSON', 'name,price')).toBe('json');
    expect(detectFormat('menu.xml', '')).toBe('xml');
    expect(detectFormat('menu.csv', '[')).toBe('csv');
    expect(detectFormat('menu.txt', '\uFEFF  [{"name":"x"}]')).toBe('json');
    expect(detectFormat(undefined, '<?xml version="1.0"?><a/>')).toBe('xml');
    expect(detectFormat('export', 'name,price_kes')).toBe('csv');
  });
});

describe('JSON to the CSV checks', () => {
  it('reads a list or an items object, with lists, booleans, quotes and unicode', () => {
    const json = JSON.stringify({
      items: [
        {
          name: 'Chai "masala", large',
          price_kes: 150,
          available: true,
          allergens: ['milk', 'nuts'],
          description: 'Ginger; cardamom ☕ — café',
        },
        { name: 'Mandazi', price_kes: '50', available: 'no', dietary_labels: 'vegan; halal' },
      ],
    });
    const plan = planCatalogueImport(csvOf(json, 'json'), []);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => r.fields)).toEqual([
      {
        name: 'Chai "masala", large',
        price_kes: 150,
        available: true,
        allergens: ['milk', 'nuts'],
        description: 'Ginger; cardamom ☕ — café',
        dietary_labels: [],
      },
      {
        name: 'Mandazi',
        price_kes: 50,
        available: false,
        dietary_labels: ['vegan', 'halal'],
        description: null,
        allergens: [],
      },
    ]);
  });

  it('numbers rows from the first item as row 2', () => {
    const plan = planCatalogueImport(
      csvOf('[{"name":"Tea","price_kes":10},{"name":"","price_kes":0}]', 'json'),
      [],
    );
    expect(plan.errors.map((e) => e.row)).toEqual([3, 3]);
  });

  it('reports unknown fields through the usual column check', () => {
    const plan = planCatalogueImport(
      csvOf('[{"name":"Tea","price_kes":10,"colour":"red"}]', 'json'),
      [],
    );
    expect(plan.errors[0]?.message).toMatch(/Unknown column: colour/);
  });

  it('explains broken or wrongly shaped JSON', () => {
    expect(toImportCsv('[{"name": "Tea",}]', 'json')).toMatchObject({ error: /could not be read/ });
    expect(toImportCsv('{"name":"Tea"}', 'json')).toMatchObject({ error: /list of items/ });
    expect(toImportCsv('[{"name":{"en":"Tea"}}]', 'json')).toMatchObject({
      error: /Item 1 \(row 2\): "name"/,
    });
    expect(toImportCsv('["Tea"]', 'json')).toMatchObject({ error: /Item 1/ });
    expect(toImportCsv('  ', 'json')).toMatchObject({ error: /empty/ });
  });
});

describe('XML to the CSV checks', () => {
  it('reads items, attributes, repeated tags, <value> lists, CDATA and entities', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- export -->
<catalogue>
  <items>
    <item id="">
      <name>Fish &amp; chips, "large"</name>
      <price_kes>KES 1,250</price_kes>
      <available>true</available>
      <allergens><value>fish</value><value>gluten</value></allergens>
      <description><![CDATA[Crispy <b>beer</b> batter — 🐟]]></description>
    </item>
    <item>
      <name>Soda &#x1F964;</name>
      <price_kes>80</price_kes>
      <dietary_labels>vegan</dietary_labels>
      <dietary_labels>halal</dietary_labels>
    </item>
  </items>
</catalogue>`;
    const plan = planCatalogueImport(csvOf(xml, 'xml'), []);
    expect(plan.errors).toEqual([]);
    expect(plan.rows[0]?.fields).toMatchObject({
      name: 'Fish & chips, "large"',
      price_kes: 1250,
      available: true,
      allergens: ['fish', 'gluten'],
      description: 'Crispy <b>beer</b> batter — 🐟',
    });
    expect(plan.rows[1]?.fields).toMatchObject({
      name: 'Soda 🥤',
      dietary_labels: ['vegan', 'halal'],
    });
  });

  it('refuses DOCTYPEs, entities and broken markup with a line number', () => {
    expect(
      toImportCsv(
        '<!DOCTYPE x [<!ENTITY e "boom">]><catalogue><item><name>&e;</name></item></catalogue>',
        'xml',
      ),
    ).toMatchObject({ error: /DOCTYPE/ });
    expect(
      toImportCsv('<catalogue>\n<item><name>Tea</nam></item></catalogue>', 'xml'),
    ).toMatchObject({
      error: /line 2: <name> is closed by <\/nam>/,
    });
    expect(
      toImportCsv('<catalogue><item><name>A &e; B</name></item></catalogue>', 'xml'),
    ).toMatchObject({
      error: /not supported/,
    });
    expect(toImportCsv('<catalogue><item><name>Tea</name></item>', 'xml')).toMatchObject({
      error: /never closed/,
    });
    expect(toImportCsv('<catalogue></catalogue>', 'xml')).toMatchObject({ error: /no items/ });
    expect('error' in parseXml('just text')).toBe(true);
  });
});

describe('template and export in every format', () => {
  const items = [
    {
      id: '20000000-0000-4000-8000-000000000001',
      name: '=Tea, "hot"',
      description: 'Rooibos <decaf> & honey',
      price_kes: 120,
      available: true,
      age_restricted: false,
      allergens: ['milk', 'honey'],
    },
  ];
  const csv = catalogueExportCsv(items, new Map());
  const existing = [{ id: items[0]!.id, name: items[0]!.name }];
  const fieldsOf = (text: string) => planCatalogueImport(text, existing).rows[0]?.fields;

  it('round-trips JSON and XML exports through the importer like CSV', () => {
    const expected = fieldsOf(csv);
    expect(expected).toMatchObject({ name: '=Tea, "hot"', allergens: ['milk', 'honey'] });
    for (const format of ['json', 'xml'] as const) {
      const exported = fromCsvText(csv, format);
      expect(fieldsOf(csvOf(exported, format))).toEqual(expected);
    }
  });

  it('writes lists as arrays and readable XML', () => {
    expect(JSON.parse(fromCsvText(csv, 'json')).items[0].allergens).toEqual(['milk', 'honey']);
    expect(fromCsvText(csv, 'xml')).toContain(
      '<description>Rooibos &lt;decaf&gt; &amp; honey</description>',
    );
  });
});

describe('the Offerings reader', () => {
  it('reads converted JSON and XML with the header first', async () => {
    const { readTable } = await import('@/components/merchant/offerings/any-csv');
    const json =
      '[{"name":"Haircut; fade","price":"500","category":"Hair"},{"name":"Braids","price":1500}]';
    const xml =
      '<offerings><item><name>Haircut; fade</name><price>500</price><category>Hair</category></item><item><name>Braids</name><price>1500</price></item></offerings>';
    for (const [text, format] of [
      [json, 'json'],
      [xml, 'xml'],
    ] as const) {
      const table = readTable(csvOf(text, format));
      if ('error' in table) throw new Error(table.error);
      expect(table.headers).toEqual(['name', 'price', 'category']);
      expect(table.rows.map((r) => [r.rowNo, r.cells[0]])).toEqual([
        [2, 'Haircut; fade'],
        [3, 'Braids'],
      ]);
    }
  });
});

describe('a byte-order mark', () => {
  it('is ignored at the start of JSON and XML', () => {
    expect(toImportCsv('\uFEFF[{"name":"Tea","price_kes":1}]', 'json')).not.toHaveProperty('error');
    expect(toImportCsv('\uFEFF<c><item><name>Tea</name></item></c>', 'xml')).not.toHaveProperty(
      'error',
    );
  });
});
