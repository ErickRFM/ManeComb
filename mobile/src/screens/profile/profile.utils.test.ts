import type { DocumentItem } from '@/src/types/app';
import {
  canReplaceDriverDocument,
  getDocumentSectionTitle,
  getDriverDocumentEmptyMessage,
  getDriverDocumentPresentation,
} from './profile.utils';

const documentItem = (overrides: Partial<DocumentItem> = {}): DocumentItem => ({
  id: 'document-1',
  ownerType: 'driver',
  ownerId: 'driver-1',
  name: 'Licencia tipo C',
  category: 'license',
  status: 'vigente',
  expiresAt: '2027-01-01T00:00:00.000Z',
  reviewStatus: 'pending_review',
  ...overrides,
});

describe('driver document presentation', () => {
  it('uses driver-specific title and empty copy', () => {
    expect(getDocumentSectionTitle('driver')).toBe('Tus documentos');
    expect(getDocumentSectionTitle('admin')).toBe('Estado documental');
    expect(getDriverDocumentEmptyMessage([])).toBe('Aún no has cargado tus documentos.');
    expect(getDriverDocumentEmptyMessage([documentItem()])).toBeNull();
  });

  it('maps backend states without allowing the client to invent a review state', () => {
    expect(getDriverDocumentPresentation(documentItem()).label).toBe('En revisión');
    expect(getDriverDocumentPresentation(documentItem({ reviewStatus: 'approved' })).label).toBe('Aprobado');
    expect(getDriverDocumentPresentation(documentItem({ reviewStatus: 'rejected' })).label).toBe('Rechazado');
    expect(getDriverDocumentPresentation(documentItem({ status: 'vencido' })).label).toBe('Vencido');
  });

  it('only offers replacement for rejected or expired documents', () => {
    expect(canReplaceDriverDocument(documentItem({ reviewStatus: 'rejected' }))).toBe(true);
    expect(canReplaceDriverDocument(documentItem({ status: 'vencido' }))).toBe(true);
    expect(canReplaceDriverDocument(documentItem({ reviewStatus: 'approved' }))).toBe(false);
    expect(canReplaceDriverDocument(documentItem())).toBe(false);
  });
});
