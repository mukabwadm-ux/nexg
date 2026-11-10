import { useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useWorkspace } from '../workspace';
import { Button, Icon } from '../ui';
import { nextDate } from '../model';

/*
 * Block dates (repairs, own use) or hold them for somebody who has not
 * confirmed yet. Both are refused by the database when the nights are
 * already taken, so a hold or block is a promise nobody else can break.
 */
export function DatesDialog({
  mode,
  unitId,
  onClose,
}: {
  mode: 'block' | 'hold';
  unitId?: string;
  onClose: () => void;
}) {
  const w = useWorkspace(),
    block = mode === 'block';
  const [draft, setDraft] = useState({
    unitId: unitId ?? w.units[0]?.id ?? '',
    start: w.today,
    end: nextDate(w.today, block ? 1 : 2),
    note: '',
    guest: '',
    adults: 1,
    hours: 24,
    phone: '',
  });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const set = (key: keyof typeof draft, value: string | number) =>
    setDraft({ ...draft, [key]: value });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (draft.end <= draft.start) {
      setError(
        block ? 'The block has to end after it starts.' : 'Check-out has to be after check-in.',
      );
      return;
    }
    setSaving(true);
    const record = block
      ? {
          kind: 'block',
          unitId: draft.unitId,
          start: draft.start,
          end: draft.end,
          note: draft.note.trim() || undefined,
        }
      : {
          kind: 'hold',
          unitId: draft.unitId,
          start: draft.start,
          end: draft.end,
          guest: draft.guest.trim(),
          adults: draft.adults,
          hours: draft.hours,
          phone: draft.phone.trim() || undefined,
          arrivalTime: w.data.settings.checkIn,
          departTime: w.data.settings.checkOut,
        };
    const ok = await w.run({ type: 'save', collection: 'stays', record });
    setSaving(false);
    if (ok) onClose();
    else setError('Those dates could not be saved. Check the workspace notification.');
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="record-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{block ? 'Block dates' : 'Hold dates'}</Dialog.Title>
              <Dialog.Description>
                {block
                  ? 'Nobody can book this unit for these nights until you lift the block.'
                  : 'Keeps the nights for a guest who has not confirmed. The hold ends by itself unless you confirm it.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label="Close dialog">
                <Icon name="close" />
              </Button>
            </Dialog.Close>
          </div>
          <form className="record-form" onSubmit={submit}>
            <div className="field-grid">
              <label className="field">
                <span>Unit *</span>
                <select
                  required
                  value={draft.unitId}
                  onChange={(e) => set('unitId', e.target.value)}
                >
                  {w.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {w.unitLabel(unit.id)}
                    </option>
                  ))}
                </select>
              </label>
              {!block && (
                <label className="field">
                  <span>Guest name *</span>
                  <input
                    required
                    maxLength={160}
                    value={draft.guest}
                    onChange={(e) => set('guest', e.target.value)}
                  />
                </label>
              )}
              <label className="field">
                <span>{block ? 'First night *' : 'Check-in date *'}</span>
                <input
                  type="date"
                  required
                  min={w.today}
                  value={draft.start}
                  onChange={(e) => set('start', e.target.value)}
                />
              </label>
              <label className="field">
                <span>{block ? 'Opens again on *' : 'Check-out date *'}</span>
                <input
                  type="date"
                  required
                  min={draft.start}
                  value={draft.end}
                  onChange={(e) => set('end', e.target.value)}
                />
              </label>
              {block ? (
                <label className="field field-wide">
                  <span>Reason · only you see this</span>
                  <input
                    maxLength={500}
                    placeholder="Repairs, painting, own use…"
                    value={draft.note}
                    onChange={(e) => set('note', e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Adults *</span>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={draft.adults}
                      onChange={(e) => set('adults', Number(e.target.value))}
                    />
                  </label>
                  <label className="field">
                    <span>Hold for *</span>
                    <select
                      value={draft.hours}
                      onChange={(e) => set('hours', Number(e.target.value))}
                    >
                      {[2, 6, 24, 48, 72, 168].map((hours) => (
                        <option key={hours} value={hours}>
                          {hours < 24
                            ? `${hours} hours`
                            : hours === 168
                              ? '7 days'
                              : `${hours / 24} ${hours === 24 ? 'day' : 'days'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Guest phone</span>
                    <input
                      type="tel"
                      maxLength={50}
                      value={draft.phone}
                      onChange={(e) => set('phone', e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="dialog-footer">
              <Button onClick={onClose}>Cancel</Button>
              <span />
              <Button type="submit" variant="primary" disabled={saving || !draft.unitId}>
                {saving ? 'Saving…' : block ? 'Block dates' : 'Hold dates'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
