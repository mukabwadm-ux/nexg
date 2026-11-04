'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { loadSetupLocations, saveSetupLocation, type SetupLocation } from '@/app/merchant/location-setup-actions';
import { LocationEditor } from './editors';
import type { Location } from './model';
import styles from './workspace.module.css';

const blank = (): SetupLocation => ({ id: null, name: '', type: 'physical', address: '', contact: '', activityIds: [], updatedAt: null });

/** The workspace's own location editor, backed by the merchant's branch records. */
export function SetupLocationEditor({ open, onClose, onSaved, activities }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  activities: { id: string; name: string }[];
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
      if (!result.ok) { setLoadFailed(true); setMessage(result.message); return; }
      setLocations(result.locations);
      const first = result.locations[0] ?? blank();
      setDraft(first);
      setBaseline(first);
    });
    return () => { active = false; };
  }, [open]);

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
    setSaving(true);
    setMessage('');
    const result = await saveSetupLocation(draft);
    setSaving(false);
    if (!result.ok) { setMessage(result.message); return; }
    setLocations((current) => [result.location, ...current.filter((item) => item.id !== result.location.id)]);
    setDraft(result.location);
    setBaseline(result.location);
    setMessage('Location saved.');
    onSaved();
  }
  const value: Location = { ...draft, id: draft.id ?? '', published: false, commitments: 0, coverage: '' };

  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-xl" aria-describedby={undefined}>
        <div className={styles.root}>
          <div className="flex items-center justify-between gap-4 py-4">
            <Dialog.Title className="text-xl font-bold">Location and coverage</Dialog.Title>
            <button type="button" onClick={close} aria-label="Close location editor">✕</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
            {loading ? <p>Loading locations…</p> : !loadFailed && <>
              {locations.length > 0 && <label className="block">Location
                <select className="mt-1 block w-full rounded border p-2" value={draft.id ?? ''} onChange={(event) => select(event.target.value)}>
                  <option value="">Add a location</option>
                  {locations.map((location) => <option key={location.id} value={location.id ?? ''}>{location.name}</option>)}
                </select>
              </label>}
              <LocationEditor setup value={value} onChange={(next) => setDraft((current) => ({
                ...current, name: next.name, type: next.type, address: next.address,
                contact: next.contact, activityIds: next.activityIds,
              }))} data={{activities: activities.map((activity) => ({...activity, enabled: true}))}} />
              <p className="text-sm">A map pin and service coverage can be added separately. Changing the address clears an existing pin and zone so they can be confirmed again.</p>
            </>}
            {message && <p role="status">{message}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t py-4">
            <button type="button" onClick={close} disabled={saving}>Close</button>
            <button type="button" onClick={() => void save()} disabled={loading || saving || loadFailed} className="rounded bg-[#d4a72c] px-4 py-2 font-bold">{saving ? 'Saving…' : 'Save location'}</button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
