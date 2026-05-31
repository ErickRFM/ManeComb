import type { Role } from '@/src/types/app';

export function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `hace ${hours} h`;
  }

  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

export function formatDurationFromSeconds(seconds: number) {
  const safeSeconds = Math.max(1, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
  }

  return `${Math.max(1, minutes)} min`;
}

export function formatDistanceFromMeters(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(meters)} m`;
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRole(role: Role) {
  if (role === 'owner') {
    return 'Propietario';
  }

  if (role === 'admin') {
    return 'Administrador';
  }

  if (role === 'dispatcher') {
    return 'Despachador';
  }

  if (role === 'supervisor') {
    return 'Supervisor';
  }

  if (role === 'billing_manager') {
    return 'Facturacion';
  }

  if (role === 'support') {
    return 'Soporte';
  }

  if (role === 'viewer') {
    return 'Consulta';
  }

  return 'Chofer';
}

export function formatAccountType(type?: string) {
  if (type === 'company_owner') {
    return 'Propietario';
  }
  return 'Operativo';
}

export function formatStatus(status: string) {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getInitials(value: string) {
  return value
    .split(' ')
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('');
}
