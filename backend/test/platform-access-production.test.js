const assert = require("node:assert/strict");
const { platformAccess } = require("../src/middlewares/platform-access");

function mockResponse() {
  const state = { status: 200, body: null };
  return {
    state,
    status(code) {
      state.status = code;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    }
  };
}

async function main() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED;

  try {
    process.env.NODE_ENV = "production";
    process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED = "false";

    const response = mockResponse();
    let nextCalled = false;

    await platformAccess(
      { headers: {} },
      response,
      () => { nextCalled = true; }
    );

    assert.equal(nextCalled, false);
    assert.equal(response.state.status, 503);
    assert.deepEqual(response.state.body, {
      ok: false,
      message: "Acceso privado no disponible"
    });

    console.log("ok - Platform Access falla cerrado en producción cuando enforcement está apagado");
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.PLATFORM_ACCESS_ENFORCEMENT_ENABLED = previousEnabled;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
