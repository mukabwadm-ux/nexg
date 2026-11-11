'use client';

import { cn } from '@nexg/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MethodBadge } from '@/components/docs/method-badge';
import type { NavSection } from '@/lib/reference/navigation';

/**
 * The documentation's navigation, used by the sidebar on wide screens and
 * by the menu on phones. Reference entries carry their method, and
 * endpoints that are not served yet say so, so nobody builds against one
 * by accident.
 */
export function DocsNav({
  nav,
  onNavigate,
  className,
}: {
  nav: NavSection[];
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className={className}>
      {nav.map((section, index) => (
        <div
          key={section.label}
          className={cn(index === 0 ? '' : section.nested ? 'mt-4' : 'mt-8')}
        >
          <p
            className={cn(
              'px-2.5',
              section.nested ? 'text-muted-light text-xs font-semibold' : 'label-micro',
            )}
          >
            {section.label}
          </p>
          <ul className="mt-1.5 space-y-px">
            {section.links.map((link) => {
              const active = pathname === link.href;
              const soon = link.status === 'coming_soon';
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-9 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm leading-5 transition-colors duration-150',
                      active
                        ? 'bg-surface text-ink ring-border shadow-card font-bold ring-1'
                        : soon
                          ? 'text-muted-light hover:bg-border/50 hover:text-ink'
                          : 'text-muted hover:bg-border/50 hover:text-ink',
                    )}
                  >
                    {link.method ? <MethodBadge method={link.method} size="sm" /> : null}
                    <span className="min-w-0 flex-1">{link.label}</span>
                    {soon ? (
                      <span className="text-muted-light shrink-0 text-[0.625rem] font-bold uppercase tracking-wide">
                        Soon
                      </span>
                    ) : link.issue ? (
                      <span className="text-warning shrink-0 text-[0.625rem] font-bold uppercase tracking-wide">
                        Issue
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
