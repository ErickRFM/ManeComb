import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { CommercialPlan } from '@/src/types/app';
import { accentByTone, planVisualTones, neonPalette, PUBLIC_DEMO_PLAN_ID } from './constants';
import { buildCheckoutParams } from '@/src/utils/checkout-context';
import type { IconName, PointerVector } from './types';
import { formatCurrency as _formatCurrency, getFirstParam as _getFirstParam } from '../shared/utils';
export const getFirstParam = _getFirstParam;
export function formatCurrency(value: number) {
  return _formatCurrency(value);
}

export function getPlanAccent(plan: CommercialPlan, index: number) {
  const fallback = [neonPalette.cyan, neonPalette.accent, neonPalette.amber, neonPalette.violet];
  return accentByTone[plan.accent] || fallback[index % fallback.length];
}

export function getPlanVisualTone(index: number) {
  return planVisualTones[index % planVisualTones.length];
}

export function isPublicDemoPlan(plan: CommercialPlan | null | undefined) {
  return Boolean(
    plan &&
      plan.id === PUBLIC_DEMO_PLAN_ID &&
      Number(plan.units) === 2 &&
      plan.trialEligible
  );
}

export function buildPlanParams(plan: CommercialPlan, requestTrial = false) {
  return buildCheckoutParams(plan.id, requestTrial && isPublicDemoPlan(plan));
}

export function prefersReducedMotion() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function getStaticRevealStyle(enabled: boolean) {
  return enabled ? { opacity: 1, transform: [{ translateY: 0 }] } : undefined;
}

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event: MediaQueryListEvent | MediaQueryList) => setReducedMotion(event.matches);
    update(media);
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    else media.addListener(update);
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', update);
      else media.removeListener(update);
    };
  }, []);

  return reducedMotion;
}

export function usePointerParallax(enabled: boolean, toTransform: (cursor: PointerVector) => string) {
  const nodeRef = useRef<unknown>(null);
  const toTransformRef = useRef(toTransform);

  useEffect(() => {
    toTransformRef.current = toTransform;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const node = nodeRef.current as HTMLElement | null;

    if (!enabled) {
      if (node) {
        node.style.transform = '';
      }
      return;
    }

    let frame: number | null = null;
    let cursor: PointerVector = { x: 0, y: 0 };

    const apply = () => {
      frame = null;
      const target = nodeRef.current as HTMLElement | null;
      if (target) {
        target.style.transform = toTransformRef.current(cursor);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      cursor = {
        x: (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2,
        y: (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2,
      };

      if (frame === null) {
        frame = window.requestAnimationFrame(apply);
      }
    };

    apply();
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [enabled]);

  return nodeRef;
}

export function webStyle(style: Record<string, unknown>) {
  return Platform.OS === 'web' ? (style as any) : undefined;
}

export function openExternalUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = url;
  }
}

export function normalizePaymentReturnStatus(status?: string) {
  const normalized = String(status || '').trim().toLowerCase();

  if (['approved', 'success', 'paid', 'accredited'].includes(normalized)) {
    return 'success';
  }

  if (['rejected', 'failure', 'cancelled', 'canceled', 'refunded', 'charged_back'].includes(normalized)) {
    return 'failure';
  }

  if (['pending', 'in_process', 'in_mediation', 'authorized'].includes(normalized)) {
    return 'pending';
  }

  return normalized || undefined;
}

export function getCheckoutReturnCopy(status?: string, confirmation?: { status?: string; message?: string }) {
  if (confirmation?.status === 'checking') {
    return {
      icon: 'sync' as IconName,
      title: 'Validando pago',
      body: 'Estamos confirmando el pago con el proveedor disponible.',
      action: 'Ver portal',
      tone: 'pending' as const,
    };
  }

  if (confirmation?.status === 'error') {
    return {
      icon: 'alert-circle-outline' as IconName,
      title: 'No pudimos confirmar el pago',
      body: confirmation.message || 'Revisa el estado del pago desde el portal.',
      action: 'Ver pagos',
      tone: 'danger' as const,
    };
  }

  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'success') {
    return {
      icon: 'check-circle-outline' as IconName,
      title: 'Pago aprobado',
      body: confirmation?.message || 'Tu plan se esta sincronizando con el portal.',
      action: 'Abrir portal',
      tone: 'success' as const,
    };
  }

  if (normalized === 'pending') {
    return {
      icon: 'clock-outline' as IconName,
      title: 'Pago pendiente',
      body: confirmation?.message || 'El proveedor aún no confirma el pago.',
      action: 'Ver pagos',
      tone: 'pending' as const,
    };
  }

  if (normalized === 'failure') {
    return {
      icon: 'alert-circle-outline' as IconName,
      title: 'Pago rechazado',
      body: 'Intenta de nuevo o usa otro método de pago.',
      action: 'Reintentar pago',
      tone: 'danger' as const,
    };
  }

  return null;
}
