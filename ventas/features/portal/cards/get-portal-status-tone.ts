import type { StatusBadgeTone } from '@/src/components/ui/status-badge';

export function getStatusTone(status?: string): StatusBadgeTone {
  const normalized = String(status || '').toLowerCase();

  if (['active', 'completed', 'finished', 'paid', 'ready', 'ready_for_activation', 'running', 'trial'].includes(normalized)) {
    return 'positive';
  }

  if (['paused', 'pending', 'pending_payment', 'trial_active'].includes(normalized)) {
    return 'warning';
  }

  if (['cancelled', 'canceled', 'suspended', 'failed', 'error'].includes(normalized)) {
    return 'danger';
  }

  return 'neutral';
}

export function getPortalStatusTone(status?: string) {
  return getStatusTone(status);
}
