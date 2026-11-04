'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import PayoutFields from '../../../../merchant-onboarding/src/PayoutFields';

export function SetupPayout({ open, onClose, initialValue, onSave }: {
  open: boolean; onClose: () => void; initialValue: Record<string, string>;
  onSave: (value: Record<string, string>) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const initial = useRef(initialValue);
  initial.current = initialValue;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setValue(initial.current); setError(''); } }, [open]);
  async function save() {
    setBusy(true); setError('');
    try { await onSave(value); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save payout details.'); }
    finally { setBusy(false); }
  }
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" aria-describedby={undefined}>
        <div className="mb-5 flex items-center justify-between gap-4"><Dialog.Title className="text-2xl font-bold">Payout details</Dialog.Title><Dialog.Close aria-label="Close" disabled={busy} className="text-2xl">×</Dialog.Close></div>
        <p className="mb-5">Add a payout destination. Your details will still need verification.</p>
        <PayoutFields value={value} onChange={setValue} />
        {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void save()} className="mt-6 rounded-xl bg-gold px-5 py-3 font-bold">{busy ? 'Saving…' : 'Save payout details'}</button>
      </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
