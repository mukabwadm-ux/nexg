import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ access: null as unknown }));

vi.mock('@/lib/host-workspace/access', () => {
  class HostWorkspaceError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  const hostWorkspaceJson = (data: unknown, status = 200) => Response.json(data, { status });
  return {
    HostWorkspaceError,
    hostWorkspaceEnabled: () => true,
    hostWorkspaceAccess: async () => state.access,
    requireWorkspaceOrigin: () => undefined,
    hostWorkspaceJson,
    hostWorkspaceError: (error: unknown) =>
      error instanceof HostWorkspaceError
        ? hostWorkspaceJson({ error: error.message }, error.status)
        : hostWorkspaceJson({ error: 'The host workspace is temporarily unavailable.' }, 503),
  };
});

import { POST as postDocument } from '@/app/api/host-workspace/documents/route';
import { POST as postPhoto } from '@/app/api/host-workspace/photos/route';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const OP = '44444444-4444-4444-8444-444444444444';
const MB = 1024 * 1024;

interface StoredObject {
  name: string;
  metadata: { size: number; mimetype: string };
}

/** A host member's client with mocked storage, rpc and table reads. */
function fakeDb(options: { objects?: StoredObject[]; gallery?: unknown[]; unitScope?: string[] }) {
  const objects = options.objects ?? [];
  let gallery = options.gallery ?? [];
  const storageCalls: { bucket: string; method: string; args: unknown[] }[] = [];
  const storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: vi.fn(async (path: string, opts: unknown) => {
        storageCalls.push({ bucket, method: 'createSignedUploadUrl', args: [path, opts] });
        return {
          data: {
            path,
            token: 'upload-token',
            signedUrl: `https://storage.example.test/object/upload/sign/${bucket}/${path}?token=upload-token`,
          },
          error: null,
        };
      }),
      list: vi.fn(async (folder: string, opts: { search: string }) => {
        storageCalls.push({ bucket, method: 'list', args: [folder, opts] });
        return { data: objects.filter((item) => item.name.includes(opts.search)), error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        storageCalls.push({ bucket, method: 'remove', args: [paths] });
        return { data: [], error: null };
      }),
      createSignedUrls: vi.fn(async (paths: string[]) => ({
        data: paths.map((path) => ({ path, signedUrl: `https://signed.example.test/${path}` })),
        error: null,
      })),
      upload: vi.fn(),
    }),
  };

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'rpc_host_workspace_photos_set') gallery = args.p_photos as unknown[];
    return { data: null, error: null };
  });

  const documentRows: unknown[] = [];
  const chain = (table: string) => {
    const result =
      table === 'host_document'
        ? { data: documentRows, error: null }
        : table === 'host'
          ? {
              data: { status: 'pending', status_reason: null, verification_submitted_at: null },
              error: null,
            }
          : { data: { photos: gallery }, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is']) builder[method] = () => builder;
    builder.order = async () => result;
    builder.maybeSingle = async () => result;
    return builder;
  };

  const access = {
    db: { storage, rpc, from: chain },
    hostId: HOST,
    unitScope: options.unitScope ?? null,
    role: 'Owner',
    userId: 'user-1',
    email: 'host@example.test',
    name: 'Host',
  };
  return { access, rpc, storageCalls, gallery: () => gallery };
}

function jsonPost(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DOCS = 'https://nexg.example.test/api/host-workspace/documents';
const PHOTOS = `https://nexg.example.test/api/host-workspace/photos?kind=unit&id=${UNIT}`;

describe('documents: direct upload', () => {
  beforeEach(() => {
    state.access = null;
  });

  it('signs an upload under the host folder for a large PDF', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const response = await postDocument(
      jsonPost(DOCS, {
        action: 'upload-url',
        kind: 'id_document',
        fileName: 'passport.pdf',
        mime: 'application/pdf',
        size: 8 * MB,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(new RegExp(`^host/${HOST}/id_document/[0-9a-f-]{36}\\.pdf$`));
    expect(body.token).toBe('upload-token');
    expect(body.signedUrl).toContain('/object/upload/sign/partner-documents/');
    expect(db.storageCalls[0]).toMatchObject({
      bucket: 'partner-documents',
      method: 'createSignedUploadUrl',
      args: [body.path, { upsert: false }],
    });
  });

  it('refuses a file over 10 MB or of the wrong type before signing', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const big = await postDocument(
      jsonPost(DOCS, {
        action: 'upload-url',
        kind: 'authority',
        mime: 'application/pdf',
        size: 11 * MB,
      }),
    );
    const zip = await postDocument(
      jsonPost(DOCS, {
        action: 'upload-url',
        kind: 'authority',
        mime: 'application/zip',
        size: MB,
      }),
    );
    expect(big.status).toBe(400);
    expect(zip.status).toBe(400);
    expect((await big.json()).error).toMatch(/up to 10 MB/);
    expect(db.storageCalls).toHaveLength(0);
  });

  it('refuses a unit-only manager', async () => {
    const db = fakeDb({ unitScope: [UNIT] });
    state.access = db.access;
    const response = await postDocument(
      jsonPost(DOCS, { action: 'upload-url', kind: 'authority', mime: 'image/jpeg', size: MB }),
    );
    expect(response.status).toBe(403);
  });

  it('records the uploaded file with the size Storage reports', async () => {
    const path = `host/${HOST}/id_document/${OP}.jpg`;
    const db = fakeDb({
      objects: [{ name: `${OP}.jpg`, metadata: { size: 6 * MB, mimetype: 'image/jpeg' } }],
    });
    state.access = db.access;
    const response = await postDocument(
      jsonPost(DOCS, {
        action: 'complete',
        kind: 'id_document',
        fileName: 'id.jpg',
        mime: 'image/jpeg',
        size: 6 * MB,
        path,
      }),
    );
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith('rpc_host_document_add', {
      p_host_id: HOST,
      p_kind: 'id_document',
      p_storage_path: path,
      p_file_name: 'id.jpg',
      p_mime: 'image/jpeg',
      p_size_bytes: 6 * MB,
    });
    const body = await response.json();
    expect(body.missing).toEqual(['id_document', 'authority']);
  });

  it('refuses a path outside this host or kind', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const other = '99999999-9999-4999-8999-999999999999';
    const response = await postDocument(
      jsonPost(DOCS, {
        action: 'complete',
        kind: 'id_document',
        mime: 'image/jpeg',
        size: MB,
        path: `host/${other}/id_document/${OP}.jpg`,
      }),
    );
    expect(response.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('says the upload has not finished when nothing is stored yet', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const response = await postDocument(
      jsonPost(DOCS, {
        action: 'complete',
        kind: 'authority',
        mime: 'application/pdf',
        size: MB,
        path: `host/${HOST}/authority/${OP}.pdf`,
      }),
    );
    expect(response.status).toBe(409);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('refuses a stored file whose type differs from the one named', async () => {
    const db = fakeDb({
      objects: [{ name: `${OP}.pdf`, metadata: { size: MB, mimetype: 'text/html' } }],
    });
    state.access = db.access;
    const response = await postDocument(
      jsonPost(DOCS, {
        action: 'complete',
        kind: 'authority',
        mime: 'application/pdf',
        size: MB,
        path: `host/${HOST}/authority/${OP}.pdf`,
      }),
    );
    expect(response.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe('photos: direct upload', () => {
  const path = `${HOST}/${UNIT}/${OP}.jpg`;

  it('signs an upload at the operation path in host-photos', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, {
        action: 'upload-url',
        room: 'kitchen',
        mime: 'image/jpeg',
        size: 7 * MB,
        operationId: OP,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ path, token: 'upload-token' });
    expect(db.storageCalls[0]).toMatchObject({
      bucket: 'host-photos',
      method: 'createSignedUploadUrl',
    });
  });

  it('refuses HEIC, which the photo bucket does not take', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, { action: 'upload-url', mime: 'image/heic', size: MB, operationId: OP }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/PNG, JPEG or WebP/);
  });

  it('refuses a gallery outside a unit manager’s units', async () => {
    const db = fakeDb({ unitScope: ['55555555-5555-4555-8555-555555555555'] });
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, { action: 'upload-url', mime: 'image/jpeg', size: MB, operationId: OP }),
    );
    expect(response.status).toBe(403);
  });

  it('adds the stored photo to the gallery with its room', async () => {
    const db = fakeDb({
      objects: [{ name: `${OP}.jpg`, metadata: { size: 7 * MB, mimetype: 'image/jpeg' } }],
    });
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, {
        action: 'complete',
        room: 'kitchen',
        alt: 'Kitchen',
        mime: 'image/jpeg',
        size: 7 * MB,
        operationId: OP,
        path,
      }),
    );
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith(
      'rpc_host_workspace_photos_set',
      expect.objectContaining({
        p_kind: 'unit',
        p_id: UNIT,
        p_photos: [{ path, alt: 'Kitchen', cover: true, room: 'kitchen' }],
      }),
    );
    const body = await response.json();
    expect(body.photos).toEqual([
      expect.objectContaining({ path, room: 'kitchen', cover: true, url: expect.any(String) }),
    ]);
  });

  it('returns the gallery unchanged when the same photo is completed twice', async () => {
    const db = fakeDb({ gallery: [{ path, alt: '', cover: true }] });
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, { action: 'complete', mime: 'image/jpeg', size: MB, operationId: OP, path }),
    );
    expect(response.status).toBe(200);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('refuses a path that is not this operation’s', async () => {
    const db = fakeDb({});
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, {
        action: 'complete',
        mime: 'image/jpeg',
        size: MB,
        operationId: OP,
        path: `${HOST}/${UNIT}/other.jpg`,
      }),
    );
    expect(response.status).toBe(400);
  });

  it('refuses a stored photo over 10 MB and removes it', async () => {
    const db = fakeDb({
      objects: [{ name: `${OP}.jpg`, metadata: { size: 12 * MB, mimetype: 'image/jpeg' } }],
    });
    state.access = db.access;
    const response = await postPhoto(
      jsonPost(PHOTOS, { action: 'complete', mime: 'image/jpeg', size: MB, operationId: OP, path }),
    );
    expect(response.status).toBe(400);
    expect(db.storageCalls).toContainEqual({
      bucket: 'host-photos',
      method: 'remove',
      args: [[path]],
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
