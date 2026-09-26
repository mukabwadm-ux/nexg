import { Button, Card } from '@nexg/ui';
import Link from 'next/link';

import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * A page that exists, says plainly what is not built yet, and offers the
 * thing the visitor probably wanted instead.
 *
 * This is here because the menu and footer link to sections the milestones
 * have not reached. A 404 tells a visitor the link is broken; this tells them
 * the truth. Nothing on these pages pretends to be a feature.
 */
export function ComingSoon({
  title,
  body,
  milestone,
  actions,
}: {
  title: string;
  body: string;
  milestone: string;
  actions: { label: string; href: string; variant?: 'default' | 'outline' }[];
}) {
  return (
    <>
      <SiteHeader action={{ label: 'Sign in', href: '/sign-in' }} />

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8 sm:py-24">
        <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
          <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
          {milestone}
        </span>

        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-muted mt-4 max-w-xl text-[1.0625rem] font-semibold leading-[1.7]">
          {body}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {actions.map((action) => (
            <Button
              key={action.href}
              size="lg"
              asChild
              {...(action.variant === 'outline' ? { variant: 'outline' as const } : {})}
            >
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>

        <Card tone="muted" className="mt-10 p-5">
          <p className="text-muted text-sm leading-[1.7]">
            Need something in the meantime? The concierge team answers on{' '}
            <Link href="/help" className="text-ink font-bold underline underline-offset-4">
              the help page
            </Link>
            .
          </p>
        </Card>
      </main>

      <SiteFooter />
    </>
  );
}
