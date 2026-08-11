import type { RadioAudioRoute, RadioAudioRouteStatus } from '@/src/native/audio';

const LABELS: Record<RadioAudioRoute, string> = {
  auto: 'Automatica',
  bluetooth: 'Bluetooth',
  wired: 'Auriculares',
  speaker: 'Altavoz',
  earpiece: 'Auricular',
};

const ICONS: Record<RadioAudioRoute, string> = {
  auto: 'volume-high',
  bluetooth: 'bluetooth-audio',
  wired: 'headphones',
  speaker: 'volume-high',
  earpiece: 'phone-in-talk',
};

const AUTO_PRIORITY: Exclude<RadioAudioRoute, 'auto'>[] = [
  'bluetooth',
  'wired',
  'speaker',
  'earpiece',
];

export function getRadioRouteLabel(route: RadioAudioRoute) {
  return LABELS[route] || LABELS.speaker;
}

export function getRadioRouteIcon(route: RadioAudioRoute) {
  return ICONS[route] || ICONS.speaker;
}

function getAutomaticRoute(available: RadioAudioRouteStatus['available']) {
  return AUTO_PRIORITY.find((route) => available.includes(route)) || null;
}

/**
 * Cicla entre las salidas realmente presentes y evita un primer toque que no
 * cambie nada. Cuando `auto` ya esta resolviendo al accesorio activo, salta
 * directo a la siguiente salida fisica; si no existe otra salida, no ofrece el
 * cambio. Una preferencia que desaparecio se normaliza de vuelta a `auto`.
 */
export function getNextRadioRoute(status: RadioAudioRouteStatus | null): RadioAudioRoute | null {
  if (!status) return null;

  const available = Array.from(new Set(status.available));
  if (
    status.requested !== 'auto' &&
    !available.includes(status.requested as Exclude<RadioAudioRoute, 'auto'>)
  ) {
    return 'auto';
  }

  const options: RadioAudioRoute[] = ['auto', ...available];
  if (options.length <= 1) return null;

  const currentIndex = options.indexOf(status.requested);
  const automaticRoute = getAutomaticRoute(available);

  for (let offset = 1; offset < options.length; offset += 1) {
    const candidate = options[(currentIndex + offset) % options.length];
    const resolvedRoute = candidate === 'auto' ? automaticRoute : candidate;

    if (resolvedRoute && resolvedRoute !== status.active) {
      return candidate;
    }
  }

  return null;
}
