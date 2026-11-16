'use client';

import { Bookmark } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/*
 * The saved jobs, read once per page however many cards ask, and shared by
 * every button on it. Kept in the browser so the board itself stays cached
 * and the same for everybody.
 */
type Saved = {
  status: 'loading' | 'signed-out' | 'ready';
  userId: string | null;
  ids: Set<string>;
};

let saved: Saved = { status: 'loading', userId: null, ids: new Set() };
let started = false;
const listeners = new Set<() => void>();

function update(next: Partial<Saved>) {
  saved = { ...saved, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user || user.is_anonymous) {
          update({ status: 'signed-out' });
          return;
        }
        const { data: rows } = await supabase.from('vacancy_saved').select('vacancy_id');
        update({
          status: 'ready',
          userId: user.id,
          ids: new Set(((rows as { vacancy_id: string }[] | null) ?? []).map((r) => r.vacancy_id)),
        });
      } catch {
        update({ status: 'signed-out' });
      }
    })();
  }
  return () => listeners.delete(listener);
}

async function toggle(vacancyId: string) {
  const supabase = createClient();
  const had = saved.ids.has(vacancyId);
  const ids = new Set(saved.ids);
  if (had) ids.delete(vacancyId);
  else ids.add(vacancyId);
  update({ ids });

  const { error } = had
    ? await supabase.from('vacancy_saved').delete().eq('vacancy_id', vacancyId)
    : await supabase
        .from('vacancy_saved')
        .insert({ user_id: saved.userId!, vacancy_id: vacancyId });

  if (error) {
    /* Put it back: the button must not claim a save that did not happen. */
    const back = new Set(saved.ids);
    if (had) back.add(vacancyId);
    else back.delete(vacancyId);
    update({ ids: back });
  }
}

export function SaveJobButton({
  vacancyId,
  title,
  className = '',
}: {
  vacancyId: string;
  title: string;
  className?: string;
}) {
  const state = React.useSyncExternalStore(
    subscribe,
    () => saved,
    () => saved,
  );
  const router = useRouter();
  const pathname = usePathname() ?? '/careers';
  const isSaved = state.ids.has(vacancyId);

  return (
    <button
      type="button"
      aria-pressed={state.status === 'ready' ? isSaved : undefined}
      aria-label={isSaved ? `Remove ${title} from your saved jobs` : `Save ${title}`}
      disabled={state.status === 'loading'}
      onClick={() => {
        if (state.status === 'signed-out') {
          router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
          return;
        }
        void toggle(vacancyId);
      }}
      className={`tap-area text-ink hover:bg-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-60 ${className}`}
    >
      <Bookmark
        aria-hidden="true"
        className="h-[1.125rem] w-[1.125rem]"
        fill={isSaved ? 'currentColor' : 'none'}
      />
    </button>
  );
}
