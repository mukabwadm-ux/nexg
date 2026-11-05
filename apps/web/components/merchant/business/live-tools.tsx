'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { SetupDocuments } from '../setup-documents';
import { Button } from './primitives';
import { SetupLocationEditor } from './setup-location';

export function BusinessLocationTools({
  activities,
}: {
  activities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button primary onClick={() => setOpen(true)}>
        Manage locations
      </Button>
      <SetupLocationEditor
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
        activities={activities}
      />
    </>
  );
}

export function BusinessDocumentTools() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button primary onClick={() => setOpen(true)}>
        Manage documents
      </Button>
      <SetupDocuments open={open} onClose={() => setOpen(false)} onSaved={() => router.refresh()} />
    </>
  );
}
