import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ access: null as unknown, anon: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ createClient: () => state.anon }));

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

import { POST as postGuide } from '@/app/api/host-workspace/guide/route';
import { GET as getAsset } from '@/app/api/host-workspace/guide/asset/route';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';
const MB = 1024 * 1024;
const BUCKET = 'host-guide-assets';
const GUIDE = 'https://nexg.example.test/api/host-workspace/guide';

/** The smallest GLB validateGlb accepts: one mesh, one embedded buffer. */
function glb() {
  let json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4 }],
      meshes: [{}],
      nodes: [],
    }),
  );
  if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const bin = Buffer.alloc(4);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(json.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHead, json, binHead, bin]);
}

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

interface Stored {
  name: string;
  bytes: Buffer;
  mime: string;
}

/** A host member's client with mocked storage, rpc and the unit check. */
function fakeDb(stored: Record<string, Stored> = {}, rpcError: unknown = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: vi.fn(async (path: string, opts: unknown) => {
        calls.push({ method: 'createSignedUploadUrl', args: [bucket, path, opts] });
        return {
          data: {
            path,
            token: 'upload-token',
            signedUrl: `https://storage.example.test/${path}?t=1`,
          },
          error: null,
        };
      }),
      list: vi.fn(async (folder: string, opts: { search: string }) => {
        calls.push({ method: 'list', args: [bucket, folder, opts] });
        const item = stored[`${folder}/${opts.search}`];
        return {
          data: item
            ? [{ name: opts.search, metadata: { size: item.bytes.length, mimetype: item.mime } }]
            : [],
          error: null,
        };
      }),
      download: vi.fn(async (path: string) => {
        calls.push({ method: 'download', args: [bucket, path] });
        const item = stored[path];
        return item
          ? { data: new Blob([new Uint8Array(item.bytes)]), error: null }
          : { data: null, error: { message: 'Object not found' } };
      }),
      remove: vi.fn(async (paths: string[]) => {
        calls.push({ method: 'remove', args: [bucket, paths] });
        return { data: [], error: null };
      }),
      createSignedUrl: vi.fn(async (path: string, seconds: number) => {
        calls.push({ method: 'createSignedUrl', args: [bucket, path, seconds] });
        return { data: { signedUrl: `https://signed.example.test/${path}` }, error: null };
      }),
    }),
  };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ method: 'rpc', args: [name, args] });
    return { data: 1, error: rpcError };
  });
  const unitCheck = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is']) builder[method] = () => builder;
    builder.maybeSingle = async () => ({ data: { id: UNIT }, error: null });
    return builder;
  };
  const access = {
    db: { storage, rpc, from: unitCheck },
    hostId: HOST,
    unitScope: null,
    role: 'Owner',
    userId: 'user-1',
    email: 'host@example.test',
    name: 'Host',
  };
  return { access, calls };
}

function jsonPost(body: unknown) {
  return new Request(GUIDE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function step(
  action: 'upload-url' | 'complete',
  bytes: Buffer,
  extra: Record<string, unknown> = {},
) {
  return {
    action,
    unit: UNIT,
    kind: 'model',
    revision: 3,
    digest: sha(bytes),
    fileName: 'flat.glb',
    mime: 'model/gltf-binary',
    size: bytes.length,
    ...extra,
  };
}

const modelPath = (digest: string) => `${HOST}/${UNIT}/model/${digest}.glb`;

describe('guide files: direct upload', () => {
  beforeEach(() => {
    state.access = null;
  });

  it('signs an upload for a model too large for a request body', async () => {
    const db = fakeDb();
    state.access = db.access;
    const response = await postGuide(
      jsonPost(step('upload-url', glb(), { size: 9 * MB, digest: 'a'.repeat(64) })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      path: modelPath('a'.repeat(64)),
      token: 'upload-token',
    });
    expect(db.calls.find((call) => call.method === 'createSignedUploadUrl')?.args).toEqual([
      BUCKET,
      modelPath('a'.repeat(64)),
      { upsert: false },
    ]);
  });

  it('refuses a model over 12 MB or a plan over 2 MB before signing', async () => {
    const db = fakeDb();
    state.access = db.access;
    const model = await postGuide(jsonPost(step('upload-url', glb(), { size: 12 * MB + 1 })));
    expect(model.status).toBe(413);
    expect(await model.json()).toEqual({ error: 'Choose a GLB file up to 12 MB.' });
    const plan = await postGuide(
      jsonPost(step('upload-url', png, { kind: 'plan', mime: 'image/png', size: 2 * MB + 1 })),
    );
    expect(plan.status).toBe(413);
    expect(await plan.json()).toEqual({ error: 'Choose a floor plan up to 2 MB.' });
    expect(db.calls.some((call) => call.method === 'createSignedUploadUrl')).toBe(false);
  });

  it('refuses a model that is not a .glb, and a plan of another type', async () => {
    state.access = fakeDb().access;
    const model = await postGuide(jsonPost(step('upload-url', glb(), { fileName: 'flat.obj' })));
    expect(await model.json()).toEqual({ error: 'Choose a GLB file.' });
    const plan = await postGuide(
      jsonPost(step('upload-url', png, { kind: 'plan', mime: 'image/gif' })),
    );
    expect(await plan.json()).toEqual({ error: 'Choose a PNG, JPEG or WebP floor plan.' });
  });

  it('skips the send when the same file already reached Storage (a retry)', async () => {
    const bytes = glb();
    const db = fakeDb({
      [modelPath(sha(bytes))]: { name: 'x', bytes, mime: 'model/gltf-binary' },
    });
    state.access = db.access;
    const response = await postGuide(jsonPost(step('upload-url', bytes)));
    expect(await response.json()).toEqual({
      path: modelPath(sha(bytes)),
      signedUrl: null,
      token: null,
      done: true,
    });
    expect(db.calls.some((call) => call.method === 'createSignedUploadUrl')).toBe(false);
  });

  it('checks the stored model and records it on complete', async () => {
    const bytes = glb();
    const path = modelPath(sha(bytes));
    const db = fakeDb({ [path]: { name: 'x', bytes, mime: 'model/gltf-binary' } });
    state.access = db.access;
    const response = await postGuide(jsonPost(step('complete', bytes, { path })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: '3D model added to the draft.' });
    expect(db.calls.find((call) => call.method === 'rpc')?.args).toEqual([
      'rpc_host_workspace_guide_asset_record',
      { p_unit_id: UNIT, p_revision: 3, p_kind: 'model', p_path: path, p_digest: sha(bytes) },
    ]);
    expect(db.calls.some((call) => call.method === 'remove')).toBe(false);
  });

  it('removes a stored file that is not a valid GLB and says why', async () => {
    const bytes = Buffer.from('not a model at all, just some text bytes');
    const path = modelPath(sha(bytes));
    const db = fakeDb({ [path]: { name: 'x', bytes, mime: 'model/gltf-binary' } });
    state.access = db.access;
    const response = await postGuide(jsonPost(step('complete', bytes, { path })));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Choose a valid self-contained GLB model.' });
    expect(db.calls.find((call) => call.method === 'remove')?.args).toEqual([BUCKET, [path]]);
    expect(db.calls.some((call) => call.method === 'rpc')).toBe(false);
  });

  it('removes a floor plan whose bytes are not the image type it claims', async () => {
    const bytes = Buffer.from('GIF89a-and-then-some-more');
    const path = `${HOST}/${UNIT}/plan/${sha(bytes)}.png`;
    const db = fakeDb({ [path]: { name: 'x', bytes, mime: 'image/png' } });
    state.access = db.access;
    const response = await postGuide(
      jsonPost(step('complete', bytes, { kind: 'plan', mime: 'image/png', path })),
    );
    expect(await response.json()).toEqual({ error: 'Choose a PNG, JPEG or WebP floor plan.' });
    expect(db.calls.find((call) => call.method === 'remove')?.args).toEqual([BUCKET, [path]]);
  });

  it('records a valid floor plan', async () => {
    const path = `${HOST}/${UNIT}/plan/${sha(png)}.png`;
    const db = fakeDb({ [path]: { name: 'x', bytes: png, mime: 'image/png' } });
    state.access = db.access;
    const response = await postGuide(
      jsonPost(step('complete', png, { kind: 'plan', mime: 'image/png', path })),
    );
    expect(await response.json()).toEqual({ message: 'Floor plan added to the draft.' });
  });

  it('asks for the same file again when it has not finished uploading', async () => {
    const bytes = glb();
    const db = fakeDb();
    state.access = db.access;
    const response = await postGuide(
      jsonPost(step('complete', bytes, { path: modelPath(sha(bytes)) })),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'The file has not finished uploading. Try the same file again.',
    });
  });

  it('refuses a path that is not this guide file', async () => {
    const bytes = glb();
    state.access = fakeDb().access;
    const response = await postGuide(
      jsonPost(step('complete', bytes, { path: `${HOST}/${UNIT}/model/${'b'.repeat(64)}.glb` })),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'This upload does not belong to this guide.',
    });
  });

  it('passes on a stale draft as the multipart upload does', async () => {
    const bytes = glb();
    const path = modelPath(sha(bytes));
    const db = fakeDb(
      { [path]: { name: 'x', bytes, mime: 'model/gltf-binary' } },
      { code: '40001', message: 'The guide has changed. Reload before attaching a file.' },
    );
    state.access = db.access;
    const response = await postGuide(jsonPost(step('complete', bytes, { path })));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'The guide has changed. Reload before attaching a file.',
    });
  });
});

describe('guide files: reading', () => {
  it('redirects a Storage file to a short-lived signed URL', async () => {
    const db = fakeDb();
    db.access.db.rpc = vi.fn(async () => ({
      data: { mime: 'model/gltf-binary', path: modelPath('a'.repeat(64)) },
      error: null,
    }));
    state.access = db.access;
    const response = await getAsset(new Request(`${GUIDE}/asset?id=${ASSET}`));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `https://signed.example.test/${modelPath('a'.repeat(64))}`,
    );
    expect(db.calls.find((call) => call.method === 'createSignedUrl')?.args).toEqual([
      BUCKET,
      modelPath('a'.repeat(64)),
      600,
    ]);
  });

  it('still serves a file stored in the database before direct uploads', async () => {
    const db = fakeDb();
    db.access.db.rpc = vi.fn(async () => ({
      data: { mime: 'image/png', base64: png.toString('base64') },
      error: null,
    }));
    state.anon = db.access.db;
    const response = await getAsset(new Request(`${GUIDE}/asset?id=${ASSET}&code=NXG-T2K4MW`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);
  });

  it('asks the sign RPC with the QR code before signing a guest link', async () => {
    const db = fakeDb();
    const rpc = vi.fn(async () => ({
      data: { mime: 'image/png', path: modelPath('a'.repeat(64)) },
      error: null,
    }));
    db.access.db.rpc = rpc;
    state.anon = db.access.db;
    const response = await getAsset(new Request(`${GUIDE}/asset?id=${ASSET}&code=nxg-t2k4mw`));
    expect(response.status).toBe(302);
    expect(rpc).toHaveBeenCalledWith('rpc_host_workspace_guide_asset_sign', {
      p_id: ASSET,
      p_code: 'NXG-T2K4MW',
    });
    expect(db.calls.find((call) => call.method === 'createSignedUrl')?.args).toEqual([
      BUCKET,
      modelPath('a'.repeat(64)),
      600,
    ]);
  });

  it('reads a host member file without the sign RPC', async () => {
    const db = fakeDb();
    const rpc = vi.fn(async () => ({ data: { mime: 'image/png', base64: '' }, error: null }));
    db.access.db.rpc = rpc;
    state.access = db.access;
    await getAsset(new Request(`${GUIDE}/asset?id=${ASSET}`));
    expect(rpc).toHaveBeenCalledWith('rpc_host_workspace_guide_asset', { p_id: ASSET });
  });
});
