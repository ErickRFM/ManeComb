import { Platform } from 'react-native';
export { getFirstParam, formatCurrency } from '../shared/utils';

export function openCheckoutUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
  }
}

export function getCheckoutMessage(message: string | null) {
  if (!message) return null;
  if (/MERCADO_PAGO|MERCADOPAGO|\bMP_|variables? (le[ií]das?|obligatorias?)/i.test(message)) {
    return 'El servicio de pago no está disponible en este momento. Intenta de nuevo más tarde o elige otra forma de pago.';
  }
  return message;
}
