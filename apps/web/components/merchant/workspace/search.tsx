'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { permittedWorkspaceNavigation, type MerchantWorkspaceSection } from './navigation';
import styles from './workspace.module.css';
import {
  appendMerchantOnboardingDemoContext,
  type MerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';

export function WorkspaceSearch({
  availableSections,
  demoContext,
}: {
  availableSections?: readonly MerchantWorkspaceSection[];
  demoContext?: MerchantOnboardingDemoContext | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const resultList = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const results = permittedWorkspaceNavigation(availableSections).filter((item) =>
    `${item.label} ${item.description} ${item.keywords}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (!open && document.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        setOpen((value) => !value);
        if (open) setQuery('');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setQuery('');
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={styles.searchTrigger}
          aria-label="Search workspace"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={17} aria-hidden="true" />
          <span>Search workspace</span>
          <kbd>Ctrl K</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.searchDialog}>
          <Dialog.Title className="sr-only">Search workspace</Dialog.Title>
          <Dialog.Description className="sr-only">
            Find a workspace section. Search is limited to the sections available in this workspace.
          </Dialog.Description>
          <form
            className={styles.searchInputRow}
            onSubmit={(event) => {
              event.preventDefault();
              if (results[0]) {
                router.push(appendMerchantOnboardingDemoContext(results[0].href, demoContext ?? null));
                changeOpen(false);
              }
            }}
          >
            <Search size={21} aria-hidden="true" />
            <input
              aria-label="Find a workspace section"
              placeholder="Where would you like to go?"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  resultList.current?.querySelector<HTMLAnchorElement>('a')?.focus();
                }
              }}
            />
            <Dialog.Close className={styles.iconButton} aria-label="Close search">
              <X size={19} aria-hidden="true" />
            </Dialog.Close>
          </form>
          <div
            className={styles.searchResults}
            ref={resultList}
            role="presentation"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const links = [
                ...(resultList.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []),
              ];
              const index = links.indexOf(document.activeElement as HTMLAnchorElement);
              if (index < 0 || links.length === 0) return;
              event.preventDefault();
              links[
                (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
              ]?.focus();
            }}
          >
            <p className={styles.searchEyebrow}>
              {query ? 'Matching sections' : 'Go to a section'}
            </p>
            {results.length ? (
              results.map(({ label, href, icon: Icon, description }) => (
                <Link
                  key={label}
                  href={appendMerchantOnboardingDemoContext(href, demoContext ?? null)}
                  className={styles.searchResult}
                  onClick={() => changeOpen(false)}
                >
                  <span className={styles.resultIcon}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              ))
            ) : (
              <div className={styles.searchEmpty}>
                <strong>No sections found</strong>
                <p>Try a section name such as Work, Offerings or Reports.</p>
                <button type="button" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            )}
          </div>
          <p className={styles.searchFooter}>
            Search workspace sections. Individual records stay in their own section.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
