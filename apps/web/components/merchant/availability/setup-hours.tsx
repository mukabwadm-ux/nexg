'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { loadSetupHours, saveSetupHours, type SavedSetupHours } from '@/app/merchant/setup-hours-actions';
import { HoursEditor } from './forms';
import { validateHours, type DayHours } from './model';
import styles from './workspace.module.css';

const emptyWeek = (): DayHours[] => Array.from({length: 7}, (_, day) => ({day, state: 'unspecified', intervals: []}));
function weekFromSaved(saved: SavedSetupHours): DayHours[] {
  return emptyWeek().map((day) => {
    const row = saved.rows.find((entry) => entry.day === day.day);
    if (!row) return day;
    if (row.closed) return {...day, state: 'closed'};
    return {...day, state: 'open', intervals: [{start: (row.opens ?? '').slice(0, 5), end: (row.closes ?? '').slice(0, 5), nextDay: false}]};
  });
}

/** The existing availability hours editor backed by the merchant's own hours. */
export function SetupHours({open, onClose, onSaved, activities}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  activities: {id: string; name: string}[];
}) {
  const [hours, setHours] = useState<DayHours[]>(emptyWeek);
  const [baseline, setBaseline] = useState('');
  const [version, setVersion] = useState('');
  const [ambiguous, setAmbiguous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = Boolean(version) && baseline !== JSON.stringify(hours);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(''); setMessage(''); setVersion('');
    void loadSetupHours().then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) { setError(result.message); return; }
      const week = weekFromSaved(result.value);
      setHours(week); setBaseline(JSON.stringify(week));
      setAmbiguous(result.value.ambiguous); setVersion(result.value.version);
    });
    return () => { active = false; };
  }, [open]);

  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm('Discard your unsaved changes to opening hours?')) return;
    onClose();
  };

  async function save() {
    const issues = validateHours(hours);
    if (issues.length) { setError(issues[0]!); return; }
    if (hours.some((day) => day.state === 'open' && (day.intervals.length !== 1 || day.intervals[0]!.nextDay))) {
      setError('This setup currently supports one same-day opening interval per day. Split, overnight and 24-hour hours are not supported yet.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    const result = await saveSetupHours(hours.map((day) => ({
      day: day.day,
      state: day.state,
      ...(day.state === 'open' ? {opens: day.intervals[0]!.start, closes: day.intervals[0]!.end} : {}),
    })), version);
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    const saved = weekFromSaved(result.value);
    setHours(saved); setBaseline(JSON.stringify(saved)); setVersion(result.value.version);
    setMessage('Opening hours saved.'); onSaved();
  }

  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-xl focus:outline-none" aria-describedby="setup-hours-description" onEscapeKeyDown={(event) => { event.preventDefault(); close(); }} onPointerDownOutside={(event) => event.preventDefault()}>
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div><Dialog.Title className="text-xl font-bold">Opening hours</Dialog.Title>
            <p id="setup-hours-description" className="mt-1 text-sm text-muted">Set shared business opening hours for {activities.map((item) => item.name).join(', ') || 'your business'}.</p>
          </div>
          <button type="button" onClick={close} className="text-xl" aria-label="Close opening hours">×</button>
        </header>
        <div className={`${styles.root} min-h-0 flex-1 overflow-y-auto px-6 py-5`}>
          <p className="mb-4 text-sm">These are business opening hours. Resource availability and booking schedules are managed separately.</p>
          {loading && <p role="status">Loading your saved hours…</p>}
          {ambiguous && <p role="alert" className="mb-4 text-sm text-red-700">Your existing hours need review because their weekday format is unclear. They have not been changed.</p>}
          {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="mb-4 text-sm text-green-700">{message}</p>}
          {!loading && version && !ambiguous && <>
            <p className="mb-4 text-sm">One same-day interval per day can be saved here. Split, overnight and 24-hour hours need a separate supported workflow.</p>
            <HoursEditor hours={hours} onChange={(next) => { setHours(next); setError(''); setMessage(''); }} />
          </>}
        </div>
        <footer className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button type="button" className="rounded-lg border border-border px-4 py-2" onClick={close}>Close</button>
          <button type="button" className="rounded-lg bg-gold px-4 py-2 font-bold disabled:opacity-50" onClick={() => void save()} disabled={!version || !dirty || loading || busy || ambiguous}>{busy ? 'Saving…' : 'Save hours'}</button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
