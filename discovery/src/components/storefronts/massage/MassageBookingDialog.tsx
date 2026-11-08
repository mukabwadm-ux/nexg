import { useEffect, useId, useState } from 'react';
import { Check, Heart, MapPin, Minus, Plus, X } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import type { CatalogNaming } from '../../../data/catalogSections';
import { MAX_NOTES, MAX_PEOPLE, localDateKey, ownDescription, type AppointmentRequest, type ServiceProfile } from '../../../data/massagePresentation';
import { formatPrice } from '../../../lib/formatPrice';
import { DatePicker } from '../../DatePicker';
import { ImageWithFallback } from '../../ImageWithFallback';

type Draft = Omit<AppointmentRequest, 'savedAt'>;
const sameDraft = (a: Draft, b: Draft) => a.date === b.date && a.time === b.time && a.people === b.people && a.notes.trim() === b.notes.trim();

/**
 * The booking request sheet for one service, in the card family's expanded frame (cards.css). It asks only
 * for a preferred day, time, people and notes. Booking isn't connected on the website yet, so "Save request"
 * keeps the request on this device and says so; the provider confirms the time once booking opens.
 */
export function MassageBookingDialog({ merchant, item, profile, naming, saved, request, onSave, onSaveRequest, onRemoveRequest, onClose }: {
  merchant: Merchant;
  item: CatalogItem;
  profile: ServiceProfile;
  naming: CatalogNaming;
  saved: boolean;
  /** The request already kept on this device for this service, if any. */
  request?: AppointmentRequest;
  onSave: (id: string) => void;
  onSaveRequest: (id: string, request: AppointmentRequest) => void;
  onRemoveRequest: (id: string) => void;
  onClose: () => void;
}) {
  const today = localDateKey();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState<Draft>(() => ({
    date: request && request.date >= today ? request.date : '',
    time: profile.askTime ? request?.time ?? '' : '',
    people: request?.people ?? 1,
    notes: request?.notes ?? '',
  }));
  // What this device holds now; the button reads "Request saved" while the form still matches it.
  const [stored, setStored] = useState<Draft | undefined>(() => request && request.date >= today ? draft : undefined);
  const [onDevice, setOnDevice] = useState(Boolean(request));
  const [notice, setNotice] = useState<{ tone: 'error' | 'done'; text: string }>();
  const unavailable = item.isAvailable === false;
  const price = formatPrice(item, 'code');
  const description = ownDescription(item, merchant);
  const savedNow = Boolean(stored && sameDraft(stored, draft));

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => { document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [dialog]);
  const close = () => { if (dialog?.open) dialog.close(); else onClose(); };

  // Any change after saving turns the button back into its action.
  const edit = (change: Partial<Draft>) => { setDraft((current) => ({ ...current, ...change })); setNotice(undefined); };
  const submit = () => {
    if (unavailable) return;
    if (!draft.date) return setNotice({ tone: 'error', text: 'Choose a date first.' });
    onSaveRequest(item.id, { ...draft, notes: draft.notes.trim(), savedAt: new Date().toISOString() });
    setStored(draft);
    setOnDevice(true);
    setNotice(undefined);
  };
  const remove = () => {
    onRemoveRequest(item.id);
    setStored(undefined);
    setOnDevice(false);
    setNotice({ tone: 'done', text: 'Request removed from this device.' });
  };

  // One short line says where the request lives and who confirms what.
  const confirms = `${merchant.name} confirms the ${price ? 'time' : 'price and time'}.`;
  const status = notice?.text
    ?? (unavailable ? `This ${naming.item} is currently unavailable.`
      : savedNow ? `Saved on this device. ${merchant.name} hasn’t been contacted yet.`
        : `Kept on this device until booking is connected. ${confirms}`);
  const tone = notice?.tone === 'error' ? 'is-error' : savedNow || notice?.tone === 'done' ? 'is-saved' : undefined;
  const people = profile.peopleLabel.toLocaleLowerCase('en-KE');

  return <dialog ref={setDialog} className="offering-sheet offering-sheet--service appointment-sheet" aria-labelledby={titleId} aria-describedby={statusId} onClose={onClose}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="offering-sheet__layout">
      <div className="offering-sheet__media">
        <ImageWithFallback src={item.image} alt="" width={760} height={570} referrerPolicy="no-referrer" />
        <button type="button" className="offering-sheet__close" aria-label="Close" onClick={close} autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
      </div>
      <form className="offering-sheet__content" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <p className="offering-sheet__merchant"><MapPin size={15} strokeWidth={1.75} aria-hidden="true" />{merchant.name}{merchant.area ? ` · ${merchant.area}` : ''}</p>
        <div className="offering-sheet__title">
          <h2 id={titleId}>{item.name}</h2>
          <button type="button" className="offering-sheet__save" aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${item.name}`} onClick={() => onSave(item.id)}>
            <Heart size={20} strokeWidth={1.75} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
        {unavailable ? <p className="offering-sheet__price is-unavailable">Currently unavailable</p> : price && <p className="offering-sheet__price">{price}</p>}
        {description && <p className="offering-sheet__description">{description}</p>}

        <div className="offering-sheet__questions">
          <DatePicker label={profile.dateLabel} mode="single" min={today} value={{ from: draft.date || undefined }} onChange={(range) => edit({ date: range.from ?? '' })} />
          {profile.askTime && <label className="offering-field"><span>Preferred time (optional)</span>
            <input type="time" value={draft.time} onChange={(event) => edit({ time: event.target.value })} /></label>}
          <div className={`offering-stepper${profile.askTime ? '' : ' offering-field--wide'}`} role="group" aria-label={profile.peopleLabel}>
            <span>{profile.peopleLabel}</span>
            <div>
              <button type="button" aria-label={`Fewer ${people}`} disabled={draft.people <= 1} onClick={() => edit({ people: draft.people - 1 })}><Minus size={16} strokeWidth={2} aria-hidden="true" /></button>
              <output aria-live="polite">{draft.people}</output>
              <button type="button" aria-label={`More ${people}`} disabled={draft.people >= MAX_PEOPLE} onClick={() => edit({ people: draft.people + 1 })}><Plus size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
          </div>
          <label className="offering-field offering-field--wide"><span>Anything they should know? (optional)</span>
            <textarea value={draft.notes} maxLength={MAX_NOTES} placeholder={profile.notesPlaceholder} onChange={(event) => edit({ notes: event.target.value })} /></label>
        </div>

        <footer className="offering-sheet__footer">
          <p id={statusId} role="status" className={tone}>{status}</p>
          {onDevice && <button type="button" className="appointment-sheet__remove" onClick={remove}>Remove</button>}
          <button type="submit" className="offering-sheet__primary" disabled={unavailable}>
            {savedNow ? <>Request saved<Check size={18} strokeWidth={2} aria-hidden="true" /></> : 'Save request'}
          </button>
        </footer>
      </form>
    </div>
  </dialog>;
}
