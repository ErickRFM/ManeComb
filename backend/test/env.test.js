const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendRoot = path.resolve(__dirname, "..");
const strongSecret = "env-test-secret-with-at-least-32-characters";
const mongoUri = "mongodb://user:password@atlas.example/manecomb";

function runEnvScript(script, overrides = {}, removals = []) {
  const env = {
    ...process.env,
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

function testProductionAcceptsJwtSecretAliases() {
  const result = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.JWT_SECRET!=='env-test-auth-secret-with-at-least-32-characters') process.exit(2);",
      "if(env.JWT_SECRET_SOURCE!=='AUTH_SECRET') process.exit(3);"
    ].join(""),
    {
      AUTH_SECRET: "env-test-auth-secret-with-at-least-32-characters",
      NODE_ENV: "production",
      RENDER: ""
    },
    ["JWT_SECRET", "SESSION_SECRET", "ACCESS_TOKEN_SECRET"]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - produccion acepta aliases fuertes de JWT_SECRET");
}

function testProductionDerivesShortJwtSecret() {
  const result = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.JWT_SECRET==='short-secret') process.exit(2);",
      "if(env.JWT_SECRET.length<32) process.exit(3);",
      "if(env.JWT_SECRET_SOURCE!=='JWT_SECRET_derived') process.exit(4);"
    ].join(""),
    {
      JWT_SECRET: "short-secret",
      NODE_ENV: "production",
      RENDER: ""
    },
    ["AUTH_SECRET", "SESSION_SECRET", "ACCESS_TOKEN_SECRET", "MONGO_URI", "MONGODB_URI"]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - produccion deriva JWT_SECRET corto en secreto estable");
}

function testRenderAcceptsMongoDerivedJwtSecret() {
  const result = runEnvScript(
    [
      "const env=require('./src/config/env');",
      "if(env.JWT_SECRET.length<32) process.exit(2);",
      "if(env.JWT_SECRET_SOURCE!=='derived_from_mongo_uri') process.exit(3);"
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

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - Render acepta fallback temporal derivado de Mongo");
}

function testDeploymentEnvAliases() {
  const result = runEnvScript(
    [
      "process.env.MONGODB_URI='mongodb://atlas.example/manecomb';",
      "process.env.JWT_EXPIRES_IN='20m';",
      "process.env.CLIENT_URL='https://manecomb1.pages.dev';",
      "process.env.MERCADOPAGO_ACCESS_TOKEN='mp-token';",
      "process.env.MERCADOPAGO_WEBHOOK_SECRET='wh-secret';",
      "const env=require('./src/config/env');",
      "if(env.MONGO_URI!=='mongodb://atlas.example/manecomb') process.exit(2);",
      "if(env.ACCESS_TOKEN_TTL!=='20m') process.exit(3);",
      "if(env.APP_URL!=='https://manecomb1.pages.dev') process.exit(4);",
      "if(env.MERCADO_PAGO_ACCESS_TOKEN!=='mp-token') process.exit(5);",
      "if(env.MERCADO_PAGO_WEBHOOK_SECRET!=='wh-secret') process.exit(6);"
    ].join(""),
    {
      NODE_ENV: "development",
      RENDER: ""
    },
    ["MONGO_URI", "MONGODB_URI", "ACCESS_TOKEN_TTL", "JWT_EXPIRES_IN", "APP_URL", "CLIENT_URL", "MERCADO_PAGO_ACCESS_TOKEN", "MERCADOPAGO_ACCESS_TOKEN", "MERCADO_PAGO_WEBHOOK_SECRET", "MERCADOPAGO_WEBHOOK_SECRET"]
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
      MERCADO_PAGO_ACCESS_TOKEN: "mp-token",
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "mercado_pago",
      RENDER: ""
    },
    ["MERCADOPAGO_ACCESS_TOKEN"]
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("ok - Mercado Pago procesa tarjeta y SPEI cuando esta configurado");
}

testProductionRequiresJwtSecret();
testRenderRequiresJwtSecret();
testProductionAcceptsStrongJwtSecret();
testProductionAcceptsJwtSecretAliases();
testProductionDerivesShortJwtSecret();
testRenderAcceptsMongoDerivedJwtSecret();
testDeploymentEnvAliases();
testClientOriginFallbackForAppUrl();
testRenderWebhookBaseUrlFallback();
testMercadoPagoProviderSelection();
