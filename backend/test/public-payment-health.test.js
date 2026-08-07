const assert = require("node:assert/strict");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.RENDER = "";
process.env.REQUIRE_MONGO = "false";
process.env.PAYMENT_PROVIDER = "manual";
process.env.BANK_TRANSFER_ACCOUNT_NAME = "ManeComb QA";
process.env.BANK_TRANSFER_CLABE = "012345678901234567";
process.env.BANK_TRANSFER_BANK_NAME = "Banco QA";

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: true, mode: "embedded", message: "payment-health-test" })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.readiness?.payments, {
      mode: "manual_transfer_ready",
      provider: "manual",
      ready: true
    });

    assert.equal(serialized.includes(process.env.BANK_TRANSFER_CLABE), false);
    assert.equal(serialized.includes(process.env.BANK_TRANSFER_ACCOUNT_NAME), false);
    assert.equal(serialized.includes("MERCADO_PAGO_ACCESS_TOKEN"), false);

    console.log("ok - /api/health expone readiness de pagos segura para Ventas");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
