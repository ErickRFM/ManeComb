const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
const storageSource = fs.readFileSync(path.join(__dirname, "../src/services/storage.js"), "utf8");
const migrationScript = fs.readFileSync(path.join(__dirname, "../scripts/migrate-legacy-documents.js"), "utf8");

assert.equal(
  serverSource.includes("migrateLegacyLocalDocumentsToMongo"),
  false,
  "server startup must not perform historical document migrations"
);
assert.match(
  storageSource,
  /migrateLegacyLocalDocumentsToMongo\(\{ dryRun = true \} = \{\}\)/,
  "legacy migration must default to dry-run"
);
assert.ok(migrationScript.includes('process.argv.includes("--apply")'));
assert.ok(migrationScript.includes("dryRun: !apply"));
assert.ok(migrationScript.includes("Dry-run completado"));

console.log("ok - legacy document migration is explicit and dry-run by default");
