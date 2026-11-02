'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

/** A single accessible drawer pattern for related Home interactions. */
export function HomePanel({
  title,
  description,
  children,
  trigger,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  trigger: React.ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/35"
          style={{
            backdropFilter: 'blur(4px) saturate(1.15)',
            WebkitBackdropFilter: 'blur(4px) saturate(1.15)',
          }}
        />
        <Dialog.Content className="bg-surface border-border fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l p-6 shadow-xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="pt-2 text-xl font-bold tracking-tight">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="hover:bg-bg focus-visible:outline-gold inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-muted text-sm">
            {description ?? 'Sample preview'}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
