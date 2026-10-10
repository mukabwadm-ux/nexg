'use client';

import { Button, useToast } from '@nexg/ui';
import { Camera, Check, Copy, MessageCircle, Smartphone, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { DocumentsNote } from '@/components/onboarding/controls';
import { ContinueButton, FooterNote } from '@/components/onboarding/shell-frame';
import { createClient } from '@/lib/supabase/client';
import { uploadDocument } from '@/lib/uploads';

import { RiderShell } from './rider-shell';
import { RiderNoDraft } from './no-draft';
import { useRiderOnboarding } from './store';

interface Requirement {
  id: string;
  kind: string;
  label: string;
  why_text: string | null;
  has_expiry: boolean;
  essential: boolean;
  sort: number;
}

interface Existing {
  requirement_id: string;
  side: string | null;
  status: string;
  expires_at: string | null;
  rejection_reason: string | null;
}

/**
 * Step 4 — the photos.
 *
 * The list is not a constant: it comes from fn_rider_required_docs, which
 * read the vehicle, the ownership and the insurance from step 2. A bicycle
 * rider sees three rows and never a logbook.
 *
 * The national ID is one row and two photos. Treating it as one upload is
 * how you end up with a thousand IDs photographed face-up and a reviewer
 * chasing every one of them for the back.
 */
export function RiderDocumentsStep() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, refresh, flushNow } = useRiderOnboarding();

  const [requirements, setRequirements] = React.useState<Requirement[]>([]);
  const [existing, setExisting] = React.useState<Existing[]>([]);
  const [requested, setRequested] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [expiry, setExpiry] = React.useState<Record<string, string>>({});
  const [handoff, setHandoff] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const draftId = draft?.id ?? null;

  const load = React.useCallback(async () => {
    if (!draftId) return;
    const supabase = createClient();
    const [{ data: reqs }, { data: docs }, { data: chases }] = await Promise.all([
      supabase.rpc('fn_rider_required_docs', { p_rider_id: draftId }),
      supabase
        .from('document')
        .select('requirement_id, side, status, expires_at, rejection_reason')
        .eq('owner_type', 'rider')
        .eq('owner_id', draftId)
        .is('superseded_at', null),
      supabase
        .from('document_request')
        .select('requirement_id')
        .eq('owner_type', 'rider')
        .eq('owner_id', draftId)
        .is('fulfilled_document_id', null),
    ]);

    setRequirements((reqs as Requirement[] | null) ?? []);
    setExisting((docs as Existing[] | null) ?? []);
    setRequested(
      new Set(((chases as { requirement_id: string }[] | null) ?? []).map((c) => c.requirement_id)),
    );
    setLoaded(true);
  }, [draftId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const have = (req: Requirement, side?: 'front' | 'back') =>
    existing.find((d) => d.requirement_id === req.id && (side ? d.side === side : true));

  const isDone = (req: Requirement) =>
    req.kind === 'national_id' ? !!have(req, 'front') && !!have(req, 'back') : !!have(req);

  const send = async (req: Requirement, file: File, side?: 'front' | 'back') => {
    if (!draftId) return;
    setBusy(req.kind + (side ?? ''));
    setActive(req.kind);

    const result = await uploadDocument({
      ownerType: 'rider',
      ownerId: draftId,
      kind: req.kind,
      file,
      expiresAt: expiry[req.kind] ?? null,
      ...(side ? { side } : {}),
    });
    setBusy(null);

    if (!result.ok) {
      toast({ title: 'That did not upload', description: result.message, tone: 'danger' });
      return;
    }
    await load();
    await refresh();
  };

  const chase = async (req: Requirement) => {
    if (!draftId) return;
    setBusy(req.kind);
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_document_request_via_whatsapp', {
      p_owner_type: 'rider',
      p_owner_id: draftId,
      p_requirement_kind: req.kind,
    });
    setBusy(null);
    if (error) {
      toast({ title: 'We could not note that', description: error.message, tone: 'danger' });
      return;
    }
    setRequested(new Set([...requested, req.id]));
    toast({
      title: 'Noted',
      description:
        'It is on your list and rider ops can see it. We cannot message you yet, so bring it to the hub.',
      tone: 'success',
    });
  };

  /*
   * "Snap on your phone instead" is a resume link, not a new channel. The
   * same single-use token that lets a rider continue on another device
   * opens this step on their phone, where the file inputs below open the
   * camera directly. Nothing extra to build, and nothing that pretends to
   * work.
   */
  const openOnPhone = async () => {
    if (!draftId) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc('rpc_rider_resume_token', { p_rider_id: draftId });
    if (error || !data) {
      toast({ title: 'We could not make a link', description: error?.message, tone: 'danger' });
      return;
    }
    setHandoff(`${window.location.origin}/r/${data as string}`);
  };

  const done = requirements.filter(isDone).length;
  const missingEssential = requirements.filter((r) => r.essential && !isDone(r));
  const pendingOptional = requirements.filter((r) => !r.essential && !isDone(r));
  const canContinue = missingEssential.length === 0;

  /* No application at all is a different thing from one still
     loading, and only the first is permanent. */
  if (!draftId) return <RiderNoDraft />;
  if (!loaded) return null;

  return (
    <RiderShell
      step={4}
      eyebrow="Verification"
      title={
        done > 0
          ? `${requirements.length} photos. ${done} done.`
          : `${requirements.length} photos, and we tell you exactly why.`
      }
      intro="Our team checks each one and tells you exactly what, if anything, needs fixing. Snap them on your phone or upload from here."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => router.push('/riders/apply/areas')}>
            Back
          </Button>
          <ContinueButton
            disabled={!canContinue}
            onClick={async () => {
              await flushNow();
              router.push('/riders/apply/payout');
            }}
          >
            {canContinue
              ? pendingOptional.length > 0
                ? `Continue with ${pendingOptional.length} pending`
                : 'Continue'
              : `Add your ${missingEssential[0]?.label.toLowerCase()}`}
          </ContinueButton>
        </>
      }
    >
      <DocumentsNote>
        Because you ride a{' '}
        <strong>
          {draft?.vehicle === 'tuktuk' ? 'tuk-tuk' : draft?.vehicle}
          {draft?.insurance === 'third_party' ? ' with third-party insurance' : ''}
        </strong>{' '}
        we need {requirements.length} photos. We check each one is readable the moment you add it.
      </DocumentsNote>

      <ul className="mt-5 space-y-3">
        {requirements.map((req) => {
          const twoSided = req.kind === 'national_id';
          const complete = isDone(req);
          const chasing = requested.has(req.id);
          const rejected = existing.find(
            (d) => d.requirement_id === req.id && d.status === 'rejected',
          );

          return (
            <li
              key={req.id}
              className={`rounded-2xl border p-4 transition-colors sm:p-5 ${
                active === req.kind && !complete
                  ? 'border-gold bg-surface'
                  : 'border-border bg-surface'
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    complete ? 'bg-gold text-ink' : 'border-border-strong border-2'
                  }`}
                >
                  {complete && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-extrabold">
                    {req.label}
                    {!req.essential && (
                      <span className="text-muted-light ml-2 text-[0.6875rem] font-bold uppercase tracking-wide">
                        · can follow
                      </span>
                    )}
                  </p>
                  {req.why_text && (
                    <p className="text-muted mt-0.5 text-xs font-semibold leading-[1.6]">
                      {req.kind === 'logbook_or_plate' && draft?.plate_no
                        ? `Plate must match ${draft.plate_no}`
                        : req.why_text}
                    </p>
                  )}
                </div>

                {complete ? (
                  <p className="text-success shrink-0 text-[0.8125rem] font-bold">
                    <Check className="mr-1 inline h-4 w-4" aria-hidden="true" />
                    Added
                    {have(req)?.expires_at ? ` · expires ${have(req)?.expires_at}` : ''}
                  </p>
                ) : chasing ? (
                  <p className="text-warning shrink-0 text-[0.8125rem] font-bold">
                    <MessageCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                    Sending on WhatsApp
                  </p>
                ) : (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {twoSided ? (
                      (['front', 'back'] as const).map((side) => (
                        <FileButton
                          key={side}
                          label={have(req, side) ? `${side} ✓` : `Add ${side}`}
                          icon={<Upload className="h-3.5 w-3.5" />}
                          busy={busy === req.kind + side}
                          done={!!have(req, side)}
                          onPick={(file) => void send(req, file, side)}
                          onFocus={() => setActive(req.kind)}
                        />
                      ))
                    ) : (
                      <>
                        <FileButton
                          label="Snap on my phone"
                          icon={<Camera className="h-3.5 w-3.5" />}
                          capture
                          busy={busy === req.kind}
                          onPick={(file) => void send(req, file)}
                          onFocus={() => setActive(req.kind)}
                        />
                        <FileButton
                          label="Upload"
                          icon={<Upload className="h-3.5 w-3.5" />}
                          busy={busy === req.kind}
                          onPick={(file) => void send(req, file)}
                          onFocus={() => setActive(req.kind)}
                        />
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === req.kind}
                      onClick={() => void chase(req)}
                    >
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Send later on WhatsApp
                      </span>
                    </Button>
                  </div>
                )}
              </div>

              {req.has_expiry && !complete && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label htmlFor={`exp_${req.kind}`} className="text-muted text-xs font-bold">
                    Expiry date on the document
                  </label>
                  <input
                    id={`exp_${req.kind}`}
                    type="date"
                    value={expiry[req.kind] ?? ''}
                    onChange={(event) => setExpiry({ ...expiry, [req.kind]: event.target.value })}
                    className="border-border-strong bg-bg rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  />
                  <span className="text-muted-light text-xs font-semibold">
                    Set it before you add the photo and we store it with the file.
                  </span>
                </div>
              )}

              {rejected && (
                <p className="border-danger/30 bg-danger-bg text-danger mt-3 rounded-lg border p-3 text-xs font-bold leading-[1.6]">
                  Sent back: {rejected.rejection_reason} Add a new photo.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="bg-ink rounded-2xl p-5 text-white">
          <p className="flex items-center gap-2 text-[0.9375rem] font-extrabold">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            Snap on your phone instead
          </p>
          <p className="mt-2 text-xs font-semibold leading-[1.7] text-white/70">
            Open this application on your phone and the buttons above open the camera directly. The
            link works once and everything you have already entered is there.
          </p>
          {handoff ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 p-2.5">
              <code className="min-w-0 flex-1 truncate text-[0.6875rem]">{handoff}</code>
              <Button
                size="sm"
                variant="gold"
                onClick={() => void navigator.clipboard.writeText(handoff)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="gold" size="sm" className="mt-3" onClick={() => void openOnPhone()}>
              Get the link
            </Button>
          )}
        </div>

        <div className="border-border bg-surface flex items-start gap-3 rounded-2xl border p-5">
          <span className="bg-success-bg text-success flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[0.9375rem] font-extrabold">Good conduct not ready?</p>
            <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
              You can be activated with the first five and send it within 14 days — policy
              assumption, confirm.
            </p>
          </div>
        </div>
      </div>

      {!canContinue && (
        <FooterNote>
          <span className="mt-4 block">
            We still need your {missingEssential.map((r) => r.label.toLowerCase()).join(', ')}.
          </span>
        </FooterNote>
      )}
    </RiderShell>
  );
}

/** A button that is really a file input, because a styled label is not one. */
function FileButton({
  icon,
  label,
  capture,
  busy,
  done,
  onPick,
  onFocus,
}: {
  icon: React.ReactNode;
  label: string;
  capture?: boolean;
  busy: boolean;
  done?: boolean;
  onPick: (file: File) => void;
  onFocus: () => void;
}) {
  const id = React.useId();
  return (
    <>
      <input
        id={id}
        type="file"
        accept={capture ? 'image/*' : 'image/*,application/pdf'}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        onFocus={onFocus}
        onClick={onFocus}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-extrabold ${
          done
            ? 'border-success/40 bg-success-bg text-success'
            : 'border-border-strong bg-surface hover:bg-bg'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        {icon}
        {label}
      </label>
    </>
  );
}
