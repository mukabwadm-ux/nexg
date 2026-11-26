export class WorkspaceConnectionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function workspaceRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch('/api/host-workspace' + path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
  });
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
