'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Info, Search, X } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import styles from './workspace.module.css';

export function BusinessHeading({ name, actions }: { name: string; actions?: ReactNode }) {
  return (
    <div className="bu-title">
      <div>
        <h1>Business</h1>
        <p className="bu-subtitle">{name}</p>
      </div>
      {actions}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  primary,
  soft,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  soft?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`bu-button ${primary ? 'bu-primary' : ''} ${soft ? 'bu-soft' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Status({ value, pill = false }: { value: string; pill?: boolean }) {
  const tone = /pending|Coverage|Needed|draft|Not replied/i.test(value)
    ? 'amber'
    : /requested|correction|Expired/i.test(value)
      ? 'red'
      : /Removed|None|Read.only/i.test(value)
        ? 'grey'
        : 'green';
  return (
    <span className={pill ? 'bu-pill' : 'bu-status'} data-tone={tone}>
      {value}
    </span>
  );
}
export function Note({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <div className={`bu-note ${warning ? 'bu-warning' : 'bu-blue'}`}>
      <Info size={17} />
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
  children: ReactNode;
  hint?: string;
}) {
  const labelId = useId();
  const control =
    isValidElement(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-labelledby': labelId,
        })
      : children;
  return (
    <div className="bu-field">
      <label>
        <span id={labelId}>{label}</span>
        {control}
      </label>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="bu-search">
      <span className="sr-only">{placeholder}</span>
      <Search />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
export function Panel({
  title,
  subtitle,
  status,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside className="bu-detail" aria-label={`${title} details`}>
      <div className="bu-detail-heading">
        <div>
          <h2>{title}</h2>
          {status && <Status value={status} pill />}
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="bu-icon" aria-label="Close details" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="bu-detail-body">{children}</div>
      {footer && <div className="bu-detail-footer">{footer}</div>}
    </aside>
  );
}
export function Facts({ rows }: { rows: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="bu-facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.value}
            {row.hint && <small>{row.hint}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function Empty({
  title = 'Nothing to show',
  text = 'Try another search or filter.',
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="bu-card bu-empty">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.root} ${styles.modal}`}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
        >
          <div className="bu-modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="bu-icon" aria-label="Close dialog">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="bu-modal-body">{children}</div>
          {footer && <div className="bu-modal-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
