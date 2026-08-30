const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const queue = require("../src/queue");

function main() {
  queue.configure({
    enabled: false,
    redisUrl: "",
    persistence: false,
    maxmemoryPolicy: "unknown"
  });
  queue.createWorker("outbox-local-test", async () => ({ ok: true }));

  const readiness = queue.getReadiness();
  assert.equal(readiness.mode, "memory");
  assert.equal(readiness.connected, false);
  assert.equal(readiness.functional, true);
  assert.equal(
    readiness.enabled,
    true,
    "la cola local funcional debe ser elegible para recibir recuperación del outbox Mongo"
  );
  assert.equal(
    readiness.durableAcrossRestart,
    false,
    "la cola local no debe fingir persistencia propia; la durabilidad viene del outbox Mongo"
  );

  const entrypoint = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  const engine = fs.readFileSync(path.resolve(__dirname, "../src/delivery/engine.js"), "utf8");
  assert.match(entrypoint, /if \(!readiness\.durable \|\| !queueState\.enabled\) return false;/);
  assert.match(engine, /if \(!queueReadiness\.enabled\)/);

  console.log("ok - outbox Mongo puede recuperar hacia la cola local sin fingir Redis persistente");
}

main();
