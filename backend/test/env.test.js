const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendRoot = path.resolve(__dirname, "..");
const strongSecret = "env-test-secret-with-at-least-32-characters";
const mongoUri = "mongodb://user:password@atlas.example/manecomb";

function runEnvScript(script, overrides = {}, removals = []) {
  const env = {
    ...process.env,
    JWT_SECRET: strongSecret,
    ...overrides
  };

  removals.forEach((key) => {
    delete env[key];
  });

  return spawnSync(process.execPath, ["-e", script], {
    cwd: backendRoot,
    encoding: "utf8",
    env
  });
}

function testProductionRequiresJwtSecret() {
  const result = runEnvScript(
    "require('./src/config/env')",
    {
      NODE_ENV: "production",
      RENDER: ""
    },
    [
      "JWT_SECRET",
      "AUTH_SECRET",
      "SESSION_SECRET",
      "ACCESS_TOKEN_SECRET",
      "MONGO_URI",
      "MONGODB_URI",
      "RENDER_SERVICE_ID",
      "RENDER_EXTERNAL_URL"
    ]
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /JWT_SECRET/);
  console.log("ok - produccion exige JWT_SECRET fuerte");
}

function testRenderRequiresJwtSecret() {
  const result = runEnvScript(
    "require('./src/config/env')",
    {
      NODE_ENV: "",
      RENDER: "true"
    },
    [
      "JWT_SECRET",
      "AUTH_SECRET",
      "SESSION_SECRET",
      "ACCESS_TOKEN_SECRET",
      "MONGO_URI",
      "MONGODB_URI",
      "RENDER_SERVICE_ID",
      "RENDER_EXTERNAL_URL"
    ]
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /JWT_SECRET/);
  console.log("ok - Render exige JWT_SECRET fuerte aunque NODE_ENV no venga definido");
}

function testProductionAcceptsStrongJwtSecret() {
  const result = runEnvScript("require('./src/config/env')", {
    JWT_SECRET: strongSecret,
    NODE_ENV: "production",
    RENDER: ""
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - produccion acepta JWT_SECRET fuerte");
}

function testRejectsJwtSecretAliases() {
  const result = runEnvScript(
    [
      "require('./src/config/env');"
    ].join(""),
    {
      AUTH_SECRET: "env-test-auth-secret-with-at-least-32-characters",
      NODE_ENV: "production",
      RENDER: ""
    },
    ["JWT_SECRET", "SESSION_SECRET", "ACCESS_TOKEN_SECRET"]
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /JWT_SECRET es obligatorio/);
  console.log("ok - aliases no sustituyen JWT_SECRET");
}

function testRejectsShortJwtSecret() {
  const result = runEnvScript(
    [
      "require('./src/config/env');"
    ].join(""),
    {
      JWT_SECRET: "short-secret",
      NODE_ENV: "production",
      RENDER: ""
    },
    ["AUTH_SECRET", "SESSION_SECRET", "ACCESS_TOKEN_SECRET", "MONGO_URI", "MONGODB_URI"]
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /al menos 32 caracteres/);
  console.log("ok - JWT_SECRET corto detiene el arranque");
}

function testRenderRejectsMongoDerivedJwtSecret() {
  const result = runEnvScript(
    [
      "require('./src/config/env');"
    ].join(""),
    {
      NODE_ENV: "",
      RENDER: "true",
      MONGODB_URI: mongoUri
    },
    [
      "JWT_SECRET",
      "AUTH_SECRET",
      "SESSION_SECRET",
      "ACCESS_TOKEN_SECRET",
      "MONGO_URI",
      "RENDER_SERVICE_ID",
      "RENDER_EXTERNAL_URL"
    ]
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /JWT_SECRET es obligatorio/);
  console.log("ok - MONGO_URI no sustituye JWT_SECRET en Render");
}

function testDeploymentEnvAliases() {
  const result = runEnvScript(
    [
      "process.env.MONGODB_URI='mongodb://atlas.example/manecomb';",
      "process.env.JWT_EXPIRES_IN='20m';",
      "process.env.CLIENT_URL='https://manecomb1.pages.dev';",
      "process.env.MERCADOPAGO_ACCESS_TOKEN='mp-token';",
      "process.env.MERCADOPAGO_PUBLIC_KEY='mp-public';",
      "process.env.MERCADOPAGO_WEBHOOK_SECRET='wh-secret';",
      "const env=require('./src/config/env');",
      "if(env.MONGO_URI!=='mongodb://atlas.example/manecomb') process.exit(2);",
      "if(env.ACCESS_TOKEN_TTL!=='20m') process.exit(3);",
      "if(env.APP_URL!=='https://manecomb1.pages.dev') process.exit(4);",
      "if(env.MERCADO_PAGO_ACCESS_TOKEN!=='mp-token') process.exit(5);",
      "if(env.MERCADO_PAGO_ACCESS_TOKEN_SOURCE!=='MERCADOPAGO_ACCESS_TOKEN') process.exit(6);",
      "if(env.MERCADO_PAGO_PUBLIC_KEY!=='mp-public') process.exit(7);",
      "if(env.MERCADO_PAGO_PUBLIC_KEY_SOURCE!=='MERCADOPAGO_PUBLIC_KEY') process.exit(8);",
      "if(env.MERCADO_PAGO_WEBHOOK_SECRET!=='wh-secret') process.exit(9);",
      "if(env.MERCADO_PAGO_WEBHOOK_SECRET_SOURCE!=='MERCADOPAGO_WEBHOOK_SECRET') process.exit(10);"
    ].join(""),
    {
      NODE_ENV: "development",
      RENDER: ""
    },
    [
      "MONGO_URI",
      "MONGODB_URI",
      "ACCESS_TOKEN_TTL",
      "JWT_EXPIRES_IN",
      "APP_URL",
      "CLIENT_URL",
      "MERCADO_PAGO_ACCESS_TOKEN",
      "MERCADOPAGO_ACCESS_TOKEN",
      "MP_ACCESS_TOKEN",
      "MERCADO_PAGO_PUBLIC_KEY",
      "MERCADOPAGO_PUBLIC_KEY",
      "MP_PUBLIC_KEY",
      "MERCADO_PAGO_WEBHOOK_SECRET",
      "MERCADOPAGO_WEBHOOK_SECRET",
      "MP_WEBHOOK_SECRET",
      "WEBHOOK_SECRET"
    ]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - aliases de variables de deploy resuelven correctamente");
}

function testClientOriginFallbackForAppUrl() {
  const result = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.APP_URL!=='https://manecomb1.pages.dev') process.exit(2);"
    ].join(""),
    {
      CLIENT_ORIGIN: "https://manecomb1.pages.dev,http://localhost:5173",
      NODE_ENV: "development",
      RENDER: ""
    },
    ["APP_URL", "CLIENT_URL"]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - APP_URL usa CLIENT_ORIGIN publico antes de localhost");
}

function testPasswordResetPublicUrl() {
  const explicit = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.PASSWORD_RESET_PUBLIC_URL!=='https://manecomb.com/reset-password') process.exit(2);"
    ].join(""),
    {
      APP_URL: "https://legacy.example.test",
      PASSWORD_RESET_PUBLIC_URL: "https://manecomb.com/reset-password"
    }
  );
  assert.equal(explicit.status, 0, explicit.stderr || explicit.stdout);

  const fallback = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.PASSWORD_RESET_PUBLIC_URL!=='https://legacy.example.test/reset-password') process.exit(2);"
    ].join(""),
    { APP_URL: "https://legacy.example.test/" },
    ["PASSWORD_RESET_PUBLIC_URL"]
  );
  assert.equal(fallback.status, 0, fallback.stderr || fallback.stdout);
  console.log("ok - PASSWORD_RESET_PUBLIC_URL explicita y fallback controlado");
}

function testRenderWebhookBaseUrlFallback() {
  const result = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.PUBLIC_WEBHOOK_BASE_URL!=='https://manecomb.onrender.com') process.exit(2);"
    ].join(""),
    {
      MONGODB_URI: mongoUri,
      NODE_ENV: "",
      RENDER: "true",
      RENDER_EXTERNAL_URL: "https://manecomb.onrender.com"
    },
    ["PUBLIC_WEBHOOK_BASE_URL", "MONGO_URI"]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - Render usa RENDER_EXTERNAL_URL como webhook publico");
}

function testMercadoPagoProviderSelection() {
  const result = runEnvScript(
    [
      "const payments=require('./src/services/commercial-payment');",
      "if(!payments.isAutomaticPaymentEnabled()) process.exit(2);",
      "if(payments.getPaymentProviderName('spei')!=='mercado_pago') process.exit(3);",
      "if(payments.getPaymentProviderName('card')!=='mercado_pago') process.exit(4);"
    ].join(""),
    {
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-env-token",
      MERCADO_PAGO_ENV: "sandbox",
      MERCADO_PAGO_PUBLIC_KEY: "TEST-env-public",
      MERCADO_PAGO_WEBHOOK_SECRET: "env-test-webhook-secret",
      MERCADO_PAGO_WEBHOOK_URL: "https://payments.example.test/api/commercial/webhooks/mercadopago",
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "mercado_pago",
      RENDER: ""
    },
    ["MERCADOPAGO_ACCESS_TOKEN"]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - Mercado Pago procesa tarjeta y SPEI cuando esta configurado");
}

function testProductionRejectsTestPaymentProvider() {
  const result = runEnvScript(
    [
      "const payments=require('./src/services/commercial-payment');",
      "const readiness=payments.getPaymentReadiness();",
      "if(readiness.ready) process.exit(2);",
      "if(!readiness.issues.includes('test_provider_forbidden_in_production')) process.exit(3);"
    ].join(""),
    {
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "test",
      RENDER: ""
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - produccion rechaza PAYMENT_PROVIDER=test");
}

function testMercadoPagoShortAliasesAndReturnUrls() {
  const result = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.MERCADO_PAGO_ACCESS_TOKEN!=='TEST-short-token') process.exit(2);",
      "if(env.MERCADO_PAGO_ACCESS_TOKEN_SOURCE!=='MP_ACCESS_TOKEN') process.exit(3);",
      "if(env.MERCADO_PAGO_PUBLIC_KEY!=='TEST-public-key') process.exit(4);",
      "if(env.MERCADO_PAGO_PUBLIC_KEY_SOURCE!=='MP_PUBLIC_KEY') process.exit(5);",
      "if(env.MERCADO_PAGO_WEBHOOK_SECRET!=='generic-webhook-secret') process.exit(6);",
      "if(env.MERCADO_PAGO_WEBHOOK_SECRET_SOURCE!=='WEBHOOK_SECRET') process.exit(7);",
      "if(env.MERCADO_PAGO_SUCCESS_URL!=='https://example.com/success') process.exit(8);",
      "if(env.MERCADO_PAGO_FAILURE_URL!=='https://example.com/failure') process.exit(9);",
      "if(env.MERCADO_PAGO_PENDING_URL!=='https://example.com/pending') process.exit(10);"
    ].join(""),
    {
      FAILURE_URL: "https://example.com/failure",
      MP_ACCESS_TOKEN: "TEST-short-token",
      MP_PUBLIC_KEY: "TEST-public-key",
      NODE_ENV: "development",
      PENDING_URL: "https://example.com/pending",
      RENDER: "",
      SUCCESS_URL: "https://example.com/success",
      WEBHOOK_SECRET: "generic-webhook-secret"
    },
    [
      "MERCADO_PAGO_ACCESS_TOKEN",
      "MERCADOPAGO_ACCESS_TOKEN",
      "MERCADO_PAGO_PUBLIC_KEY",
      "MERCADOPAGO_PUBLIC_KEY",
      "MERCADO_PAGO_WEBHOOK_SECRET",
      "MERCADOPAGO_WEBHOOK_SECRET",
      "MP_WEBHOOK_SECRET",
      "MERCADO_PAGO_SUCCESS_URL",
      "MERCADOPAGO_SUCCESS_URL",
      "MP_SUCCESS_URL",
      "MERCADO_PAGO_FAILURE_URL",
      "MERCADOPAGO_FAILURE_URL",
      "MP_FAILURE_URL",
      "MERCADO_PAGO_PENDING_URL",
      "MERCADOPAGO_PENDING_URL",
      "MP_PENDING_URL"
    ]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - aliases cortos de Mercado Pago y URLs de retorno resuelven correctamente");
}

testProductionRequiresJwtSecret();
testRenderRequiresJwtSecret();
testProductionAcceptsStrongJwtSecret();
testRejectsJwtSecretAliases();
testRejectsShortJwtSecret();
testRenderRejectsMongoDerivedJwtSecret();
testDeploymentEnvAliases();
testClientOriginFallbackForAppUrl();
testPasswordResetPublicUrl();
testRenderWebhookBaseUrlFallback();
testMercadoPagoProviderSelection();
testProductionRejectsTestPaymentProvider();
testMercadoPagoShortAliasesAndReturnUrls();
