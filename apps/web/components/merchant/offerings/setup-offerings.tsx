'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  adoptLegacySetupOffering,
  loadLegacySetupOfferings,
  loadSetupOfferings,
  saveSetupOffering,
  saveSetupOfferingPublication,
  type LegacyOffering,
} from '@/app/merchant/offering-setup-actions';
import { createClient } from '@/lib/supabase/client';
import { browserUuid } from '@/lib/browser-uuid';
import { defaultConfiguration, profiles, type Offering } from './model';
import type { OfferingsSource } from './source';
import { OfferingsWorkspace } from './workspace';

/** Reuses the workspace editor on setup Home with the merchant's own draft source. */
export function SetupOfferings({
  open,
  onClose,
  onSaved,
  activities,
  onUnavailable,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  activities: { id: string; name: string }[];
  onUnavailable?: (editor: 'offerings') => void;
}) {
  const supported = activities.filter((activity) =>
    profiles.some((profile) => profile.id === activity.id),
  );
  const merchantScope = useRef<string | null>(null);
  const active = useRef(open);
  const [legacy, setLegacy] = useState<LegacyOffering[]>([]);
  const [legacyError, setLegacyError] = useState('');
  const [legacyActivity, setLegacyActivity] = useState('');
  const [legacyItem, setLegacyItem] = useState('');
  const [opening, setOpening] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [opened, setOpened] = useState<{ id: string; profileId: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    active.current = true;
    void loadLegacySetupOfferings().then((result) => {
      if (!active.current) return;
      if (result.ok) {
        setLegacy(result.items);
        setLegacyError('');
      } else {
        setLegacy([]);
        setLegacyError(result.message);
      }
    });
    return () => {
      active.current = false;
    };
  }, [open]);
  const source = useMemo<OfferingsSource>(
    () => ({
      async load(profile) {
        const result = await loadSetupOfferings();
        if (!result.ok) {
          if (result.unavailable && active.current) onUnavailable?.('offerings');
          throw new Error(result.message);
        }
        merchantScope.current = result.merchantId;
        const client = createClient();
        const offerings = await Promise.all(
          result.items
            .filter((item) => item.profileId === profile.id)
            .map(async (item) => {
              if (!item.imageStoragePath) return item;
              const { data, error } = await client.storage
                .from('merchant-offering-media')
                .createSignedUrl(item.imageStoragePath, 3600);
              if (error || !data?.signedUrl)
                throw new Error('Could not load the saved offering photo. Please try again.');
              return { ...item, image: data.signedUrl };
            }),
        );
        return { revision: 1, configuration: defaultConfiguration(profile), offerings };
      },
      async save(_profile, item, publication) {
        /* Publish, or Save changes on a published offering, keeps it
           published; Save draft and Unpublish leave it hidden. */
        const target = publication ?? item.publication;
        if (target === 'archived') throw new Error('Archiving is not available during setup.');
        const result =
          target === 'published' || item.publication === 'published'
            ? await saveSetupOfferingPublication(item, target === 'published')
            : await saveSetupOffering(item);
        if (!result.ok) throw new Error(result.message);
        return {
          ...result.item,
          ...(item.image && item.imageStoragePath ? { image: item.image } : {}),
        };
      },
      async replace() {
        throw new Error('Changing catalogue configuration is not available during setup.');
      },
      async reset() {
        throw new Error('Reset is not available for real merchant data.');
      },
    }),
    [onUnavailable],
  );

  async function uploadImage(item: Offering, file: File) {
    const merchantId = merchantScope.current;
    if (!merchantId) throw new Error('Your workspace has not loaded. Please try again.');
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensions[file.type];
    if (!extension || file.size > 2_000_000)
      throw new Error('Choose a JPG, PNG or WebP smaller than 2 MB.');
    const path = `${merchantId}/${item.id}/${browserUuid()}.${extension}`;
    const client = createClient();
    const { error } = await client.storage
      .from('merchant-offering-media')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error('Could not upload the photo. Please try again.');
    const signed = await client.storage.from('merchant-offering-media').createSignedUrl(path, 3600);
    if (signed.error || !signed.data?.signedUrl)
      throw new Error('Photo uploaded, but its preview could not be opened. Please retry.');
    return { path, url: signed.data.signedUrl };
  }

  async function openExisting() {
    const item = legacy.find((entry) => entry.id === legacyItem);
    if (!item || !legacyActivity) {
      setLegacyError('Choose an existing offering and its business activity.');
      return;
    }
    if (
      editorDirty &&
      !window.confirm('Discard your unsaved offering changes and open this entry?')
    )
      return;
    setOpening(true);
    setLegacyError('');
    const result = await adoptLegacySetupOffering(item.id, item.updatedAt, legacyActivity);
    setOpening(false);
    if (!result.ok) {
      setLegacyError(result.message);
      return;
    }
    setLegacy((current) => current.filter((entry) => entry.id !== item.id));
    setLegacyItem('');
    setOpened({ id: result.item.id, profileId: result.item.profileId });
    onSaved();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return;
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-xl focus:outline-none"
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">Add an offering</Dialog.Title>
          {legacy.length > 0 && (
            <div className="border-b border-gray-200 p-4">
              <h2 className="font-bold">Open an existing catalogue entry</h2>
              <p className="mt-1 text-sm">
                Choose the business activity that this existing offering belongs to.
              </p>
              <select
                aria-label="Existing catalogue entry"
                value={legacyItem}
                onChange={(event) => setLegacyItem(event.target.value)}
                className="mt-2 w-full rounded border p-2"
              >
                <option value="">Choose an offering</option>
                {legacy.map((entry) => (
                  <option value={entry.id} key={entry.id} disabled={entry.live && entry.available}>
                    {entry.name}
                    {entry.live && entry.available ? ' · edit in catalogue' : ''}
                  </option>
                ))}
              </select>
              <select
                aria-label="Offering business activity"
                value={legacyActivity}
                onChange={(event) => setLegacyActivity(event.target.value)}
                className="mt-2 w-full rounded border p-2"
              >
                <option value="">Choose its activity</option>
                {supported.map((activity) => (
                  <option value={activity.id} key={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={opening}
                onClick={() => void openExisting()}
                className="mt-2 rounded border px-3 py-2 font-bold"
              >
                {opening ? 'Opening…' : 'Open offering'}
              </button>
            </div>
          )}
          {legacyError && (
            <p role="alert" className="p-4 text-red-700">
              {legacyError}
            </p>
          )}
          {supported.length ? (
            <OfferingsWorkspace
              key={opened?.id ?? 'new'}
              setupEditor
              preview={false}
              source={source}
              initialProfileId={opened?.profileId ?? supported[0]!.id}
              initialOfferingId={opened?.id}
              setupActivities={supported}
              onSetupClose={onClose}
              onSetupSaved={onSaved}
              onSetupDirtyChange={setEditorDirty}
              onUploadImage={uploadImage}
            />
          ) : (
            <div className="p-6">
              <p>
                We could not match your selected business activities to an offering editor. Please
                contact support.
              </p>
              <button type="button" className="mt-4 underline" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
