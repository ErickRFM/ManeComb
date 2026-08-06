const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const wrapperSource = fs.readFileSync(
  path.resolve(__dirname, "../src/data/mongo-store.js"),
  "utf8"
);
const platformStoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/data/platform-user-mongo-store.js"),
  "utf8"
);

assert.match(
  wrapperSource,
  /createPlatformUserMongoStore/,
  "mongo-store debe componer el adaptador persistente de usuarios de plataforma"
);
assert.match(
  platformStoreSource,
  /const\s*\{\s*PlatformUserModel\s*\}\s*=\s*require\("\.\/models"\)/,
  "el adaptador debe importar PlatformUserModel explícitamente"
);

const { createPlatformUserMongoStore } = require("../src/data/platform-user-mongo-store");
const store = createPlatformUserMongoStore();

for (const method of [
  "countPlatformOwners",
  "createPlatformUser",
  "getPlatformUserByEmail",
  "getPlatformUserById",
  "updatePlatformUser"
]) {
  assert.equal(typeof store[method], "function", `${method} debe estar disponible`);
}

console.log("platform mongo user store wiring: PASS");
