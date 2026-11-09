/**
 * The CSS variable the Tailwind preset reads for the sans stack.
 *
 * Each app binds its bundled Manrope to this name (admin and api through
 * `@nexg/ui/fonts/manrope`), so the font is named once here.
 */
export const FONT_VARIABLE = '--font-manrope';

/** Weights the design uses: 400 body, 600 emphasis, 700 headings, 800 display. */
export const MANROPE_WEIGHTS = ['400', '600', '700', '800'] as const;
