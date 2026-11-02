'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import styles from './workspace.module.css';

export function WorkspaceMobileNavigation({
  children,
  homeHref = '/merchant-live-preview',
}: {
  children: ReactNode;
  homeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.mobileTrigger}`}
          aria-label="Open workspace navigation"
        >
          <Menu size={21} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.mobileDrawer}>
          <div className={styles.mobileDrawerHeader}>
            <Link
              href={homeHref}
              className="text-sm font-bold text-white"
              onClick={() => setOpen(false)}
            >
              Merchant workspace
            </Link>
            <Dialog.Close className={styles.darkIconButton} aria-label="Close workspace navigation">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Merchant workspace</Dialog.Title>
          <Dialog.Description className={styles.drawerDescription}>
            Choose where you want to work.
          </Dialog.Description>
          <div
            className={styles.mobileDrawerBody}
            role="presentation"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
            onClick={(event) => {
              if (
                (event.target as HTMLElement).closest('a, button[data-workspace-navigation-action]')
              )
                setOpen(false);
            }}
          >
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
