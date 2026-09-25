/**
 * The CSS variable the Tailwind preset reads for the sans stack.
 *
 * Each app loads Manrope with `next/font` and binds it to this name, so the
 * font is declared once per app but named once here.
 */
export const FONT_VARIABLE = '--font-manrope';

/** Weights the design uses: 400 body, 600 emphasis, 700 headings, 800 display. */
export const MANROPE_WEIGHTS = ['400', '600', '700', '800'] as const;
