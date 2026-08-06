import {
  canCaptureLocalLocation,
  canOwnVehicleTracking,
  isOperationalDriverRole,
} from './location-eligibility';

describe('location eligibility', () => {
  const mobileContext = {
    canAccessMobile: true,
  } as any;

  it('recognizes both canonical driver role names', () => {
    expect(isOperationalDriverRole('driver')).toBe(true);
    expect(isOperationalDriverRole('conductor')).toBe(true);
    expect(isOperationalDriverRole('admin')).toBe(false);
  });

  it('allows local GPS for an authenticated mobile session', () => {
    expect(
      canCaptureLocalLocation(
        { accountType: 'operations', role: 'admin', vehicleId: null } as any,
        mobileContext
      )
    ).toBe(true);
  });

  it('keeps local GPS available while an operational cached session reconciles', () => {
    expect(
      canCaptureLocalLocation(
        { accountType: 'operations', role: 'driver', vehicleId: 'vehicle-1' } as any,
        null
      )
    ).toBe(true);
  });

  it('allows vehicle tracking only for an assigned operational driver', () => {
    expect(
      canOwnVehicleTracking(
        { accountType: 'operations', role: 'driver', vehicleId: 'vehicle-1' } as any,
        mobileContext
      )
    ).toBe(true);
    expect(
      canOwnVehicleTracking(
        { accountType: 'operations', role: 'admin', vehicleId: 'vehicle-1' } as any,
        mobileContext
      )
    ).toBe(false);
    expect(
      canOwnVehicleTracking(
        { accountType: 'operations', role: 'conductor', vehicleId: null } as any,
        mobileContext
      )
    ).toBe(false);
  });
});
