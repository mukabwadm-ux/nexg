export class WorkspaceConnectionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

declare global {
  interface Window {
    /** The first workspace request, started by index.html before this script loaded. */
    __nexgWorkspace?: Promise<Response>;
  }
}

export async function workspaceRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch('/api/host-workspace' + path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return readWorkspaceResponse<T>(response);
}

/**
 * The workspace snapshot for the first screen. index.html starts that
 * request before the app's script has downloaded, so the two arrive
 * together; this takes it over once, and asks afresh after that (Try again).
 */
export async function workspaceSnapshot<T>(signal: AbortSignal): Promise<T> {
  const early = window.__nexgWorkspace;
  window.__nexgWorkspace = undefined;
  if (!early) return workspaceRequest<T>('', { signal });
  const response = await early;
  if (signal.aborted) throw new DOMException('The request was abandoned.', 'AbortError');
  return readWorkspaceResponse<T>(response);
}

async function readWorkspaceResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new WorkspaceConnectionError(
      response.status,
      details?.error ?? 'Your workspace could not be reached.',
    );
  }
  return response.json() as Promise<T>;
}

export function sendSupport<T>(action: Record<string, string>) {
  return workspaceRequest<T>('/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof WorkspaceConnectionError ? error.message : fallback;
}

export function sendStayChat<T>(action: Record<string, string>) {
  return workspaceRequest<T>('/stay-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
}
