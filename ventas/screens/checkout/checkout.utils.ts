import { Platform } from 'react-native';

export function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

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
