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
    '@nexg/contracts',
    '@nexg/booking-config',
  ],
  eslint: {
    // `pnpm lint` runs ESLint as its own CI step; do not run it twice.
    ignoreDuringBuilds: true,
  },
  /*
   * NexG Discovery: its own app, built into public/discover by `discovery/scripts/build-for-web.mjs` (the
   * `build` and `discover` scripts). The /discover page (app/discover) shows the site header over it.
   * Same origin as the rest of the site, so its cart is this site's cart (localStorage "nexg.cart.v1").
   * The build also leaves Discovery's own index.html there, which has no site header; its address
   * goes to the page instead, query string and all.
   */
  async redirects() {
    return [{ source: '/discover/index.html', destination: '/discover', permanent: false }];
  },
  /*
   * The page behind the "Open NEXG" button in the code emails (supabase/app-emails/README.md):
   * https://www.nexgapp.com/app/code#type=…&email=…&code=…  A rewrite, not a redirect, so the address
   * keeps its fragment. The file is public/app-code.html, a copy of the Consumer app's
   * docs/email-templates/app-code.html; it is static and not indexed, and middleware does not run on it.
   */
  async rewrites() {
    return [{ source: '/app/code', destination: '/app-code.html' }];
  },
  async headers() {
    return [
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
