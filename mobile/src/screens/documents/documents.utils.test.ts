import type { DocumentItem } from '@/src/types/app';
import {
  MAX_DOCUMENT_BYTES,
  canDeleteDocument,
  canEditDocument,
  canReplaceDocument,
  normalizeDocumentDate,
  validatePickedDocument,
} from './documents.utils';

const documentItem = (overrides: Partial<DocumentItem> = {}): DocumentItem => ({
  id: 'doc-1', ownerType: 'driver', ownerId: 'driver-1', name: 'Licencia tipo C', category: 'license',
  status: 'pending_review', expiresAt: '2030-01-01T23:59:59.999Z', reviewStatus: 'pending_review', ...overrides,
});

describe('driver document policies', () => {
  it('normalizes valid dates and rejects ambiguous input', () => {
    expect(normalizeDocumentDate('2099-01-02')).toBe('2099-01-02T23:59:59.999Z');
    expect(normalizeDocumentDate('02/01/2030')).toBeNull();
    expect(normalizeDocumentDate('2099-02-31')).toBeNull();
  });

  it('restricts replacement and deletion according to review state', () => {
    expect(canReplaceDocument(documentItem({ reviewStatus: 'rejected' }))).toBe(true);
    expect(canReplaceDocument(documentItem({ reviewStatus: 'approved' }))).toBe(false);
    expect(canDeleteDocument(documentItem({ reviewStatus: 'pending_review' }))).toBe(true);
    expect(canDeleteDocument(documentItem({ reviewStatus: 'approved' }))).toBe(false);
    expect(canEditDocument(documentItem({ reviewStatus: 'approved' }))).toBe(false);
  });

  it('accepts only the supported formats within 15 MB', () => {
    expect(validatePickedDocument({ type: 'application/pdf', size: MAX_DOCUMENT_BYTES })).toBeNull();
    expect(validatePickedDocument({ type: 'text/plain', size: 10 })).toMatch(/PDF/);
    expect(validatePickedDocument({ type: 'image/png', size: MAX_DOCUMENT_BYTES + 1 })).toMatch(/15 MB/);
  });
});
