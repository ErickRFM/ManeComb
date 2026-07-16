import type { CommercialPlan, PortalInvoice, PortalSubscription } from '@/src/types/app';
import type {
  CommercialTimelineRepository,
  PlanRepository,
  SubscriptionRepository,
  SubscriptionService,
  SubscriptionValidator,
} from '../contracts';
import { getCommercialStatePresentation } from '../subscription-state';
import {
  COMMERCIAL_ACTIVITY_TYPES,
  COMMERCIAL_SUBSCRIPTION_STATES,
  type CommercialActivity,
  type CommercialChangeSummary,
  type CommercialContextSnapshot,
  type CommercialDashboardModel,
  type CommercialPlanSnapshot,
  type CommercialPlanView,
} from '../types';

function getPlanBenefits(plan: CommercialPlan) {
  return [
    `Control de hasta ${plan.units} unidades`,
    'Acceso al portal administrativo',
    plan.includesRadioModule ? 'Radio operativo incluido' : 'Radio disponible como complemento',
  ];
}

function toPlanView(plan: CommercialPlan): CommercialPlanView {
  return {
    ...plan,
    displayName: plan.name,
    description: plan.subtitle || 'Cobertura flexible para administrar tu operación.',
    benefits: getPlanBenefits(plan),
    indicator: plan.badge,
  };
}

function findCurrentPlan(plans: CommercialPlan[], subscription: PortalSubscription | null) {
  if (!subscription) return null;
  return plans.find((plan) =>
    plan.id === subscription.planId ||
    plan.name === subscription.planName ||
    plan.units === subscription.totalUnits
  ) || null;
}

function toPlanSnapshot(
  plan: CommercialPlan | null,
  subscription?: PortalSubscription | null
): CommercialPlanSnapshot {
  return {
    id: plan?.id || subscription?.planId || null,
    name: plan ? `${plan.units} ${plan.units === 1 ? 'unidad' : 'unidades'}` : subscription?.planName || 'Sin plan',
    units: Number(plan?.units ?? subscription?.totalUnits ?? 0),
    monthlyPrice: Number(subscription?.monthlyPrice ?? plan?.price ?? 0),
    currency: subscription?.currency || 'MXN',
  };
}

function expectedStateLabel(state: string) {
  const labels: Record<string, string> = {
    [COMMERCIAL_SUBSCRIPTION_STATES.TRIAL]: 'Prueba activa',
    [COMMERCIAL_SUBSCRIPTION_STATES.ACTIVE]: 'Activa',
    [COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_PENDING]: 'Pendiente de confirmación',
    [COMMERCIAL_SUBSCRIPTION_STATES.PAYMENT_FAILED]: 'Pago rechazado',
    [COMMERCIAL_SUBSCRIPTION_STATES.CHANGE_SCHEDULED]: 'Cambio programado',
    [COMMERCIAL_SUBSCRIPTION_STATES.SUSPENDED]: 'Suspendida',
    [COMMERCIAL_SUBSCRIPTION_STATES.CANCELLED]: 'Cancelada',
    [COMMERCIAL_SUBSCRIPTION_STATES.EXPIRED]: 'Vencida',
    [COMMERCIAL_SUBSCRIPTION_STATES.INACTIVE]: 'Sin plan activo',
  };
  return labels[state] || 'Sin cambios';
}

function toValidIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createInitialActivities(snapshot: CommercialContextSnapshot): CommercialActivity[] {
  const events: CommercialActivity[] = [];
  const organizationCreatedAt = toValidIsoDate(snapshot.organizationCreatedAt);
  const subscriptionStartedAt = toValidIsoDate(snapshot.subscription?.currentPeriodStart);

  if (organizationCreatedAt) {
    events.push({
      id: 'api-account-created',
      type: COMMERCIAL_ACTIVITY_TYPES.ACCOUNT_CREATED,
      title: 'Empresa creada',
      description: 'La cuenta comercial de ManeComb quedó registrada.',
      occurredAt: organizationCreatedAt,
      status: 'completed',
      source: 'api',
    });
  }

  if (snapshot.subscription && subscriptionStartedAt) {
    events.push({
      id: `api-plan-${snapshot.subscription.id || snapshot.subscription.planId || subscriptionStartedAt}`,
      type: COMMERCIAL_ACTIVITY_TYPES.PLAN_CONTRACTED,
      title: 'Plan contratado',
      description: `${snapshot.subscription.totalUnits} unidades incluidas en la suscripción.`,
      occurredAt: subscriptionStartedAt,
      status: 'completed',
      source: 'api',
      metadata: { planId: snapshot.subscription.planId },
    });
  }

  const latestInvoice = getLatestInvoice(snapshot.invoices);
  const latestInvoiceIssuedAt = toValidIsoDate(latestInvoice?.issuedAt);
  if (latestInvoice && latestInvoiceIssuedAt) {
    events.push({
      id: `api-invoice-${latestInvoice.id}`,
      type: COMMERCIAL_ACTIVITY_TYPES.INVOICE_ISSUED,
      title: latestInvoice.label || 'Comprobante emitido',
      description: `Referencia ${latestInvoice.referenceCode}.`,
      occurredAt: latestInvoiceIssuedAt,
      status: 'completed',
      source: 'api',
      metadata: { invoiceId: latestInvoice.id, total: latestInvoice.total },
    });
  }

  return events;
}
function getLatestInvoice(invoices: PortalInvoice[]) {
  return [...invoices].sort((a, b) =>
    new Date(b.issuedAt || '').getTime() - new Date(a.issuedAt || '').getTime()
  )[0] || null;
}

function isPendingInvoice(invoice: PortalInvoice) {
  return !['paid', 'ready', 'completed'].includes(String(invoice.status || '').toLowerCase());
}

function getRecommendation(input: {
  state: ReturnType<typeof getCommercialStatePresentation>;
  pendingInvoices: PortalInvoice[];
  activationComplete: boolean;
}): CommercialDashboardModel['recommendation'] {
  const { state, pendingInvoices, activationComplete } = input;

  if (state.primaryAction === 'CONTACT_SUPPORT') {
    return {
      title: 'Tu cuenta requiere atención',
      body: state.message,
      label: 'Contactar soporte',
      href: '/portal/perfil?section=soporte',
      icon: 'lifebuoy',
      tone: 'warning',
    };
  }

  if (state.primaryAction === 'REVIEW_PAYMENT') {
    return {
      title: state.label,
      body: state.message,
      label: state.actionLabel,
      href: '/portal/pagos',
      icon: 'credit-card-alert-outline',
      tone: 'warning',
    };
  }

  if (state.state === COMMERCIAL_SUBSCRIPTION_STATES.CHANGE_SCHEDULED) {
    return {
      title: 'Tienes un cambio programado',
      body: state.message,
      label: 'Ver mi plan',
      href: '/portal/plan',
      icon: 'calendar-clock',
      tone: 'info',
    };
  }

  if (pendingInvoices.length) {
    return {
      title: 'Revisa tus documentos pendientes',
      body: `${pendingInvoices.length} ${pendingInvoices.length === 1 ? 'factura necesita' : 'facturas necesitan'} tu atención.`,
      label: 'Revisar facturación',
      href: '/portal/facturacion',
      icon: 'file-alert-outline',
      tone: 'warning',
    };
  }

  if (!activationComplete) {
    return {
      title: 'Termina la configuración inicial',
      body: 'Completa los datos de empresa y los pasos iniciales de tu cuenta.',
      label: 'Continuar activación',
      href: '/portal/onboarding',
      icon: 'flag-checkered',
      tone: 'info',
    };
  }

  return {
    title: 'Explora opciones para crecer',
    body: state.message,
    label: 'Comparar planes',
    href: '/portal/plan',
    icon: 'compare-horizontal',
    tone: state.state === COMMERCIAL_SUBSCRIPTION_STATES.ACTIVE ? 'positive' : 'info',
  };
}

export class DefaultSubscriptionService implements SubscriptionService {
  private snapshot: CommercialContextSnapshot = {
    subscription: null,
    plans: [],
    invoices: [],
  };

  constructor(
    private readonly plans: PlanRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly timeline: CommercialTimelineRepository,
    private readonly validator: SubscriptionValidator
  ) {}

  async synchronize(snapshot: CommercialContextSnapshot) {
    this.snapshot = snapshot;
    await Promise.all([
      this.plans.replace(snapshot.plans),
      this.subscriptions.replace(snapshot.subscription),
      this.timeline.replace(createInitialActivities(snapshot)),
    ]);
  }

  async getWorkspace() {
    const [plans, subscription, activities] = await Promise.all([
      this.plans.list(),
      this.subscriptions.getCurrent(),
      this.timeline.list(),
    ]);
    const currentPlan = findCurrentPlan(plans, subscription);

    return {
      subscription,
      state: getCommercialStatePresentation(subscription),
      plans: plans.map(toPlanView),
      currentPlan: currentPlan ? toPlanView(currentPlan) : null,
      activities,
    };
  }

  async evaluateChange(planId: string): Promise<CommercialChangeSummary> {
    const [plans, subscription, targetPlan] = await Promise.all([
      this.plans.list(),
      this.subscriptions.getCurrent(),
      this.plans.findById(planId),
    ]);
    const currentPlan = findCurrentPlan(plans, subscription);
    const state = getCommercialStatePresentation(subscription);
    const validation = this.validator.validate({ subscription, currentPlan, targetPlan, state });
    const current = toPlanSnapshot(currentPlan, subscription);
    const target = toPlanSnapshot(targetPlan, null);

    return {
      currentPlan: current,
      targetPlan: target,
      changeKind: validation.changeKind,
      unitsDelta: target.units - current.units,
      priceDelta: target.monthlyPrice - current.monthlyPrice,
      benefits: targetPlan ? getPlanBenefits(targetPlan) : [],
      validation,
      expectedStateLabel: expectedStateLabel(validation.expectedState),
      nextStep: validation.nextStep,
    };
  }

  async getDashboardModel({ activationComplete }: { activationComplete: boolean }) {
    const workspace = await this.getWorkspace();
    const pendingInvoices = this.snapshot.invoices.filter(isPendingInvoice);
    const latestInvoice = getLatestInvoice(this.snapshot.invoices);
    const totalUnits = Number(workspace.subscription?.totalUnits || workspace.currentPlan?.units || 0);
    const activeUnits = Number(workspace.subscription?.activeUnits || 0);

    return {
      subscription: workspace.subscription,
      state: workspace.state,
      currentPlan: workspace.currentPlan,
      latestInvoice,
      pendingInvoices,
      totalUnits,
      activeUnits,
      availableUnits: Math.max(0, Number(workspace.subscription?.availableUnits ?? totalUnits - activeUnits)),
      recommendation: getRecommendation({
        state: workspace.state,
        pendingInvoices,
        activationComplete,
      }),
      activities: workspace.activities,
    } satisfies CommercialDashboardModel;
  }
}
