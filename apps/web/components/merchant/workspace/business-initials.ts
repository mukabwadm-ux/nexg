/**
 * The letters on the business badge in the workspace sidebar: the first letter
 * of each of the first two words ("Deck Supplies" → "DS"), or the first two
 * letters of a one-word name ("Razzors" → "RA"). Punctuation is ignored.
 */
export function businessInitials(name: string | null | undefined): string {
  const words = (name ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const [first, second] = words;
  if (!first) return 'ME';
  const letters = second ? [[...first][0], [...second][0]] : [...first].slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}
