'use client';

import { getCaptchaToken } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Starts the anonymous session that owns a draft application, the same one
 * /merchants/register starts, but only once the form comes near the screen.
 * Most people reading /merchants never register, and each session is a user
 * in the auth table, so a visitor who never scrolls this far gets none.
 */
export function RegistrationSessionStart() {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef<Promise<void> | null>(null);
  const [failed, setFailed] = useState(false);

  async function start() {
    const client = createClient();
    try {
      const current = await client.auth.getSession();
      if (!current.data.session) {
        pending.current ??= getCaptchaToken()
          .then((captchaToken) => client.auth.signInAnonymously({ options: { captchaToken } }))
          .then(({ error }) => {
            if (error) throw error;
          });
        await pending.current;
      }
      router.refresh();
    } catch {
      pending.current = null;
      setFailed(true);
    }
  }

  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void startRef.current();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      aria-live="polite"
      className="border-border bg-surface text-ink rounded-2xl border p-6 shadow-[0_16px_42px_rgb(20_20_20/0.06)]"
    >
      {failed ? (
        <>
          <p className="font-bold">We could not start a secure registration session.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              void start();
            }}
            className="bg-gold text-ink mt-4 rounded-lg px-4 py-3 font-bold"
          >
            Try again
          </button>
        </>
      ) : (
        <div className="space-y-4" aria-label="Preparing your secure registration">
          <p className="text-muted text-sm font-semibold">Preparing your secure registration…</p>
          {[0, 1, 2].map((row) => (
            <div key={row} className="bg-ink/[0.06] h-11 animate-pulse rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
