import type { IconName } from './types';

export const SUPPORT_EMAIL = 'ventas@manecomb.com';
export const SUPPORT_PHONE = '81812345678';
export const SYSTEM_STATUS_URL = 'https://manecomb.onrender.com/api/health';
export const PUBLIC_DEMO_PLAN_ID = 'starter-2';

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

export const heroSignals: Array<{
  label: string;
  icon: IconName;
  color: string;
}> = [
  { label: 'GPS y rutas', icon: 'map-marker-path', color: neonPalette.cyan },
  { label: 'Chat, radio y PTT', icon: 'radio-handheld', color: neonPalette.mint },
  { label: 'Llamadas de audio y video', icon: 'phone-in-talk-outline', color: neonPalette.accent },
  { label: 'Documentos y alertas', icon: 'file-document-check-outline', color: neonPalette.violet },
];

export const platformPillars: Array<{
  eyebrow: string;
  title: string;
  body: string;
  icon: IconName;
  color: string;
  features: string[];
}> = [
  {
    eyebrow: 'PREPARA',
    title: 'Flotilla lista antes de salir',
    body: 'Configura unidades, conductores, permisos, documentos y rutas desde el portal administrativo.',
    icon: 'clipboard-check-outline',
    color: neonPalette.violet,
    features: ['Usuarios y roles', 'Documentos', 'Checklist', 'Rutas y paradas'],
  },
  {
    eyebrow: 'SUPERVISA',
    title: 'Operación visible en tiempo real',
    body: 'Consulta ubicación, estado de ruta, ETA, tráfico, jornadas y última posición conocida de cada unidad.',
    icon: 'map-clock-outline',
    color: neonPalette.cyan,
    features: ['GPS en vivo', 'Seguimiento', 'ETA y tráfico', 'Jornadas'],
  },
  {
    eyebrow: 'COORDINA',
    title: 'Todo el equipo en el mismo canal',
    body: 'Conecta despacho, supervisores y conductores con chat, radio, PTT y llamadas directas.',
    icon: 'account-voice',
    color: neonPalette.mint,
    features: ['Chat operativo', 'Radio general', 'PTT', 'Audio y video'],
  },
  {
    eyebrow: 'RESPONDE',
    title: 'Evidencia y acción cuando importa',
    body: 'Registra incidencias, envía alertas, conserva historial y trabaja con sincronización cuando vuelve la red.',
    icon: 'shield-alert-outline',
    color: neonPalette.accent,
    features: ['Incidencias', 'Notificaciones', 'Historial', 'Sincronización'],
  },
];

export const processSteps: Array<{
  title: string;
  body: string;
  icon: IconName;
}> = [
  {
    title: 'Elige tu plan.',
    body: 'Selecciona el paquete que corresponde al tamaño de tu flotilla y actívalo directamente.',
    icon: 'credit-card-outline',
  },
  {
    title: 'Configura tu operación.',
    body: 'Registra empresa, responsables, permisos y estructura administrativa.',
    icon: 'account-cog-outline',
  },
  {
    title: 'Conecta unidades y rutas.',
    body: 'Agrega combis, conductores, documentos, recorridos y jornadas.',
    icon: 'bus-multiple',
  },
  {
    title: 'Opera desde portal y app.',
    body: 'Supervisa, comunica, responde y conserva evidencia en un solo sistema.',
    icon: 'monitor-cellphone',
  },
];

export const trustMetrics: Array<{
  value: string;
  label: string;
  icon: IconName;
  color: string;
}> = [
  {
    value: 'GPS + rutas',
    label: 'Operación en vivo',
    icon: 'map-marker-path',
    color: neonPalette.cyan,
  },
  {
    value: 'Chat + radio',
    label: 'Coordinación del equipo',
    icon: 'radio-handheld',
    color: neonPalette.mint,
  },
  {
    value: 'Roles + docs',
    label: 'Control y evidencia',
    icon: 'shield-account-outline',
    color: neonPalette.violet,
  },
  {
    value: 'Portal + app',
    label: 'Trabajo conectado',
    icon: 'monitor-cellphone',
    color: neonPalette.accent,
  },
];

export const footerColumns = [
  { title: 'Producto', links: ['Funciones', 'App móvil', 'Planes'] },
  { title: 'Empresa', links: ['Nosotros', 'Casos de éxito', 'Contacto'] },
  { title: 'Soporte', links: ['Centro de ayuda', 'Documentación', 'Estado del sistema'] },
  { title: 'Legal', links: ['Privacidad', 'Términos', 'Cookies'] },
];
