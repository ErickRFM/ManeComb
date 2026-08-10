import {
  canConfirmDirectoryDriverAction,
  canConfirmDirectoryVehicleAction,
} from './directory-action-state';

describe('directory action guards', () => {
  it('keeps driver confirm disabled only while impact is loading, then enables it when safe', () => {
    expect(canConfirmDirectoryDriverAction({
      kind: 'offboard',
      impactLoading: true,
      impactReady: false,
      submitting: false,
      canOffboard: true,
      reason: 'Baja administrativa',
      confirmation: '',
    })).toBe(false);

    expect(canConfirmDirectoryDriverAction({
      kind: 'offboard',
      impactLoading: false,
      impactReady: true,
      submitting: false,
      canOffboard: true,
      reason: 'Baja administrativa',
      confirmation: '',
    })).toBe(true);
  });

  it('requires explicit ELIMINAR for permanent driver deletion', () => {
    expect(canConfirmDirectoryDriverAction({
      kind: 'delete',
      impactLoading: false,
      impactReady: true,
      submitting: false,
      canDelete: true,
      reason: 'Baja definitiva',
      confirmation: '',
    })).toBe(false);

    expect(canConfirmDirectoryDriverAction({
      kind: 'delete',
      impactLoading: false,
      impactReady: true,
      submitting: false,
      canDelete: true,
      reason: 'Baja definitiva',
      confirmation: 'eliminar',
    })).toBe(true);
  });

  it('does not allow a vehicle action before its impact is available', () => {
    expect(canConfirmDirectoryVehicleAction({
      kind: 'retire',
      impactLoading: false,
      impactReady: false,
      submitting: false,
      canRetire: true,
      reason: 'Fin de vida útil',
    })).toBe(false);

    expect(canConfirmDirectoryVehicleAction({
      kind: 'retire',
      impactLoading: false,
      impactReady: true,
      submitting: false,
      canRetire: true,
      reason: 'Fin de vida útil',
    })).toBe(true);
  });
});
