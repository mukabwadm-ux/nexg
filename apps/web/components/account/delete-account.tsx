'use client';

import { Button } from '@nexg/ui';
import * as React from 'react';

import { deleteMyAccount, type DeletionClient } from '@/lib/account-deletion';
import { createClient } from '@/lib/supabase/client';

/** The signed-in customer's own "Delete my account", with a box to tick first. */
export function DeleteAccountForm() {
  const [sure, setSure] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [problem, setProblem] = React.useState<string | null>(null);

  const remove = (event: React.FormEvent) => {
    event.preventDefault();
    if (!sure) return;
    start(async () => {
      setProblem(null);
      const result = await deleteMyAccount(createClient() as unknown as DeletionClient);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      // A full load, so nothing signed-in stays on screen.
      window.location.replace('/account/delete?deleted=1');
    });
  };

  return (
    <form onSubmit={remove} className="mt-4 flex flex-col items-start gap-3">
      <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={sure}
          onChange={(event) => setSure(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        I understand my account will be deleted now and cannot be brought back.
      </label>
      <Button variant="danger" type="submit" disabled={!sure || pending}>
        {pending ? 'Deleting…' : 'Delete my account'}
      </Button>
      {problem && (
        <p role="alert" className="text-danger text-sm font-semibold">
          {problem}
        </p>
      )}
    </form>
  );
}
