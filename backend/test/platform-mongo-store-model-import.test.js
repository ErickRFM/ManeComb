const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/data/mongo-store.js"),
  "utf8"
);
const modelImport = source.match(
  /const\s*\{([\s\S]*?)\}\s*=\s*require\("\.\/models"\);/
);

assert.ok(modelImport, "mongo-store debe importar sus modelos desde ./models");

const importedModels = new Set(
  modelImport[1].match(/\b[A-Z]\w*Model\b/g) || []
);
const usedModels = new Set(source.match(/\b[A-Z]\w*Model\b/g) || []);
const missingImports = [...usedModels].filter((name) => !importedModels.has(name));

assert.deepEqual(
  missingImports,
  [],
  `mongo-store usa modelos sin importar: ${missingImports.join(", ")}`
);

console.log("platform mongo store model imports: PASS");
