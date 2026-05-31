import type { CommercialPlan } from '@/src/types/app';

export const FALLBACK_COMMERCIAL_PLANS: CommercialPlan[] = [
  {
    id: 'starter-2',
    name: '2 combis',
    units: 2,
    price: 149,
    pricePerVehicle: 74.5,
    strategy: 'Entrada',
    badge: 'Arranque rápido',
    accent: 'info',
    subtitle: 'Ideal para pilotos y patios pequeños',
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: 20,
  },
  {
    id: 'value-4',
    name: '4 combis',
    units: 4,
    price: 209,
    pricePerVehicle: 52.3,
    strategy: 'Mejor valor',
    badge: 'Más vendido',
    accent: 'success',
    subtitle: 'El punto de entrada más balanceado',
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: 20,
  },
  {
    id: 'control-6',
    name: '6 combis',
    units: 6,
    price: 299,
    pricePerVehicle: 49.8,
    strategy: 'Ajustado',
    badge: 'Operación estable',
    accent: 'warning',
    subtitle: 'Pensado para crecimiento con control operativo',
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: 20,
  },
  {
    id: 'premium-8',
    name: '8 combis',
    units: 8,
    price: 449,
    pricePerVehicle: 56.1,
    strategy: 'Premium',
    badge: 'Cobertura total',
    accent: 'danger',
    subtitle: 'Mayor cobertura, supervisores y evidencia',
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: true,
    radioAddonEligible: false,
    radioAddonPrice: 0,
  },
  {
    id: 'enterprise-12',
    name: '12 combis',
    units: 12,
    price: 749,
    pricePerVehicle: 62.4,
    strategy: 'Empresas',
    badge: 'Escala multi patio',
    accent: 'info',
    subtitle: 'Multi patio, onboarding y despliegue empresarial',
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: true,
    radioAddonEligible: false,
    radioAddonPrice: 0,
  },
];

export const COMMERCIAL_HIGHLIGHTS = [
  'Monitoreo en vivo por unidad, ruta y conductor',
  'Incidencias, documentos, alertas y chat operativo en una sola consola',
  'Radio operativo opcional con canal general, punto a punto y notas de voz',
  'Prueba de 7 días con onboarding comercial y base inicial de flotilla',
];

export const COMMERCIAL_FEATURES = [
  {
    title: 'Mapa con seguimiento real',
    body: 'Sigue cada combi, cambia de unidad activa y revisa rutas, GPS y estado en segundos.',
    icon: 'map-marker-radius',
  },
  {
    title: 'Control documental',
    body: 'Licencias, seguros y verificaciones con alertas visibles antes de que caduquen.',
    icon: 'file-document-outline',
  },
  {
    title: 'Chat operativo',
    body: 'Conductores, supervisores y centro de control coordinados desde la misma app.',
    icon: 'message-text-outline',
  },
  {
    title: 'Radio con voz',
    body: 'Canal general y punto a punto con notas de voz para despachar más rápido.',
    icon: 'radio-handheld',
  },
  {
    title: 'Bitácora y rendimiento',
    body: 'Tiempo de recorrido, vueltas por fecha y evidencia para medir puntualidad.',
    icon: 'chart-timeline-variant',
  },
];

export const COMMERCIAL_STEPS = [
  {
    title: '1. Elige tu plan',
    body: 'Selecciona el paquete ideal para el tamaño actual de tu flotilla.',
  },
  {
    title: '2. Registra tu operación',
    body: 'Deja tus datos, elige SPEI o pasarela y define si necesitas onboarding guiado o factura.',
  },
  {
    title: '3. Activa y escala',
    body: 'Pagas con referencia comercial, confirmas el cobro y dejas lista la implementación.',
  },
];

export const COMMERCIAL_FAQS = [
  {
    question: '¿El precio es por mes?',
    answer: 'La landing presenta los paquetes como mensualidad comercial por número de combis activas.',
  },
  {
    question: '¿Puedo arrancar con pocas unidades?',
    answer: 'Sí. El plan de 2 combis es la puerta de entrada para operadores pequeños o pilotos.',
  },
  {
    question: '¿La app sirve para supervisores y administración?',
    answer: 'Sí. La plataforma centraliza choferes, incidencias, documentos, seguimiento y control.',
  },
  {
    question: '¿El pago queda automatizado?',
    answer: 'Si configuras Mercado Pago, el checkout abre pago real. Mientras tanto, SPEI y transferencia siguen un flujo profesional con referencia comercial, y la prueba de 7 días no cobra al instante.',
  },
];

export const COMMERCIAL_PAYMENT_METHODS = [
  {
    id: 'card',
    label: 'Tarjeta',
    helper: 'Pasarela segura cuando la integración automática está activa',
    icon: 'credit-card-outline',
  },
  {
    id: 'spei',
    label: 'SPEI',
    helper: 'Transferencia inmediata con referencia comercial',
    icon: 'bank-transfer',
  },
  {
    id: 'transfer',
    label: 'Transferencia',
    helper: 'Compra empresarial con validación administrativa',
    icon: 'bank-outline',
  },
] as const;
