const assert = require("node:assert/strict");

process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "error-handler-test-secret-with-at-least-32-chars";

const { getPublicErrorMessage } = require("../src/middlewares/error-handler");

function testProductionFiveHundredMessageIsSanitized() {
  const message = getPublicErrorMessage(
    new Error("Mercado Pago no pudo crear el checkout. token=secret"),
    500
  );

  assert.equal(message, "Error interno del servidor");
}

function testProductionClientErrorMessageIsPreserved() {
  const error = new Error("Token de descarga invalido");
  error.statusCode = 400;

  const message = getPublicErrorMessage(error, error.statusCode);

  assert.equal(message, "Token de descarga invalido");
}

function testExplicitPublicMessageHidesTechnicalClientError() {
  const error = new Error("driver=secret database detail");
  error.statusCode = 400;
  error.publicMessage = "No fue posible completar la operacion";

  const message = getPublicErrorMessage(error, error.statusCode);

  assert.equal(message, "No fue posible completar la operacion");
}

testProductionFiveHundredMessageIsSanitized();
testProductionClientErrorMessageIsPreserved();
testExplicitPublicMessageHidesTechnicalClientError();

console.log("ok - production error messages are sanitized");
