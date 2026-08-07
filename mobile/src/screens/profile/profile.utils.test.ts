import type { DocumentItem } from '@/src/types/app';
import { canReplaceDocument, getDocumentStatus } from '@/src/screens/documents/documents.utils';
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

const expiredDocument = (overrides: Partial<DocumentItem> = {}): DocumentItem =>
  documentItem({ expiresAt: '2020-01-01T00:00:00.000Z', ...overrides });

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
    expect(getDriverDocumentPresentation(expiredDocument()).label).toBe('Vencido');
  });

  it('only offers replacement for rejected or expired documents', () => {
    expect(canReplaceDriverDocument(documentItem({ reviewStatus: 'rejected' }))).toBe(true);
    expect(canReplaceDriverDocument(expiredDocument())).toBe(true);
    expect(canReplaceDriverDocument(documentItem({ reviewStatus: 'approved' }))).toBe(false);
    expect(canReplaceDriverDocument(documentItem())).toBe(false);
  });

  it('derives expiry from expiresAt, never from a status the backend does not publish', () => {
    // El backend solo publica reviewStatus (pending_review/approved/rejected) y
    // expiresAt. Un `status` arbitrario no puede vencer ni habilitar reemplazo.
    const inventedStatus = documentItem({ status: 'vencido', reviewStatus: 'approved' });
    expect(getDriverDocumentPresentation(inventedStatus).label).toBe('Aprobado');
    expect(canReplaceDriverDocument(inventedStatus)).toBe(false);
  });

  it('agrees with the documents screen about the same document', () => {
    // Antes, un documento aprobado y vencido se veia vigente en Perfil y vencido
    // en Documentos, y solo Documentos ofrecia reemplazarlo.
    const expired = expiredDocument({ reviewStatus: 'approved' });
    expect(getDocumentStatus(expired).label).toBe(getDriverDocumentPresentation(expired).label);
    expect(canReplaceDocument(expired)).toBe(canReplaceDriverDocument(expired));
  });
});
