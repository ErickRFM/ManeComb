const RADIO_ADDON_CODE = "radio_dispatch";
const RADIO_ADDON_PRICE = 20;

function buildRadioAddon({ included = false } = {}) {
  return {
    code: RADIO_ADDON_CODE,
    name: "Radio operativo",
    price: included ? 0 : RADIO_ADDON_PRICE,
    included,
    description:
      "Canal grupal general, radio punto a punto y notas de voz operativas."
  };
}

const COMMERCIAL_PLANS = [
  {
    id: "starter-2",
    name: "2 combis",
    units: 2,
    price: 149,
    pricePerVehicle: 74.5,
    strategy: "Entrada",
    badge: "Arranque rápido",
    accent: "info",
    subtitle: "Ideal para pilotos y patios pequeños",
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: RADIO_ADDON_PRICE
  },
  {
    id: "value-4",
    name: "4 combis",
    units: 4,
    price: 209,
    pricePerVehicle: 52.3,
    strategy: "Mejor valor",
    badge: "Más vendido",
    accent: "success",
    subtitle: "El punto de entrada más balanceado",
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: RADIO_ADDON_PRICE
  },
  {
    id: "control-6",
    name: "6 combis",
    units: 6,
    price: 299,
    pricePerVehicle: 49.8,
    strategy: "Ajustado",
    badge: "Operación estable",
    accent: "warning",
    subtitle: "Pensado para crecimiento con control operativo",
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: RADIO_ADDON_PRICE
  },
  {
    id: "premium-8",
    name: "8 combis",
    units: 8,
    price: 449,
    pricePerVehicle: 56.1,
    strategy: "Premium",
    badge: "Cobertura total",
    accent: "danger",
    subtitle: "Mayor cobertura, supervisores y evidencia",
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: true,
    radioAddonEligible: false,
    radioAddonPrice: 0
  },
  {
    id: "enterprise-12",
    name: "12 combis",
    units: 12,
    price: 749,
    pricePerVehicle: 62.4,
    strategy: "Empresas",
    badge: "Escala multi patio",
    accent: "info",
    subtitle: "Multi patio, onboarding y despliegue empresarial",
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: true,
    radioAddonEligible: false,
    radioAddonPrice: 0
  }
];

function normalizeSelectedAddOns(selectedAddOns = []) {
  if (!Array.isArray(selectedAddOns)) {
    return [];
  }

  return Array.from(
    new Set(
      selectedAddOns
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
}

function buildCommercialAddOns(plan, selectedAddOns = []) {
  if (!plan) {
    return [];
  }

  if (plan.includesRadioModule) {
    return [buildRadioAddon({ included: true })];
  }

  const safeSelectedAddOns = normalizeSelectedAddOns(selectedAddOns);

  if (!plan.radioAddonEligible || !safeSelectedAddOns.includes(RADIO_ADDON_CODE)) {
    return [];
  }

  return [buildRadioAddon({ included: false })];
}

function getCommercialPlanPricing(plan, selectedAddOns = []) {
  const addOns = buildCommercialAddOns(plan, selectedAddOns);
  const addOnsTotal = addOns.reduce((sum, addOn) => sum + Number(addOn.price || 0), 0);

  return {
    basePlanPrice: Number(plan?.price || 0),
    addOns,
    addOnsTotal,
    totalPrice: Number(plan?.price || 0) + addOnsTotal,
    radioFeatureEnabled: addOns.some((addOn) => addOn.code === RADIO_ADDON_CODE)
  };
}

function listCommercialPlans() {
  return COMMERCIAL_PLANS.map((plan) => ({
    ...plan
  }));
}

function getCommercialPlanById(planId) {
  return COMMERCIAL_PLANS.find((plan) => plan.id === planId) || null;
}

module.exports = {
  COMMERCIAL_PLANS,
  RADIO_ADDON_CODE,
  RADIO_ADDON_PRICE,
  buildCommercialAddOns,
  getCommercialPlanById,
  getCommercialPlanPricing,
  listCommercialPlans
};
