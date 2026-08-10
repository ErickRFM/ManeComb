import { buildConfirmSelectionParams, getSelectorCopy } from './selector-route';

const origin = {
  id: 'origin',
  label: 'Origen',
  address: 'Origen',
  location: { latitude: 19.31, longitude: -98.24 },
};

const destination = {
  id: 'destination',
  label: 'Destino',
  address: 'Destino',
  location: { latitude: 19.42, longitude: -98.18 },
};

describe('selector route CTA', () => {
  it('keeps Continuar while creating a route', () => {
    expect(getSelectorCopy(true, true, 0, false).confirmLabel).toBe('Continuar');
  });

  it('shows Guardar cambios while editing an existing route', () => {
    expect(getSelectorCopy(true, true, 2, true).confirmLabel).toBe('Guardar cambios');
  });

  it('preserves editingRouteId through map confirmation instead of creating a second save path', () => {
    const params = buildConfirmSelectionParams(
      {
        vehicleId: 'vehicle-1',
        editingRouteId: 'route-42',
      },
      origin,
      destination,
      [],
      null
    );

    expect(params.editingRouteId).toBe('route-42');
    expect(params.vehicleId).toBe('vehicle-1');
  });
});
