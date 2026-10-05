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
  transpilePackages: ['@nexg/ui', '@nexg/db', '@nexg/location'],
  eslint: {
    // `pnpm lint` runs ESLint as its own CI step; do not run it twice.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Without @nexg/ui here, importing a Button from the barrel pulls in
    // PhoneInput and therefore libphonenumber-js on every page.
    optimizePackageImports: ['lucide-react', '@nexg/ui'],
  },
};

export default nextConfig;
