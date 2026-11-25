/**
 * Count one visit to a category (a tap on a homepage tile or a category
 * card) or one search that led to it, so Popular categories can follow what
 * people want (lib/categories, popularTiles).
 *
 * At most once per category and kind per browser per day, without holding
 * up the navigation. Only the category id is sent: nothing about the
 * visitor, and never the words typed.
 */
export type CategorySignal = 'visit' | 'search';

export function recordCategorySignal(category: string | undefined, kind: CategorySignal) {
  if (!category || typeof navigator === 'undefined') return;
  const today = new Date().toISOString().slice(0, 10);
  const key = `nexg.category-${kind}.${category}`;
  try {
    if (window.localStorage.getItem(key) === today) return;
    window.localStorage.setItem(key, today);
  } catch {
    /* Private mode or storage blocked: count it anyway. */
  }
  const body = JSON.stringify({ category, kind });
  if (
    !navigator.sendBeacon?.('/api/category-tap', new Blob([body], { type: 'application/json' }))
  ) {
    void fetch('/api/category-tap', { method: 'POST', body, keepalive: true }).catch(
      () => undefined,
    );
  }
}
