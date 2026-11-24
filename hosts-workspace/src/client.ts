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

interface UploadTicket {
  path: string;
  signedUrl: string | null;
  token: string | null;
}

function postJson(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Sends one file straight to storage, then asks the workspace to record it.
 *
 * Request bodies through the API stop at about 4.5 MB, so the workspace signs
 * an upload for one path (upload-url), the browser sends the file there, and
 * the workspace checks what arrived before saving it (complete).
 */
export async function uploadFile<T>(
  endpoint: string,
  details: Record<string, unknown>,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const fields = { ...details, mime: file.type, size: file.size };
  const ticket = await workspaceRequest<UploadTicket>(
    endpoint,
    postJson({ action: 'upload-url', ...fields }),
  );
  if (ticket.signedUrl) await putFile(ticket.signedUrl, file, onProgress);
  onProgress?.(1);
  return workspaceRequest<T>(
    endpoint,
    postJson({ action: 'complete', ...fields, path: ticket.path }),
  );
}

function putFile(url: string, file: File, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type);
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      /* Sending the same file twice is fine: the workspace checks what is there. */
      if (request.status === 409 || /already exists|duplicate/i.test(request.responseText))
        return resolve();
      reject(
        new WorkspaceConnectionError(
          request.status,
          request.status === 413 || /size|too large/i.test(request.responseText)
            ? 'This file is over 10 MB. Choose a smaller file.'
            : /mime|type/i.test(request.responseText)
              ? 'This type of file is not accepted here.'
              : 'The file could not be uploaded. Try again.',
        ),
      );
    };
    request.onerror = () =>
      reject(
        new WorkspaceConnectionError(0, 'The upload stopped. Check your connection and try again.'),
      );
    request.send(file);
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
