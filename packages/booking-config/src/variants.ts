import data from './data/subcategory-variants.json';

/**
 * NexG's category list and the subcategories added after the audited 128-profile snapshot.
 *
 * Generated from packages/contracts/src/data/category-master.json by
 * scripts/categories/build.mjs; edit the master file, not the JSON here.
 *
 * Each variant is a real subcategory (merchants choose it, it is stored and
 * validated like any other) but it reuses an existing profile's booking
 * model, setup questions and rules: `baseSubcategoryId`, which may sit in
 * another category. Only the id, name, category and description differ. That
 * keeps the generated registry and its projections as they were audited, while
 * every lookup by subcategory id still resolves.
 *
 * `LISTED_CATEGORIES` is what merchants can choose. Audited profiles that are
 * not listed stay valid (applications already reference them) but are not
 * offered.
 *
 * Kept free of the registry import so the lightweight `/profiles` export
 * can use it too.
 */
export type SubcategoryVariant = {
  subcategoryId: string;
  name: string;
  categoryId: string;
  baseSubcategoryId: string;
  specialtyNeeds: string;
  group?: string;
  /** Booking questions the base profile lacks, asked as well (the Adult Section's age check). */
  extraQuestionIds?: string[];
};
export type ListedCategory = { id: string; name: string; subcategoryIds: string[] };

export const SUBCATEGORY_VARIANTS: readonly SubcategoryVariant[] = data.variants;
/** The categories merchants can choose, in display order, with their subcategories. */
export const LISTED_CATEGORIES: readonly ListedCategory[] = data.categories;
/** Retired category id → the category that replaced it. */
export const RETIRED_CATEGORIES: Readonly<Record<string, string>> = data.retiredCategories;

/** The registry revision that includes the variants. */
export const VARIANT_REGISTRY_REVISION: string = data.revision;
/** The audited snapshot revision the variants extend. */
export const VARIANT_BASE_REVISION: string = data.baseRevision;

const byId = new Map(SUBCATEGORY_VARIANTS.map((variant) => [variant.subcategoryId, variant]));
const renames: Record<string, string> = data.renames;
const groups: Record<string, string> = data.groups;
const categoryNames = new Map(LISTED_CATEGORIES.map((category) => [category.id, category.name]));
const listedIds = new Set(LISTED_CATEGORIES.flatMap((category) => category.subcategoryIds));
const listedOrder = new Map(
  LISTED_CATEGORIES.flatMap((category) => category.subcategoryIds).map((id, index) => [id, index]),
);
const categoryOrder = new Map(LISTED_CATEGORIES.map((category, index) => [category.id, index]));

export function subcategoryVariant(id: string): SubcategoryVariant | undefined {
  return byId.get(id);
}

/** The profile whose booking setup a subcategory uses: itself, or its base. */
export function baseSubcategoryId(id: string): string {
  return byId.get(id)?.baseSubcategoryId ?? id;
}

/** Whether merchants can choose this subcategory now (false for retired ones). */
export function isListedSubcategory(id: string): boolean {
  return listedIds.has(id);
}

/** A category's current name, or undefined for one that is not listed. */
export function listedCategoryName(id: string): string | undefined {
  return categoryNames.get(id);
}

/** The heading a subcategory sits under in pickers (Wellness), if any. */
export function subcategoryGroup(id: string): string | undefined {
  return byId.get(id)?.group ?? groups[id];
}

/**
 * Adds a clone of each variant's base entry to a list keyed by subcategory id,
 * gives audited profiles their current names, and orders the result: listed
 * subcategories first in the master order, then the rest as they were.
 * Used for every projection built from the 128 snapshot.
 * Throws if a base is missing or a variant id collides, so a bad edit to
 * the variant list fails loudly in tests rather than silently.
 */
export function withSubcategoryVariants<T extends { categoryId: string }>(
  items: readonly T[],
  idOf: (item: T) => string,
  clone: (base: T, variant: SubcategoryVariant) => T,
): T[] {
  const ids = new Map(items.map((item) => [idOf(item), item]));
  const added: T[] = [];
  for (const variant of SUBCATEGORY_VARIANTS) {
    if (ids.has(variant.subcategoryId))
      throw new Error(`Subcategory variant ${variant.subcategoryId} already exists.`);
    const base = ids.get(variant.baseSubcategoryId);
    if (!base)
      throw new Error(
        `Subcategory variant ${variant.subcategoryId} needs base ${variant.baseSubcategoryId}, which is missing.`,
      );
    added.push(
      withExtraQuestions(
        retag(clone(base, variant), variant.categoryId, variant.name),
        variant.extraQuestionIds,
      ),
    );
  }
  const all = [...items.map((item) => retag(item, item.categoryId, renames[idOf(item)])), ...added];
  const rank = (item: T, index: number) => {
    const listed = listedOrder.get(idOf(item));
    return listed === undefined
      ? listedOrder.size + (categoryOrder.get(item.categoryId) ?? categoryOrder.size) * 1000 + index
      : listed;
  };
  return all
    .map((item, index) => ({ item, key: rank(item, index) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

/** Appends a variant's extra question ids to whichever question list the projection carries. */
function withExtraQuestions<T>(item: T, extra: readonly string[] | undefined): T {
  if (!extra?.length) return item;
  const record = item as Record<string, unknown>;
  for (const key of ['sourceQuestionIds', 'questions']) {
    const list = record[key];
    if (Array.isArray(list) && list.every((id) => typeof id === 'string'))
      record[key] = [...list, ...extra.filter((id) => !list.includes(id))];
  }
  return item;
}

/** Sets category, current category name and (when the item has one) name. */
function retag<T extends { categoryId: string }>(item: T, categoryId: string, name?: string): T {
  const out: T = { ...item, categoryId };
  const record = out as Record<string, unknown>;
  if (name !== undefined && 'name' in record) record.name = name;
  const categoryName = categoryNames.get(categoryId);
  if ('categoryName' in record && categoryName) record.categoryName = categoryName;
  return out;
}
