import data from './data/subcategory-variants.json';

/**
 * Subcategories added after the audited 128-profile snapshot.
 *
 * Each variant is a real subcategory (merchants choose it, it is stored and
 * validated like any other) but it reuses an existing profile's booking
 * model, setup questions and rules: `baseSubcategoryId`. Only the id, name
 * and description differ. That keeps the generated registry and its
 * projections as they were audited, while every lookup by subcategory id
 * still resolves.
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
};

export const SUBCATEGORY_VARIANTS: readonly SubcategoryVariant[] = data.variants;

/** The registry revision that includes the variants. */
export const VARIANT_REGISTRY_REVISION: string = data.revision;
/** The audited snapshot revision the variants extend. */
export const VARIANT_BASE_REVISION: string = data.baseRevision;

const byId = new Map(SUBCATEGORY_VARIANTS.map((variant) => [variant.subcategoryId, variant]));

export function subcategoryVariant(id: string): SubcategoryVariant | undefined {
  return byId.get(id);
}

/** The profile whose booking setup a subcategory uses: itself, or its base. */
export function baseSubcategoryId(id: string): string {
  return byId.get(id)?.baseSubcategoryId ?? id;
}

/**
 * Adds a clone of each variant's base entry to a list keyed by subcategory
 * id, straight after the last entry of the variant's category so category
 * order holds. Used for every projection built from the 128 snapshot.
 * Throws if a base is missing or a variant id collides, so a bad edit to
 * the variant list fails loudly in tests rather than silently.
 */
export function withSubcategoryVariants<T extends { categoryId: string }>(
  items: readonly T[],
  idOf: (item: T) => string,
  clone: (base: T, variant: SubcategoryVariant) => T,
): T[] {
  const ids = new Map(items.map((item) => [idOf(item), item]));
  const after = new Map<number, T[]>();
  for (const variant of SUBCATEGORY_VARIANTS) {
    if (ids.has(variant.subcategoryId))
      throw new Error(`Subcategory variant ${variant.subcategoryId} already exists.`);
    const base = ids.get(variant.baseSubcategoryId);
    if (!base || base.categoryId !== variant.categoryId)
      throw new Error(
        `Subcategory variant ${variant.subcategoryId} needs a base in ${variant.categoryId}; ${variant.baseSubcategoryId} is not one.`,
      );
    let last = items.length - 1;
    while (last > 0 && items[last]!.categoryId !== variant.categoryId) last -= 1;
    after.set(last, [...(after.get(last) ?? []), clone(base, variant)]);
  }
  return items.flatMap((item, index) => [item, ...(after.get(index) ?? [])]);
}
