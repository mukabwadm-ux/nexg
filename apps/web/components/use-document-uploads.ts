'use client';

import * as React from 'react';

import {
  type OwnerType,
  type SavedDocument,
  fetchSavedDocuments,
  uploadDocument,
} from '@/lib/uploads';

export interface UploadSlot {
  file: File | null;
  expiresAt: string;
  uploading: boolean;
  error: string | null;
  saved: SavedDocument | null;
}

const EMPTY: UploadSlot = {
  file: null,
  expiresAt: '',
  uploading: false,
  error: null,
  saved: null,
};

/**
 * Drives the document step of both apply flows.
 *
 * Each requirement uploads on its own the moment it has everything it needs,
 * rather than on a submit button at the bottom. An applicant on a phone in a
 * bad signal area should not lose five files because the sixth failed, and
 * the spec's promise that they can leave and come back only holds if each
 * upload is already saved when they leave.
 *
 * A requirement that expires waits for its date before uploading: the
 * database rejects an expiring document without one, so sending it early
 * would only produce an error the applicant has to decipher.
 */
export function useDocumentUploads({
  ownerType,
  ownerId,
  requirements,
}: {
  ownerType: OwnerType;
  ownerId: string | null;
  requirements: { kind: string; has_expiry: boolean; label: string }[];
}) {
  const [slots, setSlots] = React.useState<Record<string, UploadSlot>>({});

  const patch = React.useCallback((kind: string, next: Partial<UploadSlot>) => {
    setSlots((current) => ({ ...current, [kind]: { ...EMPTY, ...current[kind], ...next } }));
  }, []);

  // A return visit starts from what is already saved, not from blank.
  React.useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;

    void fetchSavedDocuments(ownerType, ownerId).then((saved) => {
      if (cancelled) return;
      setSlots((current) => {
        const next = { ...current };
        for (const document of saved) {
          next[document.kind] = { ...EMPTY, ...next[document.kind], saved: document };
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId]);

  const send = React.useCallback(
    async (kind: string, file: File, expiresAt: string) => {
      if (!ownerId) return;
      patch(kind, { uploading: true, error: null });

      const result = await uploadDocument({
        ownerType,
        ownerId,
        kind,
        file,
        expiresAt: expiresAt || null,
      });

      if (!result.ok) {
        patch(kind, { uploading: false, error: result.message ?? 'That upload did not save.' });
        return;
      }

      patch(kind, {
        uploading: false,
        error: null,
        file: null,
        saved: {
          kind,
          status: 'uploaded',
          name: file.name,
          sizeBytes: file.size,
          mime: file.type,
          rejectionReason: null,
        },
      });
    },
    [ownerType, ownerId, patch],
  );

  const onFileSelect = React.useCallback(
    (kind: string, file: File) => {
      const requirement = requirements.find((r) => r.kind === kind);
      const slot = slots[kind] ?? EMPTY;
      patch(kind, { file, error: null });

      if (requirement?.has_expiry && !slot.expiresAt) return;
      void send(kind, file, slot.expiresAt);
    },
    [requirements, slots, patch, send],
  );

  const onExpiryChange = React.useCallback(
    (kind: string, expiresAt: string) => {
      const slot = slots[kind] ?? EMPTY;
      patch(kind, { expiresAt });
      if (slot.file && expiresAt) void send(kind, slot.file, expiresAt);
    },
    [slots, patch, send],
  );

  const onRemove = React.useCallback(
    (kind: string) => patch(kind, { file: null, error: null }),
    [patch],
  );

  /*
   * What the applicant still owes. A rejected document counts as outstanding —
   * it is the one case where something is on file but the application cannot
   * move, and saying "5 of 6" while one is rejected would be a lie.
   */
  const outstanding = requirements.filter((requirement) => {
    const saved = slots[requirement.kind]?.saved;
    return !saved || saved.status === 'rejected';
  });

  return {
    slots,
    onFileSelect,
    onExpiryChange,
    onRemove,
    outstanding,
    uploaded: requirements.length - outstanding.length,
    slotFor: (kind: string) => slots[kind] ?? EMPTY,
  };
}
