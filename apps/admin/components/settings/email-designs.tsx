'use client';

import {
  DESIGN_PLACEHOLDERS,
  EMAIL_AREAS,
  EMAIL_PURPOSES,
  EMAIL_SENDERS,
  checkDesign,
  designWarnings,
  emailPurpose,
  purposeForTemplate,
  renderHouseEmail,
  renderUploadedEmail,
  replaceImageNames,
  starterDesign,
  supabaseTemplateFor,
  type EmailPurpose,
} from '@nexg/contracts/email-design';
import {
  SUPABASE_VARIANTS,
  emailConcept,
  fillSupabaseTemplate,
  sampleEmail,
} from '@nexg/contracts/email-samples';
import { Button, Card } from '@nexg/ui';
import * as React from 'react';

import {
  type Outcome,
  loadEmailDesign,
  setEmailDesignStatus,
  uploadEmailDesign,
} from '@/app/settings/actions';
import { createClient } from '@/lib/supabase/client';

import { DASH, Section, Tile } from './shared';

/**
 * Settings > Notifications & templates.
 *
 * Every kind of email NexG sends, the design it goes out in, and designs
 * uploaded to replace it. The house design (docs/merchant-portal-plan/
 * email-concept) is drawn in the browser from @nexg/contracts/email-design,
 * the same code the senders use, so a preview here is what an inbox gets.
 * Uploading and making a design live go through the database functions,
 * which hold the rules; this only reads files and shows them.
 */

export interface EmailDesignRow {
  id: string;
  purpose: string;
  name: string;
  file_name: string | null;
  notes: string | null;
  status: 'draft' | 'live';
  size_bytes: number;
  image_count: number;
  uploaded_by: string | null;
  created_at: string;
  live_since: string | null;
  status_changed_at: string | null;
}

export interface EmailOverview {
  sent_24h: number;
  failed_24h: number;
  waiting: number;
  skipped_24h: number;
  by_template: Record<string, { sent: number; failed: number }>;
  can_edit: boolean;
}

interface PreviewView {
  title: string;
  note: string;
  subject?: string;
  variants: { label: string; html: string }[];
  copy?: { label: string; html: string };
  download?: { fileName: string; html: string };
}

const MAX_HTML = 400_000;
const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-KE');
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'email-design';

const input =
  'border-border-strong bg-surface mt-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60';
const label = 'text-muted-light block text-[0.625rem] font-extrabold uppercase tracking-wide';

function saveFile(fileName: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** The house design for one kind of email, with sample words. */
function housePreview(purpose: EmailPurpose): PreviewView {
  if (purpose.sender === 'supabase') {
    /* '' draws the wordmark from this console; the copy keeps nexgapp.com. */
    const drawn = supabaseTemplateFor(purpose.key, { assetBase: '' }) ?? '';
    const pasted = supabaseTemplateFor(purpose.key) ?? '';
    return {
      title: purpose.label,
      note: 'The house design, filled in the way Supabase fills it. Supabase sends this email itself: copy the design into its dashboard to use it there.',
      variants: (SUPABASE_VARIANTS[purpose.key] ?? [{ label: 'Email', data: {} }]).map((v) => ({
        label: v.label,
        html: fillSupabaseTemplate(drawn, v.data),
      })),
      copy: { label: `Copy for Supabase > ${purpose.supabaseTemplate ?? 'Emails'}`, html: pasted },
      download: {
        fileName: purpose.key === 'auth.code' ? 'otp-code.html' : 'password-recovery.html',
        html: pasted,
      },
    };
  }
  const sample = sampleEmail(purpose);
  const concept = emailConcept(purpose.conceptId);
  return {
    title: purpose.label,
    note: `The house design${concept ? ` (${concept.id})` : ''}, with sample words. ${
      purpose.sender === 'none'
        ? 'NexG does not send this email yet.'
        : 'The real email carries the words of the moment it is sent for.'
    }`,
    subject: sample.subject,
    variants: [{ label: 'Sample', html: renderHouseEmail(sample.content, { assetBase: '' }) }],
  };
}

/** An uploaded design, filled with sample words (or the way Supabase fills it). */
function uploadedPreview(
  purpose: EmailPurpose,
  name: string,
  html: string,
  fileName: string | null,
  unsaved = false,
): PreviewView {
  const where = unsaved ? 'Not uploaded yet. ' : '';
  const download = unsaved ? undefined : { fileName: fileName ?? `${slug(name)}.html`, html };
  if (purpose.key.startsWith('auth.')) {
    return {
      title: name,
      note: `${where}Your design for “${purpose.label}”, filled in the way Supabase fills it, with sample details.`,
      variants: (SUPABASE_VARIANTS[purpose.key] ?? [{ label: 'Email', data: {} }]).map((v) => ({
        label: v.label,
        html: fillSupabaseTemplate(html, v.data),
      })),
      copy: unsaved ? undefined : { label: 'Copy for Supabase', html },
      download,
    };
  }
  const sample = sampleEmail(purpose);
  return {
    title: name,
    note: `${where}Your design for “${purpose.label}”, with sample words.`,
    subject: sample.subject,
    variants: [{ label: 'Sample', html: renderUploadedEmail(html, sample.content) }],
    download,
  };
}

export function EmailDesignsTab({
  designs,
  overview,
  unavailable,
}: {
  designs: EmailDesignRow[];
  overview: EmailOverview | null;
  unavailable: string | null;
}) {
  const [view, setView] = React.useState<PreviewView | null>(null);
  const canEdit = overview?.can_edit ?? false;

  const byPurpose = React.useMemo(() => {
    const map = new Map<string, EmailDesignRow[]>();
    for (const d of designs) map.set(d.purpose, [...(map.get(d.purpose) ?? []), d]);
    return map;
  }, [designs]);

  /* The outbox counts by template; the tab shows them by kind of email. */
  const counts = React.useMemo(() => {
    const map = new Map<string, { sent: number; failed: number }>();
    for (const [template, c] of Object.entries(overview?.by_template ?? {})) {
      const key = purposeForTemplate(template).key;
      const before = map.get(key) ?? { sent: 0, failed: 0 };
      map.set(key, {
        sent: before.sent + Number(c.sent ?? 0),
        failed: before.failed + Number(c.failed ?? 0),
      });
    }
    return map;
  }, [overview]);

  const sentKinds = EMAIL_PURPOSES.filter((p) => p.sender !== 'none').length;
  const liveCount = designs.filter((d) => d.status === 'live').length;

  return (
    <div className="mt-5">
      {unavailable ? (
        <p
          role="status"
          className="bg-warning-bg text-warning mb-4 rounded-xl px-4 py-3 text-[0.8125rem] font-semibold"
        >
          {unavailable}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Kinds of email sent"
          value={String(sentKinds)}
          hint={
            liveCount
              ? `${liveCount} in an uploaded design, the rest in the house design`
              : 'All in the house design'
          }
        />
        <Tile
          label="Sent · 24 h"
          value={overview ? fmt(overview.sent_24h) : DASH}
          hint={
            overview && overview.waiting > 0
              ? `${fmt(overview.waiting)} waiting to go out`
              : undefined
          }
        />
        <Tile
          label="Failed · 24 h"
          value={overview ? fmt(overview.failed_24h) : DASH}
          tone={overview && overview.failed_24h > 0 ? 'danger' : undefined}
        />
        <Tile
          label="Not sent · 24 h"
          value={overview ? fmt(overview.skipped_24h) : DASH}
          hint="Switched off in Email routing, or no address on file"
        />
      </div>

      <Section
        title="The house design"
        sub="Every email NexG sends is drawn in the design from the email concept: the NexG wordmark, a status line, one title, the message, one gold button and the support footer. An email uses an uploaded design only while one is live for its kind."
      >
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setView(housePreview(emailPurpose('merchant.approved')))}
            >
              Preview the house design
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => saveFile('nexg-email-starting-file.html', starterDesign())}
            >
              Download the starting file
            </Button>
          </div>
          <p className="text-muted mt-3 max-w-[52rem] text-[0.75rem] font-semibold leading-[1.7]">
            A design is an HTML file. Start from the house design&rsquo;s file, change how it looks,
            keep the placeholders where the words go, and upload it below for the emails it is for.
            Use inline styles and table layouts: most inboxes ignore stylesheets and scripts.
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-[0.75rem] font-extrabold">
              Placeholders a design can use
            </summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr]">
              {DESIGN_PLACEHOLDERS.map((p) => (
                <React.Fragment key={p.name}>
                  <dt className="font-mono text-[0.75rem] font-bold">{`{{${p.name}}}`}</dt>
                  <dd className="text-muted text-[0.75rem] font-semibold">{p.note}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
              Sign-in codes and password emails are different: Supabase sends those, so their
              designs keep Supabase&rsquo;s own fields, such as {'{{ .Token }}'}, and are pasted
              into the Supabase dashboard.
            </p>
          </details>
        </Card>
      </Section>

      {canEdit ? (
        <UploadForm onPreview={setView} />
      ) : (
        <p className="text-muted-light mt-6 text-[0.75rem] font-semibold">
          View only. A super admin or someone with full Settings access can upload designs and make
          them live.
        </p>
      )}

      <Section
        title="Every email and its design"
        sub="Grouped by what the email is about. Preview shows the design with sample words; counts are the last 30 days."
      >
        <div className="space-y-4">
          {EMAIL_AREAS.map((area) => (
            <Card key={area} className="overflow-hidden p-0">
              <h3 className="border-border border-b px-4 py-3 text-[0.8125rem] font-extrabold tracking-tight sm:px-5">
                {area}
              </h3>
              <ul className="divide-border divide-y">
                {EMAIL_PURPOSES.filter((p) => p.area === area).map((p) => (
                  <PurposeRow
                    key={p.key}
                    purpose={p}
                    designs={byPurpose.get(p.key) ?? []}
                    count={counts.get(p.key)}
                    canEdit={canEdit}
                    onPreview={setView}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      {view ? <PreviewDialog view={view} onClose={() => setView(null)} /> : null}
    </div>
  );
}

function PurposeRow({
  purpose,
  designs,
  count,
  canEdit,
  onPreview,
}: {
  purpose: EmailPurpose;
  designs: EmailDesignRow[];
  count: { sent: number; failed: number } | undefined;
  canEdit: boolean;
  onPreview: (view: PreviewView) => void;
}) {
  const live = designs.find((d) => d.status === 'live');
  const supabase = purpose.sender === 'supabase';
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Outcome | null>(null);

  async function preview(d: EmailDesignRow) {
    setBusy(`view:${d.id}`);
    const r = await loadEmailDesign(d.id);
    setBusy(null);
    if (!r.ok || !r.html) {
      setResult({ ok: false, message: r.message ?? 'That design could not be opened.' });
      return;
    }
    onPreview(uploadedPreview(purpose, d.name, r.html, d.file_name));
  }

  async function change(d: EmailDesignRow, status: 'live' | 'draft' | 'archived') {
    if (
      status === 'archived' &&
      !window.confirm(`Remove “${d.name}”? It stays in the record, but it cannot be used again.`)
    ) {
      return;
    }
    setBusy(`${status}:${d.id}`);
    setResult(await setEmailDesignStatus(d.id, status));
    setBusy(null);
  }

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-extrabold tracking-tight">{purpose.label}</p>
          <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
            {EMAIL_SENDERS[purpose.sender]}
            {count && (count.sent || count.failed)
              ? ` · ${fmt(count.sent)} sent${count.failed ? `, ${fmt(count.failed)} failed` : ''}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live && !supabase ? (
            <span className="border-gold text-gold-text rounded border px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.1em]">
              Uploaded design live
            </span>
          ) : (
            <span className="bg-bg text-muted-light rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.1em]">
              {supabase ? 'Pasted into Supabase' : 'House design'}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPreview(housePreview(purpose))}
          >
            {live && !supabase ? 'House design' : 'Preview'}
          </Button>
        </div>
      </div>

      {designs.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5">
          {designs.map((d) => (
            <li
              key={d.id}
              className="border-border bg-bg flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border px-3 py-2"
            >
              <span className="min-w-[12rem] flex-1 text-[0.75rem] font-bold">
                {d.name}
                <span className="text-muted-light font-semibold">
                  {' · '}
                  {d.file_name ?? 'uploaded file'} · {kb(d.size_bytes)}
                  {d.image_count
                    ? ` · ${d.image_count} image${d.image_count === 1 ? '' : 's'}`
                    : ''}
                  {' · '}
                  {d.uploaded_by ?? 'someone'}, {day(d.created_at)}
                </span>
                {d.notes ? (
                  <span className="text-muted block text-[0.6875rem] font-semibold">{d.notes}</span>
                ) : null}
              </span>
              {d.status === 'live' && !supabase ? (
                <span className="bg-success-bg text-success rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.1em]">
                  Live
                </span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => preview(d)}
              >
                {busy === `view:${d.id}` ? 'Opening…' : 'Preview'}
              </Button>
              {canEdit && !supabase ? (
                d.status === 'live' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => change(d, 'draft')}
                  >
                    {busy === `draft:${d.id}` ? 'Switching…' : 'Use the house design'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="gold"
                    disabled={busy !== null}
                    onClick={() => change(d, 'live')}
                  >
                    {busy === `live:${d.id}` ? 'Making it live…' : 'Make live'}
                  </Button>
                )
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => change(d, 'archived')}
                >
                  {busy === `archived:${d.id}` ? 'Removing…' : 'Remove'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {result ? (
        <p
          role="status"
          className={`mt-2 text-[0.75rem] font-bold ${result.ok ? 'text-success' : 'text-danger'}`}
        >
          {result.message}
        </p>
      ) : null}
    </li>
  );
}

function UploadForm({ onPreview }: { onPreview: (view: PreviewView) => void }) {
  const [purposeKey, setPurposeKey] = React.useState('');
  const [name, setName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [makeLive, setMakeLive] = React.useState(false);
  const [file, setFile] = React.useState<{ name: string; html: string } | null>(null);
  const [images, setImages] = React.useState<{ file: File; dataUrl: string }[]>([]);
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<(Outcome & { warnings?: string[] }) | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  const purpose = purposeKey ? emailPurpose(purposeKey) : null;
  const supabase = purpose?.sender === 'supabase';
  /* Shown with the images it was given, before anything is uploaded. */
  const drawn = file
    ? replaceImageNames(file.html, Object.fromEntries(images.map((i) => [i.file.name, i.dataUrl])))
    : '';
  const problems = file && purposeKey ? checkDesign(file.html, purposeKey) : [];
  const warnings = file ? designWarnings(drawn) : [];
  const ready = !!file && !!purpose && name.trim() !== '' && problems.length === 0 && !pending;

  async function pickFile(picked: File | undefined) {
    setResult(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_HTML) {
      setFile(null);
      setResult({
        ok: false,
        message: 'The file is larger than 400 KB. Gmail cuts off emails that big.',
      });
      return;
    }
    const html = await picked.text();
    setFile({ name: picked.name, html });
    if (!name.trim()) {
      setName(
        picked.name
          .replace(/\.html?$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim()
          .slice(0, 120),
      );
    }
  }

  async function pickImages(list: FileList | null) {
    setResult(null);
    const picked = Array.from(list ?? []);
    const bad = picked.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE);
    if (bad) {
      setImages([]);
      setResult({
        ok: false,
        message: `${bad.name}: use PNG, JPG, GIF or WebP images of up to 2 MB each.`,
      });
      return;
    }
    setImages(
      await Promise.all(
        picked.map(
          (f) =>
            new Promise<{ file: File; dataUrl: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ file: f, dataUrl: String(reader.result) });
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(f);
            }),
        ),
      ),
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !purpose || !ready) return;
    startTransition(async () => {
      /* Images go straight to storage from here: the bucket takes uploads
         only from people who may change email designs. */
      const urls: Record<string, string> = {};
      if (images.length) {
        const client = createClient();
        const folder = crypto.randomUUID();
        for (const { file: image } of images) {
          const path = `designs/${folder}/${image.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120)}`;
          const { error } = await client.storage
            .from('email-assets')
            .upload(path, image, { contentType: image.type, upsert: false });
          if (error) {
            setResult({ ok: false, message: `${image.name} did not upload: ${error.message}` });
            return;
          }
          urls[image.name] = client.storage.from('email-assets').getPublicUrl(path).data.publicUrl;
        }
      }
      const html = replaceImageNames(file.html, urls);
      const r = await uploadEmailDesign({
        purpose: purpose.key,
        name: name.trim(),
        html,
        fileName: file.name,
        notes: notes.trim(),
        images: urls,
        makeLive: makeLive && !supabase,
      });
      if (!r.ok) {
        setResult(r);
        return;
      }
      setResult({ ...r, warnings: designWarnings(html) });
      setFile(null);
      setImages([]);
      setName('');
      setNotes('');
      setMakeLive(false);
      setFormKey((k) => k + 1);
    });
  }

  return (
    <Section
      title="Upload a design"
      sub="Choose the email it is for, then the HTML file. If the file shows images by file name (such as images/logo.png), upload those images with it: inboxes can only show images that are on the web."
    >
      <Card className="p-4 sm:p-5">
        <form key={formKey} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            What it is for
            <select
              required
              className={input}
              value={purposeKey}
              onChange={(e) => setPurposeKey(e.target.value)}
            >
              <option value="">Choose an email…</option>
              {EMAIL_AREAS.map((area) => (
                <optgroup key={area} label={area}>
                  {EMAIL_PURPOSES.filter((p) => p.area === area).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                      {p.sender === 'none' ? ' (not sent yet)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={label}>
            Name
            <input
              required
              className={input}
              value={name}
              maxLength={120}
              placeholder="For example: Launch week"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={label}>
            Design file (.html)
            <input
              required
              type="file"
              accept=".html,.htm,text/html"
              className={input}
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </label>
          <label className={label}>
            Images it uses (optional)
            <input
              type="file"
              multiple
              accept={IMAGE_TYPES.join(',')}
              className={input}
              onChange={(e) => void pickImages(e.target.files)}
            />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Notes (optional)
            <textarea
              rows={2}
              maxLength={2000}
              className={input}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {purpose ? (
            <p className="text-muted text-[0.75rem] font-semibold leading-[1.7] sm:col-span-2">
              {supabase
                ? `Supabase sends this email itself. After uploading, open the design's preview and copy it into Supabase > ${purpose.supabaseTemplate ?? 'Authentication > Emails'}.`
                : purpose.sender === 'none'
                  ? 'NexG does not send this email yet. A live design is used from the first one it sends.'
                  : `${EMAIL_SENDERS[purpose.sender]}. A live design is used from the next email of this kind.`}
            </p>
          ) : null}

          {problems.length || warnings.length ? (
            <ul className="space-y-1 sm:col-span-2">
              {problems.map((p) => (
                <li key={p} className="text-danger text-[0.75rem] font-bold">
                  {p}
                </li>
              ))}
              {warnings.map((w) => (
                <li key={w} className="text-warning text-[0.75rem] font-bold">
                  {w}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {purpose && !supabase ? (
              <label className="flex items-center gap-2 text-[0.75rem] font-bold">
                <input
                  type="checkbox"
                  checked={makeLive}
                  onChange={(e) => setMakeLive(e.target.checked)}
                />
                Make it live now
              </label>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!file || !purpose}
              onClick={() =>
                file && purpose
                  ? onPreview(
                      uploadedPreview(purpose, name.trim() || file.name, drawn, file.name, true),
                    )
                  : undefined
              }
            >
              Preview
            </Button>
            <Button type="submit" size="sm" disabled={!ready}>
              {pending ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </form>

        {result ? (
          <div role="status" className="mt-3 space-y-1">
            <p className={`text-[0.75rem] font-bold ${result.ok ? 'text-success' : 'text-danger'}`}>
              {result.message}
            </p>
            {result.warnings?.map((w) => (
              <p key={w} className="text-warning text-[0.75rem] font-bold">
                {w}
              </p>
            ))}
          </div>
        ) : null}
      </Card>
    </Section>
  );
}

function PreviewDialog({ view, onClose }: { view: PreviewView; onClose: () => void }) {
  const [variant, setVariant] = React.useState(0);
  const [phone, setPhone] = React.useState(false);
  const [copied, setCopied] = React.useState<'yes' | 'failed' | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const html = view.variants[Math.min(variant, view.variants.length - 1)]?.html ?? '';
  const size = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-[0.75rem] font-bold ${on ? 'bg-ink text-white' : 'text-muted'}`;

  async function copy() {
    if (!view.copy) return;
    try {
      await navigator.clipboard.writeText(view.copy.html);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${view.title}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-8"
    >
      <Card className="w-full max-w-[52rem] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{view.title}</h2>
            {view.subject ? (
              <p className="mt-0.5 text-[0.8125rem] font-bold">Subject: {view.subject}</p>
            ) : null}
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">
              {view.note}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink rounded-lg px-2 py-1 text-[0.8125rem] font-bold"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {view.variants.length > 1 ? (
            <label className="flex items-center gap-2 text-[0.75rem] font-bold">
              Version
              <select
                className="border-border-strong bg-surface rounded-lg border px-2 py-1 text-[0.75rem] font-semibold"
                value={variant}
                onChange={(e) => setVariant(Number(e.target.value))}
              >
                {view.variants.map((v, i) => (
                  <option key={v.label} value={i}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div
            role="group"
            aria-label="Screen size"
            className="border-border inline-flex rounded-lg border p-0.5"
          >
            <button
              type="button"
              aria-pressed={!phone}
              className={size(!phone)}
              onClick={() => setPhone(false)}
            >
              Computer
            </button>
            <button
              type="button"
              aria-pressed={phone}
              className={size(phone)}
              onClick={() => setPhone(true)}
            >
              Phone
            </button>
          </div>
          {view.copy ? (
            <Button type="button" size="sm" variant="gold" onClick={() => void copy()}>
              {copied === 'yes' ? 'Copied' : view.copy.label}
            </Button>
          ) : null}
          {view.download ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => saveFile(view.download!.fileName, view.download!.html)}
            >
              Download the file
            </Button>
          ) : null}
          {copied === 'failed' ? (
            <span className="text-danger text-[0.75rem] font-bold">
              Copying was blocked. Download the file instead.
            </span>
          ) : null}
        </div>

        <div className="bg-bg border-border mt-3 flex justify-center overflow-x-auto rounded-xl border p-2 sm:p-3">
          <iframe
            title={`Email preview: ${view.title}`}
            sandbox=""
            srcDoc={html}
            className="bg-white"
            style={{ width: phone ? 390 : '100%', height: '70vh', border: 0, borderRadius: 8 }}
          />
        </div>
      </Card>
    </div>
  );
}
