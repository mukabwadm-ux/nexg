'use client';

import '../../../../merchant-onboarding/src/merchant-onboarding.css';

import { toE164 } from '@nexg/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { MerchantRegistrationFormFrame } from '@/components/onboarding/merchant-registration-page';
import { looksKenyan } from '@/components/rider-onboarding/types';
import {
  CODE_PATTERN,
  EMAIL_PATTERN,
  sendEmailCode,
  verifyEmailCode,
  type EmailCodeWording,
} from '@/lib/email-code';
import { createClient } from '@/lib/supabase/client';

/**
 * The rider application, on /riders: one short form in the merchant form's
 * look (owner, 17 Nov 2026). It replaces the five pages under /riders/apply.
 *
 * It asks only what a rider must give before review: their name, an M-Pesa
 * number, an email confirmed with a code (it becomes their login), the number
 * plate and the agreement. Riders ride motorbikes in Nairobi, so neither is
 * asked. Submit creates the application and submits it straight away; the
 * photos, areas and kit follow from the rider dashboard, and approval still
 * waits for every document to be verified (rpc_activate_rider).
 *
 * The session starts only when the rider asks for an email code, so a visitor
 * who never gets that far creates nothing.
 */

const WORDING: EmailCodeWording = {
  exists:
    'This email already has a NexG account. Sign in at the rider sign-in page, or use a different email.',
  signedInAs: (email) =>
    `You are signed in as ${email}. Sign out to apply as a rider with a different email.`,
};

type SectionId = 'name' | 'contact' | 'bike' | 'terms';
type FieldId = 'firstName' | 'lastName' | 'phone' | 'email' | 'plate' | 'terms';
type Errors = Partial<Record<FieldId, string>>;

const SECTIONS: { id: SectionId; title: string; fields: FieldId[] }[] = [
  { id: 'name', title: 'Your name', fields: ['firstName', 'lastName'] },
  { id: 'contact', title: 'Contact details', fields: ['phone', 'email'] },
  { id: 'bike', title: 'Your motorbike', fields: ['plate'] },
  { id: 'terms', title: 'Rider agreement', fields: ['terms'] },
];

/** A Kenyan mobile number as +254…, from "0712 345 678", "712345678" or "+254 712…". */
function kenyanE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return toE164(digits.startsWith('254') ? digits.slice(3) : digits, 'KE');
}

export function RiderRegistrationForm({ cityId }: { cityId: string | null }) {
  const router = useRouter();

  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [plate, setPlate] = React.useState('');
  const [accepted, setAccepted] = React.useState(false);

  const [open, setOpen] = React.useState<SectionId | null>('name');
  const [errors, setErrors] = React.useState<Errors>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  /* The email check: the address the code went to, and the one confirmed. */
  const [codeFor, setCodeFor] = React.useState<{ userId: string; email: string } | null>(null);
  const [code, setCode] = React.useState('');
  const [verifiedEmail, setVerifiedEmail] = React.useState<string | null>(null);
  const [emailBusy, setEmailBusy] = React.useState<'sending' | 'verifying' | null>(null);
  const [emailMessage, setEmailMessage] = React.useState<string | null>(null);
  const codeInput = React.useRef<HTMLInputElement>(null);

  /*
   * Someone coming back in the same browser: a confirmed email is already
   * theirs, a draft fills the form, and a submitted application gets a way to
   * it instead. Nothing here starts a session.
   */
  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || cancelled) return;
      if (!user.is_anonymous && user.email && user.email_confirmed_at) {
        const confirmed = user.email.toLowerCase();
        setEmail((current) => current || confirmed);
        setVerifiedEmail(confirmed);
      }
      const { data: row } = await supabase
        .from('rider')
        .select('first_name, last_name, phone, plate_no, submitted_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row || cancelled) return;
      if (row.submitted_at) {
        setSubmitted(true);
        return;
      }
      setFirstName((current) => current || row.first_name || '');
      setLastName((current) => current || row.last_name || '');
      setPhone((current) => current || row.phone || '');
      setPlate((current) => current || row.plate_no || '');
    })().catch(() => {
      /* Reading a saved draft is a convenience; the form works without it. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cleanEmail = email.trim().toLowerCase();
  const phoneE164 = kenyanE164(phone);
  const emailVerified = verifiedEmail !== null && verifiedEmail === cleanEmail;

  const problems = (fields: FieldId[]): Errors => {
    const found: Errors = {};
    for (const field of fields) {
      if (field === 'firstName' && !firstName.trim()) found.firstName = 'Enter your first name.';
      if (field === 'lastName' && !lastName.trim()) found.lastName = 'Enter your last name.';
      if (field === 'phone' && !phoneE164)
        found.phone = 'Enter a Kenyan mobile number, for example 0712 345 678.';
      if (field === 'email' && !EMAIL_PATTERN.test(cleanEmail))
        found.email = 'Enter a valid email address.';
      else if (field === 'email' && !emailVerified)
        found.email = 'Verify your email with the code we send you.';
      if (field === 'plate' && !plate.trim()) found.plate = 'Enter your number plate.';
      if (field === 'terms' && !accepted) found.terms = 'Accept the Rider Agreement to continue.';
    }
    return found;
  };

  const sections = SECTIONS.map((section) => {
    const done = Object.keys(problems(section.fields)).length === 0;
    const attention = section.fields.some((field) => errors[field]);
    const started = section.fields.some((field) =>
      field === 'terms'
        ? accepted
        : !!{ firstName, lastName, phone, email, plate }[field as Exclude<FieldId, 'terms'>].trim(),
    );
    const summary = {
      name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' '),
      contact: [phoneE164, emailVerified ? cleanEmail : null].filter(Boolean).join(' · '),
      bike: plate.trim() ? `${plate.trim().toUpperCase()} · Nairobi` : '',
      terms: accepted ? 'Accepted' : '',
    }[section.id];
    return { ...section, done, attention, started, summary };
  });
  const doneCount = sections.filter((section) => section.done).length;

  const clearError = (...fields: FieldId[]) =>
    setErrors((current) => {
      if (!fields.some((field) => current[field])) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });

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

  /* ------------------------------------------------------------ email code */

  const sendCode = async () => {
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setErrors((current) => ({ ...current, email: 'Enter a valid email address.' }));
      return;
    }
    setEmailBusy('sending');
    setEmailMessage(null);
    clearError('email');
    try {
      const sent = await sendEmailCode(createClient().auth, cleanEmail, WORDING);
      if (sent.verified) {
        setVerifiedEmail(cleanEmail);
        setCodeFor(null);
      } else {
        setCode('');
        setCodeFor({ userId: sent.userId, email: cleanEmail });
        window.setTimeout(() => codeInput.current?.focus(), 0);
      }
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : 'We could not send a code.');
    } finally {
      setEmailBusy(null);
    }
  };

  const confirmCode = async () => {
    if (!codeFor) return;
    if (!CODE_PATTERN.test(code)) {
      setEmailMessage('Enter the 6- or 8-digit code from the email.');
      return;
    }
    setEmailBusy('verifying');
    setEmailMessage(null);
    try {
      await verifyEmailCode(createClient().auth, codeFor.userId, codeFor.email, code, WORDING);
      setVerifiedEmail(codeFor.email);
      setCodeFor(null);
      setCode('');
      clearError('email');
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : 'That code did not work.');
    } finally {
      setEmailBusy(null);
    }
  };

  /* ---------------------------------------------------------------- submit */

  const submit = async () => {
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
    const supabase = createClient();
    try {
      const invite = new URLSearchParams(window.location.search).get('invite');
      const { data: riderId, error: startError } = await supabase.rpc('rpc_rider_start', {
        p_first_name: firstName.trim(),
        p_phone: phoneE164!,
        p_city_id: cityId ?? undefined,
        p_fleet_token: invite && invite.length <= 200 ? invite : undefined,
      });
      if (startError || !riderId)
        throw new Error(startError?.message ?? 'We could not save your application.');
      const id = riderId as string;

      const vehicle = await supabase.rpc('rpc_rider_set_vehicle', {
        p_rider_id: id,
        p_vehicle: 'motorbike',
      });
      if (vehicle.error) throw new Error(vehicle.error.message);

      const saved = await supabase.rpc('rpc_rider_save_step', {
        p_rider_id: id,
        p_step: 5,
        p_patch: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          plate_no: plate.trim().toUpperCase(),
          /* Weekly pay goes to the number they gave, as on the old payout step. */
          payout_msisdn: phoneE164,
          ...(cityId ? { city_id: cityId } : {}),
        },
      });
      if (saved.error) throw new Error(saved.error.message);

      /* Records that nobody has checked the M-Pesa name yet (no provider). */
      await supabase.rpc('rpc_rider_payout_name_check', { p_rider_id: id });

      const done = await supabase.rpc('rpc_rider_submit', { p_rider_id: id });
      if (done.error) throw new Error(done.error.message);

      /* The status page sends the welcome email with the password link. */
      router.push('/riders/status?welcome=1');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'We could not submit your application. Try again.',
      );
      setSubmitting(false);
    }
  };

  if (submitted)
    return (
      <MerchantRegistrationFormFrame>
        <div className="merchant-onboarding">
          <div className="mo-registration-form">
            <p className="mo-notice" role="status">
              Your rider application is in. Follow it, and add your photos, from your application
              page.
            </p>
            <div className="mo-actions">
              <div />
              <div className="mo-action-right">
                <Link href="/riders/status" className="mo-button mo-button-primary">
                  See your application
                </Link>
              </div>
            </div>
          </div>
        </div>
      </MerchantRegistrationFormFrame>
    );

  const sectionProps = (index: number) => ({
    section: sections[index]!,
    number: index + 1,
    open: open === sections[index]!.id,
    onOpen: () => setOpen(sections[index]!.id),
    onContinue: continueFrom(index),
  });

  const plateWarning =
    plate.trim() && !looksKenyan(plate.trim().toUpperCase())
      ? 'That is not a Kenyan plate format. We will still take it — the team checks it at the hub.'
      : undefined;

  return (
    <MerchantRegistrationFormFrame>
      <div className="merchant-onboarding">
        <form
          className="mo-registration-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {notice && (
            <div className="mo-alert" role="alert">
              {notice}
            </div>
          )}

          <section className="mo-registration" aria-label="Rider application">
            <div className="mo-registration-progress">
              <div className="mo-registration-progress-label">
                <strong>Your application</strong>
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

            <Section {...sectionProps(0)}>
              <div className="mo-section-pair">
                <Field
                  id="rider-first-name"
                  label="First name"
                  autoComplete="given-name"
                  value={firstName}
                  error={errors.firstName}
                  onChange={(value) => {
                    setFirstName(value);
                    clearError('firstName');
                  }}
                />
                <Field
                  id="rider-last-name"
                  label="Last name"
                  autoComplete="family-name"
                  value={lastName}
                  error={errors.lastName}
                  onChange={(value) => {
                    setLastName(value);
                    clearError('lastName');
                  }}
                />
              </div>
            </Section>

            <Section {...sectionProps(1)}>
              <Field
                id="rider-phone"
                label="M-Pesa mobile number"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="0712 345 678"
                help="Your weekly pay goes to this number."
                value={phone}
                error={errors.phone}
                onChange={(value) => {
                  setPhone(value);
                  clearError('phone');
                }}
              />
              <div className="mo-business-email">
                <div className="mo-business-email-row">
                  <Field
                    id="rider-email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    help="This becomes your rider login."
                    value={email}
                    error={errors.email}
                    disabled={emailBusy !== null}
                    onChange={(value) => {
                      setEmail(value);
                      clearError('email');
                      setEmailMessage(null);
                      if (codeFor && codeFor.email !== value.trim().toLowerCase()) {
                        setCodeFor(null);
                        setCode('');
                      }
                    }}
                  />
                  {EMAIL_PATTERN.test(cleanEmail) &&
                    (emailVerified ? (
                      <span className="mo-email-verified" role="status">
                        Email verified
                      </span>
                    ) : codeFor ? null : (
                      <button
                        type="button"
                        className="mo-button mo-button-secondary mo-email-verify-button"
                        disabled={emailBusy !== null}
                        onClick={() => void sendCode()}
                      >
                        {emailBusy === 'sending' ? 'Sending code…' : 'Verify email'}
                      </button>
                    ))}
                </div>
                {codeFor && !emailVerified ? (
                  <div className="mo-email-code-panel">
                    <label htmlFor="rider-email-code">Enter verification code</label>
                    <div className="mo-email-code-row">
                      <input
                        ref={codeInput}
                        id="rider-email-code"
                        name="rider-email-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={8}
                        value={code}
                        disabled={emailBusy !== null}
                        aria-describedby="rider-email-code-message"
                        onChange={(event) => {
                          setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 8));
                          setEmailMessage(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void confirmCode();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="mo-button mo-button-primary mo-email-code-verify"
                        disabled={emailBusy !== null || !CODE_PATTERN.test(code)}
                        onClick={() => void confirmCode()}
                      >
                        {emailBusy === 'verifying' ? 'Checking…' : 'Verify code'}
                      </button>
                      <button
                        type="button"
                        className="mo-button mo-button-ghost mo-email-code-resend"
                        disabled={emailBusy !== null}
                        onClick={() => void sendCode()}
                      >
                        {emailBusy === 'sending' ? 'Sending…' : 'Resend code'}
                      </button>
                    </div>
                    <p
                      id="rider-email-code-message"
                      className={`mo-email-code-message ${emailMessage ? 'mo-email-code-error' : ''}`}
                      role={emailMessage ? 'alert' : 'status'}
                    >
                      {emailMessage ?? `We sent a code to ${codeFor.email}.`}
                    </p>
                  </div>
                ) : emailMessage ? (
                  <p className="mo-email-code-message mo-email-code-error" role="alert">
                    {emailMessage}
                  </p>
                ) : null}
              </div>
            </Section>

            <Section {...sectionProps(2)}>
              <p className="mo-help">NexG riders deliver on motorbikes, in Nairobi.</p>
              <Field
                id="rider-plate"
                label="Number plate"
                autoComplete="off"
                placeholder="KMFA 123A"
                help={plateWarning}
                value={plate}
                error={errors.plate}
                onChange={(value) => {
                  setPlate(value.toUpperCase());
                  clearError('plate');
                }}
              />
            </Section>

            <Section {...sectionProps(3)} onContinue={undefined}>
              <div className="mo-registration-terms">
                <div className="mo-check">
                  <input
                    id="rider-terms-accepted"
                    type="checkbox"
                    checked={accepted}
                    required
                    aria-labelledby="rider-terms-copy"
                    aria-invalid={Boolean(errors.terms)}
                    onChange={(event) => {
                      setAccepted(event.target.checked);
                      clearError('terms');
                    }}
                  />
                  <span id="rider-terms-copy">
                    <label htmlFor="rider-terms-accepted">I accept the NexG </label>
                    <a href="/legal/rider-agreement">Rider Agreement</a>
                    <label htmlFor="rider-terms-accepted"> and </label>
                    <a href="/legal/privacy">privacy notice</a>
                    <label htmlFor="rider-terms-accepted">.</label>{' '}
                    <span className="mo-required">*</span>
                  </span>
                </div>
                {errors.terms && <span className="mo-error">{errors.terms}</span>}
              </div>
            </Section>
          </section>

          <div className="mo-actions">
            <div />
            <div className="mo-action-right">
              {!emailVerified && (
                <p className="mo-submit-requirement" role="status">
                  Verify your email before submitting.
                </p>
              )}
              <button
                type="submit"
                className="mo-button mo-button-primary"
                disabled={submitting || !emailVerified}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </form>
        <p className="mo-footnote">Next: your documents, then a short onboarding session.</p>
      </div>
    </MerchantRegistrationFormFrame>
  );
}

/* ------------------------------------------------------------ the pieces */

/** One numbered card of the form, the same markup as the merchant form's sections. */
function Section({
  section,
  number,
  open,
  onOpen,
  onContinue,
  children,
}: {
  section: {
    id: SectionId;
    title: string;
    done: boolean;
    attention: boolean;
    started: boolean;
    summary: string;
  };
  number: number;
  open: boolean;
  onOpen: () => void;
  onContinue: (() => void) | undefined;
  children: React.ReactNode;
}) {
  const bodyId = `mo-section-rider-${section.id}`;
  const state = section.done
    ? 'done'
    : section.attention
      ? 'attention'
      : open || section.started
        ? 'progress'
        : 'todo';
  const badge = {
    done: 'Complete',
    attention: 'Needs attention',
    progress: 'In progress',
    todo: 'To do',
  }[state];
  return (
    <section
      className={`mo-section is-${state} ${open ? 'is-open' : ''}`}
      aria-labelledby={`${bodyId}-title`}
    >
      <div className="mo-section-head">
        <span className="mo-section-marker" aria-hidden="true">
          {section.done ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
            >
              <path d="M5 12.5 10 17 19 7" />
            </svg>
          ) : (
            number
          )}
        </span>
        <div className="mo-section-title">
          <h2 id={`${bodyId}-title`}>{section.title}</h2>
          {!open && section.summary && <p>{section.summary}</p>}
        </div>
        {open || !section.done ? <span className="mo-section-badge">{badge}</span> : null}
        {!open && (
          <button
            type="button"
            className="mo-section-edit"
            aria-expanded="false"
            aria-controls={bodyId}
            onClick={onOpen}
          >
            {section.done ? 'Edit' : 'Open'}
            <span className="mo-sr-only"> {section.title}</span>
          </button>
        )}
      </div>
      <div id={bodyId} className="mo-section-body" hidden={!open}>
        {children}
        {onContinue && (
          <div className="mo-section-actions">
            <button type="button" className="mo-button mo-section-continue" onClick={onContinue}>
              Continue
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** A text field, the same markup as the merchant form's, so its floating label works. */
function Field({
  id,
  label,
  value,
  onChange,
  error,
  help,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  help?: string | undefined;
  type?: 'text' | 'tel' | 'email';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={`mo-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        <span className="mo-required"> *</span>
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        required
        aria-required
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        disabled={disabled}
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
