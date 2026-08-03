// RC-MULTI-ROUTE-DRIVER-01 F3 (etapa 2) — Migracion idempotente de Route.revision.
//
// Objetivo: poblar `revision` en rutas LEGADO (documentos sin el campo, o con revision 0/invalida)
// llevandolas a la revision base 1. NO altera rutas que ya tienen revision >= 1 (idempotente).
//
// Seguridad:
//   - Dry-run por DEFECTO. Solo escribe con --apply explicito.
//   - No se ejecuta al arrancar el server (script suelto, no importado por src/).
//   - Usa la DB configurada por env (MONGO_URI/MONGO_DB_NAME). NO apuntar a produccion sin intencion.
//   - Opera sobre la coleccion cruda para detectar `revision` ausente sin que el default del schema
//     enmascare el estado real.
//
// Uso:
//   node scripts/migrate-route-revision.js            # dry-run (no escribe)
//   node scripts/migrate-route-revision.js --dry-run  # explicito
//   node scripts/migrate-route-revision.js --apply    # aplica la migracion

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const BASE_REVISION = 1;

// Un documento necesita migracion si NO tiene revision entera >= 1.
// (ausente, null, 0, negativa, o no numerica) -> se lleva a BASE_REVISION.
const NEEDS_MIGRATION_FILTER = {
  $or: [
    { revision: { $exists: false } },
    { revision: null },
    { revision: { $lt: 1 } },
    { revision: { $not: { $type: "number" } } }
  ]
};

async function run() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;
  if (apply && process.argv.includes("--dry-run")) {
    throw new Error("Use --dry-run o --apply, no ambos");
  }

  const mongoUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGO_DB_NAME || "combisapp").trim();
  if (!mongoUri) throw new Error("MONGO_URI o MONGODB_URI es obligatoria");

  await mongoose.connect(mongoUri, { dbName });
  const routes = mongoose.connection.collection("routes");

  const total = await routes.countDocuments({});
  const found = await routes.countDocuments(NEEDS_MIGRATION_FILTER);
  const alreadyOk = total - found;

  let updated = 0;
  if (apply && found > 0) {
    const result = await routes.updateMany(NEEDS_MIGRATION_FILTER, {
      $set: { revision: BASE_REVISION }
    });
    updated = result.modifiedCount || 0;
  }

  const report = {
    mode: dryRun ? "dry-run" : "apply",
    database: dbName,
    collection: "routes",
    baseRevision: BASE_REVISION,
    totalRoutes: total,
    needingMigration: found,
    alreadyVersioned: alreadyOk,
    updated,
    // En dry-run "updated" siempre es 0; "needingMigration" indica cuantas SE actualizarian.
    idempotent: true
  };

  console.log(JSON.stringify(report, null, 2));

  // Verificacion post-apply: no deben quedar rutas sin migrar.
  if (apply) {
    const remaining = await routes.countDocuments(NEEDS_MIGRATION_FILTER);
    if (remaining > 0) {
      throw new Error(`Quedaron ${remaining} rutas sin migrar tras --apply`);
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
