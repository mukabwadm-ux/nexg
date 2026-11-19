import { PageHead } from '@/components/merchant/frame';
import {
  ItemChoices,
  type ChoiceItemRow,
  type OptionGroupRow,
} from '@/components/partner/merchant-item-choices';
import { Menu, type ItemRow, type SectionRow } from '@/components/partner/merchant-menu';
import { SetupReview } from '@/components/partner/merchant-setup-review';
import { requireMerchant, setupPageOrWorkspace } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';
import { getCatalogueExample } from '@nexg/contracts';

export const metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

/**
 * The menu.
 *
 * Merchants set and change their own prices here. Checkout reads the price
 * from the same row, so an edit is live for the next order.
 */
export default async function MerchantMenu() {
  const me = await setupPageOrWorkspace(
    () => requireMerchant({ access: 'setup' }),
    '/merchant/offerings',
  );
  const supabase = createClient();

  const [
    { data, error },
    { data: sectionData },
    { data: merchantData },
    { data: groupData },
    { data: linkData },
    { data: attributeData },
    { data: variantData },
    { data: reviewData },
  ] = await Promise.all([
    supabase
      .from('catalogue_item')
      .select(
        'id, section_id, name, description, price_kes, available, age_restricted, sort, photo_path, portion_size, ingredients, allergens, dietary_labels, availability_notes, handling_notes, storage_guidance, prep_time_minutes, sold_by, unit_label, unit_step, unit_min, unit_max, price_is_estimate, kind, booking_offering_id',
      )
      .eq('merchant_id', me.id)
      .order('sort'),
    supabase.from('catalogue_section').select('id, name').eq('merchant_id', me.id).order('sort'),
    supabase
      .from('merchant')
      .select('category, category_key, subcategory')
      .eq('id', me.id)
      .maybeSingle(),
    supabase
      .from('modifier_group')
      .select(
        'id, name, required, max_choices, sort, modifier_option(id, name, extra_cents, available, sort)',
      )
      .eq('merchant_id', me.id)
      .is('archived_at', null)
      .order('sort'),
    supabase.from('catalogue_item_modifier').select('item_id, group_id, sort').order('sort'),
    supabase
      .from('catalogue_attribute')
      .select('id, item_id, name, sort, catalogue_attribute_value(id, name, sort)')
      .order('sort'),
    supabase
      .from('catalogue_variant')
      .select('id, item_id, value_ids, price_kes, available, stock_count, sku')
      .is('archived_at', null),
    supabase
      .from('catalogue_setup_review')
      .select('id, item_id, kind, message, created_at')
      .eq('merchant_id', me.id)
      .is('resolved_at', null)
      .order('created_at'),
  ]);

  const itemRows = (data as ItemRow[] | null) ?? [];
  const photoPaths = itemRows.flatMap((item) => (item.photo_path ? [item.photo_path] : []));
  const { data: signedPhotos } = photoPaths.length
    ? await supabase.storage.from('catalogue-images').createSignedUrls(photoPaths, 60 * 60)
    : { data: [] };
  const photoUrls = new Map(
    (signedPhotos ?? []).flatMap((photo) =>
      photo.signedUrl ? [[photo.path, photo.signedUrl]] : [],
    ),
  );
  const items = itemRows.map((item) => ({
    ...item,
    photo_url: item.photo_path ? (photoUrls.get(item.photo_path) ?? null) : null,
  }));
  const sections = (sectionData as SectionRow[] | null) ?? [];
  const groups: OptionGroupRow[] = (groupData ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    max_choices: g.max_choices,
    options: [...(g.modifier_option ?? [])]
      .sort((a, b) => a.sort - b.sort)
      .map((o) => ({ id: o.id, name: o.name, extra_cents: o.extra_cents, available: o.available })),
  }));
  const choiceItems: ChoiceItemRow[] = itemRows.map((item) => ({
    ...item,
    group_ids: (linkData ?? []).filter((l) => l.item_id === item.id).map((l) => l.group_id),
    variants: itemVariants(item.id, attributeData ?? [], variantData ?? []),
  }));
  const on = items.filter((i) => i.available);
  const categoryId = merchantData?.category_key ?? merchantData?.category;
  const { data: categoryConfig, error: categoryConfigError } = categoryId
    ? await supabase
        .from('category_config')
        .select('catalogue_example, subcategories')
        .eq('category', categoryId)
        .maybeSingle()
    : { data: null, error: null };
  if (categoryConfigError) {
    throw new Error(`Could not load catalogue guidance: ${categoryConfigError.message}`);
  }
  const configuredSubcategory = Array.isArray(categoryConfig?.subcategories)
    ? categoryConfig.subcategories.find(
        (subcategory) =>
          subcategory &&
          typeof subcategory === 'object' &&
          !Array.isArray(subcategory) &&
          subcategory.id === merchantData?.subcategory,
      )
    : null;
  const configuredExample =
    configuredSubcategory &&
    typeof configuredSubcategory === 'object' &&
    !Array.isArray(configuredSubcategory)
      ? configuredSubcategory.catalogueExample
      : null;
  const categoryExample = categoryConfig?.catalogue_example;
  const catalogueExample = isCatalogueExample(configuredExample)
    ? configuredExample
    : isCatalogueExample(categoryExample)
      ? categoryExample
      : getCatalogueExample(categoryId, merchantData?.subcategory);

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Catalogue"
        lead="Everything guests can order from you. Set your own prices, add items, and switch things off when they run out; changes are live for the next order."
      />
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your menu could not be read: {error.message}
        </p>
      )}
      <SetupReview lines={reviewData ?? []} />
      <Menu
        items={items}
        available={on.length}
        merchantId={me.id}
        sections={sections}
        catalogueExample={catalogueExample}
      />
      <ItemChoices groups={groups} items={choiceItems} />
    </div>
  );
}

function isCatalogueExample(value: unknown): value is {
  name: string;
  description: string;
  pricePlaceholder: string;
  photoHint: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const example = value as Record<string, unknown>;
  return (
    typeof example.name === 'string' &&
    typeof example.description === 'string' &&
    typeof example.pricePlaceholder === 'string' &&
    typeof example.photoHint === 'string'
  );
}

interface AttributeRow {
  id: string;
  item_id: string;
  name: string;
  sort: number;
  catalogue_attribute_value: { id: string; name: string; sort: number }[] | null;
}
interface VariantRow {
  id: string;
  item_id: string;
  value_ids: string[];
  price_kes: number;
  available: boolean;
  stock_count: number | null;
  sku: string | null;
}

/** An item's saved versions in the shape the Menu grid edits: names, not ids. */
function itemVariants(itemId: string, attributes: AttributeRow[], variants: VariantRow[]) {
  const mine = attributes.filter((a) => a.item_id === itemId).sort((a, b) => a.sort - b.sort);
  const names = new Map(
    mine.flatMap((a) => (a.catalogue_attribute_value ?? []).map((v) => [v.id, v.name] as const)),
  );
  return {
    attributes: mine.map((a) => ({
      name: a.name,
      values: [...(a.catalogue_attribute_value ?? [])]
        .sort((x, y) => x.sort - y.sort)
        .map((v) => v.name),
    })),
    variants: variants
      .filter((v) => v.item_id === itemId)
      .map((v) => ({
        values: v.value_ids.map((id) => names.get(id) ?? ''),
        priceKes: v.price_kes,
        available: v.available,
        stockCount: v.stock_count,
        sku: v.sku,
      })),
  };
}
