'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

type VerificationMethod = 'listing_ownership' | 'id_document' | 'call';
type VerifyAction = (input: {
  hostId: string;
  method: string;
  evidence: string;
}) => Promise<{ error?: string; success?: boolean }>;

const METHODS: { value: VerificationMethod; label: string }[] = [
  { value: 'listing_ownership', label: 'Listing ownership' },
  { value: 'id_document', label: 'Identity document' },
  { value: 'call', label: 'Verification call' },
];

export function HostVerificationForm({ hostId, action }: { hostId: string; action: VerifyAction }) {
  const router = useRouter();
  const [method, setMethod] = React.useState<VerificationMethod>('listing_ownership');
  const [evidence, setEvidence] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await action({ hostId, method, evidence });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/hotels?tab=hosts&selected=${hostId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Verification failed unexpectedly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <fieldset>
        <legend className="text-sm font-extrabold">Verification method</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {METHODS.map((option) => (
            <label
              key={option.value}
              className="border-border-strong flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-semibold"
            >
              <input
                type="radio"
                name="method"
                value={option.value}
                checked={method === option.value}
                onChange={() => setMethod(option.value)}
                required
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-extrabold" htmlFor="verification-evidence">
        Evidence checked
        <textarea
          id="verification-evidence"
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          required
          minLength={5}
          maxLength={2000}
          rows={4}
          placeholder="Describe what you checked and the outcome."
          className="border-border-strong focus:border-ink mt-2 block w-full rounded-lg border bg-white p-3 text-sm font-medium outline-none"
        />
      </label>

      {error ? (
        <p role="alert" className="text-danger text-sm font-semibold">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="bg-ink hover:bg-ink/90 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Verifying…' : 'Verify and activate host'}
      </button>
    </form>
  );
}
