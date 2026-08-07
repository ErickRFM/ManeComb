import type { DocumentItem } from '@/src/types/app';
import { canReplaceDocument, isDocumentExpired } from '@/src/screens/documents/documents.utils';

export const getDocumentPresentation = (reviewStatus?: string) => {
  if (reviewStatus === 'rejected') return { icon: 'alert-outline' as const, label: 'Rechazado', tone: 'danger' as const };
  if (reviewStatus === 'approved') return { icon: 'check-circle-outline' as const, label: 'Subido', tone: 'positive' as const };
  return { icon: 'clock-outline' as const, label: 'Pendiente', tone: 'warning' as const };
};

export const getDriverPresentation = (driverDocuments: DocumentItem[]) => {
  if (driverDocuments.some((document) => document.reviewStatus === 'rejected')) return { label: 'Rechazado', tone: 'danger' as const };
  if (!driverDocuments.length || driverDocuments.some((document) => document.reviewStatus !== 'approved')) return { label: 'Pendiente', tone: 'warning' as const };
  return { label: 'Subido', tone: 'positive' as const };
};

export const DEFAULT_DRIVER_DOCUMENT = {
  category: 'license',
  name: 'Licencia tipo C',
} as const;

// Perfil y Documentos hablan del mismo documento: comparten la regla, no la
// reimplementan. Antes Perfil comparaba contra `status === 'vencido'`, un valor
// que el backend nunca publica, asi que un documento aprobado y vencido se veia
// como vigente aqui y como vencido en Documentos, sin boton de reemplazo.
export const canReplaceDriverDocument = canReplaceDocument;

export const getDriverDocumentPresentation = (document: DocumentItem) => {
  if (isDocumentExpired(document)) {
    return { icon: 'calendar-alert' as const, label: 'Vencido', tone: 'danger' as const };
  }

  if (document.reviewStatus === 'rejected') {
    return { icon: 'alert-outline' as const, label: 'Rechazado', tone: 'danger' as const };
  }

  if (document.reviewStatus === 'approved') {
    return { icon: 'check-circle-outline' as const, label: 'Aprobado', tone: 'positive' as const };
  }

  return { icon: 'clock-outline' as const, label: 'En revisión', tone: 'warning' as const };
};

export const getDocumentSectionTitle = (role?: string) =>
  role === 'driver' ? 'Tus documentos' : 'Estado documental';

export const getDriverDocumentEmptyMessage = (documents: DocumentItem[]) =>
  documents.length ? null : 'Aún no has cargado tus documentos.';
