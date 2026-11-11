import type { Metadata } from 'next';

import { DocsNav } from '@/components/site/docs-nav';
import { navForClient } from '@/lib/reference/navigation';

/**
 * The documentation shell: the navigation rail on the left, the page on
 * the right. On phones the rail moves into the masthead's menu.
 *
 * The <html> and <body> live in the root layout. A nested layout that
 * rendered its own would produce two of each.
 */
export const metadata: Metadata = {
  title: {
    default: 'Documentation',
    template: '%s · NexG API',
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-1">
      <aside className="border-border hidden w-72 shrink-0 border-r lg:block">
        <div className="code-scroll sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-4 py-8">
          <DocsNav nav={navForClient()} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-12">{children}</main>
    </div>
  );
}
