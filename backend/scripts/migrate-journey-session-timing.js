// MDX-03 — Migracion segura de tiempos de Jornada sobre route_sessions.
//
// Dry-run por defecto. Solo escribe con --apply.
// No se ejecuta durante el arranque del backend.
//
// Regla legacy:
// - ASSIGNED/READY con startedAt y sin scheduledStartAt:
//   startedAt era horario programado; se mueve a scheduledStartAt y se limpia.
// - RUNNING/PAUSED/FINISHED/CANCELLED conservan startedAt como inicio real.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const LEGACY_PENDING_FILTER = {
  status: { $in: ["ASSIGNED", "READY"] },
  startedAt: { $type: "date" },
  $or: [
    { scheduledStartAt: { $exists: false } },
    { scheduledStartAt: null }
  ]
};

const UNVERSIONED_STARTED_FILTER = {
  status: { $in: ["RUNNING", "PAUSED", "FINISHED", "CANCELLED"] },
  startedAt: { $type: "date" },
  $or: [
    { timingMigrationVersion: { $exists: false } },
    { timingMigrationVersion: null },
    { timingMigrationVersion: { $lt: 1 } }
  ]
};

async function run() {
  const apply = process.argv.includes("--apply");
  const explicitDryRun = process.argv.includes("--dry-run");
  if (apply && explicitDryRun) {
    throw new Error("Use --dry-run o --apply, no ambos");
  }

  const mongoUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGO_DB_NAME || "combisapp").trim();
  if (!mongoUri) throw new Error("MONGO_URI o MONGODB_URI es obligatoria");

  await mongoose.connect(mongoUri, { dbName });
  const sessions = mongoose.connection.collection("route_sessions");

  const pendingLegacy = await sessions.countDocuments(LEGACY_PENDING_FILTER);
  const startedUnversioned = await sessions.countDocuments(UNVERSIONED_STARTED_FILTER);

  let pendingUpdated = 0;
  let startedMarked = 0;

  if (apply) {
    const pendingResult = await sessions.updateMany(
      LEGACY_PENDING_FILTER,
      [
        {
          $set: {
            scheduledStartAt: "$startedAt",
            startedAt: null,
            timingMigrationVersion: 1,
            updatedAt: "$$NOW"
          }
        }
      ]
    );
    pendingUpdated = pendingResult.modifiedCount || 0;

    const startedResult = await sessions.updateMany(
      UNVERSIONED_STARTED_FILTER,
      {
        $set: {
          timingMigrationVersion: 1,
          updatedAt: new Date()
        }
      }
    );
    startedMarked = startedResult.modifiedCount || 0;
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    database: dbName,
    collection: "route_sessions",
    pendingLegacy,
    startedUnversioned,
    pendingUpdated,
    startedMarked,
    idempotent: true
  };

  console.log(JSON.stringify(report, null, 2));

  if (apply) {
    const remainingPending = await sessions.countDocuments(LEGACY_PENDING_FILTER);
    const remainingStarted = await sessions.countDocuments(UNVERSIONED_STARTED_FILTER);
    if (remainingPending || remainingStarted) {
      throw new Error(
        `Migracion incompleta: pending=${remainingPending}, started=${remainingStarted}`
      );
    }
  }
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
