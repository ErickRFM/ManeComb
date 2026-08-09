import { shouldAdoptRouteSessionUpdate } from './route-session-reconciliation';

describe('reconciliacion de jornada por realtime', () => {
  it('adopta la jornada de la propia unidad', () => {
    expect(
      shouldAdoptRouteSessionUpdate({
        sessionVehicleId: 'vehicle-101',
        userVehicleId: 'vehicle-101',
      })
    ).toBe(true);
  });

  it('ignora la jornada de otra unidad', () => {
    // Un dispatcher o supervisor recibe route-session:updated de cualquier
    // conductor de su organizacion porque backend emite a las salas de rol con
    // canViewAnalytics. Adoptarla sobrescribiria su propio estado.
    expect(
      shouldAdoptRouteSessionUpdate({
        sessionVehicleId: 'vehicle-999',
        userVehicleId: 'vehicle-101',
      })
    ).toBe(false);
  });

  it('ignora cualquier jornada cuando el actor no opera unidad', () => {
    // Es el caso de admin/dispatcher/supervisor: REST les deja
    // activeRouteSession en null porque no tienen vehicleId. Realtime debe
    // coincidir con esa autoridad, no contradecirla.
    for (const userVehicleId of [null, undefined, '', '   ']) {
      expect(
        shouldAdoptRouteSessionUpdate({ sessionVehicleId: 'vehicle-101', userVehicleId })
      ).toBe(false);
    }
  });

  it('no adopta un payload sin unidad', () => {
    for (const sessionVehicleId of [null, undefined, '']) {
      expect(
        shouldAdoptRouteSessionUpdate({ sessionVehicleId, userVehicleId: 'vehicle-101' })
      ).toBe(false);
    }
  });
});
