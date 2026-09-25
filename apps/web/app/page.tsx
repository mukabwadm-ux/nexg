import { Card, CardDescription, CardTitle, Tag } from '@nexg/ui';

/**
 * Placeholder. The real homepage (artboard `BookingFirst`) is built in M3 —
 * spec section 4.1. M1 ships only the repository and the design system, so
 * nothing here pretends to be the product.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2">
        <Tag tone="gold">Milestone M1</Tag>
        <Tag>Repository and design system</Tag>
      </div>

      <div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          <span className="text-gold-text">NexG</span> public site
        </h1>
        <p className="text-muted mt-3 text-base leading-relaxed">
          The monorepo, design tokens and shared components are in place. The homepage, rider
          application and merchant application arrive in M3 to M5.
        </p>
      </div>

      <Card>
        <CardTitle>What exists today</CardTitle>
        <CardDescription className="mt-2">
          Manrope is loaded through <code className="font-mono text-xs">next/font</code>, the
          section 2 tokens are applied, and every shared component is reviewable on the admin
          console at <code className="font-mono text-xs">/ui-kit</code>.
        </CardDescription>
      </Card>
    </main>
  );
}
