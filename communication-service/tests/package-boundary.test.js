const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageJson = require("../package.json");
const publicApi = require("..");
const backendAdapterDir = path.resolve(__dirname, "../../backend/modules/communication");
const backendAdapterSource = fs.readFileSync(
  path.join(backendAdapterDir, "index.js"),
  "utf8"
);

assert.equal(packageJson.main, "src/index.js");
assert.equal(packageJson.exports?.["."], "./src/index.js");
assert.equal(typeof publicApi.configure, "function");
assert.equal(typeof publicApi.sendEmail, "function");
assert.equal(typeof publicApi.getReadiness, "function");
assert.match(
  backendAdapterSource,
  /require\(["']\.\.\/\.\.\/\.\.\/communication-service["']\)/,
  "Backend debe consumir el entrypoint publico del paquete"
);

const adapterFiles = fs.readdirSync(backendAdapterDir).filter((name) => name.endsWith(".js"));
for (const adapterFile of adapterFiles) {
  const source = fs.readFileSync(path.join(backendAdapterDir, adapterFile), "utf8");
  assert.doesNotMatch(
    source,
    /communication-service\/src\//,
    `${adapterFile} no debe acoplarse a internos src del paquete`
  );
}

const retiredInternalShims = [
  "communication.events.js",
  "communication.history.js",
  "communication.jobs.js",
  "communication.metrics.js",
  "communication.provider.js",
  "communication.queue.js",
  "communication.renderer.js",
  "communication.retry.js",
  "communication.templates.js",
  "communication.types.js",
  "communication.validators.js"
];
for (const retiredShim of retiredInternalShims) {
  assert.equal(
    adapterFiles.includes(retiredShim),
    false,
    `${retiredShim} no debe reaparecer; usar el API publico de backend/modules/communication/index.js`
  );
}

console.log("ok - communication-service public package boundary");
