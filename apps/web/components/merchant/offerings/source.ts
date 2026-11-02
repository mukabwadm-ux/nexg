import {
  assertEditable,
  availableSchemas,
  createOffering,
  moneyMinor,
  seedCatalogue,
  validateOffering,
  validateOfferingRelationships,
  type Catalogue,
  type Offering,
  type OfferingProfile,
  type Publication,
} from './model';
import { schemas } from './schemas';

export interface OfferingsSource {
  load(profile: OfferingProfile): Promise<Catalogue>;
  save(profile: OfferingProfile, item: Offering, publication?: Publication): Promise<Offering>;
  replace(profile: OfferingProfile, catalogue: Catalogue): Promise<void>;
  reset(profile: OfferingProfile): Promise<Catalogue>;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (id: string) => `nexg.offerings.preview.v1.${id}`;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validDate = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
function validOptions(o: Offering) {
  return (
    (o.reservationFee === undefined ||
      (record(o.reservationFee) &&
        ['none', 'fixed', 'percentage'].includes(o.reservationFee.mode) &&
        typeof o.reservationFee.amount === 'string' &&
        typeof o.reservationFee.creditToTotal === 'boolean')) &&
    (o.section === undefined || typeof o.section === 'string') &&
    (o.tags === undefined ||
      (Array.isArray(o.tags) && o.tags.every((t) => typeof t === 'string'))) &&
    (o.availabilityPaused === undefined || typeof o.availabilityPaused === 'boolean') &&
    (o.quantityRules === undefined ||
      (record(o.quantityRules) &&
        typeof o.quantityRules.minimum === 'string' &&
        typeof o.quantityRules.maximum === 'string' &&
        Number.isInteger(o.quantityRules.precision))) &&
    (o.optionGroups === undefined ||
      (Array.isArray(o.optionGroups) &&
        o.optionGroups.every(
          (g) =>
            record(g) &&
            typeof g.id === 'string' &&
            typeof g.name === 'string' &&
            typeof g.minimum === 'number' &&
            typeof g.maximum === 'number' &&
            Array.isArray(g.choices) &&
            g.choices.every(
              (c) =>
                record(c) &&
                typeof c.id === 'string' &&
                typeof c.name === 'string' &&
                typeof c.extra === 'string' &&
                Array.isArray(c.variantIds) &&
                c.variantIds.every((id) => typeof id === 'string'),
            ),
        ))) &&
    (o.bundleItems === undefined ||
      (Array.isArray(o.bundleItems) &&
        o.bundleItems.every(
          (c) => record(c) && typeof c.offeringId === 'string' && typeof c.quantity === 'number',
        ))) &&
    (o.visibility === undefined ||
      (record(o.visibility) &&
        typeof o.visibility.startsAt === 'string' &&
        typeof o.visibility.endsAt === 'string' &&
        ['marketplace', 'direct', 'both'].includes(o.visibility.channel) &&
        Array.isArray(o.visibility.locations) &&
        o.visibility.locations.every((l) => typeof l === 'string'))) &&
    (o.discount === undefined ||
      (record(o.discount) &&
        typeof o.discount.enabled === 'boolean' &&
        ['percentage', 'amount'].includes(o.discount.kind) &&
        typeof o.discount.value === 'string' &&
        typeof o.discount.startsAt === 'string' &&
        typeof o.discount.endsAt === 'string'))
  );
}
export function localOfferingsSource(storage: StorageLike): OfferingsSource {
  function load(profile: OfferingProfile): Catalogue {
    try {
      const raw = storage.getItem(key(profile.id));
      if (!raw) return seedCatalogue(profile);
      const data = JSON.parse(raw) as Catalogue;
      const allowed = availableSchemas(profile);
      if (
        data.revision !== 1 ||
        data.configuration.subcategoryId !== profile.id ||
        !Array.isArray(data.offerings) ||
        !Array.isArray(data.configuration.enabledSchemas) ||
        data.configuration.enabledSchemas.length === 0 ||
        new Set(data.configuration.enabledSchemas).size !==
          data.configuration.enabledSchemas.length ||
        !data.configuration.enabledSchemas.every((id) => allowed.includes(id)) ||
        !record(data.configuration.inheritedAttributes) ||
        data.offerings.some(
          (o) =>
            !record(o) ||
            !validOptions(o) ||
            o.profileId !== profile.id ||
            !allowed.includes(o.schemaId) ||
            !data.configuration.enabledSchemas.includes(o.schemaId) ||
            typeof o.id !== 'string' ||
            typeof o.name !== 'string' ||
            typeof o.description !== 'string' ||
            typeof o.price !== 'string' ||
            typeof o.unit !== 'string' ||
            !schemas[o.schemaId]!.priceModes.includes(o.priceMode) ||
            !['draft', 'published', 'archived'].includes(o.publication) ||
            !Number.isSafeInteger(o.version) ||
            o.version < 1 ||
            !record(o.sources) ||
            !Object.values(o.sources).every((value) => value === 'nexg' || value === 'external') ||
            !['details', 'price', 'availability'].every((area) => Object.hasOwn(o.sources, area)) ||
            !record(o.fields) ||
            !record(o.attributes) ||
            !Array.isArray(o.resources) ||
            !o.resources.every((value) => typeof value === 'string') ||
            typeof o.availabilityLinked !== 'boolean' ||
            !['current', 'stale', 'offline', 'pending'].includes(o.sync) ||
            !validDate(o.updatedAt) ||
            (o.stockAsOf !== undefined && !validDate(o.stockAsOf)) ||
            !Array.isArray(o.history) ||
            o.history.some(
              (entry) =>
                !record(entry) ||
                !validDate(entry.at) ||
                typeof entry.action !== 'string' ||
                !Number.isSafeInteger(entry.version),
            ) ||
            !Array.isArray(o.variants) ||
            o.variants.some(
              (variant) =>
                !record(variant) ||
                typeof variant.id !== 'string' ||
                typeof variant.name !== 'string' ||
                typeof variant.sku !== 'string' ||
                typeof variant.price !== 'string',
            ) ||
            (o.fulfilmentMethods !== undefined &&
              (!Array.isArray(o.fulfilmentMethods) ||
                !o.fulfilmentMethods.every((m) => typeof m === 'string'))),
        )
      )
        throw new Error('Invalid catalogue');
      return data;
    } catch {
      throw new Error(
        'The saved preview could not be read. Reset this specialty’s sample or restore a valid preview.',
      );
    }
  }
  const replace = (profile: OfferingProfile, catalogue: Catalogue) => {
    try {
      storage.setItem(key(profile.id), JSON.stringify(catalogue));
    } catch {
      throw new Error(
        'This browser could not save the preview. Free some local storage and try again. Your current edits are still open.',
      );
    }
  };
  return {
    async load(profile) {
      return load(profile);
    },
    async replace(profile, catalogue) {
      replace(profile, catalogue);
    },
    async reset(profile) {
      storage.removeItem(key(profile.id));
      return seedCatalogue(profile);
    },
    async save(profile, item, publication) {
      const data = load(profile);
      const previous = data.offerings.find((o) => o.id === item.id);
      if (previous && previous.version !== item.version)
        throw new Error(
          'This offering changed in another tab. Reload the saved version before saving again.',
        );
      if (!previous && item.version !== 0)
        throw new Error('This offering was removed. Reload the catalogue before saving again.');
      if (!data.configuration.enabledSchemas.includes(item.schemaId))
        throw new Error('Enable this offering type in the merchant configuration first.');
      if (previous) assertEditable(previous, item);
      const status = publication ?? item.publication;
      const issues = [
        ...validateOffering(item, status === 'published', profile),
        ...validateOfferingRelationships(item, data.offerings, status === 'published'),
      ];
      if (issues.length) throw new Error(issues[0]!.message);
      const at = new Date().toISOString();
      const saved = {
        ...item,
        name: item.name.trim(),
        tags: item.tags?.map((tag) => tag.trim()).filter(Boolean),
        publication: status,
        version: item.version + 1,
        updatedAt: at,
        history: [
          {
            at,
            version: item.version + 1,
            action:
              previous?.publication === 'archived' && status === 'draft'
                ? 'Restored as draft in preview'
                : publication === 'published'
                  ? 'Published in preview'
                  : publication === 'archived'
                    ? 'Archived in preview'
                    : 'Changes saved in preview',
          },
          ...item.history,
        ].slice(0, 50),
      };
      data.offerings = previous
        ? data.offerings.map((o) => (o.id === item.id ? saved : o))
        : [...data.offerings, saved];
      replace(profile, data);
      return saved;
    },
  };
}

/** RFC-style quoted fields, bounded file size and rows; never execute spreadsheet text. */
export function parseCsv(text: string): string[][] {
  if (text.length > 1_000_000) throw new Error('Use a CSV smaller than 1 MB.');
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else value += c;
    } else if (c === '"' && !value && !afterQuote) quoted = true;
    else if (c === ',') {
      row.push(value);
      value = '';
      afterQuote = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
      afterQuote = false;
    } else if (afterQuote && c.trim())
      throw new Error('A quoted CSV value must end before the next column.');
    else value += c;
    if (rows.length > 201) throw new Error('Import up to 200 offerings at a time.');
  }
  if (quoted) throw new Error('Close the quoted value in the CSV and try again.');
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length > 201) throw new Error('Import up to 200 offerings at a time.');
  return rows;
}
export function prepareImport(
  text: string,
  profile: OfferingProfile,
  enabled: string[],
  existing: Offering[],
): Offering[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase());
  if (
    !header ||
    !['name', 'type', 'price_mode', 'price_kes', 'unit'].every((h) => header.includes(h))
  )
    throw new Error(
      'CSV columns: name, description, type, price_mode, price_kes, unit. Download the template for an example.',
    );
  const seen = new Set(existing.map((o) => o.name.trim().toLowerCase()));
  if (!rows.length) throw new Error('Add at least one offering row.');
  return rows.map((row, index) => {
    if (row.length !== header.length)
      throw new Error(`Row ${index + 2}: column count does not match the header.`);
    const record = Object.fromEntries(header.map((h, n) => [h, row[n]?.trim() ?? '']));
    const schemaId = Object.values(schemas).find(
      (s) => s.id === record.type || s.label.toLowerCase() === record.type?.toLowerCase(),
    )?.id;
    if (!schemaId || !enabled.includes(schemaId))
      throw new Error(`Row ${index + 2}: enable a supported offering type before importing it.`);
    const item = createOffering(profile, schemaId, crypto.randomUUID());
    item.name = record.name ?? '';
    item.description = record.description ?? '';
    item.price = record.price_kes ?? '';
    item.unit = record.unit || item.unit;
    item.priceMode = record.price_mode as Offering['priceMode'];
    if (record.discount_kind) {
      if (record.discount_enabled && !['true', 'false'].includes(record.discount_enabled))
        throw new Error(`Row ${index + 2}: discount_enabled must be true or false.`);
      item.discount = {
        enabled: record.discount_enabled !== 'false',
        kind: record.discount_kind as 'percentage' | 'amount',
        value: record.discount_value ?? '',
        startsAt: record.discount_starts_at ?? '',
        endsAt: record.discount_ends_at ?? '',
      };
    }
    if (seen.has(item.name.toLowerCase()))
      throw new Error(`Row ${index + 2}: “${item.name}” already exists. Use a unique name.`);
    const issues = validateOffering(item);
    if (
      issues.length ||
      ((item.priceMode === 'fixed' || item.priceMode === 'unit') && moneyMinor(item.price) === null)
    )
      throw new Error(`Row ${index + 2}: ${issues[0]?.message ?? 'Check the price.'}`);
    seen.add(item.name.toLowerCase());
    item.version = 1;
    item.updatedAt = new Date().toISOString();
    item.history = [{ at: item.updatedAt, action: 'Imported as draft in preview', version: 1 }];
    return item;
  });
}
export function catalogueCsv(items: Offering[]) {
  const escape = (v: string) => `"${(/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;
  return [
    'name,description,type,price_mode,price_kes,unit,discount_enabled,discount_kind,discount_value,discount_starts_at,discount_ends_at',
    ...items.map((o) =>
      [
        o.name,
        o.description,
        o.schemaId,
        o.priceMode,
        o.price,
        o.unit,
        o.discount ? String(o.discount.enabled) : '',
        o.discount?.kind ?? '',
        o.discount?.value ?? '',
        o.discount?.startsAt ?? '',
        o.discount?.endsAt ?? '',
      ]
        .map(escape)
        .join(','),
    ),
  ].join('\r\n');
}
