import { categoryName } from '@nexg/contracts';

/**
 * What the person on a ticket said they need, in one line the desk can read
 * before calling back: the category picked on the Ask a concierge form
 * (`details.category`, an id, shown by its current name), or the chip pressed
 * on requests from before that dropdown (`details.need`). Null when the form
 * asked neither.
 */
export function ticketCategory(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const asked = details as Record<string, unknown>;
  if (typeof asked.category === 'string' && asked.category.trim())
    return categoryName(asked.category.trim()) ?? asked.category.trim();
  if (typeof asked.need === 'string' && asked.need.trim()) return asked.need.trim();
  return null;
}
