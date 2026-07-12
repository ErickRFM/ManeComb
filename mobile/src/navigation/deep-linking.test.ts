import { getStateFromPath } from '@react-navigation/native';
import { linking } from './linking';
import { MODULE_ROUTE_NAMES } from './route-registry';

const linkingConfig = linking.config as Parameters<typeof getStateFromPath>[1];

describe('isolated deep linking', () => {
  it.each([
    ['chat', MODULE_ROUTE_NAMES.chat, '/chat'],
    ['radio', MODULE_ROUTE_NAMES.radio, '/radio'],
    ['incidencias', MODULE_ROUTE_NAMES.incidents, '/incidencias'],
    ['perfil-editar', MODULE_ROUTE_NAMES.profile, '/perfil-editar'],
  ])('builds only the destination module for %s', (path, moduleName, screenName) => {
    const state = getStateFromPath(path, linkingConfig);

    expect(state?.routes).toHaveLength(1);
    expect(state?.routes[0]?.name).toBe(moduleName);
    expect(state?.routes[0]?.state?.routes.at(-1)?.name).toBe(screenName);
  });

  it('preserves query parameters without adding previous modules', () => {
    const state = getStateFromPath('mapa?vehicleId=unit-15&follow=true', linkingConfig);
    const mapRoute = state?.routes[0]?.state?.routes[0];

    expect(state?.routes).toHaveLength(1);
    expect(mapRoute?.name).toBe('/mapa');
    expect(mapRoute?.params).toEqual({ vehicleId: 'unit-15', follow: 'true' });
  });
});
