import navigation from '../../docs/discovery/MASTER_NAVIGATION.json';
import { webIcons } from './webIcons.generated';

interface ConfigOption { id: string; label: string; source_subcategory_ids: string[] }
interface ConfigSubcategory {
  position: number;
  name: string;
  icon_reference: string | null;
  discovery_key: string;
  supabase: { category: string; subcategory: string };
  base: string;
  group?: string;
  source_subcategory_ids: string[];
  nested_option_candidates: ConfigOption[];
  journey?: string;
  legacy_discovery_keys: string[];
}
interface ConfigCategory {
  position: number;
  category: string;
  icon_reference: string;
  discovery_key: string;
  supabase_category: string;
  customer_task: string;
  source_category_ids: string[];
  legacy_discovery_keys: string[];
  subcategories: ConfigSubcategory[];
}

export interface DiscoveryOption { id: string; label: string; sourceIds: string[] }
export interface DiscoverySubcategory {
  id: string;
  label: string;
  /** The pack icon that matches it, else its category's icon (no artwork was made for the master list). */
  icon?: string;
  /** A heading the master list sets over a run of subcategories (Wellness: "Spa & Massage", "Salon Services"…). */
  group?: string;
  /** The audited booking profile the master list says it reuses (massage, gym, haircare…). */
  base: string;
  /** Its Supabase merchant.subcategory key. */
  supabaseKey: string;
  sourceIds: string[];
  options: DiscoveryOption[];
  /** Default journey from CATEGORY_FLOWS.md (PURCHASE, APPOINTMENT, TOUR…); it picks the card kind, never a transaction. */
  journey?: string;
}
export interface DiscoveryCategory {
  id: string;
  label: string;
  icon?: string;
  position: number;
  description: string;
  /** Its Supabase category_config.category key. */
  supabaseKey: string;
  sourceIds: string[];
  subcategories: DiscoverySubcategory[];
}

interface DiscoveryNavigation {
  version: string;
  categories: ConfigCategory[];
  homepage_category_order: string[];
  legacy_category_keys: Record<string, string>;
}

/** The JSON's inferred types are wider than the generator writes (an empty options list, an optional group). */
const nav = navigation as unknown as DiscoveryNavigation;
const config = nav.categories;
/**
 * The URL a taxonomy icon is drawn from: its 256 px WebP web copy (scripts/icons/build-web-icons.mjs) when one
 * exists, else the original PNG through the /icons/ route. Originals weigh megabytes each, copies a few kilobytes.
 */
export function iconUrl(reference: string | null | undefined): string | undefined {
  if (!reference) return undefined;
  const icon = reference.replace(/^references\/icons-v1\.1\/NexG_Discovery_Icons\//, '');
  return webIcons.get(icon) ?? ((import.meta.env?.BASE_URL as string | undefined) ?? '/') + 'icons/' + icon;
}

/**
 * Navigation is NexG's master category list (owner, 16 Nov 2026), generated into the docs by
 * scripts/taxonomy/build.mjs: 21 categories in the master order, with the master names.
 */
export const categories: DiscoveryCategory[] = config.map((category) => {
  const categoryIcon = iconUrl(category.icon_reference);
  return {
    id: category.discovery_key,
    label: category.category,
    icon: categoryIcon,
    position: category.position,
    description: category.customer_task,
    supabaseKey: category.supabase_category,
    sourceIds: category.source_category_ids,
    subcategories: category.subcategories.map((subcategory) => ({
      id: subcategory.discovery_key,
      label: subcategory.name,
      icon: iconUrl(subcategory.icon_reference) ?? categoryIcon,
      ...(subcategory.group ? { group: subcategory.group } : {}),
      base: subcategory.base,
      supabaseKey: subcategory.supabase.subcategory,
      sourceIds: subcategory.source_subcategory_ids,
      options: subcategory.nested_option_candidates.map((option) => ({ id: option.id, label: option.label, sourceIds: option.source_subcategory_ids })),
      ...(subcategory.journey ? { journey: subcategory.journey } : {}),
    })),
  };
});

export const taxonomyVersion = nav.version;
export const categoryCount = categories.length;
export const subcategoryCount = categories.reduce((total, category) => total + category.subcategories.length, 0);
const categoriesById = new Map(categories.map((category) => [category.id, category]));
const homepageOrder = nav.homepage_category_order;
if (
  homepageOrder.length !== categories.length ||
  new Set(homepageOrder).size !== categories.length ||
  categories.some((category) => !homepageOrder.includes(category.id))
) {
  throw new Error('Homepage category priority must include every category exactly once');
}
export const homepageCategories = homepageOrder.map((id) => {
  const category = categoriesById.get(id);
  if (!category) throw new Error(`Homepage category priority references unknown category: ${id}`);
  return category;
});
export const findCategory = (id?: string) => categories.find((category) => category.id === id);
export const findSubcategory = (categoryId?: string, subcategoryId?: string) => findCategory(categoryId)?.subcategories.find((subcategory) => subcategory.id === subcategoryId);

/** Old Discovery ids (the icon-pack taxonomy before 16 Nov 2026) that still open a page: `health-pharmacy` → `pharmacy`. */
const legacyCategories: ReadonlyMap<string, string> = new Map(Object.entries(nav.legacy_category_keys));
const legacySubcategories: ReadonlyMap<string, { categoryId: string; subcategoryId: string }> = new Map(config.flatMap((category) =>
  category.subcategories.flatMap((subcategory) => subcategory.legacy_discovery_keys.map((old) => [old, { categoryId: category.discovery_key, subcategoryId: subcategory.discovery_key }] as const))));

/**
 * A category and subcategory from an address, with old ids moved to where their stores are now. An old
 * subcategory id names its new category too. Unknown ids come back unchanged, so the page can say so.
 */
export function currentTaxonomyIds(categoryId?: string, subcategoryId?: string): { categoryId?: string; subcategoryId?: string } {
  const subcategory = subcategoryId ? legacySubcategories.get(subcategoryId) : undefined;
  if (subcategory) return subcategory;
  return { categoryId: categoryId ? legacyCategories.get(categoryId) ?? categoryId : undefined, subcategoryId };
}
