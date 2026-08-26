const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageJson = require("../package.json");
const publicApi = require("..");
const backendAdapterSource = fs.readFileSync(
  path.resolve(__dirname, "../../backend/modules/communication/index.js"),
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
assert.doesNotMatch(
  backendAdapterSource,
  /communication-service\/src/,
  "Backend no debe acoplarse a internos src del paquete"
);

console.log("ok - communication-service public package boundary");
