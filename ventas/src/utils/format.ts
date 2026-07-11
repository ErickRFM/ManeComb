import type { Role } from '@/src/types/app';

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  dispatcher: 'Despachador',
  supervisor: 'Supervisor',
  billing_manager: 'Facturación',
  support: 'Soporte',
  viewer: 'Consulta',
  driver: 'Conductor',
};

export function formatRole(role?: Role | string | null) {
  return roleLabels[String(role || '')] || 'Usuario';
}

export function formatCurrency(value?: number | null, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

type FormatDateOptions = {
  fallback?: string;
  year?: boolean;
};

export function formatDate(value?: string | null, options: FormatDateOptions = {}) {
  const fallback = options.fallback || 'Pendiente';

  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    ...(options.year === false ? {} : { year: 'numeric' }),
  });
}
