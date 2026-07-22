import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { formatPortalStatus } from '../cards';
import type { PortalActivationKey } from '@/src/types/app';

export function getStepIcon(stepId: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    'company-profile': 'domain',
    'select-plan': 'clipboard-list-outline',
    'plan-active': 'clipboard-check-outline',
    payment: 'credit-card-check-outline',
    'payment-method': 'credit-card-outline',
    'activation-keys': 'key-variant',
    'activated-drivers': 'account-check-outline',
    'register-units': 'bus-multiple',
    'invite-supervisors': 'account-tie-outline',
    'activate-drivers': 'steering',
    'gps-setup': 'crosshairs-gps',
    'radio-setup': 'radio-handheld',
    'gps-radio': 'radio-tower',
    'finish-activation': 'check-decagram-outline',
  };

  return icons[stepId] || 'flag-checkered';
}

export function getStepTarget(stepId: string) {
  if (stepId === 'company-profile') {
    return { pathname: '/portal/perfil', params: { section: 'empresa' } };
  }

  if (stepId === 'select-plan' || stepId === 'plan-active') {
    return '/portal/plan';
  }

  if (stepId === 'payment-method' || stepId === 'payment') {
    return '/portal/pagos';
  }

  if (stepId === 'activated-drivers') {
    return '/portal/usuarios';
  }

  if (stepId === 'register-units') {
    return '/portal/unidades';
  }

  if (stepId === 'invite-supervisors') {
    return '/portal/usuarios';
  }

  if (stepId === 'activate-drivers') {
    return '/portal/usuarios';
  }

  if (stepId === 'gps-setup' || stepId === 'gps-radio') {
    return '/portal/rutas';
  }

  if (stepId === 'radio-setup') {
    return '/portal/unidades';
  }

  if (stepId === 'finish-activation') {
    return '/portal';
  }

  return null;
}

export function formatActivationKeyStatus(status: PortalActivationKey['status']) {
  if (status === 'available') return 'disponible';
  if (status === 'used') return 'usada';
  if (status === 'expired') return 'vencida';
  if (status === 'revoked') return 'revocada';

  return formatPortalStatus(status);
}

export function getActivationKeyTone(status: PortalActivationKey['status']) {
  if (status === 'available') return 'positive';
  if (status === 'used') return 'info';
  if (status === 'expired') return 'warning';
  if (status === 'revoked') return 'danger';

  return 'neutral';
}
