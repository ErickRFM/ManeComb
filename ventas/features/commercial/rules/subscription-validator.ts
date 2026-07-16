import type { CommercialPlan, PortalSubscription } from '@/src/types/app';
import type { SubscriptionValidator } from '../contracts';
import {
  CHANGE_VALIDATION_CODES,
  COMMERCIAL_SUBSCRIPTION_STATES,
  PLAN_CHANGE_KINDS,
  type CommercialStatePresentation,
  type PlanChangeKind,
  type PlanChangeValidation,
} from '../types';

function getChangeKind(currentPlan: CommercialPlan | null, targetPlan: CommercialPlan | null): PlanChangeKind {
  if (!currentPlan || !targetPlan || currentPlan.id === targetPlan.id) return PLAN_CHANGE_KINDS.SAME_PLAN;
  if (targetPlan.units !== currentPlan.units) {
    return targetPlan.units > currentPlan.units ? PLAN_CHANGE_KINDS.UPGRADE : PLAN_CHANGE_KINDS.DOWNGRADE;
  }
  return targetPlan.price > currentPlan.price ? PLAN_CHANGE_KINDS.UPGRADE : PLAN_CHANGE_KINDS.DOWNGRADE;
}

function blocked(
  changeKind: PlanChangeKind,
  input: Omit<PlanChangeValidation, 'allowed' | 'changeKind'>
): PlanChangeValidation {
  return { allowed: false, changeKind, ...input };
}

export class DefaultSubscriptionValidator implements SubscriptionValidator {
  validate({
    subscription,
    currentPlan,
    targetPlan,
    state,
  }: {
    subscription: PortalSubscription | null;
    currentPlan: CommercialPlan | null;
    targetPlan: CommercialPlan | null;
    state: CommercialStatePresentation;
  }): PlanChangeValidation {
    const changeKind = getChangeKind(currentPlan, targetPlan);

    if (!targetPlan) {
      return blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.PLAN_NOT_FOUND,
        reason: 'El plan seleccionado ya no está disponible.',
        restrictions: ['Selecciona otra opción del catálogo.'],
        expectedState: state.state,
        outcome: 'La suscripción permanece sin cambios.',
        nextStep: 'Actualiza el catálogo y elige otro plan.',
        action: 'COMPARE_PLAN',
        actionLabel: 'Elegir otro plan',
      });
    }

    if (!subscription || !currentPlan) {
      return blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.NO_ACTIVE_SUBSCRIPTION,
        reason: 'No existe una suscripción activa que pueda modificarse.',
        restrictions: [],
        expectedState: COMMERCIAL_SUBSCRIPTION_STATES.INACTIVE,
        outcome: 'Se preparará una contratación nueva.',
        nextStep: 'Continúa para revisar la contratación inicial.',
        action: 'CONTINUE_CHANGE',
        actionLabel: 'Continuar',
      });
    }

    if (changeKind === PLAN_CHANGE_KINDS.SAME_PLAN) {
      return blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.SAME_PLAN,
        reason: 'Este ya es tu plan actual.',
        restrictions: ['Selecciona un plan diferente para comparar cambios.'],
        expectedState: state.state,
        outcome: 'La suscripción permanece igual.',
        nextStep: 'Elige otra opción del catálogo.',
        action: 'COMPARE_PLAN',
        actionLabel: 'Comparar otro plan',
      });
    }

    const stateBlocks: Partial<Record<CommercialStatePresentation['state'], PlanChangeValidation>> = {
      CHANGE_SCHEDULED: blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.CHANGE_ALREADY_SCHEDULED,
        reason: 'Ya existe un cambio programado.',
        restrictions: state.restrictions,
        expectedState: state.state,
        outcome: 'El cambio anterior conserva su programación.',
        nextStep: 'Espera a que finalice el cambio actual.',
        action: 'NONE',
        actionLabel: 'Cambio en proceso',
      }),
      SUSPENDED: blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.ACCOUNT_SUSPENDED,
        reason: 'La cuenta está suspendida.',
        restrictions: state.restrictions,
        expectedState: state.state,
        outcome: 'No se aplicará ningún cambio.',
        nextStep: 'Contacta a soporte para revisar la cuenta.',
        action: 'CONTACT_SUPPORT',
        actionLabel: 'Contactar soporte',
      }),
      CANCELLED: blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.ACCOUNT_CANCELLED,
        reason: 'La suscripción está cancelada.',
        restrictions: state.restrictions,
        expectedState: state.state,
        outcome: 'No se aplicará ningún cambio.',
        nextStep: 'Contacta a soporte para revisar una nueva contratación.',
        action: 'CONTACT_SUPPORT',
        actionLabel: 'Contactar soporte',
      }),
      EXPIRED: blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.ACCOUNT_EXPIRED,
        reason: 'La suscripción está vencida.',
        restrictions: state.restrictions,
        expectedState: state.state,
        outcome: 'No se aplicará ningún cambio.',
        nextStep: 'Contacta a soporte para revisar una nueva contratación.',
        action: 'CONTACT_SUPPORT',
        actionLabel: 'Contactar soporte',
      }),
      PAYMENT_PENDING: blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.PAYMENT_REQUIRED,
        reason: 'Hay un pago pendiente de confirmación.',
        restrictions: state.restrictions,
        expectedState: state.state,
        outcome: 'El plan actual permanece sin cambios.',
        nextStep: 'Confirma el pago pendiente para continuar.',
        action: 'REVIEW_PAYMENT',
        actionLabel: 'Revisar pago',
      }),
      PAYMENT_FAILED: blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.PAYMENT_FAILED,
        reason: 'El último pago fue rechazado.',
        restrictions: state.restrictions,
        expectedState: state.state,
        outcome: 'El plan actual permanece sin cambios.',
        nextStep: 'Actualiza el método de pago antes de continuar.',
        action: 'REVIEW_PAYMENT',
        actionLabel: 'Actualizar método',
      }),
    };

    const stateBlock = stateBlocks[state.state];
    if (stateBlock) return stateBlock;

    if (changeKind === PLAN_CHANGE_KINDS.DOWNGRADE && subscription.activeUnits > targetPlan.units) {
      return blocked(changeKind, {
        code: CHANGE_VALIDATION_CODES.ACTIVE_USAGE_EXCEEDS_TARGET,
        reason: `Actualmente utilizas ${subscription.activeUnits} unidades y el nuevo plan permite ${targetPlan.units}.`,
        restrictions: [`Libera ${subscription.activeUnits - targetPlan.units} unidades antes de solicitar el cambio.`],
        expectedState: state.state,
        outcome: 'La suscripción conserva su capacidad actual.',
        nextStep: 'Reduce el uso de unidades y vuelve a comparar.',
        action: 'RESOLVE_USAGE',
        actionLabel: 'Revisar uso',
      });
    }

    const expectedState = state.state;

    return {
      allowed: true,
      code: CHANGE_VALIDATION_CODES.ALLOWED,
      changeKind,
      reason: changeKind === PLAN_CHANGE_KINDS.UPGRADE
        ? 'Puedes aplicar esta ampliación de cobertura.'
        : 'Puedes aplicar este cambio de capacidad.',
      restrictions: [],
      expectedState,
      outcome: 'El plan, la capacidad y el importe mensual se actualizarán inmediatamente.',
      nextStep: 'Confirma el cambio mostrado en este resumen.',
      action: 'CONTINUE_CHANGE',
      actionLabel: 'Continuar',
    };
  }
}
