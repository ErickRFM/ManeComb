export function getStatusMeta(status: string) {
  if (status === 'approved' || status === 'active') return { label: 'Aprobado', tone: 'positive' as const };
  if (status === 'rejected') return { label: 'Rechazado', tone: 'danger' as const };
  return { label: 'Pendiente', tone: 'warning' as const };
}
