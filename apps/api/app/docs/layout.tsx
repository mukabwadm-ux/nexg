import type { Metadata } from 'next';

/**
 * The documentation shell.
 *
 * The <html> and <body> live in the root layout. A nested layout that
 * rendered its own would produce two of each, which is not a styling
 * problem -- it is a document that browsers disagree about.
 */
export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Interactive documentation for api.nexgapp.com',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">NexG API</h1>
        <p className="text-lg text-ink/70 max-w-2xl">
          Read-only endpoints for the public, partner, and internal surfaces.
          Every list is cursor-paginated and every response is versioned.
        </p>
        <div className="mt-6 flex gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-surface border text-ink/80 font-medium">
            v1
          </span>
          <span className="px-3 py-1 rounded-full bg-surface border text-ink/80 font-medium">
            Public read
          </span>
        </div>
      </header>
      <nav className="mb-8 flex flex-wrap gap-4 text-sm border-b pb-4">
        <a href="/docs" className="font-medium hover:underline">
          Reference
        </a>
        <a href="/docs/quickstart" className="hover:underline">
          Quick start
        </a>
        <a href="/docs/auth" className="hover:underline">
          Authentication
        </a>
        <a href="/developers" className="hover:underline">
          Issue a key
        </a>
      </nav>
      {children}
    </main>
  );
}