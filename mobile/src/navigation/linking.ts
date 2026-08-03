import type { LinkingOptions } from '@react-navigation/native';
import { Linking } from 'react-native';
import { isRecoveryUrlCandidate, parseAuthorizedRecoveryUrl } from '../screens/password-recovery/password-recovery.utils';
import { MODULE_ROUTE_NAMES } from './route-registry';

export function shouldHandleIncomingUrl(url: string) {
  if (parseAuthorizedRecoveryUrl(url).authorized) return true;
  return !isRecoveryUrlCandidate(url);
}

export async function getInitialNavigationUrl() {
  const url = await Linking.getInitialURL();
  return url && shouldHandleIncomingUrl(url) ? url : null;
}

export function subscribeToNavigationUrls(listener: (url: string) => void) {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (shouldHandleIncomingUrl(url)) listener(url);
  });
  return () => subscription.remove();
}

export const linking: LinkingOptions<any> = {
  prefixes: ['https://manecomb.com', 'manecomb://', 'mobile://'],
  getInitialURL: getInitialNavigationUrl,
  subscribe: subscribeToNavigationUrls,
  config: {
    screens: {
      '/': '', '/login': 'login', '/registro': 'registro', '/aplicacion': 'aplicacion',
      '/recuperar-contrasena': 'recuperar-contrasena',
      '/recuperacion-enviada': 'recuperacion-enviada',
      '/acceso-suspendido': 'acceso-suspendido',
      '/nueva-contrasena': 'reset-password',
      '/contrasena-actualizada': 'contrasena-actualizada',
      '/comercial': 'comercial', '/ventas': 'ventas', '/ventas/login': 'ventas/login',
      '/ventas/registro': 'ventas/registro', '/plan-blocked': 'plan-blocked',
      '/operational-onboarding': 'operational-onboarding', '/sync-error': 'sync-error',
      '/portal': 'portal', '/portal/plan': 'portal/plan', '/portal/usuarios': 'portal/usuarios',
      '/portal/pagos': 'portal/pagos', '/portal/facturacion': 'portal/facturacion',
      '/portal/perfil': 'portal/perfil', '/portal/onboarding': 'portal/onboarding',
      '/portal/comercial': 'portal/comercial', '/perfil-comprador': 'perfil-comprador',
      '/terminos': 'terminos', '/privacidad': 'privacidad',
      [MODULE_ROUTE_NAMES.map]: { screens: { '/mapa': 'mapa' } },
      [MODULE_ROUTE_NAMES.incidents]: { screens: { '/incidencias': 'incidencias' } },
      [MODULE_ROUTE_NAMES.users]: { screens: { '/usuarios': 'usuarios' } },
      [MODULE_ROUTE_NAMES.chat]: { screens: { '/chat': 'chat' } },
      [MODULE_ROUTE_NAMES.radio]: { screens: { '/radio': 'radio' } },
      [MODULE_ROUTE_NAMES.checklist]: { screens: { '/checklist': 'checklist' } },
      [MODULE_ROUTE_NAMES.profile]: {
        screens: { '/perfil': 'perfil', '/perfil-editar': 'perfil-editar', '/mis-documentos': 'mis-documentos' },
      },
    },
  },
};
