import Link from 'next/link';

/**
 * The API's front door.
 *
 * It says what this is and where to go next, because somebody who has
 * just been handed an api.nexgapp.com address should not have to guess
 * that /docs is where the reference lives.
 */
export default function HomePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight mb-4">NexG API</h1>
      <p className="text-lg text-ink/70 mb-8">
        Read-only catalog, and a write path for merchants who book our
        services. Every list is cursor-paginated, every response is
        versioned, and every write takes an idempotency key.
      </p>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/docs" className="underline font-medium">
          Read the documentation
        </Link>
        <Link href="/docs/quickstart" className="underline font-medium">
          Quick start
        </Link>
        <Link href="/docs/auth" className="underline font-medium">
          Authentication
        </Link>
        <Link href="/developers" className="underline font-medium">
          Issue a key
        </Link>
      </div>

      <div className="mt-12 border-t pt-8">
        <h2 className="text-2xl font-bold mb-4">Endpoints</h2>
        <ul className="space-y-2 text-sm">
          {[
            ['GET', '/v1/catalog/merchants', 'Live merchants, cursor-paginated'],
            ['GET', '/v1/catalog/merchants/{id}', 'One merchant and its catalogue'],
            ['GET', '/v1/zones', 'Delivery zones and their bounds'],
            ['GET', '/v1/experiences', 'Upcoming events'],
            ['GET', '/v1/services', 'What a merchant can book'],
            ['POST', '/v1/orders', 'Book a service (merchant scope)'],
          ].map(([method, path, note]) => (
            <li key={path} className="flex gap-3 items-baseline">
              <span className="text-xs font-extrabold uppercase tracking-wider text-ink/50 w-14 shrink-0">
                {method}
              </span>
              <code className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded">{path}</code>
              <span className="text-ink/60">{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}