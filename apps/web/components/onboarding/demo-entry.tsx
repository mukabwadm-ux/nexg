import Link from 'next/link';

/** Demo activation belongs to onboarding; the portal never changes mode. */
export function OnboardingDemoEntry() {
  return (
    <aside
      className="border-border bg-surface mt-6 rounded-xl border p-4"
      aria-label="Try the merchant demo"
    >
      <p className="text-muted text-sm">
        Explore the merchant workspace before completing registration.
      </p>
      <Link
        href="/merchant-live-preview?state=setup"
        prefetch={false}
        className="border-border mt-3 inline-block rounded-lg border px-4 py-2 text-sm font-bold"
      >
        Try demo · sample data
      </Link>
      <p className="text-muted mt-2 text-xs">
        Demo uses sample data. Your saved business records stay separate.
      </p>
    </aside>
  );
}
