import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { reviewHostDocument, verifyHost } from '@/app/hotels/actions';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { HostDocumentReview, type ReviewDocument } from '@/components/hotels/host-document-review';
import { HostVerificationForm } from '@/components/hotels/host-verification-form';
import { Card } from '@nexg/ui';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Verify hospitality host' };
export const dynamic = 'force-dynamic';

const DOCUMENT_KINDS: Record<string, { label: string; required: boolean }> = {
  id_document: { label: 'ID or passport', required: true },
  authority: { label: 'Proof of authority to let', required: true },
  kra_pin: { label: 'KRA PIN certificate', required: false },
  business_registration: { label: 'Business registration', required: false },
};

interface DocumentRow {
  id: string;
  kind: string;
  file_name: string;
  status: ReviewDocument['status'];
  rejection_reason: string | null;
  uploaded_at: string;
  storage_path: string;
}

export default async function VerifyHostPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)
  ) {
    notFound();
  }

  const supabase = createClient();
  const { data: host, error } = await supabase
    .from('console_host_directory_v')
    .select('id, display_name, contact_name, city_name, kind, status, submitted_at')
    .eq('id', params.id)
    .maybeSingle();

  if (error) throw new Error(`Could not load host: ${error.message}`);
  if (!host?.id) notFound();

  const canVerify = host.status === 'applied' || host.status === 'verifying';

  /* host_document is newer than the generated types. Staff read it through
     RLS (works_hospitality) and open files with short-lived signed URLs. */
  const loose = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          is: (
            column: string,
            value: null,
          ) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => PromiseLike<{ data: DocumentRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const { data: rows, error: documentsError } = await loose
    .from('host_document')
    .select('id, kind, file_name, status, rejection_reason, uploaded_at, storage_path')
    .eq('host_id', host.id)
    .is('superseded_at', null)
    .order('uploaded_at', { ascending: true });
  if (documentsError) throw new Error(`Could not load documents: ${documentsError.message}`);

  const documentRows = rows ?? [];
  const { data: signed } = documentRows.length
    ? await supabase.storage.from('partner-documents').createSignedUrls(
        documentRows.map((row) => row.storage_path),
        600,
      )
    : { data: [] };
  const urls = new Map(signed?.map((row) => [row.path, row.signedUrl]));
  const documents: ReviewDocument[] = documentRows.map((row) => ({
    id: row.id,
    label: DOCUMENT_KINDS[row.kind]?.label ?? row.kind,
    required: DOCUMENT_KINDS[row.kind]?.required ?? false,
    fileName: row.file_name,
    status: row.status,
    rejectionReason: row.rejection_reason,
    uploadedAt: row.uploaded_at,
    url: urls.get(row.storage_path) ?? null,
  }));
  const missing = Object.entries(DOCUMENT_KINDS)
    .filter(
      ([kind, meta]) =>
        meta.required &&
        !documentRows.some((row) => row.kind === kind && row.status !== 'rejected'),
    )
    .map(([, meta]) => meta.label);
  const documentsApproved = ['id_document', 'authority'].every((kind) =>
    documentRows.some((row) => row.kind === kind && row.status === 'approved'),
  );

  return (
    <ConsoleShell staff={staff} current="/hotels">
      <ConsoleHeader title="Verify hospitality host" breadcrumb="Partners · Hotels & Airbnb" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        <Link
          href={`/hotels?tab=hosts&selected=${host.id}`}
          className="text-muted hover:text-ink text-sm font-semibold"
        >
          ← Back to host
        </Link>

        <Card className="mt-5 p-5 sm:p-7">
          <p className="text-muted text-[0.6875rem] font-extrabold uppercase tracking-wide">
            Host application
          </p>
          <h1 className="mt-2 text-xl font-extrabold">
            {host.display_name || host.contact_name || 'Unnamed host'}
          </h1>
          <p className="text-muted mt-1 text-sm font-semibold">
            {[host.city_name, host.kind?.replaceAll('_', ' '), host.status]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <HostDocumentReview
            hostId={host.id}
            documents={documents}
            missing={missing}
            action={reviewHostDocument}
          />

          {canVerify && documentsApproved ? (
            <HostVerificationForm hostId={host.id} action={verifyHost} />
          ) : canVerify ? (
            <p className="bg-surface mt-6 rounded-lg p-4 text-sm font-semibold">
              Approve the ID or passport and proof of authority to activate this host.
            </p>
          ) : (
            <p className="bg-surface mt-6 rounded-lg p-4 text-sm font-semibold">
              This host is {host.status ?? 'no longer awaiting verification'} and cannot be verified
              from this page.
            </p>
          )}
        </Card>
      </main>
    </ConsoleShell>
  );
}
