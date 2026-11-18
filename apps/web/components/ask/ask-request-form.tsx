'use client';

import '../../../../merchant-onboarding/src/merchant-onboarding.css';

import { withCaptcha } from '@nexg/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { submitLead } from '@/app/actions';
import { StayingAtField } from '@/components/location/staying-at-field';
import { FormSection, Tick } from '@/components/onboarding/form-section';
import { MerchantRegistrationFormFrame } from '@/components/onboarding/merchant-registration-page';
import {
  ASK_NOTES_MAX,
  askPhoneProblem,
  askPrefill,
  askWhenLabel,
  type AskCategory,
  type AskWhen,
} from '@/lib/ask-request';

import styles from './ask-request-form.module.css';

/**
 * The request form on /ask, in the merchant and rider forms' look (owner,
 * 17 Nov 2026): numbered cards, one open at a time, each folding to a
 * one-line summary once it is done.
 *
 *   1. What you need: a category from NexG's list, so whoever calls back
 *      already knows what it is about, and the request in their own words.
 *   2. Where and when.
 *   3. How we reach you: WhatsApp, which is where the reply goes.
 *
 * It raises a support ticket (submitLead) and orders nothing: a person
 * replies and agrees the price before anything is bought.
 */

type SectionId = 'need' | 'where' | 'contact';
type FieldId = 'category' | 'staying' | 'phone';
type Errors = Partial<Record<FieldId, string>>;

const SECTIONS: { id: SectionId; title: string; fields: FieldId[] }[] = [
  { id: 'need', title: 'What you need', fields: ['category'] },
  { id: 'where', title: 'Where and when', fields: ['staying'] },
  { id: 'contact', title: 'How we reach you', fields: ['phone'] },
];

const WHEN_OPTIONS: { value: AskWhen; label: string }[] = [
  { value: 'asap', label: 'As soon as possible' },
  { value: 'later', label: 'Pick a time' },
];

interface Sent {
  reference?: string | undefined;
  category: string;
  when: string;
}

/** Long text cut down for the one line a folded section shows. */
function clip(text: string, max = 70): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function AskRequestForm({ categories }: { categories: readonly AskCategory[] }) {
  const params = useSearchParams();
  const prefill = React.useMemo(() => askPrefill(params, categories), [params, categories]);

  const [category, setCategory] = React.useState(prefill.category ?? '');
  const [notes, setNotes] = React.useState(prefill.notes ?? '');
  const [stayingAt, setStayingAt] = React.useState('');
  const [when, setWhen] = React.useState<AskWhen>('asap');
  const [whenDetail, setWhenDetail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [fullName, setFullName] = React.useState('');

  const [open, setOpen] = React.useState<SectionId | null>('need');
  const [errors, setErrors] = React.useState<Errors>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState<Sent | null>(null);
  const sentHeading = React.useRef<HTMLHeadingElement>(null);

  /* A link followed while the page is open (the search's "Airport
     transfer", say) changes the query without remounting the form. */
  React.useEffect(() => {
    if (!prefill.category && !prefill.notes) return;
    if (prefill.category) setCategory(prefill.category);
    if (prefill.notes) setNotes(prefill.notes);
    setSent(null);
    setOpen('need');
  }, [prefill.category, prefill.notes]);

  /* Sent: the card that replaced the form takes focus, which also brings
     it into view on a phone, where the button was far below it. */
  React.useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  const clearError = React.useCallback(
    (...fields: FieldId[]) =>
      setErrors((current) => {
        if (!fields.some((field) => current[field])) return current;
        const next = { ...current };
        for (const field of fields) delete next[field];
        return next;
      }),
    [],
  );

  const onStayingChange = React.useCallback(
    (value: string) => {
      setStayingAt(value);
      if (value.trim().length >= 3) clearError('staying');
    },
    [clearError],
  );

  const chosen = categories.find((option) => option.id === category);
  const fallback = categories.find((option) => option.id === 'concierge_services');

  const problems = (fields: FieldId[]): Errors => {
    const found: Errors = {};
    for (const field of fields) {
      if (field === 'category' && !chosen) found.category = 'Choose what you need.';
      if (field === 'staying' && stayingAt.trim().length < 3)
        found.staying = 'Tell us where you are staying.';
      if (field === 'phone') {
        const problem = askPhoneProblem(phone);
        if (problem) found.phone = problem;
      }
    }
    return found;
  };

  const sections = SECTIONS.map((section) => {
    const done = Object.keys(problems(section.fields)).length === 0;
    const attention = section.fields.some((field) => errors[field]);
    const started = {
      need: Boolean(category || notes.trim()),
      where: Boolean(stayingAt.trim()) || when === 'later',
      contact: Boolean(phone.trim() || fullName.trim()),
    }[section.id];
    const summary = {
      need: [chosen?.name, notes.trim() ? clip(notes) : null].filter(Boolean).join(' · '),
      where: stayingAt.trim() ? `${clip(stayingAt, 50)} · ${askWhenLabel(when, whenDetail)}` : '',
      contact: [phone.trim(), fullName.trim()].filter(Boolean).join(' · '),
    }[section.id];
    return { ...section, done, attention, started, summary };
  });
  const doneCount = sections.filter((section) => section.done).length;

  const continueFrom = (index: number) => () => {
    const section = sections[index]!;
    const found = problems(section.fields);
    setErrors((current) => ({ ...current, ...found }));
    if (Object.keys(found).length > 0) return;
    const next =
      sections.find((item, position) => position > index && !item.done) ??
      sections.find((item) => !item.done && item.id !== section.id);
    setOpen(next?.id ?? null);
  };

  const submit = async (form: HTMLFormElement) => {
    if (submitting) return;
    const found = problems(SECTIONS.flatMap((section) => section.fields));
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = SECTIONS.find((section) => section.fields.some((field) => found[field]));
      setOpen(first?.id ?? null);
      setNotice('Some details are missing. Check the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      /* Every field is in the form, folded sections included: a
         section's body is hidden, never disabled. */
      const result = await submitLead(null, await withCaptcha(new FormData(form)));
      if (!result.ok) {
        /* The rate limit is worded for the person; it reaches them as written. */
        setNotice(result.message);
        return;
      }
      setSent({
        reference: result.reference,
        category: chosen!.name,
        when: askWhenLabel(when, whenDetail),
      });
    } catch {
      setNotice('That did not send. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* Another request from the same person keeps where they are and how to
     reach them, and starts again from what they need. */
  const askAgain = () => {
    setCategory('');
    setNotes('');
    setWhen('asap');
    setWhenDetail('');
    setErrors({});
    setNotice(null);
    setSent(null);
    setOpen('need');
  };

  const sectionProps = (index: number) => ({
    scope: 'ask',
    section: sections[index]!,
    number: index + 1,
    open: open === sections[index]!.id,
    onOpen: () => setOpen(sections[index]!.id),
    onContinue: continueFrom(index),
  });

  return (
    <MerchantRegistrationFormFrame>
      <div className={`merchant-onboarding ${styles.ask}`}>
        {sent ? <SentCard sent={sent} headingRef={sentHeading} onAskAgain={askAgain} /> : null}

        {/* Kept, not unmounted, once sent: the place they picked (and its
            pin) is still there if they ask for something else. */}
        <div hidden={sent !== null}>
          <form
            className="mo-registration-form"
            noValidate
            aria-label="Ask a concierge"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(event.currentTarget);
            }}
          >
            <section className="mo-registration" aria-label="Your request">
              <div className="mo-registration-progress">
                <div className="mo-registration-progress-label">
                  <strong>Your request</strong>
                  <span>
                    {doneCount} of {sections.length} complete
                  </span>
                </div>
                <div className="mo-registration-progress-bar" aria-hidden="true">
                  {sections.map((section) => (
                    <span
                      key={section.id}
                      className={
                        section.done ? 'is-done' : open === section.id ? 'is-open' : undefined
                      }
                    />
                  ))}
                </div>
              </div>

              <FormSection {...sectionProps(0)}>
                <div className={`mo-field ${errors.category ? 'has-error' : ''}`}>
                  <label htmlFor="ask-category">
                    Category
                    <span className="mo-required"> *</span>
                  </label>
                  <select
                    id="ask-category"
                    name="category"
                    value={category}
                    required
                    aria-required
                    aria-invalid={Boolean(errors.category)}
                    aria-describedby={errors.category ? 'ask-category-error' : 'ask-category-help'}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      clearError('category');
                    }}
                  >
                    <option value="" disabled>
                      Choose a category
                    </option>
                    {categories.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  {errors.category ? (
                    <span id="ask-category-error" className="mo-error" role="alert">
                      {errors.category}
                    </span>
                  ) : (
                    <small id="ask-category-help" className="mo-help">
                      {chosen
                        ? chosen.desc
                        : fallback
                          ? `Not sure which? Choose ${fallback.name} and tell us below.`
                          : 'Not sure which? Tell us below.'}
                    </small>
                  )}
                </div>

                <div className="mo-field">
                  <label htmlFor="ask-notes">
                    Tell us more
                    <span className="mo-optional">optional</span>
                  </label>
                  <textarea
                    id="ask-notes"
                    name="notes"
                    rows={4}
                    maxLength={ASK_NOTES_MAX}
                    placeholder="A brand, a budget, a time, a room number: anything that helps."
                    aria-describedby="ask-notes-help"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <small id="ask-notes-help" className="mo-help">
                    The more you tell us, the less we need to ask when we call.
                  </small>
                </div>
              </FormSection>

              <FormSection {...sectionProps(1)}>
                <StayingAtField error={errors.staying} onValueChange={onStayingChange} />

                <fieldset className="mo-segment-field">
                  <legend>When do you need it?</legend>
                  <div className="mo-segment">
                    {WHEN_OPTIONS.map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name="when"
                          value={option.value}
                          checked={when === option.value}
                          onChange={() => setWhen(option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {when === 'later' && (
                  <TextField
                    id="when_detail"
                    label="What time suits you?"
                    placeholder="e.g. tonight at 8pm"
                    optional
                    value={whenDetail}
                    onChange={setWhenDetail}
                  />
                )}
              </FormSection>

              <FormSection {...sectionProps(2)} onContinue={undefined}>
                <div className="mo-section-pair">
                  <TextField
                    id="phone"
                    label="WhatsApp number"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0712 345 678"
                    help="Your concierge replies here."
                    value={phone}
                    error={errors.phone}
                    onChange={(value) => {
                      setPhone(value);
                      clearError('phone');
                    }}
                  />
                  <TextField
                    id="full_name"
                    label="Your name"
                    autoComplete="given-name"
                    optional
                    value={fullName}
                    onChange={setFullName}
                  />
                </div>
              </FormSection>
            </section>

            {notice && (
              <div className="mo-alert" role="alert">
                {notice}
              </div>
            )}

            <div className="mo-actions">
              <div />
              <div className="mo-action-right">
                <p className={`mo-submit-requirement ${styles.reassurance}`}>
                  You&apos;ll see the price and delivery time before you confirm.
                </p>
                <button
                  type="submit"
                  className={`mo-button mo-button-primary ${styles.send}`}
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </MerchantRegistrationFormFrame>
  );
}

/**
 * What replaces the form once it is sent: that a person has it, what they
 * asked for read back, and the reference to quote. Then a way to keep going,
 * because the next thought after "sent" is often "one more thing".
 */
function SentCard({
  sent,
  headingRef,
  onAskAgain,
}: {
  sent: Sent;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onAskAgain: () => void;
}) {
  return (
    <div className="mo-registration-form">
      <section className="mo-section is-done is-open" aria-labelledby="ask-sent-title">
        <div className="mo-section-head">
          <span className="mo-section-marker" aria-hidden="true">
            <Tick />
          </span>
          <div className="mo-section-title">
            <h2 id="ask-sent-title" ref={headingRef} tabIndex={-1}>
              Thank you — a concierge has your request.
            </h2>
          </div>
        </div>
        <div className="mo-section-body">
          <p className={styles.sentLede}>
            Somebody is reading it now, not a bot. You will hear from us on WhatsApp shortly to
            confirm the price and the timing before anything is ordered.
          </p>
          <dl className={styles.sentList}>
            <div>
              <dt>You asked for</dt>
              <dd>{sent.category}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>{sent.when}</dd>
            </div>
            {sent.reference ? (
              <div>
                <dt>Your reference</dt>
                <dd className={styles.reference}>{sent.reference}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mo-help">
            Quote that reference if you call or message us, and whoever answers will already know
            what this is about.
          </p>
        </div>
      </section>
      <div className={styles.sentActions}>
        <Link href="/discover" className="mo-button mo-button-secondary">
          Browse while you wait
        </Link>
        <button type="button" className="mo-button mo-button-primary" onClick={onAskAgain}>
          Ask for something else
        </button>
      </div>
    </div>
  );
}

/** A text field in the merchant form's markup, so its floating label works. */
function TextField({
  id,
  label,
  value,
  onChange,
  error,
  help,
  optional = false,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  help?: string;
  optional?: boolean;
  type?: 'text' | 'tel';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  placeholder?: string;
}) {
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={`mo-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional ? (
          <span className="mo-optional">optional</span>
        ) : (
          <span className="mo-required"> *</span>
        )}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        required={!optional}
        aria-required={!optional || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={`${id}-error`} className="mo-error" role="alert">
          {error}
        </span>
      ) : help ? (
        <small id={`${id}-help`} className="mo-help">
          {help}
        </small>
      ) : null}
    </div>
  );
}
