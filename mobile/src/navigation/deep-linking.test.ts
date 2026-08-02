import { getStateFromPath } from '@react-navigation/native';
import { Linking } from 'react-native';
import {
  getInitialNavigationUrl,
  linking,
  shouldHandleIncomingUrl,
  subscribeToNavigationUrls,
} from './linking';
import { MODULE_ROUTE_NAMES } from './route-registry';
import {
  PASSWORD_RECOVERY_RESEND_SECONDS,
  isPasswordAllowed,
  isValidRecoveryEmail,
  maskRecoveryEmail,
  normalizeRecoveryToken,
  parseAuthorizedRecoveryUrl,
} from '../screens/password-recovery/password-recovery.utils';

const linkingConfig = linking.config as Parameters<typeof getStateFromPath>[1];

describe('isolated deep linking', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
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

  it('abre el flujo de nueva contraseña y conserva un token HTTPS', () => {
    const state = getStateFromPath('reset-password?token=token-seguro', linkingConfig);

    expect(state?.routes).toHaveLength(1);
    expect(state?.routes[0]?.name).toBe('/nueva-contrasena');
    expect(state?.routes[0]?.params).toEqual({ token: 'token-seguro' });
  });

  it('valida el contrato funcional de recuperación', () => {
    expect(isValidRecoveryEmail('')).toBe(false);
    expect(isValidRecoveryEmail('usuario@correo.com')).toBe(true);
    expect(maskRecoveryEmail('usuario@correo.com')).toBe('u***@correo.com');
    expect(isPasswordAllowed('solo-letras')).toBe(false);
    expect(isPasswordAllowed('Ruta123!')).toBe(true);
    expect(normalizeRecoveryToken(['a', 'b'])).toBe('');
    expect(PASSWORD_RECOVERY_RESEND_SECONDS).toBe(45);
  });

  it('acepta solo el dominio y path autorizados con un único token', () => {
    expect(parseAuthorizedRecoveryUrl('https://manecomb.com/reset-password?token=abc')).toEqual({ authorized: true, token: 'abc' });
    expect(parseAuthorizedRecoveryUrl('manecomb://reset-password?token=abc')).toEqual({ authorized: true, token: 'abc' });
    expect(parseAuthorizedRecoveryUrl('https://evil.test/reset-password?token=abc')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('https://sub.manecomb.com/reset-password?token=abc')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('http://manecomb.com/reset-password?token=abc')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('https://manecomb.com/otra?token=abc')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('https://manecomb.com/reset-password')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('https://manecomb.com/reset-password?token=a&token=b')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('mobile://reset-password?token=abc')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('arbitrario://reset-password?token=abc')).toEqual({ authorized: false, token: '' });
    expect(parseAuthorizedRecoveryUrl('no-es-url')).toEqual({ authorized: false, token: '' });
  });

  it('filtra la URL inicial cuando la app estaba cerrada', async () => {
    const getInitialUrl = jest.spyOn(Linking, 'getInitialURL');
    getInitialUrl.mockResolvedValueOnce('mobile://reset-password?token=abc');
    await expect(getInitialNavigationUrl()).resolves.toBeNull();

    const validUrl = 'https://manecomb.com/reset-password?token=abc';
    getInitialUrl.mockResolvedValueOnce(validUrl);
    await expect(getInitialNavigationUrl()).resolves.toBe(validUrl);
  });

  it('filtra eventos con la app activa o en background', () => {
    let emitUrl: ((event: { url: string }) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(Linking, 'addEventListener').mockImplementation((_, listener) => {
      emitUrl = listener as (event: { url: string }) => void;
      return { remove } as never;
    });
    const listener = jest.fn();
    const unsubscribe = subscribeToNavigationUrls(listener);

    emitUrl?.({ url: 'https://evil.test/reset-password?token=abc' });
    emitUrl?.({ url: 'https://manecomb.com/reset-password?token=a&token=b' });
    emitUrl?.({ url: 'manecomb://reset-password?token=valid' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('manecomb://reset-password?token=valid');
    expect(shouldHandleIncomingUrl('mobile://chat')).toBe(true);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
