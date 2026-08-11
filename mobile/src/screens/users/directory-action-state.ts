export type DirectoryDriverActionKind = 'offboard' | 'reactivate' | 'delete';
export type DirectoryVehicleActionKind = 'retire' | 'delete';

type DriverActionGuardInput = {
  kind: DirectoryDriverActionKind;
  impactLoading: boolean;
  impactReady: boolean;
  submitting: boolean;
  canOffboard?: boolean;
  canDelete?: boolean;
  reason: string;
  confirmation: string;
};

type VehicleActionGuardInput = {
  kind: DirectoryVehicleActionKind;
  impactLoading: boolean;
  impactReady: boolean;
  submitting: boolean;
  canRetire?: boolean;
  canDeletePermanently?: boolean;
  mustRetire?: boolean;
  reason: string;
};

export function canConfirmDirectoryDriverAction({
  kind,
  impactLoading,
  impactReady,
  submitting,
  canOffboard,
  canDelete,
  reason,
  confirmation,
}: DriverActionGuardInput) {
  if (submitting || impactLoading || !impactReady) return false;
  if (kind !== 'reactivate' && reason.trim().length < 3) return false;
  if (kind === 'offboard' && canOffboard === false) return false;
  if (kind === 'delete') {
    if (canDelete === false) return false;
    if (confirmation.trim().toUpperCase() !== 'ELIMINAR') return false;
  }
  return true;
}

export function canConfirmDirectoryVehicleAction({
  kind,
  impactLoading,
  impactReady,
  submitting,
  canRetire,
  canDeletePermanently,
  mustRetire,
  reason,
}: VehicleActionGuardInput) {
  if (submitting || impactLoading || !impactReady) return false;

  if (kind === 'retire') {
    if (reason.trim().length < 3) return false;
    if (canRetire === false) return false;
    return true;
  }

  if (canDeletePermanently === true) return true;
  if (mustRetire === true && canRetire !== false) {
    return reason.trim().length >= 3;
  }
  return false;
}