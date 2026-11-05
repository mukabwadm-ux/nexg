'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Starts the existing Supabase anonymous session used to own a public draft. */
export function ApplicationSessionBootstrap() {
  const router = useRouter();
  const pending = useRef<Promise<void> | null>(null);
  const [message, setMessage] = useState('Preparing your secure registration…');

  async function start() {
    const client = createClient();
    try {
      const current = await client.auth.getSession();
      if (current.data.session) {
        router.refresh();
        return;
      }
      if (!pending.current) {
        pending.current = client.auth.signInAnonymously().then(({ error }) => {
          if (error) throw error;
        });
      }
      await pending.current;
      router.refresh();
    } catch {
      pending.current = null;
      setMessage('We could not start a secure registration session. Please try again.');
    }
  }

  // Runs once on mount; the ref keeps the latest `start` without re-running.
  const startOnMount = useRef(start);
  startOnMount.current = start;
  useEffect(() => {
    void startOnMount.current();
  }, []);

  return (
    <section className="border-border bg-surface rounded-xl border p-6" aria-live="polite">
      <p>{message}</p>
      {message.startsWith('We could not') ? (
        <button
          type="button"
          onClick={() => {
            setMessage('Preparing your secure registration…');
            void start();
          }}
          className="bg-gold text-ink mt-4 rounded-lg px-4 py-3 font-bold"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}
