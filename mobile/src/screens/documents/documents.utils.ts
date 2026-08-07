import type { DocumentItem } from '@/src/types/app';

export const DRIVER_DOCUMENT_CATEGORY = 'license';
export const DRIVER_DOCUMENT_NAME = 'Licencia tipo C';
export const ACCEPTED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export function normalizeDocumentDate(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(`${normalized}T23:59:59.999Z`);
  if (
    Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day
    || parsed.getTime() <= Date.now()
  ) return null;
  return parsed.toISOString();
}

/**
 * Unica regla de vencimiento documental. El backend no publica ningun estado
 * "vencido": la vigencia se deriva siempre de `expiresAt`, y toda pantalla que
 * hable de documentos vencidos debe pasar por aqui.
 */
export const isDocumentExpired = (document: DocumentItem) =>
  new Date(document.expiresAt).getTime() < Date.now();

export function getDocumentStatus(document: DocumentItem) {
  if (isDocumentExpired(document)) return { label: 'Vencido', tone: 'danger' as const };
  if (document.reviewStatus === 'approved') return { label: 'Aprobado', tone: 'positive' as const };
  if (document.reviewStatus === 'rejected') return { label: 'Rechazado', tone: 'danger' as const };
  return { label: 'En revisión', tone: 'warning' as const };
}

export function getProfileDocumentSummary(documents: DocumentItem[]) {
  const current = documents.filter((document) => !document.deletedAt && !document.supersededByDocumentId);
  const valid = current.filter((document) => document.reviewStatus === 'approved' && !isDocumentExpired(document)).length;
  const pending = current.filter((document) => document.reviewStatus === 'pending_review').length;
  return `${valid} vigente${valid === 1 ? '' : 's'} · ${pending} pendiente${pending === 1 ? '' : 's'}`;
}

export const canReplaceDocument = (document: DocumentItem) =>
  document.reviewStatus === 'rejected' || isDocumentExpired(document);

export const canEditDocument = (document: DocumentItem) =>
  document.reviewStatus !== 'approved' || isDocumentExpired(document);

export const canDeleteDocument = (document: DocumentItem) =>
  document.reviewStatus === 'pending_review' || document.reviewStatus === 'rejected';

export function validatePickedDocument(file: { type?: string | null; size?: number | null }) {
  if (!file.type || !ACCEPTED_DOCUMENT_TYPES.includes(file.type as typeof ACCEPTED_DOCUMENT_TYPES[number])) {
    return 'Selecciona un archivo PDF, JPG, PNG o WEBP.';
  }
  if (typeof file.size === 'number' && file.size > MAX_DOCUMENT_BYTES) {
    return 'El archivo supera el límite de 15 MB.';
  }
  return null;
}
