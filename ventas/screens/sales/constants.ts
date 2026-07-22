import type { IconName } from './types';

export const SUPPORT_EMAIL = 'ventas@manecomb.com';
export const SUPPORT_PHONE = '81812345678';
export const SYSTEM_STATUS_URL = 'https://manecomb.onrender.com/api/health';

export const accentByTone = {
  info: '#00C2FF',
  success: '#FF2D7A',
  warning: '#FF8A3D',
  danger: '#FF2D7A',
} as const;

export const neonPalette = {
  background: '#050816',
  backgroundAlt: '#070B1D',
  panel: 'rgba(9, 15, 34, 0.78)',
  panelStrong: 'rgba(10, 17, 39, 0.92)',
  panelSoft: 'rgba(255, 255, 255, 0.055)',
  line: 'rgba(245, 247, 255, 0.12)',
  lineStrong: 'rgba(245, 247, 255, 0.22)',
  text: '#F5F7FF',
  muted: '#8A93B2',
  mutedStrong: '#B7BED8',
  accent: '#FF2D7A',
  accentSoft: 'rgba(255, 45, 122, 0.13)',
  accentGlow: 'rgba(255, 45, 122, 0.5)',
  violet: '#7A3CFF',
  violetSoft: 'rgba(122, 60, 255, 0.16)',
  cyan: '#00C2FF',
  cyanSoft: 'rgba(0, 194, 255, 0.14)',
  mint: '#2FFFD5',
  mintSoft: 'rgba(47, 255, 213, 0.12)',
  amber: '#FF8A3D',
} as const;

export const planVisualTones = [
  {
    edge: '#00C2FF',
    secondary: '#2FFFD5',
    violet: '#7A3CFF',
    soft: 'rgba(0, 194, 255, 0.16)',
    secondarySoft: 'rgba(47, 255, 213, 0.11)',
    violetSoft: 'rgba(122, 60, 255, 0.13)',
    cursor: 'rgba(0, 194, 255, 0.34)',
  },
  {
    edge: '#FF2D7A',
    secondary: '#00C2FF',
    violet: '#7A3CFF',
    soft: 'rgba(255, 45, 122, 0.15)',
    secondarySoft: 'rgba(0, 194, 255, 0.11)',
    violetSoft: 'rgba(122, 60, 255, 0.13)',
    cursor: 'rgba(255, 45, 122, 0.34)',
  },
  {
    edge: '#FF8A3D',
    secondary: '#FF2D7A',
    violet: '#7A3CFF',
    soft: 'rgba(255, 138, 61, 0.14)',
    secondarySoft: 'rgba(255, 45, 122, 0.11)',
    violetSoft: 'rgba(122, 60, 255, 0.12)',
    cursor: 'rgba(255, 138, 61, 0.32)',
  },
  {
    edge: '#FF2D7A',
    secondary: '#2FFFD5',
    violet: '#7A3CFF',
    soft: 'rgba(255, 45, 122, 0.15)',
    secondarySoft: 'rgba(47, 255, 213, 0.1)',
    violetSoft: 'rgba(122, 60, 255, 0.13)',
    cursor: 'rgba(255, 45, 122, 0.34)',
  },
  {
    edge: '#7A3CFF',
    secondary: '#00C2FF',
    violet: '#FF2D7A',
    soft: 'rgba(122, 60, 255, 0.16)',
    secondarySoft: 'rgba(0, 194, 255, 0.1)',
    violetSoft: 'rgba(255, 45, 122, 0.11)',
    cursor: 'rgba(122, 60, 255, 0.32)',
  },
] as const;

export const benefits: Array<{
  title: string;
  body: string;
  icon: IconName;
  color: string;
}> = [
  {
    title: 'Monitoreo en tiempo real',
    body: 'Ubica cada unidad en mapa vivo, con estado de ruta, velocidad y actividad operativa.',
    icon: 'map-marker-path',
    color: neonPalette.cyan,
  },
  {
    title: 'Comunicación instantánea',
    body: 'Coordina conductores, supervisores y despacho desde una misma plataforma.',
    icon: 'message-processing-outline',
    color: neonPalette.mint,
  },
  {
    title: 'Alertas y notificaciones',
    body: 'Recibe avisos críticos sobre eventos, vencimientos, incidencias y operación diaria.',
    icon: 'bell-ring-outline',
    color: neonPalette.accent,
  },
  {
    title: 'Gestión documental',
    body: 'Centraliza licencias, seguros, verificaciones y documentos de cada unidad.',
    icon: 'file-document-check-outline',
    color: neonPalette.mint,
  },
  {
    title: 'Historial de viajes',
    body: 'Consulta rutas, paradas y recorridos anteriores para auditar la operación.',
    icon: 'history',
    color: neonPalette.violet,
  },
  {
    title: 'Analítica operativa',
    body: 'Detecta patrones, mide disponibilidad y toma mejores decisiones de flotilla.',
    icon: 'chart-line-variant',
    color: neonPalette.accent,
  },
];

export const processSteps: Array<{
  title: string;
  body: string;
  icon: IconName;
}> = [
  {
    title: 'Selecciona tu plan.',
    body: 'Elige el paquete que coincide con el tamaño de tu flotilla.',
    icon: 'credit-card-outline',
  },
  {
    title: 'Crea tu cuenta.',
    body: 'Registra tu empresa y deja listo el acceso administrativo.',
    icon: 'account-plus-outline',
  },
  {
    title: 'Activa tus unidades.',
    body: 'Agrega combis, conductores y permisos desde el portal.',
    icon: 'bus-multiple',
  },
  {
    title: 'Accede a tu panel.',
    body: 'Monitorea GPS, alertas, documentos y comunicación.',
    icon: 'monitor-dashboard',
  },
];

export const trustMetrics: Array<{
  value: string;
  label: string;
  icon: IconName;
  color: string;
}> = [
  {
    value: '99.8%',
    label: 'Disponibilidad',
    icon: 'shield-check-outline',
    color: neonPalette.cyan,
  },
  {
    value: '< 5 min',
    label: 'Implementación',
    icon: 'timer-outline',
    color: neonPalette.violet,
  },
  {
    value: '24/7',
    label: 'Soporte',
    icon: 'headset',
    color: neonPalette.accent,
  },
  {
    value: 'Datos',
    label: 'Seguridad',
    icon: 'lock-check-outline',
    color: neonPalette.mint,
  },
];

export const footerColumns = [
  { title: 'Producto', links: ['Funciones', 'Planes', 'Demo'] },
  { title: 'Empresa', links: ['Nosotros', 'Casos de éxito', 'Contacto'] },
  { title: 'Soporte', links: ['Centro de ayuda', 'Documentación', 'Estado del sistema'] },
  { title: 'Legal', links: ['Privacidad', 'Términos', 'Cookies'] },
];
