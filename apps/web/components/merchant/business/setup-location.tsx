'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import {
  loadSetupLocations,
  saveSetupLocation,
  type SetupLocation,
} from '@/app/merchant/location-setup-actions';
import { MapPinField, parsePin } from '@/components/merchant/map-pin-field';
import { LocationEditor } from './editors';
import type { Location } from './model';
import styles from './workspace.module.css';

const blank = (): SetupLocation => ({
  id: null,
  name: '',
  type: 'physical',
  address: '',
  contact: '',
  activityIds: [],
  updatedAt: null,
  pin: '',
});

/* A place riders and customers go to, or a base a service leaves from. */
const needsPin = (location: SetupLocation) => location.type !== 'digital_operation';

/** The workspace's own location editor, backed by the merchant's branch records. */
export function SetupLocationEditor({
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
  onUnavailable?: (editor: 'location') => void;
}) {
  const [locations, setLocations] = useState<SetupLocation[]>([]);
  const [draft, setDraft] = useState<SetupLocation>(blank);
  const [baseline, setBaseline] = useState<SetupLocation>(blank);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    setMessage('');
    void loadSetupLocations().then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) {
        if (result.unavailable && onUnavailable) onUnavailable('location');
        setLoadFailed(true);
        setMessage(result.message);
        return;
      }
      setLocations(result.locations);
      const first = result.locations[0] ?? blank();
      setDraft(first);
      setBaseline(first);
    });
    return () => {
      active = false;
    };
  }, [open, onUnavailable]);

  function close() {
    if (saving || (dirty && !window.confirm('Discard unsaved location changes?'))) return;
    onClose();
  }
  function select(id: string) {
    if (dirty && !window.confirm('Discard unsaved location changes?')) return;
    const next = locations.find((location) => location.id === id) ?? blank();
    setDraft(next);
    setBaseline(next);
    setMessage('');
  }
  async function save() {
    if (needsPin(draft) && !parsePin(draft.pin)) {
      setMessage('Pin this location on the map: riders and customers are sent to that exact spot.');
      return;
    }
    setSaving(true);
    setMessage('');
    const result = await saveSetupLocation(draft);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setLocations((current) => [
      result.location,
      ...current.filter((item) => item.id !== result.location.id),
    ]);
    setDraft(result.location);
    setBaseline(result.location);
    setMessage(
      !needsPin(result.location)
        ? 'Location saved.'
        : result.location.area
          ? `Location saved, in the ${result.location.area} area.`
          : result.location.inServiceArea === false
            ? 'Location saved. This pin is outside the areas NexG serves today, so customers will not find it on the map yet.'
            : 'Location saved.',
    );
    onSaved();
  }
  const value: Location = {
    ...draft,
    id: draft.id ?? '',
    published: false,
    commitments: 0,
    coverage: '',
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-xl"
          aria-describedby={undefined}
        >
          <div className={styles.root}>
            <div className="flex items-center justify-between gap-4 py-4">
              <Dialog.Title className="text-xl font-bold">Location and coverage</Dialog.Title>
              <button type="button" onClick={close} aria-label="Close location editor">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {loading ? (
                <p>Loading locations…</p>
              ) : (
                !loadFailed && (
                  <>
                    {locations.length > 0 && (
                      <label className="block">
                        Location
                        <select
                          className="mt-1 block w-full rounded border p-2"
                          value={draft.id ?? ''}
                          onChange={(event) => select(event.target.value)}
                        >
                          <option value="">Add a location</option>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id ?? ''}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <LocationEditor
                      setup
                      value={value}
                      onChange={(next) =>
                        setDraft((current) => ({
                          ...current,
                          name: next.name,
                          type: next.type,
                          address: next.address,
                          contact: next.contact,
                          activityIds: next.activityIds,
                        }))
                      }
                      data={{
                        activities: activities.map((activity) => ({ ...activity, enabled: true })),
                      }}
                    />
                    {needsPin(draft) && (
                      <div>
                        <label htmlFor="setup-location-pin" className="block font-bold">
                          Exact location on the map
                        </label>
                        <p className="text-sm">
                          Riders and customers are sent to this pin, and it decides which area your
                          shop shows in. Pin your door, not the street.
                        </p>
                        <MapPinField
                          id="setup-location-pin"
                          value={draft.pin}
                          disabled={saving}
                          placeholder="Pin on the map, or paste latitude, longitude"
                          className="block w-full rounded border p-2"
                          onChange={(pin) => setDraft((current) => ({ ...current, pin }))}
                          searchText={draft.address}
                        />
                        {draft.pin !== '' && draft.pin === baseline.pin && (
                          <p className="text-sm font-bold" role="status">
                            {draft.area
                              ? `This location is in the ${draft.area} area. Move the pin if it is not on your door.`
                              : draft.inServiceArea === false
                                ? 'This pin is outside the areas NexG serves today, so customers will not find it on the map yet.'
                                : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )
              )}
              {message && <p role="status">{message}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t py-4">
              <button type="button" onClick={close} disabled={saving}>
                Close
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={loading || saving || loadFailed}
                className="rounded bg-[#FDD128] px-4 py-2 font-bold"
              >
                {saving ? 'Saving…' : 'Save location'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
