import { apiClient } from '@/src/api/client';

export type RouteAssignmentStatus =
  | 'AVAILABLE'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type VehicleRouteAssignment = {
  id: string;
  organizationId: string;
  vehicleId: string;
  routeId: string;
  status: RouteAssignmentStatus;
  priority: number;
  selectableByDriver: boolean;
  scheduledFrom: string | null;
  scheduledUntil: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  activationVersion: number;
  routeRevision: number;
};

export type CreateRouteAssignmentInput = {
  vehicleId: string;
  routeId: string;
  priority?: number;
  selectableByDriver?: boolean;
  scheduledFrom?: string | null;
  scheduledUntil?: string | null;
};

type ApiEnvelope<T> = { ok: boolean; data: T; message?: string };

export async function listRouteAssignments(vehicleId: string) {
  const response = await apiClient.get<ApiEnvelope<VehicleRouteAssignment[]>>(
    '/navigation/assignments',
    { params: { vehicleId } }
  );
  return response.data.data || [];
}

export async function createRouteAssignment(input: CreateRouteAssignmentInput) {
  const response = await apiClient.post<ApiEnvelope<VehicleRouteAssignment>>(
    '/navigation/assignments',
    input
  );
  return response.data.data;
}

export async function activateRouteAssignment(assignment: VehicleRouteAssignment) {
  const response = await apiClient.post<ApiEnvelope<{
    outcome: string;
    applied: boolean;
    assignment: VehicleRouteAssignment;
    vehicle: { id: string; routeId: string | null; routeName: string | null; driverId: string | null } | null;
  }>>(
    `/navigation/assignments/${encodeURIComponent(assignment.id)}/activate`,
    {
      reason: 'admin_activated',
      expectedActivationVersion: assignment.activationVersion,
    }
  );
  return response.data.data;
}
