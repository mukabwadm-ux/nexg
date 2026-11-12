// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationReviewActor } from './application-review-actor';
import { ApplicationReviewControls } from './application-review-controls';

const ports = vi.hoisted(() => ({
  getUser: vi.fn(),
  refresh: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
  unsubscribe: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: ports.refresh }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: ports.getUser,
      onAuthStateChange: (listener: typeof ports.listener) => {
        ports.listener = listener;
        return { data: { subscription: { unsubscribe: ports.unsubscribe } } };
      },
    },
  }),
}));

const actorId = '10000000-0000-4000-8000-000000000001';
const merchantId = '20000000-0000-4000-8000-000000000002';
const actor = { data: { user: { id: actorId, is_anonymous: false } }, error: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function saved(operationId: string, decision = 'approved') {
  return {
    merchant_id: merchantId,
    revision: 2,
    operation_id: operationId,
    payload: {
      registryRevision: 'nexg-booking-2026-10-31.1',
      business: {
        name: 'Maua Cafe',
        firstName: 'Amina',
        lastName: 'Owino',
        email: 'amina@example.test',
        phone: '+254712345678',
        branchCount: 1,
        registered: true,
        sameBusinessPhone: true,
        businessPhone: '',
        marketing: false,
      },
      categoryId: 'restaurants_food',
      subcategories: ['cafe'],
      answersBySubcategory: {},
      policies: { terms: true },
    },
    review: {
      state: decision,
      submitted_revision: 2,
      submitted_at: '2026-11-02T08:00:00Z',
      needs_resubmission: false,
    },
    access: { state: decision, setup: true, operations: decision === 'approved' },
    publication: { status: 'applied', accepting_orders: false },
  };
}

let container: HTMLDivElement;
let root: Root;
const fetcher = vi.fn<typeof fetch>();
async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  expect(button?.disabled).toBe(false);
  await act(async () => {
    button!.click();
  });
}
const form = () => (
  <ApplicationReviewControls actorId={actorId} merchantId={merchantId} revision={2} canReview />
);
function posted(index = 0) {
  return JSON.parse(String(fetcher.mock.calls[index]?.[1]?.body)) as {
    merchantId: string;
    expectedRevision: number;
    operationId: string;
    decision: string;
    reason: string;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetcher);
  fetcher.mockReset();
  ports.getUser.mockReset();
  ports.refresh.mockReset();
  ports.unsubscribe.mockReset();
  ports.listener = null;
  ports.getUser.mockResolvedValue(actor);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('application review decision controls', () => {
  it('bounds a hung authentication lookup and keeps the same operation for explicit retry', async () => {
    const auth = deferred<typeof actor>();
    ports.getUser.mockReturnValueOnce(auth.promise);
    fetcher.mockImplementation(
      async (_url, init) =>
        new Response(JSON.stringify(saved(JSON.parse(String(init?.body)).operationId)), {
          headers: { 'x-merchant-live': 'true' },
        }),
    );
    await render(form());
    await click('Confirm approve workspace access');
    expect(container.textContent).toContain('Saving decision');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(container.textContent).toContain('The result could not be confirmed');
    const operation = container.textContent!.match(/Operation ([\w-]+)/)![1];
    expect(fetcher.mock.calls).toHaveLength(0);
    await click('Retry same decision');
    expect(posted()).toEqual({
      merchantId,
      expectedRevision: 2,
      operationId: operation,
      decision: 'approved',
      reason: '',
    });
    expect(container.textContent).toContain(
      'Application approved. The merchant is live, shown in Explore, and their home is now the dashboard.',
    );
    expect(container.querySelector('button')?.disabled).toBe(true);
    await act(async () => {
      auth.resolve(actor);
    });
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(ports.refresh.mock.calls).toHaveLength(1);
  });

  it('bounds hung response parsing, ignores its late result, and retries the identical command', async () => {
    const body = deferred<unknown>();
    fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: () => body.promise } as Response);
    await render(form());
    await click('Confirm approve workspace access');
    const original = posted();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(container.textContent).toContain('Retry same decision');
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    const next = deferred<Response>();
    fetcher.mockReturnValueOnce(next.promise);
    await click('Retry same decision');
    await act(async () => {
      body.resolve(saved(original.operationId));
    });
    expect(container.textContent).toContain('Saving decision');
    expect(container.textContent).not.toContain('Application approved.');
    expect(posted(1)).toEqual(original);
    await act(async () => {
      next.resolve(
        new Response(JSON.stringify(saved(original.operationId)), {
          headers: { 'x-merchant-live': 'true' },
        }),
      );
    });
    expect(container.textContent).toContain(
      'Application approved. The merchant is live, shown in Explore, and their home is now the dashboard.',
    );
    expect(ports.refresh.mock.calls).toHaveLength(1);
  });

  it('permits one in-flight command and requires reload after a revision conflict', async () => {
    const response = deferred<Response>();
    fetcher.mockReturnValueOnce(response.promise);
    await render(form());
    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(posted()).toMatchObject({ merchantId, expectedRevision: 2, decision: 'approved' });
    expect(fetcher.mock.calls).toHaveLength(1);
    await act(async () => {
      response.resolve(
        new Response(JSON.stringify({ detail: 'private backend exception' }), { status: 409 }),
      );
    });
    expect(container.textContent).toContain('The application changed or was already reviewed');
    expect(container.textContent).not.toContain('private backend exception');
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      `/merchants/applications/${merchantId}`,
    );
  });

  it('keeps a malformed success unknown and makes a request-changes reason mandatory', async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify(saved('30000000-0000-4000-8000-000000000003'))),
    );
    await render(form());
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = 'changes_requested';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.querySelector('textarea')?.required).toBe(true);
    await act(async () => {
      select.value = 'approved';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Confirm approve workspace access');
    expect(container.textContent).toContain('The result could not be confirmed');
    expect(container.textContent).toContain('Retry same decision');
    expect(ports.refresh.mock.calls).toHaveLength(0);
  });
});

describe('private application actor boundary', () => {
  const view = (id = actorId) => (
    <ApplicationReviewActor actorId={id}>
      <div>Private submitted name</div>
      {form()}
    </ApplicationReviewActor>
  );

  it('removes private facts on sign-out and fences an in-flight confirmation', async () => {
    const response = deferred<Response>();
    fetcher.mockReturnValueOnce(response.promise);
    await render(view());
    expect(container.textContent).toContain('Private submitted name');
    await click('Confirm approve workspace access');
    const operation = posted().operationId;
    await act(async () => {
      ports.listener!('SIGNED_OUT', null);
    });
    expect(container.textContent).toContain('This application view is closed');
    expect(container.textContent).not.toContain('Private submitted name');
    await act(async () => {
      response.resolve(new Response(JSON.stringify(saved(operation))));
    });
    expect(container.textContent).toContain('This application view is closed');
    expect(ports.refresh.mock.calls).toHaveLength(0);
  });

  it('keeps private content closed after an initial null session even if getUser resolves late', async () => {
    const auth = deferred<typeof actor>();
    ports.getUser.mockReturnValue(auth.promise);
    await render(view());
    expect(container.textContent).toContain('Checking your current staff session');
    expect(container.textContent).not.toContain('Private submitted name');
    await act(async () => {
      ports.listener!('INITIAL_SESSION', null);
      auth.resolve(actor);
    });
    expect(container.textContent).toContain('This application view is closed');
    expect(container.textContent).not.toContain('Private submitted name');
  });

  it('closes private content as soon as the command response denies access', async () => {
    fetcher.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => new Promise(() => {}),
    } as Response);
    await render(view());
    expect(container.textContent).toContain('Private submitted name');
    await click('Confirm approve workspace access');
    expect(container.textContent).toContain('This application view is closed');
    expect(container.textContent).not.toContain('Private submitted name');
  });

  it('closes on actor switch and the initial lookup deadline', async () => {
    await render(view());
    expect(container.textContent).toContain('Private submitted name');
    await act(async () => {
      ports.listener!('SIGNED_IN', { user: { id: 'another-actor' } });
    });
    expect(container.textContent).toContain('This application view is closed');
    const auth = deferred<typeof actor>();
    ports.getUser.mockReturnValue(auth.promise);
    await render(view('different-request-actor'));
    expect(container.textContent).toContain('Checking your current staff session');
    expect(container.textContent).not.toContain('Private submitted name');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      auth.resolve(actor);
    });
    expect(container.textContent).toContain('This application view is closed');
    expect(container.textContent).not.toContain('Private submitted name');
  });
});
