import taxonomy from '../../docs/discovery/TAXONOMY_V1.1.json';
import configuration from '../../docs/discovery/DISCOVERY_CONFIGURATION_V1.1.json';
import { webIcons } from './webIcons.generated';

interface ConfigOption { id: string; label: string; source_subcategory_ids: string[] }
interface ConfigSubcategory {
  name: string;
  discovery_key: string;
  source_subcategory_ids: string[];
  nested_option_candidates: ConfigOption[];
  journey?: string;
}
interface ConfigCategory {
  category: string;
  discovery_key: string;
  customer_task: string;
  source_category_ids: string[];
  subcategories: ConfigSubcategory[];
}

export interface DiscoveryOption { id: string; label: string; sourceIds: string[] }
export interface DiscoverySubcategory {
  id: string;
  label: string;
  icon?: string;
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
  sourceIds: string[];
  subcategories: DiscoverySubcategory[];
}

interface DiscoveryConfiguration {
  categories: ConfigCategory[];
  homepage_category_order: string[];
}

const config = (configuration as DiscoveryConfiguration).categories;
/**
 * The URL a taxonomy icon is drawn from: its 256 px WebP web copy (scripts/icons/build-web-icons.mjs) when one
 * exists, else the original PNG through the /icons/ route. Originals weigh megabytes each, copies a few kilobytes.
 */
export function iconUrl(reference: string | null | undefined): string | undefined {
  if (!reference) return undefined;
  const icon = reference.replace(/^references\/icons-v1\.1\/NexG_Discovery_Icons\//, '');
  return webIcons.get(icon) ?? '/icons/' + icon;
}

/** Navigation is generated from the final pack-derived V1.1 docs, never the old platform registry. */
export const categories: DiscoveryCategory[] = taxonomy.categories.map((category, index) => {
  const details = config[index];
  if (!details || details.category !== category.name) throw new Error(`Discovery configuration mismatch: ${category.name}`);
  return {
    id: details.discovery_key,
    label: category.name,
    icon: iconUrl(category.icon_reference),
    position: category.position,
    description: details.customer_task,
    sourceIds: details.source_category_ids,
    subcategories: category.subcategories.map((subcategory) => {
      const match = details.subcategories.find((entry) => entry.name === subcategory.name);
      if (!match) throw new Error(`Discovery subcategory configuration missing: ${subcategory.name}`);
      return {
        id: match.discovery_key,
        label: subcategory.name,
        icon: iconUrl(subcategory.icon_reference),
        sourceIds: match.source_subcategory_ids,
        options: match.nested_option_candidates.map((option) => ({ id: option.id, label: option.label, sourceIds: option.source_subcategory_ids })),
        ...(match.journey ? { journey: match.journey } : {}),
      };
    }),
  };
});

export const taxonomyVersion = taxonomy.version;
export const categoryCount = categories.length;
export const subcategoryCount = categories.reduce((total, category) => total + category.subcategories.length, 0);
const categoriesById = new Map(categories.map((category) => [category.id, category]));
const homepageOrder = (configuration as DiscoveryConfiguration).homepage_category_order;
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
