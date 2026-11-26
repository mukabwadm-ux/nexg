/** The console's old address, now served by this site as a 404 only. */
const RETIRED_HOST = [{ type: 'host', value: 'admin.nexgapp.com' }];
/** Page paths only: not /_next, /api, or a file (anything with a dot). */
const RETIRED_PAGE_PATH = ':path((?!_next/|api/)[^.]*)';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Separate output directories for dev and build. They share `.next` by
   * default, so running `pnpm build` while a dev server is up wipes the
   * chunks that server is still serving — the page then renders with no CSS
   * at all, which looks like a styling bug rather than a clobbered directory.
   */
  distDir:
    process.env.NEXG_NEXT_DIST_DIR ??
    (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  ...(process.env.NODE_ENV === 'development'
    ? {
        // Retain the portal's nine sections between background loading and use.
        onDemandEntries: {
          maxInactiveAge: 30 * 60 * 1000,
          pagesBufferLength: 16,
        },
      }
    : {}),
  // The workspace packages ship TypeScript source rather than a build output.
  transpilePackages: [
    '@nexg/ui',
    '@nexg/db',
    '@nexg/location',
    '@nexg/merchant-agreement',
    '@nexg/contracts',
    '@nexg/booking-config',
  ],
  eslint: {
    // `pnpm lint` runs ESLint as its own CI step; do not run it twice.
    ignoreDuringBuilds: true,
  },
  /*
   * Serve images as they are, not through Vercel's /_next/image optimizer.
   * The Hobby plan's image-optimization quota ran out (2026-11-25) and every
   * optimized image then failed with "402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED":
   * a broken-image icon on store cards, category tiles and logos.
   */
  images: { unoptimized: true },
  /*
   * NexG Discovery: its own app, built into public/discover by `discovery/scripts/build-for-web.mjs` (the
   * `build` and `discover` scripts). The /discover page (app/discover) shows the site header over it.
   * Same origin as the rest of the site, so its cart is this site's cart (localStorage "nexg.cart.v1").
   * The build also leaves Discovery's own index.html there, which has no site header; its address
   * goes to the page instead, query string and all.
   */
  async redirects() {
    return [
      { source: '/discover/index.html', destination: '/discover', permanent: false },
      // The account deletion page's short address, for the app stores.
      { source: '/delete-account', destination: '/account/delete', permanent: false },
      /*
       * On the retired admin.nexgapp.com, a link followed from its own 404 page
       * (the header, footer and "Ask the concierge desk") goes on to the same
       * path on www. Anything else on that host is the 404 (see rewrites).
       */
      {
        source: `/${RETIRED_PAGE_PATH}`,
        has: [
          ...RETIRED_HOST,
          { type: 'header', key: 'referer', value: 'https://admin\\.nexgapp\\.com(/.*)?' },
        ],
        destination: 'https://www.nexgapp.com/:path',
        permanent: false,
      },
    ];
  },
  /*
   * The page behind the "Open NEXG" button in the code emails (supabase/app-emails/README.md):
   * https://www.nexgapp.com/app/code#type=…&email=…&code=…  A rewrite, not a redirect, so the address
   * keeps its fragment. The file is public/app-code.html, a copy of the Consumer app's
   * docs/email-templates/app-code.html; it is static and not indexed, and middleware does not run on it.
   */
  async rewrites() {
    return {
      /*
       * admin.nexgapp.com is retired (the console moved; the owner, 25 Nov 2026).
       * Every page there is the site's 404, under the site's header and footer, and
       * nothing on it points at the console. Before files, so `/` and every real
       * route on that host land on the 404 too; the site's own files (/_next, /api,
       * anything with an extension) still load, or the page could not draw.
       */
      beforeFiles: [
        {
          source: `/${RETIRED_PAGE_PATH}`,
          has: RETIRED_HOST,
          destination: '/retired-address-not-found',
        },
      ],
      afterFiles: [{ source: '/app/code', destination: '/app-code.html' }],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        has: RETIRED_HOST,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      { source: '/app/code', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/app-code.html', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
  experimental: {
    // Without @nexg/ui here, importing a Button from the barrel pulls in
    // PhoneInput and therefore libphonenumber-js on every page.
    optimizePackageImports: ['lucide-react', '@nexg/ui'],
  },
};

export default nextConfig;
