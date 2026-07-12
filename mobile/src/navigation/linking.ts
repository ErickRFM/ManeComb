import type { LinkingOptions } from '@react-navigation/native';
import { MODULE_ROUTE_NAMES } from './route-registry';

export const linking: LinkingOptions<any> = {
  prefixes: ['manecomb://', 'mobile://'],
  config: {
    screens: {
      '/': '', '/login': 'login', '/registro': 'registro', '/aplicacion': 'aplicacion',
      '/comercial': 'comercial', '/ventas': 'ventas', '/ventas/login': 'ventas/login',
      '/ventas/registro': 'ventas/registro', '/plan-blocked': 'plan-blocked',
      '/operational-onboarding': 'operational-onboarding', '/sync-error': 'sync-error',
      '/portal': 'portal', '/portal/plan': 'portal/plan', '/portal/usuarios': 'portal/usuarios',
      '/portal/pagos': 'portal/pagos', '/portal/facturacion': 'portal/facturacion',
      '/portal/perfil': 'portal/perfil', '/portal/onboarding': 'portal/onboarding',
      '/portal/comercial': 'portal/comercial', '/perfil-comprador': 'perfil-comprador',
      '/terminos': 'terminos', '/privacidad': 'privacidad', '/modal': 'modal',
      [MODULE_ROUTE_NAMES.map]: { screens: { '/mapa': 'mapa' } },
      [MODULE_ROUTE_NAMES.incidents]: { screens: { '/incidencias': 'incidencias' } },
      [MODULE_ROUTE_NAMES.users]: { screens: { '/usuarios': 'usuarios' } },
      [MODULE_ROUTE_NAMES.chat]: { screens: { '/chat': 'chat' } },
      [MODULE_ROUTE_NAMES.radio]: { screens: { '/radio': 'radio' } },
      [MODULE_ROUTE_NAMES.checklist]: { screens: { '/checklist': 'checklist' } },
      [MODULE_ROUTE_NAMES.profile]: {
        screens: { '/perfil': 'perfil', '/perfil-editar': 'perfil-editar' },
      },
    },
  },
};
