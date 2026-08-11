const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const mongoose = require("mongoose");
const { connectDB, getDbState } = require("../src/config/db");
const { getCommercialPlanById } = require("../src/config/commercial-plans");
const {
  CommercialLeadModel,
  TrialEntitlementModel,
  UserModel
} = require("../src/data/models");
const { evaluateTrialEligibility } = require("../src/services/commercial-activation");
const {
  DEFAULT_INTERNAL_DEMO_DAYS,
  DEFAULT_INTERNAL_DEMO_PLAN_ID,
  buildInternalDemoOrder,
  evaluateInternalDemoGrant,
  isInternalDemoOrder
} = require("../src/services/internal-demo-access");
const {
  buildSubscription,
  deriveSubscriptionStatus,
  pickActiveOrder
} = require("../src/services/portal-account");

function getArgValue(name) {
  const direct = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toPlain(doc) {
  if (!doc) return null;
  const value = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    ...value,
    id: String(value.id || value._id || "").trim()
  };
}

function getOrganizationId(user) {
  return String(user?.organizationId || "").trim();
}

async function findOrders(user) {
  const userId = String(user?.id || user?._id || "").trim();
  const organizationId = getOrganizationId(user);
  const email = normalize(user?.email);
  const query = {
    $or: [
      ...(userId ? [{ ownerUserId: userId }] : []),
      ...(organizationId ? [{ organizationId }, { organizationSlug: organizationId }] : []),
      ...(email ? [{ ownerAccountEmail: email }, { email }] : [])
    ]
  };
  const orders = await CommercialLeadModel.find(query).sort({ createdAt: -1 }).lean();
  return orders.map(toPlain);
}

function getTrialMessage(code) {
  const messages = {
    eligible: "La organización todavía puede usar la prueba pública de 7 días del plan de 2 combis.",
    trial_already_active: "La organización ya tiene una prueba pública activa.",
    trial_already_consumed: "La organización ya utilizó su única prueba pública.",
    trial_already_consumed_entitlement: "Existe un entitlement de prueba consumido para esta organización.",
    paid_subscription_exists: "Existe una suscripción pagada; la prueba pública ya no está disponible.",
    trial_only_available_for_starter_2: "La prueba pública solo existe para el plan de 2 combis.",
    trial_organization_required: "La cuenta no tiene organizationId y no puede evaluar prueba.",
    trial_configuration_invalid: "La configuración del plan de prueba no cumple el contrato.",
    trial_units_policy_mismatch: "La capacidad del plan de prueba no coincide con el contrato."
  };
  return messages[code] || `La prueba pública no está disponible (${code}).`;
}

function buildOrderSummary(order) {
  return {
    id: order.id,
    referenceCode: order.referenceCode,
    planId: order.planId,
    planName: order.planName,
    fleetSize: Number(order.fleetSize || 0),
    paymentProvider: order.paymentProvider || null,
    paymentStatus: order.paymentStatus || null,
    activationStatus: order.activationStatus || null,
    trialStatus: order.trialStatus || null,
    requestTrial: Boolean(order.requestTrial),
    status: deriveSubscriptionStatus(order),
    internalDemo: isInternalDemoOrder(order),
    createdAt: order.createdAt || null,
    currentPeriodEnd: order.currentPeriodEnd || null,
    trialEndsAt: order.trialEndsAt || null,
    cancelledAt: order.cancelledAt || null
  };
}

function buildPublicTrialDiagnostic({ organizationId, orders, entitlement }) {
  const starterPlan = getCommercialPlanById("starter-2");
  const eligibility = evaluateTrialEligibility({
    organizationId,
    existingOrders: orders,
    requestedPlan: starterPlan,
    now: new Date()
  });
  const code = entitlement && eligibility.eligible
    ? "trial_already_consumed_entitlement"
    : eligibility.code;
  const eligible = Boolean(eligibility.eligible && !entitlement);

  return {
    eligible,
    code,
    message: getTrialMessage(code),
    entitlement: entitlement
      ? {
          id: String(entitlement._id || ""),
          planId: entitlement.planId,
          status: entitlement.status,
          orderId: entitlement.orderId,
          trialStartedAt: entitlement.trialStartedAt || null,
          trialEndsAt: entitlement.trialEndsAt || null,
          consumedAt: entitlement.consumedAt || null
        }
      : null
  };
}

async function main() {
  const email = normalize(getArgValue("--email"));
  const planId = String(getArgValue("--plan") || DEFAULT_INTERNAL_DEMO_PLAN_ID).trim();
  const durationDays = Number(getArgValue("--days") || DEFAULT_INTERNAL_DEMO_DAYS);
  const confirmation = normalize(getArgValue("--confirm"));
  const apply = hasFlag("--apply");

  if (!email) {
    throw new Error(
      "Uso: node scripts/manage-demo-account.js --email usuario@dominio.com [--plan enterprise-12 --days 30] [--apply --confirm usuario@dominio.com]"
    );
  }

  await connectDB();
  if (!getDbState().connected) {
    throw new Error("MongoDB no está conectado. Revisa MONGO_URI/MONGO_DB_NAME.");
  }

  const userDoc = await UserModel.findOne({ email }).lean();
  const user = toPlain(userDoc);
  if (!user) {
    throw new Error(`No existe una cuenta con el correo ${email}.`);
  }

  const role = normalize(user.role);
  const accountType = normalize(user.accountType);
  if (role !== "owner" || accountType !== "company_owner") {
    throw new Error("La herramienta solo puede administrar cuentas owner/company_owner comerciales.");
  }

  const organizationId = getOrganizationId(user);
  if (!organizationId) {
    throw new Error("La cuenta no tiene organizationId; corrige primero la identidad del tenant.");
  }

  const [orders, entitlement] = await Promise.all([
    findOrders(user),
    TrialEntitlementModel.findOne({ organizationId }).lean()
  ]);
  const activeOrder = pickActiveOrder(orders);
  const demoDecision = evaluateInternalDemoGrant({
    existingOrders: orders,
    planId,
    durationDays,
    now: new Date()
  });
  const proposedDemo = demoDecision.allowed
    ? buildInternalDemoOrder({ user, existingOrders: orders, planId, durationDays, now: new Date() })
    : null;

  const report = {
    ok: true,
    readOnly: !apply,
    inspectedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accountType: user.accountType,
      organizationId,
      companyName: user.companyProfile?.companyName || ""
    },
    current: {
      activeOrderId: activeOrder?.id || null,
      subscription: buildSubscription(activeOrder),
      orders: orders.map(buildOrderSummary)
    },
    publicTrial: buildPublicTrialDiagnostic({ organizationId, orders, entitlement }),
    requestedInternalDemo: {
      planId,
      durationDays,
      decision: demoDecision,
      preview: proposedDemo
        ? {
            planId: proposedDemo.planId,
            planName: proposedDemo.planName,
            fleetSize: proposedDemo.fleetSize,
            paymentStatus: proposedDemo.paymentStatus,
            paymentProvider: proposedDemo.paymentProvider,
            currentPeriodStart: proposedDemo.currentPeriodStart,
            currentPeriodEnd: proposedDemo.currentPeriodEnd,
            radioFeatureEnabled: proposedDemo.radioFeatureEnabled
          }
        : null
    }
  };

  if (!apply) {
    console.log(JSON.stringify({
      ...report,
      message: demoDecision.allowed
        ? "DRY RUN: se puede otorgar acceso demo interno sin tocar la prueba pública ni su historial."
        : "DRY RUN: el acceso demo interno fue bloqueado por la política de seguridad."
    }, null, 2));
    return;
  }

  if (confirmation !== email) {
    throw new Error("Para aplicar cambios, --confirm debe coincidir exactamente con --email.");
  }

  if (!demoDecision.allowed || !proposedDemo) {
    throw new Error(`No se puede otorgar demo interno: ${demoDecision.code}.`);
  }

  const now = new Date();
  const existingInternalDemoIds = orders
    .filter((order) => isInternalDemoOrder(order) && deriveSubscriptionStatus(order, { now }) === "active")
    .map((order) => order.id)
    .filter(Boolean);

  if (existingInternalDemoIds.length) {
    await CommercialLeadModel.updateMany(
      { _id: { $in: existingInternalDemoIds } },
      {
        $set: {
          status: "cancelled",
          activationStatus: "cancelled",
          cancelledAt: now,
          cancelAtPeriodEnd: false
        }
      }
    );
  }

  const created = toPlain(await CommercialLeadModel.create(proposedDemo));
  const finalOrders = await findOrders(user);
  const finalActiveOrder = pickActiveOrder(finalOrders);

  console.log(JSON.stringify({
    ...report,
    readOnly: false,
    applied: true,
    cancelledPreviousInternalDemoOrders: existingInternalDemoIds,
    createdOrder: buildOrderSummary(created),
    finalSubscription: buildSubscription(finalActiveOrder),
    publicTrialPreserved: true,
    message: `Acceso demo interno activado: ${created.planName}, ${created.fleetSize} combis. El historial de prueba pública no fue borrado.`
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      code: error.code || null,
      message: error.message
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
