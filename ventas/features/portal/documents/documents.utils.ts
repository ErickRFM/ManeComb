export function getStatusMeta(status: string) {
  if (status === 'deleted') return { label: 'Eliminado', tone: 'neutral' as const };
  if (status === 'expired') return { label: 'Vencido', tone: 'danger' as const };
  if (status === 'approved' || status === 'active') return { label: 'Aprobado', tone: 'positive' as const };
  if (status === 'rejected') return { label: 'Rechazado', tone: 'danger' as const };
  return { label: 'Pendiente', tone: 'warning' as const };
}

export function isDocumentExpired(expiresAt: string) {
  return Number.isFinite(new Date(expiresAt).getTime()) && new Date(expiresAt).getTime() < Date.now();
}

export function getDocumentSummary(documents: Array<{ deletedAt?: string | null; expiresAt: string; reviewStatus?: string }>, missing: number) {
  return {
    total: documents.filter((document) => !document.deletedAt).length,
    pending: documents.filter((document) => !document.deletedAt && document.reviewStatus === 'pending_review').length,
    rejected: documents.filter((document) => !document.deletedAt && document.reviewStatus === 'rejected').length,
    expired: documents.filter((document) => !document.deletedAt && isDocumentExpired(document.expiresAt)).length,
    missing,
  };
}

export function matchesDocumentFilter(document: {
  deletedAt?: string | null;
  expiresAt: string;
  name: string;
  ownerLabel: string;
  reviewStatus?: string;
  vehicleLabel?: string;
}, filter: string, search: string) {
  const term = search.trim().toLocaleLowerCase('es');
  const matchesSearch = !term || [document.name, document.ownerLabel, document.vehicleLabel || '']
    .some((value) => value.toLocaleLowerCase('es').includes(term));
  if (!matchesSearch) return false;
  if (filter === 'deleted') return Boolean(document.deletedAt);
  if (document.deletedAt) return false;
  if (filter === 'expired') return isDocumentExpired(document.expiresAt);
  return !filter || document.reviewStatus === filter;
}
