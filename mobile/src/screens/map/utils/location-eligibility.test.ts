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

  it('publica GPS en foreground solo a traves de la autoridad canonica', () => {
    // El servicio de background ya se gobierna con canOwnVehicleTracking. Si el
    // arranque rederiva la condicion, foreground y background discrepan sobre
    // quien puede publicar: un admin con unidad asignada emitiria su posicion
    // personal como posicion de la unidad, y backend la acepta porque
    // vehicle-location-ingestion exime al rol admin de la comprobacion de
    // propiedad.
    const fs = require('node:fs');
    const path = require('node:path');
    const app = fs.readFileSync(path.resolve(__dirname, '../../../../App.tsx'), 'utf8');
    const syncCall = app.slice(app.indexOf('useLocationSync({'), app.indexOf('vehicleId: user?.vehicleId'));

    expect(syncCall).toContain('canOwnVehicleTracking(user, authContext)');
    expect(syncCall).not.toContain('authContext?.canAccessMobile === true');
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
