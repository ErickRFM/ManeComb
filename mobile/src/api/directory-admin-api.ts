import { apiClient } from '@/src/api/client';
import type { DocumentItem, User, Vehicle } from '@/src/types/app';

export type ManagedVehicle = Vehicle & {
  retiredAt?: string | null;
  retiredBy?: string | null;
  retirementReason?: string | null;
};

export type DriverLifecycleImpact = {
  conductor: User;
  status: string;
  assignedVehicle?: ManagedVehicle | null;
  activeRouteSession?: {
    id: string;
    startedAt?: string | null;
    status?: string | null;
  } | null;
  relatedDocuments?: { count: number };
  sessionsToRevoke?: number;
  releasesPlanSlot?: boolean;
  canOffboard: boolean;
  canDelete: boolean;
  blockers: string[];
  warnings: string[];
};

export type VehicleDeletionImpact = {
  vehicle: ManagedVehicle;
  driver?: User | null;
  activeRouteSession?: {
    id: string;
    startedAt?: string | null;
    status?: string | null;
  } | null;
  history?: {
    routeSessions: number;
    positions: number;
    incidents: number;
    tripLogs: number;
    total: number;
  };
  documents?: { count: number };
  canDeletePermanently: boolean;
  mustRetire: boolean;
  canRetire: boolean;
  blockers: string[];
  actionsRequired: string[];
};

export type VehicleMutationPayload = {
  code: string;
  plate: string;
  status: 'available' | 'maintenance';
  currentKilometers?: number;
};

export async function getManagedVehiclesRequest(includeRetired = false) {
  const response = await apiClient.get<{ ok: boolean; data: ManagedVehicle[] }>('/vehicles', {
    params: includeRetired ? { includeRetired: 'true' } : undefined,
  });
  return response.data.data;
}

export async function createManagedVehicleRequest(payload: VehicleMutationPayload) {
  const response = await apiClient.post<{ ok: boolean; data: ManagedVehicle }>('/vehicles', payload);
  return response.data.data;
}

export async function updateManagedVehicleRequest(
  vehicleId: string,
  payload: Partial<VehicleMutationPayload>
) {
  const response = await apiClient.patch<{ ok: boolean; data: ManagedVehicle }>(
    `/vehicles/${encodeURIComponent(vehicleId)}`,
    payload
  );
  return response.data.data;
}

export async function getVehicleDeletionImpactRequest(vehicleId: string) {
  const response = await apiClient.get<{ ok: boolean; data: VehicleDeletionImpact }>(
    `/vehicles/${encodeURIComponent(vehicleId)}/deletion-impact`
  );
  return response.data.data;
}

export async function retireVehicleRequest(vehicleId: string, reason: string) {
  const response = await apiClient.post<{ ok: boolean; data: unknown }>(
    `/vehicles/${encodeURIComponent(vehicleId)}/retire`,
    { reason }
  );
  return response.data.data;
}

export async function deleteManagedVehicleRequest(vehicleId: string) {
  const response = await apiClient.delete<{ ok: boolean; data: unknown }>(
    `/vehicles/${encodeURIComponent(vehicleId)}`
  );
  return response.data.data;
}

export async function assignDriverVehicleRequest(userId: string, vehicleId: string | null) {
  const response = await apiClient.patch<{ ok: boolean; data: User }>(
    `/users/${encodeURIComponent(userId)}`,
    { vehicleId }
  );
  return response.data.data;
}

export async function getDriverLifecycleImpactRequest(userId: string) {
  const response = await apiClient.get<{ ok: boolean; data: DriverLifecycleImpact }>(
    `/users/${encodeURIComponent(userId)}/lifecycle-impact`
  );
  return response.data.data;
}

export async function offboardDriverRequest(userId: string, reason: string) {
  const response = await apiClient.post<{ ok: boolean; data: unknown }>(
    `/users/${encodeURIComponent(userId)}/offboard`,
    { reason, releaseVehicle: true }
  );
  return response.data.data;
}

export async function reactivateDriverRequest(userId: string) {
  const response = await apiClient.post<{ ok: boolean; data: unknown }>(
    `/users/${encodeURIComponent(userId)}/reactivate`
  );
  return response.data.data;
}

export async function deleteDriverRequest(userId: string, reason: string) {
  const response = await apiClient.delete<{ ok: boolean; data: unknown }>(
    `/users/${encodeURIComponent(userId)}`,
    {
      data: {
        confirmation: 'ELIMINAR',
        reason,
      },
    }
  );
  return response.data.data;
}

export async function getAdminDocumentsForOwnerRequest(
  ownerType: 'driver' | 'vehicle',
  ownerId: string
) {
  const response = await apiClient.get<{ ok: boolean; data: DocumentItem[] }>('/documents/admin', {
    params: { ownerType },
  });
  return response.data.data.filter(
    (document) => document.ownerType === ownerType && document.ownerId === ownerId
  );
}
