'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useState } from 'react';
import { loadSetupDocuments } from '@/app/merchant/setup-documents-actions';
import { Documents } from '@/components/partner/documents';

type Result = Awaited<ReturnType<typeof loadSetupDocuments>>;

export function SetupDocuments({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const next = await loadSetupDocuments();
    setResult(next);
    setLoading(false);
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl" aria-describedby={undefined}>
        <div className="mb-5 flex items-center justify-between gap-4"><Dialog.Title className="text-2xl font-bold">Documents and evidence</Dialog.Title><Dialog.Close aria-label="Close" className="text-2xl">×</Dialog.Close></div>
        {loading && !result ? <p role="status">Loading documents…</p> : result?.ok ?
          <Documents ownerType="merchant" ownerId={result.ownerId} requirements={result.requirements} onFile={result.onFile} asked={result.asked} onUploaded={() => { void load(); onSaved(); }} /> :
          result && <p role="alert">{result.message}</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
