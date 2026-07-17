const DEFAULT_TRIAL_DAYS = 7;

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const safeDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(safeDate.getTime()) ? null : safeDate.toISOString();
}

function addDaysToIso(baseValue, days) {
  const safeDate = baseValue ? new Date(baseValue) : new Date();

  if (Number.isNaN(safeDate.getTime())) {
    return null;
  }

  safeDate.setDate(safeDate.getDate() + Math.max(1, Number(days) || DEFAULT_TRIAL_DAYS));
  return safeDate.toISOString();
}

function buildStarterFleet(order) {
  if (Array.isArray(order?.starterFleet) && order.starterFleet.length) {
    return order.starterFleet;
  }

  const units = Math.max(1, Number(order?.fleetSize) || 1);

  return Array.from({ length: units }, (_, index) => {
    const position = String(index + 1).padStart(2, "0");

    return {
      vehicleCode: `${order?.referenceCode || "MNCB"}-U${position}`,
      label: `Unidad ${position}`,
      status: "draft",
      suggestedDriver: `Chofer ${position}`,
      suggestedShift: index % 2 === 0 ? "05:30 - 13:30" : "13:30 - 21:30"
    };
  });
}

function buildOnboardingChecklist(order) {
  if (Array.isArray(order?.onboardingChecklist) && order.onboardingChecklist.length) {
    return order.onboardingChecklist;
  }

  return [
    {
      id: "kickoff",
      title: "Sesión de arranque comercial",
      owner: "comercial",
      status: "pending",
      description: "Alinear patios, responsables y calendario operativo."
    },
    {
      id: "fleet-seed",
      title: "Carga inicial de flotilla",
      owner: "operaciones",
      status: "ready",
      description: `Base sugerida para ${Math.max(1, Number(order?.fleetSize) || 1)} unidades.`
    },
    {
      id: "admin-access",
      title: "Entrega de acceso administrador",
      owner: "soporte",
      status: "pending",
      description: "Compartir referencia comercial, accesos y siguiente paso."
    }
  ];
}

function buildLaunchSummary(order, { isTrial = false } = {}) {
  const fleetCount = Math.max(1, Number(order?.fleetSize) || 1);
  const radioSummary = order?.radioFeatureEnabled
    ? " Radio operativo listo para canal general, punto a punto y notas de voz."
    : "";

  if (isTrial) {
    return `Prueba activa por ${Math.max(1, Number(order?.trialDays) || DEFAULT_TRIAL_DAYS)} días con base inicial para ${fleetCount} unidades.${radioSummary}`;
  }

  return `Cuenta activa con onboarding ${order?.needsOnboarding ? "guiado" : "self-service"} y alta inicial para ${fleetCount} unidades.${radioSummary}`;
}

function buildCommercialActivationUpdate(order, mode = "active") {
  const nowIso = new Date().toISOString();
  const existingTrialStart = toIsoDate(order?.trialStartedAt);
  const isTrial = mode === "trial" || Boolean(order?.requestTrial);
  const trialDays = isTrial
    ? Math.max(1, Number(order?.trialDays) || DEFAULT_TRIAL_DAYS)
    : Math.max(0, Number(order?.trialDays) || 0);
  const activationStatus = mode === "ready" ? "ready_for_activation" : "active";
  const activatedAt = activationStatus === "active" ? toIsoDate(order?.activatedAt) || nowIso : null;
  const trialStartedAt = isTrial ? existingTrialStart || activatedAt || nowIso : null;

  return {
    requestTrial: isTrial,
    trialDays,
    trialStatus: isTrial ? (activationStatus === "active" ? "active" : "scheduled") : "not_requested",
    trialStartedAt,
    trialEndsAt: isTrial ? addDaysToIso(trialStartedAt || nowIso, trialDays) : null,
    activationStatus,
    activationStartedAt: toIsoDate(order?.activationStartedAt) || nowIso,
    activatedAt,
    activationNotes:
      activationStatus === "active"
        ? isTrial
          ? `Prueba de ${trialDays} días activada automáticamente.`
          : "Cuenta activada automáticamente después del pago."
        : "Orden lista para activación operativa.",
    onboardingStatus: order?.needsOnboarding ? "kickoff_pending" : "self_service_ready",
    onboardingChecklist: buildOnboardingChecklist(order),
    fleetSetupStatus: "seeded",
    starterFleet: buildStarterFleet(order),
    launchSummary: buildLaunchSummary(
      {
        ...order,
        trialDays
      },
      { isTrial }
    ),
    status:
      activationStatus === "active"
        ? "active"
        : order?.paymentStatus === "paid"
          ? "paid"
          : order?.status || "new"
  };
}

module.exports = {
  DEFAULT_TRIAL_DAYS,
  buildCommercialActivationUpdate
};
