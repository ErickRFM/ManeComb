const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { connectDB, getDbState } = require("../src/config/db");
const { migrateLegacyLocalDocumentsToMongo } = require("../src/services/storage");

async function main() {
  const apply = process.argv.includes("--apply");

  await connectDB();
  const db = getDbState();
  if (!db.connected) {
    throw new Error("MongoDB debe estar conectado para auditar o migrar documentos legacy");
  }

  const summary = await migrateLegacyLocalDocumentsToMongo({ dryRun: !apply });
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("Dry-run completado. Vuelve a ejecutar con --apply solo despues de revisar este reporte.");
  }

  if (summary.failed > 0 || summary.missing > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => undefined);
    }
  });
