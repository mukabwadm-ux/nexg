'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Spinner } from './spinner';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger' | 'loading';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds on screen. Loading toasts stay until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  /** Show a toast; returns its id so it can be dismissed programmatically. */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Wrap each app once. Radix handles the live region, swipe-to-dismiss and the
 * F8 hotkey that moves focus to the newest toast.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { ...options, id }]);
    return id;
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((entry) => (
          <Toast key={entry.id} {...entry} onDismiss={() => dismiss(entry.id)} />
        ))}
        <ToastPrimitive.Viewport
          className={cn(
            'fixed bottom-0 right-0 z-[60] flex w-full flex-col gap-2 p-4 outline-none',
            'sm:bottom-4 sm:right-4 sm:max-w-sm sm:p-0',
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a <ToastProvider>');
  return context;
}

const toneStyles: Record<ToastTone, { bar: string; icon: React.ReactNode }> = {
  info: { bar: 'bg-ink', icon: <Info className="text-ink h-5 w-5" /> },
  success: { bar: 'bg-success', icon: <CheckCircle2 className="text-success h-5 w-5" /> },
  warning: { bar: 'bg-warning', icon: <AlertTriangle className="text-warning h-5 w-5" /> },
  danger: { bar: 'bg-danger', icon: <XCircle className="text-danger h-5 w-5" /> },
  loading: { bar: 'bg-gold', icon: <Spinner className="text-gold-text h-5 w-5" label="" /> },
};

export interface ToastProps extends ToastOptions {
  onDismiss?: () => void;
  /** Controlled open state; used by the ui-kit page to pin a toast on screen. */
  open?: boolean;
}

/** A single notification. Prefer `useToast()` over rendering this directly. */
export function Toast({
  title,
  description,
  tone = 'info',
  duration,
  action,
  onDismiss,
  open,
}: ToastProps) {
  const { bar, icon } = toneStyles[tone];
  // A loading toast has no natural end; keep it until the caller dismisses it.
  const resolvedDuration = tone === 'loading' ? Number.POSITIVE_INFINITY : duration;

  return (
    <ToastPrimitive.Root
      open={open}
      duration={resolvedDuration}
      onOpenChange={(next) => {
        if (!next) onDismiss?.();
      }}
      className={cn(
        'border-border relative flex items-start gap-3 overflow-hidden rounded-xl border',
        'bg-surface shadow-raised p-3 pl-4',
        'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
        'data-[swipe=end]:animate-slide-out-right',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', bar)} />
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="text-ink text-sm font-bold">{title}</ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="text-muted mt-0.5 text-sm leading-snug">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>

      {action && (
        <ToastPrimitive.Action
          altText={action.label}
          onClick={action.onClick}
          className={cn(
            'text-gold-text shrink-0 rounded-md px-2 py-1 text-xs font-bold',
            'hover:bg-gold-soft focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
          )}
        >
          {action.label}
        </ToastPrimitive.Action>
      )}

      <ToastPrimitive.Close
        aria-label="Dismiss notification"
        className={cn(
          'text-muted-light hover:bg-bg hover:text-ink shrink-0 rounded-md p-1 transition-colors',
          'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
        )}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
