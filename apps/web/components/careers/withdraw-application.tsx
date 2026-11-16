'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Withdraw, with one step to confirm. The database detaches the CV first, so
 * the business loses it even if deleting the file then fails; the file is
 * then deleted from the applicant's own folder.
 */
export function WithdrawApplication({
  applicationId,
  employer,
}: {
  applicationId: string;
  employer: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: before } = await supabase
      .from('vacancy_application')
      .select('cv_path')
      .eq('id', applicationId)
      .maybeSingle();
    const { error: rpcError } = await supabase.rpc('rpc_vacancy_application_withdraw', {
      p_application_id: applicationId,
    });
    if (rpcError) {
      setBusy(false);
      setError(rpcError.message);
      return;
    }
    const cvPath = (before as { cv_path: string | null } | null)?.cv_path;
    if (cvPath) await supabase.storage.from('careers-cv').remove([cvPath]);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-muted hover:text-danger text-[0.75rem] font-bold underline-offset-2 hover:underline"
      >
        Withdraw
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-ink text-[0.75rem] font-bold">
        Withdraw? {employer} will no longer see your CV.
      </span>
      <button
        type="button"
        onClick={withdraw}
        disabled={busy}
        className="bg-danger h-8 rounded-lg px-3 text-[0.75rem] font-bold text-white disabled:opacity-60"
      >
        {busy ? 'Withdrawing…' : 'Withdraw'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="border-border-strong h-8 rounded-lg border px-3 text-[0.75rem] font-bold"
      >
        Keep it
      </button>
      {error ? (
        <span role="alert" className="text-danger w-full text-[0.75rem] font-bold">
          {error}
        </span>
      ) : null}
    </span>
  );
}
