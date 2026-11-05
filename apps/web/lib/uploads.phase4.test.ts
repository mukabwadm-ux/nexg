import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadDocument } from './uploads';
import {
  resumeProtectedBrowserRequests,
  stopProtectedBrowserRequests,
} from './supabase/protected-request';
const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('./supabase/client', () => ({ createClient: mock.createClient }));
let user: { id: string; is_anonymous?: boolean } | null;
let storage: ReturnType<typeof vi.fn>;
let submissions: string[];
const file = new File(['document'], 'document.pdf', { type: 'application/pdf' });
const input = { ownerType: 'merchant' as const, ownerId: 'merchant-1', kind: 'national_id', file };
beforeEach(() => {
  user = { id: 'user-1' };
  storage = vi.fn().mockResolvedValue({ error: null });
  submissions = [];
  mock.createClient.mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      signInAnonymously: () => {
        throw new Error('Merchant uploads must never create another identity.');
      },
    },
    storage: { from: () => ({ upload: storage }) },
    rpc: async (name: string) => {
      if (name === 'rpc_merchant_workspace_access')
        return {
          data: {
            state: 'pending',
            setup: true,
            operations: false,
            expires_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        };
      submissions.push(name);
      return { data: 'document-1', error: null };
    },
  });
});
afterEach(() => resumeProtectedBrowserRequests());
describe('merchant document session', () => {
  it('records the owner upload through the existing document command', async () => {
    await expect(uploadDocument(input)).resolves.toEqual({ ok: true, documentId: 'document-1' });
    expect(submissions).toEqual(['rpc_document_submit']);
  });
  it('requires a verified existing user without minting an anonymous replacement', async () => {
    user = null;
    await expect(uploadDocument(input)).resolves.toEqual({
      ok: false,
      message: 'Sign in with your verified account to upload documents.',
    });
    user = { id: 'anonymous', is_anonymous: true };
    await expect(uploadDocument(input)).resolves.toMatchObject({ ok: false });
    expect(storage).not.toHaveBeenCalled();
  });
  it('does not record a completed storage upload after the user signs out', async () => {
    storage.mockImplementation(async () => {
      stopProtectedBrowserRequests();
      return { error: null };
    });
    await expect(uploadDocument(input)).resolves.toEqual({
      ok: false,
      message: 'Your session ended before the upload was recorded. Sign in and retry.',
    });
    expect(submissions).toEqual([]);
  });
});
