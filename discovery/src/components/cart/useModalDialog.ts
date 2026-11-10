import { useEffect, useState, type MouseEvent, type SyntheticEvent } from 'react';

// Sheets can stack (a product, then "Start a new cart?"), so the page scroll unlocks only when the last one closes.
let locks = 0;
let scrollBefore = '';

/**
 * The modal plumbing the cart's sheets share, as the card family's sheets do: open as a modal dialog, lock
 * the page scroll, close on Escape or a backdrop click, and hand focus back to whatever opened it.
 */
export function useModalDialog(onClose: () => void) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  // Read once while rendering: effects run twice in development, and by then the sheet holds the focus.
  const [opener] = useState(() => typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  useEffect(() => {
    if (!dialog) return;
    if (locks++ === 0) { scrollBefore = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    if (!dialog.open) dialog.showModal();
    return () => {
      if (--locks === 0) document.body.style.overflow = scrollBefore;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [dialog, opener]);
  const close = () => { if (dialog?.open) dialog.close(); else onClose(); };
  return {
    close,
    props: {
      ref: setDialog,
      onClose,
      onCancel: (event: SyntheticEvent<HTMLDialogElement>) => { event.preventDefault(); close(); },
      onClick: (event: MouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) close(); },
    },
  };
}
