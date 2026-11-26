import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  HostWorkspaceError,
  hostWorkspaceAccess,
  hostWorkspaceEnabled,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
  type HostWorkspaceAccess,
} from '@/lib/host-workspace/access';
import {
  isJsonRequest,
  readUploadStep,
  requireUploaded,
  signUpload,
} from '@/lib/host-workspace/direct-upload';

/*
 * Host documents for approval: upload, list and "submit for review".
 * Files go to the private partner-documents bucket under host/<host_id>/,
 * which only the host's full-access members and hospitality staff can read.
 *
 * Large files skip the API body (Vercel stops request bodies at about 4.5 MB):
 * POST JSON {action:'upload-url', kind, fileName, mime, size} returns a signed
 * upload URL, the client sends the file straight to Storage, and
 * POST JSON {action:'complete', kind, fileName, mime, size, path} records it.
 * Either way an optional expiresOn (YYYY-MM-DD) records the expiry date
 * printed on the document; NexG staff confirm or correct it when approving.
 */

export const dynamic = 'force-dynamic';

const maxBytes = 10 * 1024 * 1024;
const BUCKET = 'partner-documents';
const KINDS = ['id_document', 'authority', 'kra_pin', 'business_registration'] as const;
const REQUIRED = new Set<string>(['id_document', 'authority']);
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

interface DocumentRow {
  id: string;
  kind: string;
  file_name: string;
  status: 'uploaded' | 'approved' | 'rejected';
  rejection_reason: string | null;
  uploaded_at: string;
  storage_path: string;
  /** From 20270331000300; missing until that migration is applied. */
  expires_on?: string | null;
}

/* host_document and the onboarding RPCs are newer than the generated types. */
type Loose = {
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
          ) => PromiseLike<{ data: DocumentRow[] | null; error: unknown }>;
        };
      };
    };
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

function fullAccess(access: HostWorkspaceAccess) {
  if (access.unitScope)
    throw new HostWorkspaceError(
      403,
      'Only the account owner or a full-access manager can do this.',
    );
}

const DOCUMENT_COLUMNS = 'id, kind, file_name, status, rejection_reason, uploaded_at, storage_path';

/* The current documents, with their expiry dates once the column exists. */
async function currentDocuments(access: HostWorkspaceAccess) {
  const db = access.db as unknown as Loose;
  const read = (columns: string) =>
    db
      .from('host_document')
      .select(columns)
      .eq('host_id', access.hostId)
      .is('superseded_at', null)
      .order('uploaded_at', { ascending: false });
  const withExpiry = await read(`${DOCUMENT_COLUMNS}, expires_on`);
  return withExpiry.error ? await read(DOCUMENT_COLUMNS) : withExpiry;
}

async function view(access: HostWorkspaceAccess) {
  const [{ data: rows, error }, host] = await Promise.all([
    currentDocuments(access),
    access.db
      .from('host')
      .select('status, status_reason, verification_submitted_at')
      .eq('id', access.hostId)
      .maybeSingle(),
  ]);
  if (error || host.error || !host.data)
    throw new HostWorkspaceError(503, 'Your documents could not be loaded.');

  const documents = rows ?? [];
  const { data: signed } = documents.length
    ? await access.db.storage.from(BUCKET).createSignedUrls(
        documents.map((row) => row.storage_path),
        600,
      )
    : { data: [] };
  const urls = new Map(signed?.map((row) => [row.path, row.signedUrl]));
  const present = new Set(
    documents.filter((row) => row.status !== 'rejected').map((row) => row.kind),
  );

  return hostWorkspaceJson({
    status: host.data.status,
    statusReason: host.data.status_reason,
    submittedAt: host.data.verification_submitted_at,
    missing: [...REQUIRED].filter((kind) => !present.has(kind)),
    documents: documents.map((row) => ({
      id: row.id,
      kind: row.kind,
      fileName: row.file_name,
      status: row.status,
      rejectionReason: row.rejection_reason,
      uploadedAt: row.uploaded_at,
      expiresOn: row.expires_on ?? null,
      url: urls.get(row.storage_path) ?? '',
    })),
  });
}

function respond(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return hostWorkspaceJson({ error: 'Choose a document type and a file.' }, 400);
  return hostWorkspaceError(error);
}

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    const access = await hostWorkspaceAccess(request);
    return await view(access);
  } catch (error) {
    return respond(error);
  }
}

const BAD_FILE = 'Upload a PDF or photo (JPEG, PNG, WebP or HEIC) up to 10 MB.';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/* Optional expiry date printed on the document (YYYY-MM-DD); '' = none. */
const expiresOnSchema = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .nullish()
  .transform((value) => value || null);

const stepSchema = z.object({
  kind: z.enum(KINDS),
  fileName: z.string().max(400).optional().default(''),
  mime: z.string().max(100),
  size: z.number().int(),
  expiresOn: expiresOnSchema,
});

/** A real calendar date, not before today in Nairobi. */
function checkExpiry(expiresOn: string | null) {
  if (!expiresOn) return null;
  const parsed = new Date(`${expiresOn}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== expiresOn)
    throw new HostWorkspaceError(400, 'Enter the expiry date as a full date, or leave it empty.');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  if (expiresOn < today)
    throw new HostWorkspaceError(400, 'This document has already expired. Upload a current one.');
  return expiresOn;
}
const uploadStepSchema = z.discriminatedUnion('action', [
  stepSchema.extend({ action: z.literal('upload-url') }),
  stepSchema.extend({ action: z.literal('complete'), path: z.string().max(400) }),
]);

function extensionFor(mime: string, size: number) {
  const extension = EXTENSIONS[mime];
  if (!extension || size <= 0 || size > maxBytes) throw new HostWorkspaceError(400, BAD_FILE);
  return extension;
}

interface NewDocument {
  kind: string;
  path: string;
  fileName: string;
  extension: string;
  mime: string;
  size: number;
  expiresOn: string | null;
}

async function record(access: HostWorkspaceAccess, file: NewDocument) {
  const db = access.db as unknown as Loose;
  const { data: documentId, error } = await db.rpc('rpc_host_document_add', {
    p_host_id: access.hostId,
    p_kind: file.kind,
    p_storage_path: file.path,
    p_file_name: file.fileName.slice(0, 200) || `${file.kind}.${file.extension}`,
    p_mime: file.mime,
    p_size_bytes: file.size,
  });
  if (error?.code === '42501') throw new HostWorkspaceError(403, error.message);
  if (error?.code === '22023') throw new HostWorkspaceError(400, error.message);
  if (error) throw new HostWorkspaceError(503, 'The document could not be saved. Try again.');
  if (file.expiresOn && typeof documentId === 'string') {
    const expiry = await db.rpc('rpc_host_document_set_expiry', {
      p_document_id: documentId,
      p_expires_on: file.expiresOn,
    });
    if (expiry.error?.code === '22023') throw new HostWorkspaceError(400, expiry.error.message);
    if (expiry.error)
      throw new HostWorkspaceError(
        503,
        'The document was uploaded, but its expiry date was not saved. NexG will add it when reviewing.',
      );
  }
  return await view(access);
}

/** The two JSON steps of a direct upload. */
async function uploadStep(request: Request) {
  const step = uploadStepSchema.parse(await readUploadStep(request));
  const expiresOn = checkExpiry(step.expiresOn);
  const extension = extensionFor(step.mime, step.size);
  const access = await hostWorkspaceAccess(request);
  fullAccess(access);

  if (step.action === 'upload-url') {
    const path = `host/${access.hostId}/${step.kind}/${randomUUID()}.${extension}`;
    return hostWorkspaceJson(await signUpload(access, BUCKET, path));
  }

  const expected = new RegExp(`^host/${access.hostId}/${step.kind}/${UUID}\\.${extension}$`);
  if (!expected.test(step.path))
    throw new HostWorkspaceError(400, 'This upload does not belong to your documents.');
  const object = await requireUploaded(
    access,
    BUCKET,
    step.path,
    { mime: step.mime, maxBytes },
    BAD_FILE,
  );
  return await record(access, {
    kind: step.kind,
    path: step.path,
    fileName: step.fileName,
    extension,
    mime: step.mime,
    size: object.size,
    expiresOn,
  });
}

/**
 * Upload one document: multipart (kind, file) for small files, or the JSON
 * upload-url / complete steps for any size.
 */
export async function POST(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    if (isJsonRequest(request)) return await uploadStep(request);
    if (
      !request.headers.get('content-type')?.startsWith('multipart/form-data') ||
      Number(request.headers.get('content-length')) > maxBytes + 16_000
    )
      throw new HostWorkspaceError(400, 'Upload a PDF or photo up to 10 MB.');

    const access = await hostWorkspaceAccess(request);
    fullAccess(access);
    const form = await request.formData();
    const kind = z.enum(KINDS).parse(form.get('kind'));
    const expiresOn = checkExpiry(expiresOnSchema.parse(form.get('expiresOn')));
    const file = form.get('file');
    const extension = file instanceof File ? EXTENSIONS[file.type] : undefined;
    if (!(file instanceof File) || !extension || !file.size || file.size > maxBytes)
      throw new HostWorkspaceError(400, BAD_FILE);

    const path = `host/${access.hostId}/${kind}/${randomUUID()}.${extension}`;
    const upload = await access.db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error)
      throw new HostWorkspaceError(
        503,
        'The upload could not be confirmed. Try the same file again.',
      );

    return await record(access, {
      kind,
      path,
      fileName: file.name,
      extension,
      mime: file.type,
      size: file.size,
      expiresOn,
    });
  } catch (error) {
    return respond(error);
  }
}

/** Ask NexG to review the uploaded documents. */
export async function PATCH(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    const access = await hostWorkspaceAccess(request);
    fullAccess(access);
    const { error } = await (access.db as unknown as Loose).rpc('rpc_host_documents_submit', {
      p_host_id: access.hostId,
    });
    if (error?.code === '42501') throw new HostWorkspaceError(403, error.message);
    if (error?.code === '22023') throw new HostWorkspaceError(400, error.message);
    if (error)
      throw new HostWorkspaceError(503, 'Your documents could not be submitted. Try again.');
    return await view(access);
  } catch (error) {
    return respond(error);
  }
}
