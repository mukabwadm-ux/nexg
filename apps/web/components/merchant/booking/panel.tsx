'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';

export function BookingPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content className="bg-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-y-auto p-5 shadow-xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-xl font-extrabold tracking-tight">{title}</Dialog.Title>
            <Dialog.Close
              className="rounded-lg p-2 focus-visible:outline focus-visible:outline-2"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-muted mt-1 text-sm leading-relaxed">
            {description}
          </Dialog.Description>
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const inputClass =
  'border-border bg-surface text-ink w-full rounded-lg border px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50';
export const buttonClass =
  'border-border bg-surface text-ink inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50';
export const primaryClass =
  'bg-ink text-white inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const hintId = `${generatedId}-hint`;
  const controls: ReactElement<FieldChildProps>[] = [];
  function findControls(nodes: ReactNode): void {
    Children.forEach(nodes, (node) => {
      if (!isValidElement<FieldChildProps>(node)) return;
      if (
        typeof node.type === 'string' &&
        ['input', 'select', 'textarea'].includes(node.type) &&
        node.props.type !== 'hidden'
      )
        controls.push(node);
      else if (typeof node.type === 'string' || node.type === Fragment)
        findControls(node.props.children);
    });
  }
  findControls(children);
  const control = controls.length === 1 ? controls[0] : undefined;
  const controlId = control?.props.id ?? generatedId;
  function connectControl(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement<FieldChildProps>(node)) return node;
      if (node === control)
        return cloneElement(node, {
          id: controlId,
          ...(hint
            ? {
                'aria-describedby': [
                  ...new Set([
                    ...(node.props['aria-describedby']?.split(/\s+/).filter(Boolean) ?? []),
                    hintId,
                  ]),
                ].join(' '),
              }
            : {}),
        });
      if ((typeof node.type === 'string' || node.type === Fragment) && node.props.children)
        return cloneElement(node, undefined, connectControl(node.props.children));
      return node;
    });
  }
  return (
    <div
      className="block space-y-1.5 text-sm font-bold"
      {...(!control
        ? {
            role: 'group',
            'aria-labelledby': labelId,
            ...(hint ? { 'aria-describedby': hintId } : {}),
          }
        : {})}
    >
      {control ? (
        <label id={labelId} htmlFor={controlId} className="block">
          {label}
        </label>
      ) : (
        <span id={labelId} className="block">
          {label}
        </span>
      )}
      {control ? connectControl(children) : children}
      {hint ? (
        <span id={hintId} className="text-muted block text-xs font-normal leading-relaxed">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

interface FieldChildProps {
  id?: string;
  type?: string;
  children?: ReactNode;
  'aria-describedby'?: string;
}
