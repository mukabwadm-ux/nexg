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
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-4 text-4xl font-extrabold tracking-tight">NexG API</h1>
      <p className="text-ink/70 mb-8 text-lg">
        Read the public catalog and, with an authorized merchant key, your merchant&apos;s orders.
        Responses use API version v1.
      </p>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/docs" className="font-medium underline">
          Read the documentation
        </Link>
        <Link href="/docs/quickstart" className="font-medium underline">
          Quick start
        </Link>
        <Link href="/docs/auth" className="font-medium underline">
          Authentication
        </Link>
        <Link href="/developers" className="font-medium underline">
          Issue a key
        </Link>
      </div>

      <div className="mt-12 border-t pt-8">
        <h2 className="mb-4 text-2xl font-bold">Endpoints</h2>
        <ul className="space-y-2 text-sm">
          {[
            ['GET', '/v1/catalog/merchants', 'Live merchants, cursor-paginated'],
            ['GET', '/v1/catalog/merchants/{id}', 'One merchant and its catalogue'],
            ['GET', '/v1/zones', 'Delivery zones and their bounds'],
            ['GET', '/v1/experiences', 'Upcoming events'],
            ['GET', '/v1/services', 'Configured service descriptions'],
            ['GET', '/v1/orders', 'Your merchant orders (merchant_read scope)'],
          ].map(([method, path, note]) => (
            <li key={path} className="flex items-baseline gap-3">
              <span className="text-ink/50 w-14 shrink-0 text-xs font-extrabold uppercase tracking-wider">
                {method}
              </span>
              <code className="bg-surface rounded px-1.5 py-0.5 font-mono text-xs">{path}</code>
              <span className="text-ink/60">{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
