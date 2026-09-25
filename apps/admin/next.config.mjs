/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source rather than a build output.
  transpilePackages: ['@nexg/ui', '@nexg/db'],
  eslint: {
    // `pnpm lint` runs ESLint as its own CI step; do not run it twice.
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
