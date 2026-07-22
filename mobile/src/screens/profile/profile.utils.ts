import type { DocumentItem } from '@/src/types/app';

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
