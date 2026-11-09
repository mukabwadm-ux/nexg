import localFont from 'next/font/local';

/**
 * Manrope 400–800, bundled in the repo so a build never fetches fonts.
 *
 * This used to be `next/font/google`, which downloads the CSS and font
 * files from fonts.googleapis.com at build time. When Google rate-limits
 * or the network blips, the CSS cannot be parsed and the whole build fails
 * inside next/font. The file is Google's own Manrope v23 latin subset
 * (a variable font covering every weight), so the face is unchanged.
 *
 * Import this only from a Next.js app (`@nexg/ui/fonts/manrope`): the
 * `next/font` call is compiled by Next and does not run anywhere else.
 * The options match the old Google call: 400/600/700/800 (spec section 2),
 * `display: swap`, and the same fallback stack.
 *
 * The four weights are declared as four faces over the one file, exactly
 * as Google's CSS did, rather than as a `400 800` range. That keeps weight
 * matching identical: a `font-medium` (500) request still resolves to the
 * 400 face instead of suddenly rendering a true 500. The path is repeated
 * because next/font only accepts literal options.
 */
export const manrope = localFont({
  src: [
    { path: '../../fonts/manrope/manrope-latin-v23.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/manrope/manrope-latin-v23.woff2', weight: '600', style: 'normal' },
    { path: '../../fonts/manrope/manrope-latin-v23.woff2', weight: '700', style: 'normal' },
    { path: '../../fonts/manrope/manrope-latin-v23.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-manrope',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});
