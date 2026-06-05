import type { Role } from '@/src/types/app';

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  dispatcher: 'Despachador',
  supervisor: 'Supervisor',
  billing_manager: 'Facturacion',
  support: 'Soporte',
  viewer: 'Consulta',
  driver: 'Conductor',
};

export function formatRole(role?: Role | string | null) {
  return roleLabels[String(role || '')] || 'Usuario';
}
