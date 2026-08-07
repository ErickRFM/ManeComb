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

export function getRadioRouteLabel(route: RadioAudioRoute) {
  return LABELS[route] || LABELS.speaker;
}

export function getRadioRouteIcon(route: RadioAudioRoute) {
  return ICONS[route] || ICONS.speaker;
}

/**
 * Cicla entre las salidas realmente conectadas mas la opcion automatica. No
 * ofrece rutas ausentes: el operador nunca elige un accesorio desconectado.
 */
export function getNextRadioRoute(status: RadioAudioRouteStatus | null): RadioAudioRoute | null {
  if (!status) return null;
  const options: RadioAudioRoute[] = ['auto', ...status.available];
  if (options.length <= 1) return null;

  const currentIndex = options.indexOf(status.requested);
  return options[(currentIndex + 1) % options.length];
}
