import { describe, expect, it } from 'vitest';

import { outstandingDocuments, parseDocumentReadiness } from './merchant-document-readiness';

describe('document readiness', () => {
  it('parses the database answer and finds what holds approval', () => {
    const readiness = parseDocumentReadiness({
      ready: false,
      documents: [
        { kind: 'a', label: 'A', essential: true, status: 'verified' },
        { kind: 'b', label: 'B', essential: true, status: 'rejected' },
        { kind: 'c', label: 'C', essential: false, status: 'missing' },
      ],
    });
    expect(readiness?.ready).toBe(false);
    expect(outstandingDocuments(readiness!).map((doc) => doc.kind)).toEqual(['b']);
  });

  it('refuses a malformed answer rather than guessing', () => {
    expect(parseDocumentReadiness(null)).toBeNull();
    expect(parseDocumentReadiness({ ready: 'yes', documents: [] })).toBeNull();
    expect(parseDocumentReadiness({ ready: true, documents: [{ kind: 'a' }] })).toBeNull();
  });
});
