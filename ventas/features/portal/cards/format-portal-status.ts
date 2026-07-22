export function formatPortalStatus(status?: string) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'completed') return 'Completado';
  if (normalized === 'running') return 'En curso';
  if (normalized === 'paused') return 'Pausada';
  if (normalized === 'finished') return 'Finalizada';
  if (normalized === 'pending') return 'Pendiente';
  if (normalized === 'active') return 'Activo';
  if (normalized === 'inactive') return 'Inactivo';
  if (normalized === 'paid') return 'Pagado';
  if (normalized === 'ready') return 'Listo';
  if (normalized === 'ready_for_activation') return 'Listo para activar';
  if (normalized === 'trial' || normalized === 'trial_active') return 'Prueba activa';
  if (normalized === 'pending_payment') return 'Pago pendiente';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelado';
  if (normalized === 'suspended') return 'Suspendido';
  if (normalized === 'failed') return 'Fallido';

  const fallback = String(status || 'Sin estado').replace(/_/g, ' ');
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}
