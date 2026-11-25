/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Separate output directories for dev and build. They share `.next` by
   * default, so running `pnpm build` while a dev server is up wipes the
   * chunks that server is still serving — the page then renders with no CSS
   * at all, which looks like a styling bug rather than a clobbered directory.
   */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // The workspace packages ship TypeScript source rather than a build output.
  transpilePackages: [
    '@nexg/ui',
    '@nexg/db',
    '@nexg/contracts',
    '@nexg/booking-config',
    '@nexg/merchant-agreement',
  ],
  eslint: {
    // `pnpm lint` runs ESLint as its own CI step; do not run it twice.
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  /*
   * The support desk was called `Concierge desk` and lived at /concierge.
   * Permanent, because the old path is not coming back: `concierge` is the
   * name the orders domain will want.
   */
  async redirects() {
    return [
      /*
       * The console moved from admin.nexgapp.com to control.nexgapp.com.
       * The old address stays attached to this project and answers every
       * path with a 308 to the same path on the new one; Next keeps the
       * query string. Staff sign in once on the new address: auth cookies
       * are host-only, so a session on the old host does not carry over.
       */
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'admin.nexgapp.com' }],
        destination: 'https://control.nexgapp.com/:path*',
        permanent: true,
      },
      { source: '/concierge', destination: '/support', permanent: true },
    ];
  },
};

export default nextConfig;
