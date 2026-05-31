const assert = require("node:assert/strict");

const { recordAppEventSafely } = require("../src/services/telemetry");

async function testTelemetryIsolation() {
  const unhandledRejections = [];
  const handleUnhandledRejection = (error) => {
    unhandledRejections.push(error);
  };

  process.on("unhandledRejection", handleUnhandledRejection);

  try {
    recordAppEventSafely(
      {
        recordAppEvent() {
          throw new Error("sync telemetry failure");
        }
      },
      {}
    );
    recordAppEventSafely(
      {
        recordAppEvent() {
          return Promise.reject(new Error("async telemetry failure"));
        }
      },
      {}
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(unhandledRejections, []);
    console.log("ok - errores de telemetria secundaria no generan unhandledRejection");
  } finally {
    process.off("unhandledRejection", handleUnhandledRejection);
  }
}

testTelemetryIsolation().catch((error) => {
  console.error(error);
  process.exit(1);
});
