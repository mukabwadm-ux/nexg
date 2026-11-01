'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Button, cn } from '@nexg/ui';
import { Check, ChevronRight, Info, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { Tone } from './model';
import { useSettings } from './store';
import s from './settings.module.css';

export function Action({
  children,
  onClick,
  variant = 'outline',
  disabled,
  loading,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'gold' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <Button
      type={type}
      className={s.button}
      variant={variant}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
export function Card({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(s.card, className)}>
      {title && (
        <div className={s.cardHead}>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={cn(s.badge, s[tone])}>{children}</span>;
}
export function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <div className={cn(s.note, s[tone])}>
      <Info size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Switch({
  label,
  checked,
  onChange,
  caption = true,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  caption?: boolean;
}) {
  return (
    <button
      className={s.switchControl}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className={cn(s.switchTrack, checked && s.switchOn)}>
        <span />
      </span>
      {caption && <span aria-hidden="true">{checked ? 'On' : 'Off'}</span>}
    </button>
  );
}
export function TextLink({
  children,
  href,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {children}
      <ChevronRight size={16} aria-hidden="true" />
    </>
  );
  return href ? (
    <Link className={s.textLink} href={href}>
      {content}
    </Link>
  ) : (
    <button type="button" className={s.textLink} onClick={onClick}>
      {content}
    </button>
  );
}
export function SaveBar({
  dirty,
  scope,
  onSave,
  onCancel,
  label = 'Save changes',
}: {
  dirty: boolean;
  scope: string;
  onSave: () => void;
  onCancel: () => void;
  label?: string;
}) {
  const { busy } = useSettings();
  return (
    <div className={s.saveBar}>
      <div className={s.saveCaption}>
        <span className={cn(s.dot, dirty ? s.warningDot : s.successDot)} />
        {dirty ? 'Unsaved changes' : 'No unsaved changes'}
        <span className={s.muted}>· {scope}</span>
      </div>
      <div className={s.actions}>
        <Action onClick={onCancel} disabled={!dirty || busy}>
          Cancel
        </Action>
        <Action variant="gold" onClick={onSave} loading={busy} disabled={!dirty || busy}>
          {label}
        </Action>
      </div>
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  open,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const descriptionId = React.useId();
  const returnFocus = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (open) return;
    const remember = (event: PointerEvent) => {
      const target = (event.target as Element).closest<HTMLElement>('button, a[href], input, select');
      if (target) returnFocus.current = target;
    };
    document.addEventListener('pointerdown', remember, true);
    return () => document.removeEventListener('pointerdown', remember, true);
  }, [open]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content
          className={s.modal}
          aria-describedby={description ? descriptionId : undefined}
          onOpenAutoFocus={() => { if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) returnFocus.current = document.activeElement; }}
          onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}
        >
          <div className={s.modalHead}>
            <div>
              <Dialog.Title className={s.modalTitle}>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id={descriptionId} className={s.modalDescription}>
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className={s.iconButton} aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className={s.modalBody}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={s.empty}>
      <Info size={26} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Pending({ children }: { children: React.ReactNode }) {
  return (
    <span className={s.inline}>
      <Loader2 className={s.spin} size={16} />
      {children}
    </span>
  );
}
export function CheckLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className={s.inline}>
      <Check size={16} />
      {children}
    </span>
  );
}
