import { PageHead } from '@/components/merchant/frame';
import { Menu, type ItemRow, type SectionRow } from '@/components/partner/merchant-menu';
import { requireMerchant } from '@/lib/partner';
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
  const me = await requireMerchant();
  const supabase = createClient();

  const [{ data, error }, { data: sectionData }, { data: merchantData }] = await Promise.all([
    supabase
      .from('catalogue_item')
      .select('id, name, description, price_kes, available, age_restricted, sort, photo_path')
      .eq('merchant_id', me.id)
      .order('sort'),
    supabase.from('catalogue_section').select('id, name').eq('merchant_id', me.id).order('sort'),
    supabase.from('merchant').select('category, category_key, subcategory').eq('id', me.id).maybeSingle(),
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
      <Menu
        items={items}
        available={on.length}
        merchantId={me.id}
        sections={sections}
        catalogueExample={catalogueExample}
      />
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
