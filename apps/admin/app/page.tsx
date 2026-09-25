import { Button, Card, CardDescription, CardTitle, Tag } from '@nexg/ui';
import Link from 'next/link';

/**
 * Placeholder. Staff sign-in and the console shell (artboard `A0_StaffSignIn`)
 * are built in M6 — spec section 5.1. M1 ships the design system, so the only
 * useful route here is the ui-kit.
 */
export default function AdminHomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2">
        <Tag tone="gold">Milestone M1</Tag>
        <Tag>Repository and design system</Tag>
      </div>

      <div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          NexG <span className="text-gold-text">admin</span>
        </h1>
        <p className="text-muted mt-3 text-base leading-relaxed">
          Staff sign-in, the rider and merchant pipelines and document review arrive in M6. For now
          the console hosts the design system review page.
        </p>
      </div>

      <Card>
        <CardTitle>Review the design system</CardTitle>
        <CardDescription className="mt-2">
          Every component, in every state, on one page — loading, error, disabled and empty
          included.
        </CardDescription>
        <div className="mt-4">
          <Button asChild>
            <Link href="/ui-kit">Open the ui-kit</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
