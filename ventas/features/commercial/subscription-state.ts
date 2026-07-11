import type { PortalSubscription } from '@/src/types/app';
import {
  COMMERCIAL_SUBSCRIPTION_STATES,
  type CommercialStatePresentation,
  type CommercialSubscriptionState,
} from './types';

const API_STATE_MAP: Record<string, CommercialSubscriptionState> = {
  trial: COMMERCIAL_SUBSCRIPTION_STATES.TRIAL,
  trial_active: COMMERCIAL_SUBSCRIPTION_STATES.TRIAL,
  active: COMMERCIAL_SUBSCRIPTION_STATES.ACTIVE,
  pending: COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_PENDING,
  pending_payment: COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_PENDING,
  payment_pending: COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_PENDING,
  failed: COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_FAILED,
  payment_failed: COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_FAILED,
  change_scheduled: COMMERCIAL_SUBSCRIPTION_STATES.CHANGE_SCHEDULED,
  scheduled_change: COMMERCIAL_SUBSCRIPTION_STATES.CHANGE_SCHEDULED,
  suspended: COMMERCIAL_SUBSCRIPTION_STATES.SUSPENDED,
  cancelled: COMMERCIAL_SUBSCRIPTION_STATES.CANCELLED,
  canceled: COMMERCIAL_SUBSCRIPTION_STATES.CANCELLED,
  expired: COMMERCIAL_SUBSCRIPTION_STATES.EXPIRED,
  inactive: COMMERCIAL_SUBSCRIPTION_STATES.INACTIVE,
};

export function resolveCommercialSubscriptionState(status?: string | null): CommercialSubscriptionState {
  return API_STATE_MAP[String(status || '').toLowerCase()] || COMMERCIAL_SUBSCRIPTION_STATES.INACTIVE;
}

export function getCommercialStatePresentation(
  subscription?: PortalSubscription | null
): CommercialStatePresentation {
  const state = resolveCommercialSubscriptionState(subscription?.status);
  const presentations: Record<CommercialSubscriptionState, Omit<CommercialStatePresentation, 'state'>> = {
    TRIAL: {
      label: 'Prueba activa',
      message: 'Estás usando ManeComb durante el periodo de prueba.',
      tone: 'info',
      primaryAction: 'COMPARE_PLAN',
      actionLabel: 'Comparar planes',
      restrictions: [],
    },
    ACTIVE: {
      label: 'Activa',
      message: 'Tu suscripción está activa y lista para operar.',
      tone: 'positive',
      primaryAction: 'COMPARE_PLAN',
      actionLabel: 'Comparar planes',
      restrictions: [],
    },
    PAYMENT_PENDING: {
      label: 'Pago pendiente',
      message: 'Necesitamos confirmar el pago antes de solicitar cambios.',
      tone: 'warning',
      primaryAction: 'REVIEW_PAYMENT',
      actionLabel: 'Revisar pago',
      restrictions: ['Los cambios de plan permanecen bloqueados hasta confirmar el pago.'],
    },
    PAYMENT_FAILED: {
      label: 'Pago rechazado',
      message: 'El último intento de pago no pudo completarse.',
      tone: 'danger',
      primaryAction: 'REVIEW_PAYMENT',
      actionLabel: 'Actualizar método',
      restrictions: ['No es posible solicitar cambios mientras exista un pago rechazado.'],
    },
    CHANGE_SCHEDULED: {
      label: 'Cambio programado',
      message: 'Ya existe un cambio pendiente para esta suscripción.',
      tone: 'info',
      primaryAction: 'NONE',
      actionLabel: 'Cambio en proceso',
      restrictions: ['Espera a que el cambio programado termine antes de solicitar otro.'],
    },
    SUSPENDED: {
      label: 'Suspendida',
      message: 'La cuenta está suspendida y requiere atención.',
      tone: 'danger',
      primaryAction: 'CONTACT_SUPPORT',
      actionLabel: 'Contactar soporte',
      restrictions: ['No se permiten cambios de plan durante la suspensión.'],
    },
    CANCELLED: {
      label: 'Cancelada',
      message: 'La suscripción está cancelada.',
      tone: 'neutral',
      primaryAction: 'REACTIVATE',
      actionLabel: 'Reactivar próximamente',
      restrictions: ['Reactiva la suscripción antes de elegir otro plan.'],
    },
    EXPIRED: {
      label: 'Vencida',
      message: 'El periodo contratado finalizó.',
      tone: 'danger',
      primaryAction: 'REACTIVATE',
      actionLabel: 'Renovar próximamente',
      restrictions: ['Renueva la suscripción antes de solicitar cambios.'],
    },
    INACTIVE: {
      label: 'Sin plan activo',
      message: 'Aún no existe una suscripción activa para esta cuenta.',
      tone: 'neutral',
      primaryAction: 'COMPARE_PLAN',
      actionLabel: 'Explorar planes',
      restrictions: [],
    },
  };

  return { state, ...presentations[state] };
}
