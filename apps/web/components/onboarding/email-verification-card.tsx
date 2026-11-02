'use client';

import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader } from '@nexg/ui';
import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react';

type Feedback = { kind: 'error' | 'notice'; message: string } | null;

type EmailVerificationCardProps = {
  email: string;
  preview?: boolean;
  submitLabel?: string;
  descriptionPrefix?: string;
  resendNotice?: string;
  requestStatus?: 'sending' | 'ready' | 'error';
  requestMessage?: string;
  onRetryRequest?: () => void;
  /** Resolve only after the identity provider confirms the code. The caller owns navigation. */
  onVerify?: (code: string) => Promise<void>;
  /** Resolve only after the identity provider accepts a resend request. */
  onResend?: () => Promise<void>;
};

/** The entry screen is separate from the identity provider so the saved application can be retained. */
export function EmailVerificationCard({
  email,
  preview = false,
  submitLabel = 'Verify email',
  descriptionPrefix,
  resendNotice = 'A new code has been sent to your email.',
  requestStatus = 'ready',
  requestMessage,
  onRetryRequest,
  onVerify,
  onResend,
}: EmailVerificationCardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [pending, setPending] = useState<'verify' | 'resend' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const activeSlot = Math.min(cursor, 5);

  function updateCode(value: string, selectionStart: number | null) {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
    setCursor(Math.min(value.slice(0, selectionStart ?? value.length).replace(/[^0-9]/g, '').length, digits.length));
    setFeedback(null);
  }

  function pasteCode(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = event.clipboardData.getData('text').replace(/[^0-9]/g, '');
    const start = event.currentTarget.selectionStart ?? code.length;
    const end = event.currentTarget.selectionEnd ?? start;
    const next = `${code.slice(0, start)}${digits}${code.slice(end)}`.slice(0, 6);
    const nextCursor = Math.min(start + digits.length, next.length);
    setCode(next);
    setCursor(nextCursor);
    setFeedback(null);
    requestAnimationFrame(() => input.current?.setSelectionRange(nextCursor, nextCursor));
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || requestStatus !== 'ready') return;
    if (code.length !== 6) {
      setFeedback({ kind: 'error', message: 'Enter the complete 6-digit code.' });
      input.current?.focus();
      return;
    }
    if (!onVerify) {
      setFeedback({ kind: 'notice', message: 'This preview does not send or verify a code yet.' });
      return;
    }
    setPending('verify');
    setFeedback(null);
    try {
      await onVerify(code);
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'We could not verify this code. Check it and try again.' });
    } finally {
      setPending(null);
    }
  }

  async function resend() {
    if (pending || requestStatus !== 'ready') return;
    if (!onResend) {
      setFeedback({ kind: 'notice', message: 'Email delivery is not connected in this preview.' });
      return;
    }
    setPending('resend');
    setFeedback(null);
    try {
      await onResend();
      setFeedback({ kind: 'notice', message: resendNotice });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'We could not send a new code. Please try again.' });
    } finally {
      setPending(null);
    }
  }

  return (
    <Card padded={false} className="border-border overflow-hidden rounded-[22px] shadow-[0_18px_55px_rgba(20,20,20,0.07)]">
      <div className="bg-gold h-1" aria-hidden="true" />
      <CardHeader className="mb-0 block px-6 pb-0 pt-7 sm:px-8 sm:pt-8">
        <p className="text-gold-text w-full text-center text-[13px] font-extrabold uppercase tracking-[0.16em] sm:text-sm">
          Merchant onboarding
        </p>
        <h1 className="text-ink mt-1 text-center text-[24px] font-extrabold leading-tight tracking-tight sm:text-[26px]">
          Verify your email
        </h1>
        <CardDescription className="mt-2 text-center text-[15px] leading-6">
          {descriptionPrefix ?? (preview ? 'A 6-digit code will be sent to ' : requestStatus === 'sending' ? 'Sending a 6-digit code to ' : requestStatus === 'error' ? 'We could not send a code to ' : 'Enter the 6-digit code sent to ')}
          <strong className="text-ink break-all font-bold">{email}</strong>.
        </CardDescription>
      </CardHeader>

      <CardContent className="text-ink px-6 pb-7 pt-6 sm:px-8 sm:pb-8">
        <form onSubmit={verify} noValidate aria-busy={pending !== null || requestStatus === 'sending'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="merchant-email-code" className="text-[13px] font-extrabold">
              Verification code
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => requestStatus === 'error' ? onRetryRequest?.() : void resend()}
              disabled={pending !== null || requestStatus === 'sending' || (requestStatus === 'error' && !onRetryRequest)}
              className="h-9 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {pending === 'resend' || requestStatus === 'sending' ? 'Sending…' : requestStatus === 'error' ? 'Try again' : 'Resend code'}
            </Button>
          </div>

          <div className="relative mt-3" onClick={() => input.current?.focus()}>
            <div className="flex items-center gap-1.5 sm:gap-2" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} className="contents">
                  {index === 3 ? <span className="text-muted-light px-0.5 text-lg">–</span> : null}
                  <span
                    className={`flex h-14 min-w-0 flex-1 items-center justify-center rounded-xl border text-[22px] font-bold tabular-nums transition-colors ${focused && activeSlot === index ? 'border-gold ring-gold/25 ring-4' : feedback?.kind === 'error' ? 'border-danger' : 'border-border-strong bg-white'}`}
                  >
                    {code[index] ?? ''}
                  </span>
                </span>
              ))}
            </div>
            <input
              ref={input}
              id="merchant-email-code"
              name="verification-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              value={code}
              onChange={(event) => updateCode(event.currentTarget.value, event.currentTarget.selectionStart)}
              onPaste={pasteCode}
              onFocus={(event) => {
                setFocused(true);
                setCursor(event.currentTarget.selectionStart ?? code.length);
              }}
              onBlur={() => setFocused(false)}
              onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? code.length)}
              aria-describedby="merchant-email-code-help merchant-email-code-feedback"
              aria-invalid={feedback?.kind === 'error' || undefined}
              className="absolute inset-0 h-full w-full cursor-text opacity-0"
            />
          </div>
          <p id="merchant-email-code-help" className="text-muted-light mt-3 text-xs leading-5">
            Enter all 6 digits from the email.
          </p>
          <p
            id="merchant-email-code-feedback"
            role={requestStatus === 'error' || feedback?.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`mt-2 text-xs leading-5 ${requestStatus === 'error' || feedback?.kind === 'error' ? 'text-danger' : 'text-muted'}`}
          >
            {requestStatus === 'error' ? requestMessage ?? 'We could not send a verification code. Please try again.' : feedback?.message ?? ''}
          </p>

          <CardFooter className="mt-5 block p-0">
            <Button type="submit" variant="gold" size="lg" block disabled={requestStatus !== 'ready'} loading={pending === 'verify'} loadingText="Verifying…">
              {submitLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="text-muted mt-5 text-center text-xs leading-5">
              Having trouble?{' '}
              <Link href="/help" className="text-ink font-bold underline underline-offset-4 hover:text-gold-text">
                Contact support
              </Link>
            </p>
            {requestStatus === 'error' ? (
              <p className="mt-3 text-center text-xs"><Link href="/merchant" className="text-ink font-bold underline underline-offset-4">Return to Home</Link></p>
            ) : null}
          </CardFooter>
        </form>
      </CardContent>
      <div className="border-border bg-gold-soft/60 text-muted flex items-start gap-2 border-t px-6 py-4 text-xs leading-5 sm:px-8">
        <ShieldCheck className="text-gold-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Once verified, you can continue setting up your merchant workspace.</span>
      </div>
    </Card>
  );
}
