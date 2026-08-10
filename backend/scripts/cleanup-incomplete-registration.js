const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const mongoose = require("mongoose");
const { connectDB, getDbState } = require("../src/config/db");
const {
  ActivationKeyModel,
  CommercialLeadModel,
  ConversationModel,
  DocumentModel,
  IncidentModel,
  NotificationModel,
  RouteModel,
  RouteSessionModel,
  SessionModel,
  TripLogModel,
  UserModel,
  VehicleModel
} = require("../src/data/models");

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

function toId(value) {
  return String(value || "").trim();
}

async function countCommercialOrders(user) {
  const organizationId = toId(user.organizationId);
  const email = normalize(user.email);

  return CommercialLeadModel.countDocuments({
    $or: [
      { ownerUserId: toId(user._id) },
      ...(organizationId ? [{ organizationId }, { organizationSlug: organizationId }] : []),
      ...(email ? [{ ownerAccountEmail: email }, { email }] : [])
    ]
  });
}

async function inspectAccount(user) {
  const userId = toId(user._id);
  const organizationId = toId(user.organizationId);
  const orgQuery = organizationId ? { organizationId } : { organizationId: "__missing__" };

  const [
    commercialOrders,
    otherUsers,
    vehicles,
    activationKeys,
    documents,
    incidents,
    routes,
    routeSessions,
    tripLogs,
    conversations,
    notifications,
    sessions
  ] = await Promise.all([
    countCommercialOrders(user),
    organizationId ? UserModel.countDocuments({ organizationId, _id: { $ne: user._id } }) : 0,
    VehicleModel.countDocuments(orgQuery),
    ActivationKeyModel.countDocuments(organizationId ? { companyId: organizationId } : { companyId: "__missing__" }),
    DocumentModel.countDocuments(orgQuery),
    IncidentModel.countDocuments(orgQuery),
    RouteModel.countDocuments(orgQuery),
    RouteSessionModel.countDocuments(orgQuery),
    TripLogModel.countDocuments(orgQuery),
    ConversationModel.countDocuments(orgQuery),
    NotificationModel.countDocuments({
      $or: [
        { userId },
        ...(organizationId ? [{ organizationId }] : [])
      ]
    }),
    SessionModel.countDocuments({ userId })
  ]);

  const usage = {
    commercialOrders,
    otherUsers,
    vehicles,
    activationKeys,
    documents,
    incidents,
    routes,
    routeSessions,
    tripLogs,
    conversations,
    notifications,
    sessions
  };

  const blockingUsage = Object.entries(usage)
    .filter(([key, count]) => key !== "sessions" && Number(count) > 0)
    .map(([key, count]) => ({ key, count }));

  return {
    usage,
    blockingUsage,
    removable: blockingUsage.length === 0
  };
}

async function main() {
  const email = normalize(getArgValue("--email"));
  const confirmation = normalize(getArgValue("--confirm"));
  const apply = hasFlag("--apply");

  if (!email) {
    throw new Error("Uso: node scripts/cleanup-incomplete-registration.js --email usuario@dominio.com [--apply --confirm usuario@dominio.com]");
  }

  await connectDB();
  if (!getDbState().connected) {
    throw new Error("MongoDB no esta conectado. Revisa MONGO_URI/MONGO_DB_NAME.");
  }

  const user = await UserModel.findOne({ email }).lean();
  if (!user) {
    console.log(JSON.stringify({
      ok: true,
      email,
      found: false,
      message: "No existe una cuenta con ese correo; ya puede intentarse el registro nuevamente."
    }, null, 2));
    return;
  }

  const role = normalize(user.role);
  const accountType = normalize(user.accountType);
  if (role !== "owner" || accountType !== "company_owner") {
    throw new Error("La cuenta encontrada no es un owner comercial; la limpieza automatica fue bloqueada.");
  }

  const inspection = await inspectAccount(user);
  const report = {
    ok: true,
    email,
    found: true,
    apply,
    account: {
      id: toId(user._id),
      name: user.name,
      role: user.role,
      accountType: user.accountType,
      organizationId: user.organizationId || "",
      createdAt: user.createdAt || null
    },
    ...inspection
  };

  if (!inspection.removable) {
    console.log(JSON.stringify({
      ...report,
      ok: false,
      message: "La cuenta tiene datos asociados y NO se eliminara automaticamente."
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (!apply) {
    console.log(JSON.stringify({
      ...report,
      message: "DRY RUN: la cuenta parece un registro incompleto y puede eliminarse de forma segura."
    }, null, 2));
    return;
  }

  if (confirmation !== email) {
    throw new Error("Para borrar, --confirm debe coincidir exactamente con --email.");
  }

  const sessionDelete = await SessionModel.deleteMany({ userId: toId(user._id) });
  const userDelete = await UserModel.deleteOne({ _id: user._id, email });

  if (userDelete.deletedCount !== 1) {
    throw new Error("La cuenta cambio durante la limpieza y no se elimino. Vuelve a ejecutar el diagnostico.");
  }

  console.log(JSON.stringify({
    ...report,
    deleted: true,
    deletedSessions: sessionDelete.deletedCount || 0,
    message: "Registro incompleto eliminado. El correo puede registrarse nuevamente desde Ventas."
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      message: error.message
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
