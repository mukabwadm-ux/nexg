'use client';

import {
  Button,
  DetailPanel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nexg/ui';
import {
  CirclePlus,
  Download,
  ExternalLink,
  Eye,
  MoreHorizontal,
  PanelRight,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { addProduct, reviewCatalogueEdit } from '@/app/merchants/catalogues/actions';
import {
  FormPanel,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { PaneButton } from '@/components/portal/dash-detail';

const NEW_SECTION = '__new__';

/** "Add Product" in the header: into the open merchant's catalogue, audited. */
export function AddProductButton({
  merchant,
}: {
  /** The catalogue open in the pane, or null when none is. */
  merchant: {
    id: string;
    name: string;
    canEdit: boolean;
    sections: { id: string; name: string }[];
  } | null;
}) {
  const [open, setOpen] = React.useState(false);
  const { run, busy } = useRunner();
  const [section, setSection] = React.useState<string>('');
  const [sectionName, setSectionName] = React.useState('');
  const [name, setName] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [available, setAvailable] = React.useState(false);

  React.useEffect(() => {
    setSection(merchant?.sections[0]?.id ?? NEW_SECTION);
    setSectionName('');
    setName('');
    setPrice('');
    setDescription('');
    setAvailable(false);
  }, [merchant?.id, merchant?.sections]);

  const disabled = !merchant || !merchant.canEdit;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          !merchant
            ? 'Open a catalogue first.'
            : !merchant.canEdit
              ? 'Only merchant operations staff for this city can add products.'
              : undefined
        }
        className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)] transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE07A] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CirclePlus aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
        Add Product
      </button>
      {merchant && (
        <FormPanel
          open={open}
          onOpenChange={setOpen}
          title={`Add a product to ${merchant.name}`}
          subtitle="It stays hidden from customers until it is made available."
          submitLabel="Add product"
          busy={busy}
          onSubmit={async () => {
            const ok = await run(() =>
              addProduct({
                merchantId: merchant.id,
                sectionId: section === NEW_SECTION ? null : section,
                sectionName,
                name,
                priceKes: price.trim() === '' ? null : Number(price),
                description,
                available,
              }),
            );
            if (ok) setOpen(false);
            return ok;
          }}
        >
          <div className="space-y-4">
            <SelectField
              label="Section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              options={[
                ...merchant.sections.map((s) => ({ value: s.id, label: s.name })),
                { value: NEW_SECTION, label: 'A new section…' },
              ]}
            />
            {section === NEW_SECTION && (
              <TextField
                label="New section name"
                required
                maxLength={80}
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
              />
            )}
            <TextField
              label="Product name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Price (KES)"
              inputMode="numeric"
              hint="Whole shillings. Leave empty if the price is on request."
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
            />
            <TextArea
              label="Description"
              maxLength={600}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="flex items-center gap-2.5 text-sm font-bold">
              <input
                type="checkbox"
                className="h-[1.125rem] w-[1.125rem] accent-[#E5A800]"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
              />
              Show it to customers now
            </label>
          </div>
        </FormPanel>
      )}
    </>
  );
}

/** "Bulk Import": merchants import their own catalogue; this shows where, and what came in. */
export function BulkImportButton({
  imports,
}: {
  imports: { merchant: string; source: string; status: string | null; when: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-white/40 px-4 text-[0.9375rem] font-bold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE07A]"
      >
        <Download aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
        Bulk Import
      </button>
      <DetailPanel
        open={open}
        onOpenChange={setOpen}
        title="Bulk import"
        subtitle="Catalogues in bulk, from a spreadsheet."
      >
        <div className="space-y-4 text-[0.9375rem] leading-relaxed">
          <p>
            Merchants import their own catalogue from a CSV file in their portal, under Menu, using
            the template there. Staff cannot import on a merchant&apos;s behalf yet; add single
            products with Add Product.
          </p>
          <section>
            <h3 className="font-extrabold">Recent imports</h3>
            {imports.length === 0 ? (
              <p className="text-muted mt-1">None recorded.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#EFEDE8]">
                {imports.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3 py-2 text-sm">
                    <span className="font-bold">{i.merchant}</span>
                    <span className="text-muted">
                      {i.source} · {i.status ?? 'queued'} · {i.when}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DetailPanel>
    </>
  );
}

/** "Publish Changes": the changes a merchant asked for, each published or turned down. */
export function PublishChanges({
  edits,
}: {
  edits: { id: string; kind: string; item: string | null; created: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<Record<string, string>>({});
  const { run, busy } = useRunner();
  return (
    <>
      <PaneButton
        icon={Send}
        tone="gold"
        disabled={edits.length === 0}
        title={
          edits.length === 0
            ? 'Nothing is waiting to be published. Merchants publish their own items.'
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        Publish Changes{edits.length > 0 ? ` (${edits.length})` : ''}
      </PaneButton>
      <DetailPanel
        open={open}
        onOpenChange={setOpen}
        title="Changes waiting"
        subtitle="Publish each one, or turn it down with a reason."
      >
        <ul className="space-y-3">
          {edits.map((e) => (
            <li key={e.id} className="border-border rounded-xl border p-3">
              <p className="font-bold">
                {e.kind.replace(/_/g, ' ')}
                {e.item ? ` · ${e.item}` : ''}
              </p>
              <p className="text-muted text-xs font-semibold">Asked {e.created}</p>
              <textarea
                className="border-border bg-surface mt-2 w-full rounded-lg border p-2.5 text-sm"
                rows={2}
                maxLength={500}
                placeholder="Reason, if you turn it down"
                aria-label="Reason for turning it down"
                value={reason[e.id] ?? ''}
                onChange={(ev) => setReason((r) => ({ ...r, [e.id]: ev.target.value }))}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() => reviewCatalogueEdit(e.id, false, reason[e.id] ?? ''))
                  }
                >
                  Turn down
                </Button>
                <Button
                  variant="black"
                  disabled={busy}
                  onClick={() => void run(() => reviewCatalogueEdit(e.id, true, ''))}
                >
                  Publish
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DetailPanel>
    </>
  );
}

/** The "…" on a catalogue row and in the pane. */
export function CatalogueMenu({
  merchantId,
  name,
  reviewHref,
  previewHref,
}: {
  merchantId: string;
  name: string;
  reviewHref?: string;
  previewHref: string | null;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More for ${name}`}
          className="text-ink rounded-md p-1 hover:text-[#B57A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]"
        >
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {reviewHref && (
          <DropdownMenuItem
            icon={<PanelRight />}
            onSelect={() => router.push(reviewHref, { scroll: false })}
          >
            Open here
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          icon={<ExternalLink />}
          onSelect={() => router.push(`/merchants/${merchantId}`)}
        >
          Open merchant record
        </DropdownMenuItem>
        {previewHref && (
          <DropdownMenuItem
            icon={<Eye />}
            onSelect={() => window.open(previewHref, '_blank', 'noopener')}
          >
            Preview on the site
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** List / Grid, as links so the server draws the chosen one. */
export function ViewToggle({
  view,
  listHref,
  gridHref,
}: {
  view: 'list' | 'grid';
  listHref: string;
  gridHref: string;
}) {
  const cls = (on: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.875rem] font-bold transition-colors ${
      on ? 'bg-ink text-[#F5B400]' : 'text-ink hover:bg-bg'
    }`;
  return (
    <nav aria-label="View" className="border-border flex gap-1 rounded-xl border p-1">
      <Link
        href={listHref}
        scroll={false}
        aria-current={view === 'list' ? 'page' : undefined}
        className={cls(view === 'list')}
      >
        List
      </Link>
      <Link
        href={gridHref}
        scroll={false}
        aria-current={view === 'grid' ? 'page' : undefined}
        className={cls(view === 'grid')}
      >
        Grid
      </Link>
    </nav>
  );
}
