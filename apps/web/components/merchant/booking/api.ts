export class BookingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function bookingRequest<T>(
  path: string,
  init: RequestInit = {},
  base = '/api/merchant/booking',
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => null)) as {
    detail?: string;
    message?: string;
    error?: string;
  } | null;
  if (!response.ok)
    throw new BookingApiError(
      data?.detail ??
        data?.message ??
        data?.error ??
        `The request could not be completed (${response.status}).`,
      response.status,
    );
  return data as T;
}

const pendingOperations = new Map<string, string>();

export async function command<T>(
  path: string,
  body: unknown,
  method = 'POST',
  base?: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const serialized = JSON.stringify(body);
  const operation = `${base ?? ''}:${method}:${path}:${serialized}`;
  const key = pendingOperations.get(operation) ?? crypto.randomUUID();
  pendingOperations.set(operation, key);
  try {
    const result = await bookingRequest<T>(
      path,
      { method, headers: { ...headers, 'Idempotency-Key': key }, body: serialized },
      base,
    );
    pendingOperations.delete(operation);
    return result;
  } catch (error) {
    if (error instanceof BookingApiError && error.status < 500) pendingOperations.delete(operation);
    // A network failure has an uncertain outcome. Reuse this key on retry.
    throw error;
  }
}
