'use client';

import { cn } from '@nexg/ui';
import { KeyRound, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import type { NavSection } from '@/lib/reference/navigation';

import { DocsNav } from './docs-nav';

const TOP_LINKS = [
  { href: '/docs', label: 'Guides' },
  { href: '/docs/reference', label: 'API reference' },
  { href: '/docs/changelog', label: 'Changelog' },
] as const;

function activeTop(pathname: string): string | null {
  if (pathname.startsWith('/docs/reference')) return '/docs/reference';
  if (pathname.startsWith('/docs/changelog')) return '/docs/changelog';
  if (pathname.startsWith('/docs')) return '/docs';
  return null;
}

export function MastheadLinks() {
  const active = activeTop(usePathname());
  return (
    <nav aria-label="Main" className="ml-4 hidden h-full items-stretch gap-1 lg:flex">
      {TOP_LINKS.map((link) => {
        const current = active === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'relative flex items-center px-3 text-sm font-bold transition-colors duration-150 focus-visible:ring-inset',
              current ? 'text-white' : 'text-white/65 hover:text-white',
            )}
          >
            {link.label}
            <span
              aria-hidden="true"
              className={cn(
                'bg-gold absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-opacity duration-150',
                current ? 'opacity-100' : 'opacity-0',
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The phone menu: a native modal dialog, so focus is held inside it, Escape
 * closes it and the page behind cannot be reached while it is open.
 */
export function MobileMenu({ nav }: { nav: NavSection[] }) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  const close = React.useCallback(() => dialog.current?.close(), []);

  React.useEffect(() => {
    close();
  }, [pathname, close]);

  React.useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const restore = () => {
      document.documentElement.style.removeProperty('overflow');
    };
    node.addEventListener('close', restore);
    return () => {
      node.removeEventListener('close', restore);
      restore();
    };
  }, []);

  function open() {
    const node = dialog.current;
    if (!node || node.open) return;
    document.documentElement.style.overflow = 'hidden';
    node.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="focus-visible:ring-offset-ink flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white transition-colors duration-150 hover:bg-white/[0.08] lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* A click on the dialog itself, outside its panel, is a click on the backdrop. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="bg-bg text-ink backdrop:bg-ink/60 open:animate-slide-in-right shadow-panel fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-[min(22rem,calc(100vw-2.5rem))] max-w-none p-0"
      >
        <div className="flex h-full flex-col">
          <div className="border-border flex h-16 shrink-0 items-center justify-between border-b px-4">
            <span className="text-sm font-extrabold">NexG Developers</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="border-border hover:bg-border/50 flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-150"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-10 pt-5">
            <Link
              href="/developers"
              onClick={close}
              className="bg-ink mb-6 flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-extrabold text-white"
            >
              <KeyRound className="text-gold h-4 w-4" aria-hidden="true" />
              Get an API key
            </Link>
            <DocsNav nav={nav} onNavigate={close} />
          </div>
        </div>
      </dialog>
    </>
  );
}
