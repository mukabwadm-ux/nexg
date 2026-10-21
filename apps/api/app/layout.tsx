/**
 * The NexG public API.
 *
 * Read-only endpoints for public consumers. Stage 1 serves the
 * merchant catalog, zones and experiences — the same data the
 * public site already shows, through a versioned, paginated API.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NexG API',
  description: 'NexG public API — merchant catalog, zones, and experiences',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}