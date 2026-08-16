import { apiClient } from '@/src/lib/api';
import type { LearnedRouteCandidate } from '@/src/lib/api';
import type { GeoPoint } from '@/src/types/app';

export type LearnedRouteSegmentReview = LearnedRouteCandidate & {
  segment: {
    routeId: string;
    baseRouteRevision: number;
    currentRouteRevision: number | null;
    routeName: string;
    startDistanceMeters: number;
    endDistanceMeters: number;
    baselinePolyline: GeoPoint[];
    baselineDistanceMeters: number;
    baselineDurationSeconds: number;
    distanceDeltaMeters: number;
    durationDeltaSeconds: number;
    stale: boolean;
  };
};

export type LearnedRouteSegmentApplication = {
  mode: 'segment_patch';
  idempotent: boolean;
  previousRevision?: number;
  revision?: number;
  comparison?: {
    baselineDistanceMeters: number;
    baselineDurationSeconds: number;
    candidateDistanceMeters: number;
    candidateDurationSeconds: number;
    distanceDeltaMeters: number;
    durationDeltaSeconds: number;
  };
};

export type LearnedRouteSegmentApprovalResponse = {
  ok: boolean;
  data: LearnedRouteCandidate;
  route: {
    id: string;
    name: string;
    revision: number;
  };
  application: LearnedRouteSegmentApplication;
};

export async function getLearnedRouteSegmentsRequest(status = 'READY_FOR_REVIEW') {
  try {
    const response = await apiClient.get<{ ok: boolean; data: LearnedRouteSegmentReview[] }>(
      '/navigation/learned-route-segments',
      { params: { status } }
    );
    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (error: any) {
    if (error?.response?.data?.code === 'auto_route_review_disabled') return [];
    throw error;
  }
}

export async function approveLearnedRouteSegmentRequest(candidateId: string) {
  const response = await apiClient.post<LearnedRouteSegmentApprovalResponse>(
    `/navigation/learned-routes/${encodeURIComponent(candidateId)}/approve`
  );
  return response.data;
}

export async function rejectLearnedRouteSegmentRequest(candidateId: string, reason = 'Mantener ruta actual') {
  const response = await apiClient.post<{ ok: boolean; data: LearnedRouteCandidate }>(
    `/navigation/learned-routes/${encodeURIComponent(candidateId)}/reject`,
    { reason }
  );
  return response.data.data;
}
