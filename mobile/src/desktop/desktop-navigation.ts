import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { User } from '@/src/types/app';
import { canUserAccessRoute } from '@/src/navigation/route-registry';

export type AppSectionKey =
  | 'mapa'
  | 'incidencias'
  | 'usuarios'
  | 'chat'
  | 'radio'
  | 'checklist'
  | 'perfil';

export type OperationalSectionKey = AppSectionKey;

export type AppSection = {
  key: AppSectionKey;
  href:
    | '/'
    | '/(tabs)'
    | '/mapa'
    | '/incidencias'
    | '/usuarios'
    | '/chat'
    | '/radio'
    | '/checklist'
    | '/perfil';
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const appSections: AppSection[] = [
  {
    key: 'mapa',
    href: '/mapa',
    label: 'Mapa',
    eyebrow: 'Cobertura en vivo',
    title: 'Mapa operativo',
    description: 'Seguimiento amplio de rutas, incidencias y flotilla.',
    icon: 'map-marker-radius',
  },
  {
    key: 'incidencias',
    href: '/incidencias',
    label: 'Alertas',
    eyebrow: 'Seguimiento crítico',
    title: 'Incidencias y escalaciones',
    description: 'Consulta, prioriza y resuelve eventos de la operación.',
    icon: 'alert-octagon',
  },
  {
    key: 'usuarios',
    href: '/usuarios',
    label: 'Directorio',
    eyebrow: 'Operación',
    title: 'Directorio operativo',
    description: 'Consulta personal, estado, unidad y ruta asignada.',
    icon: 'account-group',
  },
  {
    key: 'chat',
    href: '/chat',
    label: 'Chat',
    eyebrow: 'Mensajes y llamadas',
    title: 'Mensajería operativa',
    description: 'Coordina texto, archivos, llamadas y videollamadas desde el mismo chat.',
    icon: 'chat-processing',
  },
  {
    key: 'radio',
    href: '/radio',
    label: 'Radio',
    eyebrow: 'Tap to talk',
    title: 'Radio operativo',
    description: 'Módulo independiente de despacho con audio inmediato y cabina tipo PTT.',
    icon: 'radio-handheld',
  },
  {
    key: 'checklist',
    href: '/checklist',
    label: 'Control',
    eyebrow: 'Salida y llegada',
    title: 'Checklist de flota',
    description: 'Control automático de tiempos, aforo y estado de unidades al entrar o salir.',
    icon: 'clipboard-list-outline',
  },
  {
    key: 'perfil',
    href: '/perfil',
    label: 'Perfil',
    eyebrow: 'Cuenta y documentos',
    title: 'Perfil de usuario',
    description: 'Actualiza tus datos, foto y documentos del sistema.',
    icon: 'account-circle',
  },
];

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/(tabs)' || pathname === '/index') {
    return '/mapa';
  }

  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function getAppSections(user: User) {
  return appSections.filter((section) => canUserAccessRoute(section.href, user));
}

export function getOperationalMenuSections(user: User) {
  return getAppSections(user) as (AppSection & { key: OperationalSectionKey })[];
}

export function getSectionByPathname(pathname: string, user: User) {
  const normalizedPath = normalizePathname(pathname);
  const sections = getAppSections(user);

  return (
    sections.find((section) => {
      const sectionPath = normalizePathname(section.href);

      if (sectionPath === '/') {
        return normalizedPath === '/';
      }

      return (
        normalizedPath === sectionPath ||
        normalizedPath.startsWith(`${sectionPath}/`) ||
        normalizedPath.startsWith(`${sectionPath}-`)
      );
    }) || sections[0]
  );
}
