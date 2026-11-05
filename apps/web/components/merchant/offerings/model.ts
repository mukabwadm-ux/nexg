import type { BookingModel } from '@nexg/booking-config/profiles';
import type { BookingOffering } from '../booking/types';
import config from './config.json';
import { modelSchema, schemas } from './schemas';
import type { CatalogueOptions } from './catalogue-options';

export type Attribute = {
  id: string;
  label: string;
  schema: Record<string, unknown>;
  options: { value: string; label: string }[];
  target: string;
};
export type OfferingProfile = {
  categoryId: string;
  id: string;
  name: string;
  schema: string;
  models: string[];
  attributes: Attribute[];
};
export const profiles = config.profiles as OfferingProfile[];
export type MerchantOfferingConfiguration = {
  subcategoryId: string;
  /** Explicitly enabled by scoped onboarding/configuration, never by a category candidate alone. */
  enabledSchemas: string[];
  inheritedAttributes: Record<string, unknown>;
};
export type Ownership = 'nexg' | 'external';
export type Publication = 'draft' | 'published' | 'archived';
export type Offering = CatalogueOptions & {
  id: string;
  profileId: string;
  schemaId: string;
  name: string;
  description: string;
  priceMode: 'fixed' | 'unit' | 'quote' | 'enquiry';
  price: string;
  unit: string;
  publication: Publication;
  version: number;
  fields: Record<string, string | number>;
  attributes: Record<string, unknown>;
  reservationFee?: {
    mode: 'none' | 'fixed' | 'percentage';
    amount: string;
    creditToTotal: boolean;
  };
  resources: string[];
  availabilityLinked: boolean;
  stock?: number;
  stockAsOf?: string;
  image?: string;
  /** Private storage path. `image` is a short-lived URL for display only. */
  imageStoragePath?: string;
  imageAlt?: string;
  sources: { details: Ownership; price: Ownership; availability: Ownership };
  sync: 'current' | 'stale' | 'offline' | 'pending';
  updatedAt: string;
  history: { at: string; action: string; version: number }[];
  variants: { id: string; name: string; sku: string; price: string; stock?: number }[];
  fulfilmentMethods?: string[];
  fulfilmentInstructions?: string;
};
export type Catalogue = {
  revision: 1;
  writable?: boolean;
  configuration: MerchantOfferingConfiguration;
  offerings: Offering[];
};
export type Issue = { key: string; tab: 'details' | 'pricing' | 'availability'; message: string };

export function availableSchemas(profile: OfferingProfile) {
  return [
    ...new Set([
      profile.schema,
      ...profile.models.map((m) => modelSchema[m as BookingModel]).filter(Boolean),
    ]),
  ];
}
export function defaultConfiguration(profile: OfferingProfile): MerchantOfferingConfiguration {
  return { subcategoryId: profile.id, enabledSchemas: [profile.schema], inheritedAttributes: {} };
}
export function fulfilmentOptions(schemaId: string): string[] {
  if (schemaId === 'REMOTE_SESSION_V1') return ['Remote session'];
  if (schemaId === 'FIELD_SERVICE_V1') return ['Customer location'];
  if (schemaId === 'PICKUP_RETURN_V1')
    return ['Collection and return', 'Customer drop-off and pickup'];
  if (schemaId === 'TRANSFER_ROUTE_V1') return ['Passenger pickup and drop-off'];
  if (schemaId === 'FREIGHT_SHIPMENT_V1') return ['Carrier pickup and delivery', 'Depot to depot'];
  if (schemaId === 'MEMBERSHIP_PLAN_V1') return ['Digital entitlement'];
  if (schemaId === 'REGULATED_ENQUIRY_V1') return ['Provider referral'];
  if (['PRODUCT_CATALOG_V1', 'MADE_TO_ORDER_V1', 'RENTAL_ASSET_V1'].includes(schemaId))
    return ['Customer collection', 'Delivery'];
  return schemas[schemaId]!.capacity === 'scope' ? ['Agreed per request'] : ['Merchant location'];
}
/** Extensions reuse registered editor behaviour; unknown behaviour cannot silently activate. */
export function extendOfferingProfiles(extensions: OfferingProfile[] = []): OfferingProfile[] {
  const result = [...profiles];
  for (const profile of extensions) {
    if (
      !profile.id ||
      !profile.categoryId ||
      !profile.name ||
      result.some((p) => p.id === profile.id)
    )
      throw new Error('Each category extension needs a new, unique specialty ID.');
    if (
      !schemas[profile.schema] ||
      profile.models.some((model) => !modelSchema[model as BookingModel])
    )
      throw new Error('Register the new editor or booking model before enabling this category.');
    if (profile.attributes.some((a) => !a.id || !a.target.startsWith('catalog.attributes.')))
      throw new Error('Offering attributes must have a scoped catalogue target.');
    result.push(profile);
  }
  return result;
}
export function moneyMinor(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, cents = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 100_000_000_000 ? amount : null;
}
export const money = (value: string) => {
  const minor = moneyMinor(value);
  return minor === null
    ? 'Price not set'
    : `KES ${(minor / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
};
export function discountedMinor(item: Offering, baseMinor: number, now = Date.now()): number {
  const discount = item.discount;
  if (!discount?.enabled || item.priceMode === 'quote' || item.priceMode === 'enquiry')
    return baseMinor;
  const value = moneyMinor(discount.value);
  if (value === null || value <= 0) return baseMinor;
  const start = discount.startsAt ? Date.parse(`${discount.startsAt}+03:00`) : null;
  const end = discount.endsAt ? Date.parse(`${discount.endsAt}+03:00`) : null;
  if (
    (start !== null && (!Number.isFinite(start) || now < start)) ||
    (end !== null && (!Number.isFinite(end) || now >= end))
  )
    return baseMinor;
  if (discount.kind === 'percentage')
    return value <= 10000 ? Math.round((baseMinor * (10000 - value)) / 10000) : baseMinor;
  return value <= baseMinor ? baseMinor - value : baseMinor;
}
export function discountLabel(item: Offering, now = Date.now()) {
  const d = item.discount;
  if (!d?.enabled) return '';
  if (d.startsAt && now < Date.parse(`${d.startsAt}+03:00`)) return 'Discount scheduled';
  if (d.endsAt && now >= Date.parse(`${d.endsAt}+03:00`)) return 'Discount ended';
  return d.kind === 'percentage' ? `${d.value}% off` : `${money(d.value)} off / ${item.unit}`;
}
export function priceLabel(item: Offering) {
  if (item.priceMode === 'quote') return 'Price on quotation';
  if (item.priceMode === 'enquiry') return 'Enquiry only';
  if (item.variants.length) {
    const values = item.variants
      .map((v) => moneyMinor(v.price))
      .filter((v): v is number => v !== null);
    return values.length
      ? `From ${money(String(Math.min(...values.map((value) => discountedMinor(item, value))) / 100))}`
      : 'Variant prices not set';
  }
  const base = moneyMinor(item.price);
  return `${base === null ? 'Price not set' : money(String(discountedMinor(item, base) / 100))} / ${item.unit}`;
}
export function capacityLabel(item: Offering) {
  if (item.availabilityPaused) return 'Paused listing';
  if (item.schemaId === 'REGULATED_ENQUIRY_V1') return 'Provider referral';
  if (schemas[item.schemaId]?.capacity === 'scope') return 'Scope agreed per request';
  if (!item.availabilityLinked)
    return schemas[item.schemaId]?.capacity === 'stock'
      ? 'Stock not linked'
      : 'Availability not linked';
  const schema = schemas[item.schemaId]!;
  if (schema.capacity === 'stock') {
    if (item.sync !== 'current')
      return item.sync === 'stale' ? 'Stock needs refresh' : 'Stock unavailable';
    if (item.stock === undefined) return 'Stock unknown';
    return item.stock === 0
      ? 'Out of stock'
      : `${item.stock} ${item.fields.sale_unit ?? item.unit}${item.stock === 1 ? '' : 's'}`;
  }
  if (schema.capacity === 'scope') return 'Scope agreed per request';
  if (schema.capacity === 'storage') return 'Storage pool linked';
  if (schema.capacity === 'session') return 'Dated sessions linked';
  if (schema.capacity === 'asset') return 'Asset calendars linked';
  if (schema.capacity === 'space') return 'Compatible spaces linked';
  return 'Resource calendars linked';
}
export function createOffering(profile: OfferingProfile, schemaId: string, id: string): Offering {
  const schema = schemas[schemaId];
  if (!schema || !availableSchemas(profile).includes(schemaId))
    throw new Error('This offering type is not supported by this specialty.');
  return {
    id,
    profileId: profile.id,
    schemaId,
    name: '',
    description: '',
    price: '',
    priceMode: schema.priceModes[0]!,
    unit: schema.unit,
    publication: 'draft',
    version: 0,
    fields: Object.fromEntries(
      schema.fields.map((f) => [
        f.key,
        f.type === 'number' ? '' : f.type === 'select' ? (f.options?.[0] ?? '') : '',
      ]),
    ),
    resources: [],
    availabilityLinked: false,
    sources: { details: 'nexg', price: 'nexg', availability: 'nexg' },
    sync: 'current',
    attributes: {},
    history: [],
    variants: [],
    fulfilmentMethods: [fulfilmentOptions(schemaId)[0]!],
    updatedAt: '',
  };
}

export function validateOffering(
  item: Offering,
  publish = false,
  profile = profiles.find((p) => p.id === item.profileId),
): Issue[] {
  const issues: Issue[] = [];
  const add = (key: string, tab: Issue['tab'], message: string) =>
    issues.push({ key, tab, message });
  const schema = schemas[item.schemaId];
  if (!schema) {
    add('schemaId', 'details', 'Choose a supported offering type.');
    return issues;
  }
  if (!item.name.trim()) add('name', 'details', 'Enter an offering name.');
  if (item.name.length > 150) add('name', 'details', 'Keep the name within 150 characters.');
  if (!schema.priceModes.includes(item.priceMode))
    add('priceMode', 'pricing', 'Choose a supported pricing method.');
  if (item.priceMode === 'fixed' || item.priceMode === 'unit') {
    if ((publish || item.price !== '') && moneyMinor(item.price) === null)
      add('price', 'pricing', 'Enter a valid KES amount with at most two decimal places.');
    if (publish && !item.unit.trim()) add('unit', 'pricing', 'Choose the price unit.');
  }
  if (item.reservationFee) {
    const fee = item.reservationFee,
      amount = moneyMinor(fee.amount);
    if (
      !['none', 'fixed', 'percentage'].includes(fee.mode) ||
      typeof fee.creditToTotal !== 'boolean'
    )
      add('reservationFee', 'pricing', 'Choose a valid reservation fee policy.');
    else if (
      fee.mode !== 'none' &&
      (amount === null || amount <= 0 || (fee.mode === 'percentage' && amount > 10000))
    )
      add('reservationFee', 'pricing', 'Enter a positive fee; percentages cannot exceed100%.');
  }
  if (publish) {
    if (
      item.fulfilmentMethods &&
      (!item.fulfilmentMethods.length ||
        item.fulfilmentMethods.some((method) => !fulfilmentOptions(item.schemaId).includes(method)))
    )
      add('fulfilmentMethods', 'details', 'Select a supported fulfilment or handover method.');
    if (!item.description.trim())
      add('description', 'details', 'Describe what the customer receives.');
    for (const field of schema.fields) {
      const value = item.fields[field.key];
      if (field.required && (value === '' || value === undefined))
        add(field.key, 'details', `Complete ${field.label.toLowerCase()}.`);
    }
    if (item.image && !item.imageAlt?.trim())
      add('imageAlt', 'details', 'Add a description for the offering photo.');
    if (schema.capacity !== 'scope' && !item.availabilityLinked)
      add(
        'availabilityLinked',
        'availability',
        'Link the stock or resource setup before publishing.',
      );
    if (
      ['calendar', 'asset', 'space', 'session', 'storage'].includes(schema.capacity) &&
      !item.resources.length
    )
      add('resources', 'availability', 'Select at least one eligible resource.');
  }
  for (const field of schema.fields) {
    const value = item.fields[field.key];
    if (value === '' || value === undefined) continue;
    if (
      field.type === 'number' &&
      (!Number.isFinite(Number(value)) ||
        !Number.isInteger(Number(value)) ||
        Number(value) < (field.min ?? 0))
    )
      add(
        field.key,
        'details',
        `${field.label} must be a whole number of at least ${field.min ?? 0}.`,
      );
    if (field.type === 'select' && !field.options?.includes(String(value)))
      add(field.key, 'details', `Choose a valid ${field.label.toLowerCase()}.`);
    if (
      field.type === 'datetime-local' &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value)) ||
        Number.isNaN(Date.parse(String(value))))
    )
      add(field.key, 'details', `Enter a valid ${field.label.toLowerCase()}.`);
  }
  if (Number(item.fields.group_size_min) > Number(item.fields.group_size_max))
    add('group_size_max', 'details', 'Maximum participants must be at least the minimum.');
  if (Number(item.fields.party_min) > Number(item.fields.party_max))
    add('party_max', 'details', 'Maximum party size must be at least the minimum.');
  if (item.stock !== undefined && (!Number.isFinite(item.stock) || item.stock < 0))
    add('stock', 'availability', 'Stock must be zero or greater.');
  const variantNames = new Set<string>();
  if (item.discount?.enabled) {
    const d = item.discount;
    const amount = moneyMinor(d.value);
    const bases = (
      item.variants.length
        ? item.variants.map((v) => moneyMinor(v.price))
        : [moneyMinor(item.price)]
    ).filter((v): v is number => v !== null);
    const start = d.startsAt ? Date.parse(`${d.startsAt}+03:00`) : null;
    const end = d.endsAt ? Date.parse(`${d.endsAt}+03:00`) : null;
    if (
      !['fixed', 'unit'].includes(item.priceMode) ||
      !['percentage', 'amount'].includes(d.kind) ||
      (publish && (!bases.length || amount === null || amount <= 0)) ||
      (amount !== null &&
        (amount <= 0 ||
          (d.kind === 'percentage' ? amount > 10000 : bases.some((base) => amount > base)))) ||
      (d.value !== '' && amount === null) ||
      (start !== null && !Number.isFinite(start)) ||
      (end !== null && !Number.isFinite(end)) ||
      (start !== null && end !== null && end <= start)
    )
      add(
        'discount',
        'pricing',
        'Use a valid discount: up to 100%, or a positive KES amount no greater than each variant price, with a valid date window.',
      );
  }
  for (const v of item.variants) {
    if (
      !v.name.trim() ||
      variantNames.has(v.name.trim().toLowerCase()) ||
      moneyMinor(v.price) === null ||
      (v.stock !== undefined && (!Number.isFinite(v.stock) || v.stock < 0))
    )
      add(
        'variants',
        'pricing',
        'Each variant needs a unique name, valid price and non-negative stock.',
      );
    variantNames.add(v.name.trim().toLowerCase());
  }
  if (item.quantityRules) {
    const q = item.quantityRules;
    const valid = (value: string) =>
      new RegExp(q.precision === 0 ? '^\\d+$' : `^\\d+(?:\\.\\d{1,${q.precision}})?$`).test(
        value,
      ) && Number.isFinite(Number(value));
    if (
      !Number.isInteger(q.precision) ||
      q.precision < 0 ||
      q.precision > 3 ||
      !valid(q.minimum) ||
      Number(q.minimum) <= 0 ||
      (q.maximum !== '' && (!valid(q.maximum) || Number(q.maximum) < Number(q.minimum)))
    )
      add(
        'quantityRules',
        'pricing',
        'Use a positive minimum, a compatible maximum and the declared quantity precision.',
      );
  }
  for (const group of item.optionGroups ?? []) {
    if (
      !Number.isInteger(group.minimum) ||
      !Number.isInteger(group.maximum) ||
      group.minimum < 0 ||
      group.maximum < 1 ||
      group.minimum > group.maximum ||
      (publish && (!group.name.trim() || group.maximum > group.choices.length))
    )
      add(
        'optionGroups',
        'pricing',
        'Each option group needs a name and valid minimum/maximum choice limits.',
      );
    const seen = new Set<string>();
    for (const choice of group.choices) {
      if (
        (publish && (!choice.name.trim() || choice.extra === '')) ||
        (choice.extra !== '' && moneyMinor(choice.extra) === null) ||
        (choice.name.trim() && seen.has(choice.name.trim().toLowerCase())) ||
        choice.variantIds.some((id) => !item.variants.some((v) => v.id === id))
      )
        add(
          'optionGroups',
          'pricing',
          'Choices need unique names, valid extra prices and compatible existing variants.',
        );
      if (choice.name.trim()) seen.add(choice.name.trim().toLowerCase());
    }
  }
  if (item.visibility) {
    const v = item.visibility;
    const start = v.startsAt ? Date.parse(`${v.startsAt}+03:00`) : null;
    const end = v.endsAt ? Date.parse(`${v.endsAt}+03:00`) : null;
    if (
      !v.locations.length ||
      !['marketplace', 'direct', 'both'].includes(v.channel) ||
      (start !== null && !Number.isFinite(start)) ||
      (end !== null && !Number.isFinite(end)) ||
      (start !== null && end !== null && end <= start)
    )
      add(
        'visibility',
        'details',
        'Choose a location and a visibility window whose end follows its start.',
      );
  }
  for (const [id, value] of Object.entries(item.attributes)) {
    const attribute = profile?.attributes.find((a) => a.id === id);
    if (!attribute) {
      add(id, 'details', 'Remove the attribute that is not registered for this specialty.');
      continue;
    }
    if (value === undefined) continue;
    const shape = attribute.schema;
    const type = shape.type;
    const enumValues = shape.enum as unknown[] | undefined;
    const items = shape.items as { enum?: unknown[]; type?: string } | undefined;
    const wrongType =
      type === 'boolean'
        ? typeof value !== 'boolean'
        : type === 'number' || type === 'integer'
          ? typeof value !== 'number' ||
            !Number.isFinite(value) ||
            (type === 'integer' && !Number.isInteger(value))
          : type === 'array'
            ? !Array.isArray(value)
            : type === 'string'
              ? typeof value !== 'string'
              : false;
    if (
      wrongType ||
      (enumValues && !enumValues.includes(value)) ||
      (Array.isArray(value) && items?.enum && value.some((v) => !items.enum!.includes(v)))
    )
      add(id, 'details', `Choose a valid value for ${attribute.label.toLowerCase()}.`);
  }
  if (publish && item.sources.availability === 'external' && item.sync !== 'current')
    add(
      'sync',
      'availability',
      'Refresh the connected source before publishing. Existing publication and current availability remain separate.',
    );
  return issues;
}

export function validateOfferingRelationships(
  item: Offering,
  catalogue: Offering[],
  publish = false,
): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map([...catalogue.filter((o) => o.id !== item.id), item].map((o) => [o.id, o]));
  function visit(id: string, path: Set<string>): boolean {
    if (path.has(id)) return false;
    const next = new Set([...path, id]);
    return (byId.get(id)?.bundleItems ?? []).every(
      (c) => !c.offeringId || visit(c.offeringId, next),
    );
  }
  if (!visit(item.id, new Set()))
    issues.push({
      key: 'bundleItems',
      tab: 'details',
      message: 'A bundle cannot contain itself or a circular chain of bundles.',
    });
  const seen = new Set<string>();
  for (const component of item.bundleItems ?? []) {
    const child = byId.get(component.offeringId);
    if (
      (!child && (publish || component.offeringId !== '')) ||
      !Number.isInteger(component.quantity) ||
      component.quantity < 1 ||
      (component.offeringId && seen.has(component.offeringId))
    )
      issues.push({
        key: 'bundleItems',
        tab: 'details',
        message: 'Choose unique existing bundle constituents and positive whole quantities.',
      });
    if (
      publish &&
      child &&
      (child.publication !== 'published' ||
        child.availabilityPaused ||
        (schemas[child.schemaId]!.capacity === 'stock' &&
          (!child.availabilityLinked ||
            child.stock === undefined ||
            child.stock < component.quantity ||
            child.sync !== 'current')))
    )
      issues.push({
        key: 'bundleItems',
        tab: 'details',
        message:
          'Publish the constituent listings and resolve their availability before publishing this bundle.',
      });
    if (
      publish &&
      child &&
      item.fulfilmentMethods &&
      child.fulfilmentMethods &&
      !item.fulfilmentMethods.some((method) => child.fulfilmentMethods!.includes(method))
    )
      issues.push({
        key: 'bundleItems',
        tab: 'details',
        message: 'Bundle constituents need a compatible fulfilment method.',
      });
    seen.add(component.offeringId);
  }
  return issues;
}

/** Translation seam only: never calls the booking API or creates a booking. */
export function bookingOfferingProjection(item: Offering): Partial<BookingOffering> {
  const schema = schemas[item.schemaId]!;
  const quoting = item.priceMode === 'quote' || item.priceMode === 'enquiry';
  return {
    id: item.id,
    version: item.version,
    name: item.name,
    description: item.description,
    model: schema.model,
    durationMinutes: item.fields.duration_minutes
      ? Number(item.fields.duration_minutes)
      : undefined,
    resourceIds: [...item.resources],
    priceMinor: discountedMinor(item, moneyMinor(item.price) ?? 0),
    currency: 'KES',
    pricingBasis: quoting
      ? 'indicative'
      : item.priceMode === 'unit'
        ? 'per_quantity'
        : 'per_booking',
    intakeMode: quoting ? 'request_quote' : 'instant_after_requirements',
    capacityUnit: item.unit,
    active: item.publication === 'published',
    executionMode: quoting ? 'request_capture' : 'native_reservation',
  };
}

export function seedCatalogue(profile: OfferingProfile): Catalogue {
  const configuration = defaultConfiguration(profile);
  const build = (schemaId: string, name: string, n: number, published = true): Offering => {
    const item = createOffering(profile, schemaId, `${profile.id}-sample-${n}`);
    const schema = schemas[schemaId]!;
    item.name = name;
    item.description = `Includes the stated ${schema.label.toLowerCase()} scope. Contact details and policies are shown before checkout.`;
    item.price = String([3500, 8500, 1500, 1200, 2500][n - 1] ?? 2500);
    item.fields = Object.fromEntries(schema.fields.map((f) => [f.key, f.value ?? '']));
    if (profile.id === 'meet_greet' && schemaId === 'TRANSFER_ROUTE_V1')
      item.fields.transport_mode = 'Greeter only';
    item.resources = [...schema.resources];
    item.availabilityLinked = true;
    if (schema.capacity === 'stock') {
      item.stock = 12;
      item.stockAsOf = '2026-10-31T06:40:00Z';
    }
    item.publication = published ? 'published' : 'draft';
    item.version = 1;
    item.updatedAt = '2026-10-31T06:40:00Z';
    item.history = [{ at: item.updatedAt, action: 'Sample listing created', version: 1 }];
    if (published && validateOffering(item, true).length) item.publication = 'draft';
    return item;
  };
  // This demonstration merchant explicitly offers both services and stocked products.
  const beauty = profile.id === 'makeup';
  if (beauty) {
    configuration.enabledSchemas.push('PRODUCT_CATALOG_V1');
    const offerings = [
      build(profile.schema, 'Occasion makeup', 1, false),
      build(profile.schema, 'Bridal makeup', 2),
      build(profile.schema, 'Makeup consultation', 3),
      build('PRODUCT_CATALOG_V1', 'Lip tint', 4),
      build('PRODUCT_CATALOG_V1', 'Brush set', 5, false),
    ];
    offerings[0]!.description = 'Makeup for celebrations, tailored to your look.';
    offerings[1]!.fields.duration_minutes = 120;
    offerings[2]!.fields.duration_minutes = 30;
    offerings[3]!.sources.availability = 'external';
    offerings[4]!.stock = undefined;
    offerings[4]!.availabilityLinked = false;
    offerings[4]!.fields.sale_unit = 'set';
    offerings[4]!.unit = 'set';
    return { revision: 1, configuration, offerings };
  }
  return {
    revision: 1,
    configuration,
    offerings: [
      build(profile.schema, `${profile.name} · standard`, 1),
      build(profile.schema, `${profile.name} · tailored option`, 2, false),
    ],
  };
}

export function assertEditable(previous: Offering, next: Offering) {
  if (previous.sources.details === 'external') {
    for (const key of [
      'name',
      'description',
      'fields',
      'attributes',
      'image',
      'imageAlt',
      'fulfilmentMethods',
      'fulfilmentInstructions',
      'section',
      'tags',
      'bundleItems',
      'visibility',
    ] as const) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
        throw new Error('Details are managed in the connected system.');
    }
  }
  if (
    previous.sources.price === 'external' &&
    [
      'price',
      'priceMode',
      'unit',
      'variants',
      'quantityRules',
      'optionGroups',
      'discount',
      'reservationFee',
    ].some(
      (key) =>
        JSON.stringify(previous[key as keyof Offering]) !==
        JSON.stringify(next[key as keyof Offering]),
    )
  )
    throw new Error('Prices are managed in the connected system.');
  if (
    previous.sources.availability === 'external' &&
    (['stock', 'resources', 'availabilityLinked', 'availabilityPaused'].some(
      (key) =>
        JSON.stringify(previous[key as keyof Offering]) !==
        JSON.stringify(next[key as keyof Offering]),
    ) ||
      next.variants.some(
        (v) => v.stock !== previous.variants.find((old) => old.id === v.id)?.stock,
      ))
  )
    throw new Error('Availability is managed in the connected system.');
}
