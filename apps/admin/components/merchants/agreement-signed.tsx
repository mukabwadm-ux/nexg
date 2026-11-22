import { signingContext, type SigningContext } from '@/lib/merchant-agreement-signing';
import { liveEmailStatus, recipientLabel, type LiveEmailStatus } from '@/lib/merchant-live-email';
import { createClient } from '@/lib/supabase/server';

import { IssueAgreementButton } from './issue-agreement-button';
import { ResendLiveEmailButton } from './resend-live-email-button';

const day = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

const BASIS: Record<string, string> = {
  negotiated: 'negotiated rate',
  own_riders: 'standard rate, own riders',
  nexg_delivery: 'NexG rider delivers',
};

/**
 * The merchant's signed agreement for staff: the copy NexG issued, with its
 * reference and checksum and a download, or what is still missing before it
 * can be signed, and the details it is (or will be) filled in with.
 */
export async function MerchantAgreementSigned({ merchantId }: { merchantId: string }) {
  const client = createClient();
  const [{ context, error }, email] = await Promise.all([
    signingContext(client, merchantId),
    liveEmailStatus(client, merchantId),
  ]);
  return (
    <section
      aria-labelledby="merchant-agreement-signed"
      className="border-border bg-surface mt-4 rounded-2xl border p-5"
    >
      <h2 id="merchant-agreement-signed" className="text-[0.9375rem] font-extrabold">
        Signed merchant agreement
      </h2>
      {!context ? (
        <p className="text-muted mt-2 text-sm font-semibold">
          The signing record could not be read{error ? `: ${error}` : '.'}
        </p>
      ) : (
        <Body merchantId={merchantId} context={context} email={email.status} />
      )}
    </section>
  );
}

/**
 * Where the owner's "business is live" email stands, under the signed copy
 * it carries: it goes by itself once the agreement is signed and the business
 * is live, and Send again is offered only when it did not go.
 */
function LiveEmail({ merchantId, email }: { merchantId: string; email: LiveEmailStatus | null }) {
  if (!email || email.state === 'not_signed') return null;
  const to = recipientLabel(email);
  const line = (() => {
    switch (email.state) {
      case 'not_live':
        return 'The owner is emailed, with this agreement attached, when the business goes live.';
      case 'sent':
        return `Emailed to ${to ?? 'the owner'}${email.sent_at ? ` ${day(email.sent_at)}` : ''}, with this agreement attached.`;
      case 'waiting':
        return `Waiting to go out to ${to ?? 'the owner'}${
          email.attempts && email.last_error
            ? `. Attempt ${email.attempts} of 5 failed: ${email.last_error}`
            : ''
        }.`;
      case 'failed':
        return `Not sent: it failed after its retries${email.last_error ? ` (${email.last_error})` : ''}.`;
      case 'skipped':
        return `Not sent: ${email.reason ?? 'it was skipped.'}`;
      case 'error':
        return `Not sent: it could not be queued${email.reason ? ` (${email.reason})` : ''}.`;
      default:
        return 'Not sent yet.';
    }
  })();
  const good = email.state === 'sent' || email.state === 'waiting' || email.state === 'not_live';
  return (
    <div className="border-border mt-3 border-t pt-3">
      <p className="text-ink text-[0.8125rem] font-bold">“Your business is live” email</p>
      <p className={`mt-1 text-[0.8125rem] font-semibold ${good ? 'text-muted' : 'text-warning'}`}>
        {line}
      </p>
      {email.can_resend ? <ResendLiveEmailButton merchantId={merchantId} /> : null}
    </div>
  );
}

function Body({
  merchantId,
  context,
  email,
}: {
  merchantId: string;
  context: SigningContext;
  email: LiveEmailStatus | null;
}) {
  const { signed, party } = context;
  return (
    <div className="mt-3 space-y-3 text-sm">
      {signed ? (
        <div className="bg-success-bg rounded-xl px-4 py-3">
          <p className="text-success font-bold">
            Signed and issued {day(signed.signed_at)} · {signed.reference}
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            Version {signed.version} · {signed.pages} pages · SHA-256{' '}
            <span className="font-mono text-[0.75rem]">{signed.sha256.slice(0, 16)}…</span>
          </p>
          <a
            href={`/merchants/${encodeURIComponent(merchantId)}/agreement`}
            className="text-ink mt-2 inline-flex min-h-11 items-center font-extrabold underline underline-offset-2"
          >
            Download signed agreement (PDF)
          </a>
          <LiveEmail merchantId={merchantId} email={email} />
        </div>
      ) : context.missing.length ? (
        <div className="bg-warning-bg rounded-xl px-4 py-3">
          <p className="text-warning font-bold">Not signed yet</p>
          <ul className="text-ink mt-1 list-disc space-y-1 pl-5 text-[0.8125rem] font-semibold">
            {context.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="border-border rounded-xl border px-4 py-3">
          <p className="font-bold">Ready to sign.</p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            Approving signs it. For a merchant approved earlier, issue it here.
          </p>
          <IssueAgreementButton merchantId={merchantId} />
        </div>
      )}
      {party ? (
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted font-semibold">Registered name</dt>
          <dd className="font-bold">{party.legal_name}</dd>
          <dt className="text-muted font-semibold">Registration number</dt>
          <dd className="font-bold">{party.registration_number ?? 'Not given yet'}</dd>
          <dt className="text-muted font-semibold">KRA PIN</dt>
          <dd className="font-mono text-[0.8125rem]">{party.kra_pin}</dd>
          <dt className="text-muted font-semibold">Address</dt>
          <dd className="font-semibold">
            {party.address}
            {party.postal_address ? ` · ${party.postal_address}` : ''}
          </dd>
          <dt className="text-muted font-semibold">Signs for the business</dt>
          <dd className="font-semibold">
            {party.signatory_name}, {party.signatory_title}
          </dd>
          <dt className="text-muted font-semibold">Disputes</dt>
          <dd className="font-semibold">
            {party.representative_name}, {party.representative_title} · then {party.principal_name}
          </dd>
          {context.commission?.pct != null ? (
            <>
              <dt className="text-muted font-semibold">Commission stated</dt>
              <dd className="font-semibold">
                {Number(context.commission.pct)} % (
                {BASIS[context.commission.basis] ?? context.commission.basis})
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
