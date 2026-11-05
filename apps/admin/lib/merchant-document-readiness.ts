export interface ReadinessDocument {
  kind: string;
  label: string;
  essential: boolean;
  status: 'missing' | 'uploaded' | 'verified' | 'rejected' | 'expired' | string;
}

/** Whether staff may approve: every essential document verified. */
export interface DocumentReadiness {
  ready: boolean;
  documents: ReadinessDocument[];
}

export function parseDocumentReadiness(value: unknown): DocumentReadiness | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { ready, documents } = value as { ready?: unknown; documents?: unknown };
  if (typeof ready !== 'boolean' || !Array.isArray(documents)) return null;
  const parsed: ReadinessDocument[] = [];
  for (const item of documents) {
    if (!item || typeof item !== 'object') return null;
    const { kind, label, essential, status } = item as Record<string, unknown>;
    if (
      typeof kind !== 'string' ||
      typeof label !== 'string' ||
      typeof essential !== 'boolean' ||
      typeof status !== 'string'
    )
      return null;
    parsed.push({ kind, label, essential, status });
  }
  return { ready, documents: parsed };
}

/** Essential documents that still hold approval back. */
export function outstandingDocuments(readiness: DocumentReadiness) {
  return readiness.documents.filter((doc) => doc.essential && doc.status !== 'verified');
}
