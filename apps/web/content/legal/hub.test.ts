import { describe, expect, it } from 'vitest';

import { LEGAL_DOCUMENTS, LEGAL_HUB_GROUPS, findDocument } from './index';

describe('the legal hub', () => {
  it('lists every legal document exactly once', () => {
    const listed = LEGAL_HUB_GROUPS.flatMap((group) => group.documents.map((entry) => entry.slug));
    expect([...listed].sort()).toEqual(LEGAL_DOCUMENTS.map((document) => document.slug).sort());
  });

  it('lists only documents that exist, each for someone', () => {
    for (const group of LEGAL_HUB_GROUPS) {
      for (const entry of group.documents) {
        expect(findDocument(entry.slug), entry.slug).toBeDefined();
        expect(entry.audiences.length, entry.slug).toBeGreaterThan(0);
      }
    }
  });
});

describe('the reading aids', () => {
  it('put a request after a section the document has, to an address its text names', () => {
    for (const document of LEGAL_DOCUMENTS) {
      if (!document.request) continue;
      const section = document.sections.find(({ id }) => id === document.request!.afterSection);
      expect(section, document.slug).toBeDefined();
      const text = document.sections.flatMap(({ body }) => body).join(' ');
      expect(text, document.slug).toContain(document.request.email);
    }
  });

  it('keep the summary short', () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.glance?.length ?? 0, document.slug).toBeLessThanOrEqual(6);
    }
  });

  it('never put a copyright sign where a clause letter belongs', () => {
    const everything = JSON.stringify(LEGAL_DOCUMENTS);
    expect(everything).not.toContain('©');
  });
});
