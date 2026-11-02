import { describe, expect, it } from 'vitest';
import { listBookingProfiles } from '@nexg/booking-config/profiles';
import {
  availableSchemas,
  bookingOfferingProjection,
  capacityLabel,
  createOffering,
  discountedMinor,
  discountLabel,
  extendOfferingProfiles,
  moneyMinor,
  priceLabel,
  profiles,
  seedCatalogue,
  validateOffering,
  validateOfferingRelationships,
} from './model';
import { catalogueCsv, localOfferingsSource, parseCsv, prepareImport } from './source';
import { schemas } from './schemas';

function store() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const makeup = profiles.find((p) => p.id === 'makeup')!;
const retail = profiles.find((p) => p.id === 'fragrances')!;

describe('adaptive offering behaviour', () => {
  it('publishes a percentage discount and retains the discounted price after reload', async () => {
    const source = localOfferingsSource(store());
    const item = (await source.load(makeup)).offerings[0]!;
    const saved = await source.save(
      makeup,
      {
        ...item,
        discount: { enabled: true, kind: 'percentage', value: '15', startsAt: '', endsAt: '' },
      },
      'published',
    );
    expect(saved.publication).toBe('published');
    expect(priceLabel(saved)).toBe('KES 2,975 / appointment');
    expect(discountLabel(saved)).toBe('15% off');
    expect(bookingOfferingProjection(saved).priceMinor).toBe(297500);
    expect(priceLabel((await source.load(makeup)).offerings.find((o) => o.id === item.id)!)).toBe(
      'KES 2,975 / appointment',
    );
  });
  it('uses exact minor units for amount discounts, percentage rounding and scheduled windows', () => {
    const item = {
      ...seedCatalogue(makeup).offerings[0]!,
      discount: {
        enabled: true,
        kind: 'amount' as const,
        value: '500.25',
        startsAt: '',
        endsAt: '',
      },
    };
    expect(discountedMinor(item, 350000)).toBe(299975);
    expect(
      discountedMinor(
        { ...item, discount: { ...item.discount, kind: 'percentage', value: '12.50' } },
        999,
      ),
    ).toBe(874);
    const scheduled = {
      ...item,
      discount: { ...item.discount, startsAt: '2026-11-01T09:00', endsAt: '2026-11-02T09:00' },
    };
    expect(discountedMinor(scheduled, 350000, Date.parse('2026-11-01T05:59:00Z'))).toBe(350000);
    expect(discountedMinor(scheduled, 350000, Date.parse('2026-11-01T06:00:00Z'))).toBe(299975);
    expect(discountedMinor(scheduled, 350000, Date.parse('2026-11-02T06:00:00Z'))).toBe(350000);
  });
  it('rejects excessive discounts, invalid dates and changes to externally owned discount prices', async () => {
    const source = localOfferingsSource(store());
    const item = seedCatalogue(makeup).offerings[0]!;
    const invalid = {
      ...item,
      discount: {
        enabled: true,
        kind: 'percentage' as const,
        value: '150',
        startsAt: '',
        endsAt: '',
      },
    };
    expect(validateOffering(invalid, true).some((i) => i.key === 'discount')).toBe(true);
    await expect(source.save(makeup, invalid, 'published')).rejects.toThrow('valid discount');
    const data = await source.load(makeup);
    data.offerings[0]!.sources.price = 'external';
    await source.replace(makeup, data);
    await expect(
      source.save(
        makeup,
        { ...data.offerings[0]!, discount: { ...invalid.discount, value: '10' } },
        'published',
      ),
    ).rejects.toThrow('Prices are managed');
    expect(priceLabel((await source.load(makeup)).offerings[0]!)).toBe('KES 3,500 / appointment');
  });
  it('validates quantity precision, required options, visibility windows and circular bundle references', () => {
    const item = seedCatalogue(makeup).offerings[0]!;
    const invalid = {
      ...item,
      quantityRules: { minimum: '0.5', maximum: '5', precision: 0 },
      optionGroups: [{ id: 'extras', name: 'Extras', minimum: 1, maximum: 2, choices: [] }],
      visibility: {
        startsAt: '2026-11-02T09:00',
        endsAt: '2026-11-01T09:00',
        locations: ['Westlands'],
        channel: 'both' as const,
      },
    };
    expect(validateOffering(invalid, true).map((i) => i.key)).toEqual(
      expect.arrayContaining(['quantityRules', 'optionGroups', 'visibility']),
    );
    const a = { ...item, id: 'bundle-a', bundleItems: [{ offeringId: 'bundle-b', quantity: 1 }] };
    const b = { ...item, id: 'bundle-b', bundleItems: [{ offeringId: 'bundle-a', quantity: 1 }] };
    expect(validateOfferingRelationships(a, [b], true).map((i) => i.message)).toContain(
      'A bundle cannot contain itself or a circular chain of bundles.',
    );
    expect(
      priceLabel({ ...item, quantityRules: { minimum: '0.5', maximum: '5', precision: 1 } }),
    ).toBe('KES 3,500 / appointment');
  });
  it('restores an archived listing as a draft with a new history version', async () => {
    const source = localOfferingsSource(store());
    const data = await source.load(makeup);
    data.offerings[0]!.publication = 'archived';
    await source.replace(makeup, data);
    const restored = await source.save(makeup, data.offerings[0]!, 'draft');
    expect(restored.publication).toBe('draft');
    expect(restored.version).toBe(2);
    expect(restored.history[0]!.action).toBe('Restored as draft in preview');
  });
  it('rejects unknown saved types and malformed resource lists and recovers through reset', async () => {
    const storage = store();
    const source = localOfferingsSource(storage);
    const unknown = seedCatalogue(makeup);
    unknown.configuration.enabledSchemas = ['UNREGISTERED_EDITOR'];
    storage.setItem('nexg.offerings.preview.v1.makeup', JSON.stringify(unknown));
    await expect(source.load(makeup)).rejects.toThrow('saved preview could not be read');
    expect((await source.reset(makeup)).offerings[0]!.name).toBe('Occasion makeup');
    const malformed = seedCatalogue(makeup);
    Reflect.deleteProperty(malformed.offerings[0]!, 'resources');
    storage.setItem('nexg.offerings.preview.v1.makeup', JSON.stringify(malformed));
    await expect(source.load(makeup)).rejects.toThrow('saved preview could not be read');
    expect((await source.reset(makeup)).configuration.enabledSchemas).toEqual([
      'SERVICE_APPOINTMENT_V1',
      'PRODUCT_CATALOG_V1',
    ]);
  });
  it('adds a future category through the same registered editor and persists its own catalogue', async () => {
    const extension = {
      ...makeup,
      id: 'new_consultancy',
      categoryId: 'new_services',
      name: 'New consultancy',
      schema: 'REMOTE_SESSION_V1',
      models: ['APPOINTMENT'],
      attributes: [],
    };
    const extended = extendOfferingProfiles([extension]);
    const profile = extended.find((p) => p.id === 'new_consultancy')!;
    const source = localOfferingsSource(store());
    const item = createOffering(profile, 'REMOTE_SESSION_V1', 'new-consultancy-1');
    const saved = await source.save(profile, { ...item, name: 'First consultation' });
    expect(saved.name).toBe('First consultation');
    expect((await source.load(profile)).configuration.subcategoryId).toBe('new_consultancy');
    expect((await source.load(makeup)).offerings[0]!.name).toBe('Occasion makeup');
    expect(() =>
      extendOfferingProfiles([{ ...extension, id: 'unsupported', schema: 'UNREGISTERED_V1' }]),
    ).toThrow('Register the new editor');
  });
  it('rejects out-of-scope attributes and unsupported handover methods at publication', () => {
    const item = seedCatalogue(retail).offerings[0]!;
    const invalid = {
      ...item,
      attributes: { Q_REGULATORY_LICENSE: 'claimed' },
      fulfilmentMethods: ['Passenger pickup and drop-off'],
    };
    expect(validateOffering(invalid, true).map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'Select a supported fulfilment or handover method.',
        'Remove the attribute that is not registered for this specialty.',
      ]),
    );
    expect(priceLabel(item)).toBe('KES 3,500 / item');
  });
  it('binds every current booking specialty to a supported editor, without activating candidates', () => {
    const expected = listBookingProfiles()
      .map((p) => p.subcategoryId)
      .sort();
    const rendered = profiles
      .map((profile) => {
        const data = seedCatalogue(profile);
        expect(data.configuration.subcategoryId).toBe(profile.id);
        expect(data.configuration.enabledSchemas.includes(profile.schema)).toBe(true);
        for (const item of data.offerings) {
          expect(bookingOfferingProjection(item).name).toBe(item.name);
          expect(availableSchemas(profile).includes(item.schemaId)).toBe(true);
          if (item.publication === 'published') expect(validateOffering(item, true)).toEqual([]);
        }
        return profile.id;
      })
      .sort();
    expect(rendered).toEqual(expected);
    expect(seedCatalogue(retail).configuration.enabledSchemas).toEqual(['PRODUCT_CATALOG_V1']);
  });
  it('provides an executable field contract for each registered schema including conditional spaces', async () => {
    for (const schema of Object.values(schemas)) {
      const profile = profiles.find((p) => availableSchemas(p).includes(schema.id))!;
      const source = localOfferingsSource(store());
      const data = await source.load(profile);
      data.configuration.enabledSchemas = [
        ...new Set([...data.configuration.enabledSchemas, schema.id]),
      ];
      await source.replace(profile, data);
      const item = createOffering(profile, schema.id, `test-${schema.id}`);
      item.name = 'A complete offering';
      item.description = 'Included scope and customer terms.';
      item.price = '1234.50';
      item.fields = Object.fromEntries(
        schema.fields.map((field) => [
          field.key,
          field.value || (field.type === 'number' ? 1 : 'Confirmed provider reference'),
        ]),
      );
      item.resources = [...schema.resources];
      item.availabilityLinked = true;
      const saved = await source.save(profile, item, 'published');
      expect(saved.publication).toBe('published');
      expect(saved.version).toBe(1);
      expect((await source.load(profile)).offerings.find((o) => o.id === saved.id)?.name).toBe(
        'A complete offering',
      );
    }
  });
  it('saves incomplete drafts but blocks publishing until exact duration and capacity links are supplied', async () => {
    const source = localOfferingsSource(store());
    const item = createOffering(makeup, 'SERVICE_APPOINTMENT_V1', 'new-appointment');
    item.name = 'Evening service';
    const draft = await source.save(makeup, item);
    expect(draft.publication).toBe('draft');
    expect(validateOffering(draft, true).map((i) => i.key)).toEqual(
      expect.arrayContaining([
        'description',
        'duration_minutes',
        'availabilityLinked',
        'resources',
        'price',
      ]),
    );
    await expect(source.save(makeup, draft, 'published')).rejects.toThrow(
      'Enter a valid KES amount',
    );
    expect((await source.load(makeup)).offerings.find((o) => o.id === draft.id)?.publication).toBe(
      'draft',
    );
  });
  it('keeps unknown, zero, stale and current stock distinct from publication', () => {
    const item = seedCatalogue(retail).offerings[0]!;
    expect(capacityLabel({ ...item, stock: undefined })).toBe('Stock unknown');
    expect(capacityLabel({ ...item, stock: 0 })).toBe('Out of stock');
    expect(capacityLabel({ ...item, stock: 12 })).toBe('12 items');
    expect(capacityLabel({ ...item, stock: 12, sync: 'stale' })).toBe('Stock needs refresh');
    expect(capacityLabel({ ...item, stock: 12, sync: 'offline' })).toBe('Stock unavailable');
    expect(bookingOfferingProjection({ ...item, stock: 0 }).active).toBe(true);
  });
  it('preserves automatic stock/resource confirmation and uses enquiry/quote wording instead of a free purchase', () => {
    const service = seedCatalogue(makeup).offerings[0]!;
    expect(bookingOfferingProjection(service).intakeMode).toBe('instant_after_requirements');
    const quoted = { ...service, priceMode: 'quote' as const, price: '' };
    expect(priceLabel(quoted)).toBe('Price on quotation');
    expect(bookingOfferingProjection(quoted).intakeMode).toBe('request_quote');
    expect(priceLabel({ ...quoted, priceMode: 'enquiry' })).toBe('Enquiry only');
  });
  it('parses monetary amounts without rounding malformed decimals into valid prices', () => {
    expect(moneyMinor('1234.50')).toBe(123450);
    expect(moneyMinor('0')).toBe(0);
    expect(moneyMinor('1.005')).toBe(null);
    expect(moneyMinor('-1')).toBe(null);
    expect(moneyMinor('NaN')).toBe(null);
  });
  it('prevents local edits to externally owned fields while allowing local description changes with external stock', async () => {
    const source = localOfferingsSource(store());
    const item = (await source.load(makeup)).offerings.find((o) => o.name === 'Lip tint')!;
    const saved = await source.save(makeup, { ...item, description: 'Updated local description' });
    expect(saved.description).toBe('Updated local description');
    await expect(source.save(makeup, { ...saved, stock: 99 })).rejects.toThrow(
      'Availability is managed',
    );
    expect((await source.load(makeup)).offerings.find((o) => o.id === saved.id)?.stock).toBe(12);
  });
  it('prevents a stale tab from overwriting another tab and retains the newer value', async () => {
    const source = localOfferingsSource(store());
    const before = (await source.load(makeup)).offerings[0]!;
    const saved = await source.save(makeup, { ...before, name: 'New saved name' });
    expect(saved.version).toBe(2);
    await expect(source.save(makeup, { ...before, name: 'Stale name' })).rejects.toThrow(
      'another tab',
    );
    expect((await source.load(makeup)).offerings[0]!.name).toBe('New saved name');
  });
  it('reports storage failures without claiming the draft was saved', async () => {
    const source = localOfferingsSource({
      ...store(),
      setItem: () => {
        throw new Error('quota');
      },
    });
    const draft = seedCatalogue(makeup).offerings[0]!;
    await expect(source.save(makeup, { ...draft, name: 'Unsaved name' })).rejects.toThrow(
      'could not save',
    );
    expect((await source.load(makeup)).offerings[0]!.name).toBe('Occasion makeup');
  });
  it('imports quoted multiline CSV as drafts without manufacturing capacity or accepting duplicate names', () => {
    expect(parseCsv('name,description\r\n"One, two","First\nSecond"')).toEqual([
      ['name', 'description'],
      ['One, two', 'First\nSecond'],
    ]);
    const file =
      'name,description,type,price_mode,price_kes,unit\n"New, scent",Description,PRODUCT_CATALOG_V1,fixed,1200.50,item';
    const rows = prepareImport(file, retail, ['PRODUCT_CATALOG_V1'], []);
    expect(rows[0]?.name).toBe('New, scent');
    expect(rows[0]?.price).toBe('1200.50');
    expect(rows[0]?.publication).toBe('draft');
    expect(rows[0]?.availabilityLinked).toBe(false);
    const discounted = { ...seedCatalogue(retail).offerings[0]!, name:'Imported discount', discount:{enabled:true,kind:'percentage' as const,value:'20',startsAt:'',endsAt:''} };
    const imported = prepareImport(catalogueCsv([discounted]), retail, ['PRODUCT_CATALOG_V1'], []);
    expect(priceLabel(imported[0]!)).toBe('KES 2,800 / item');
    expect(() => prepareImport(file, retail, ['PRODUCT_CATALOG_V1'], rows)).toThrow(
      'already exists',
    );
    expect(() =>
      prepareImport(file.replace('1200.50', '12.123'), retail, ['PRODUCT_CATALOG_V1'], []),
    ).toThrow('valid KES');
  });
  it('rejects malformed import rows and safely exports spreadsheet formulas as text', () => {
    expect(() => parseCsv('name\n"Unclosed')).toThrow('Close the quoted');
    const item = { ...seedCatalogue(retail).offerings[0]!, name: '=HYPERLINK("bad")' };
    expect(catalogueCsv([item])).toContain('"\'=HYPERLINK(""bad"")"');
  });
});
