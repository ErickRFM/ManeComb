const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ResendProvider } = require("../src/providers/resend.provider");

async function main() {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { id: "resend-email-1" };
      }
    };
  };

  try {
    const provider = new ResendProvider({
      apiKey: "re_test_key",
      fromEmail: "noreply@manecomb.com",
      fromName: "ManeComb"
    });

    const result = await provider.send({
      to: "user@example.com",
      subject: "ManeComb test",
      html: "<p>Hola</p>",
      text: "Hola",
      idempotencyKey: "delivery-abc-123"
    });

    assert.equal(result.success, true);
    assert.equal(result.id, "resend-email-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].options.headers["Idempotency-Key"], "delivery-abc-123");

    calls.length = 0;
    await provider.send({
      to: "user@example.com",
      subject: "Sin clave",
      html: "<p>Hola</p>",
      text: "Hola"
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(calls[0].options.headers, "Idempotency-Key"),
      false,
      "El provider no debe inventar una identidad cuando la capa durable no la entregó"
    );

    const engine = fs.readFileSync(path.resolve(__dirname, "../src/delivery/engine.js"), "utf8");
    const entrypoint = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
    assert.match(
      engine,
      /providerIdempotencyKey:\s*deliveryId/,
      "El delivery durable de Mongo debe ser la identidad estable de todos los retries del provider"
    );
    assert.match(
      entrypoint,
      /idempotencyKey:\s*providerIdempotencyKey/,
      "El entrypoint debe propagar la identidad durable al provider"
    );

    console.log("ok - Resend reutiliza el deliveryId durable como Idempotency-Key");
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
