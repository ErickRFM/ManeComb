const dns = require("node:dns");
const http = require("node:http");
const path = require("node:path");

if (!process.argv.includes("--execute")) {
  console.error("Use --execute para confirmar la prueba dry-run controlada.");
  process.exit(1);
}

dns.setServers(["1.1.1.1", "8.8.8.8"]);
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
process.env.EMAIL_ENABLED = "true";
process.env.EMAIL_DRY_RUN = "true";

const mongoose = require("mongoose");
const createApp = require("../src/app");
const { connectDB, getDbState } = require("../src/config/db");
const {
  EMAIL_FROM,
  EMAIL_FROM_NAME,
  PORTAL_PUBLIC_URL,
  RESEND_API_KEY,
  RESEND_REPLY_TO
} = require("../src/config/env");
const { UserModel } = require("../src/data/models");
const { createMongoStore } = require("../src/data/store");
const communication = require("../modules/communication");

function getCounterTotal(snapshot, name) {
  return (snapshot.counters || [])
    .filter((counter) => counter.name === name)
    .reduce((total, counter) => total + counter.value, 0);
}

async function run() {
  let server;

  try {
    await connectDB();
    if (!getDbState().connected) {
      throw new Error("La prueba requiere MongoDB conectado.");
    }

    communication.configure({
      provider: "resend",
      providerConfig: {
        apiKey: RESEND_API_KEY,
        fromEmail: EMAIL_FROM,
        replyTo: RESEND_REPLY_TO
      },
      queue: {
        enabled: false,
        redisUrl: ""
      },
      defaultFrom: EMAIL_FROM ? `${EMAIL_FROM_NAME} <${EMAIL_FROM}>` : "",
      docsUrl: PORTAL_PUBLIC_URL,
      brandName: EMAIL_FROM_NAME,
      email: {
        enabled: true,
        dryRun: true,
        requireDurableQueue: false,
        requireDurableHistory: true
      },
      persistence: { mongoose }
    });
    await communication.initializePersistence();

    const developer = await UserModel.findOne({
      email: /@combis\.app$/i
    }).select("_id email name organizationId").lean();
    if (!developer) {
      throw new Error("No existe una cuenta de desarrollo @combis.app para la prueba.");
    }

    const store = await createMongoStore();
    const appEvents = [];
    const originalRecordAppEvent = store.recordAppEvent;
    store.recordAppEvent = async (event) => {
      appEvents.push(event);
      return originalRecordAppEvent(event);
    };

    let providerCalls = 0;
    communication.deliveryEngine.setSendFunction(async () => {
      providerCalls += 1;
      throw new Error("El provider no debe ejecutarse durante dry-run.");
    });

    const app = createApp({ store, getDbState });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    const startedAt = new Date();
    const providerAttemptsBefore = getCounterTotal(
      communication.metrics.getSnapshot(),
      "provider_attempts"
    );
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/auth/forgot-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: developer.email })
      }
    );
    const payload = await response.json();
    const providerAttemptsAfter = getCounterTotal(
      communication.metrics.getSnapshot(),
      "provider_attempts"
    );

    const recipientHash = communication.security.hashRecipient(developer.email);
    const deliveries = await communication.history.query({
      eventType: "PASSWORD_RESET",
      limit: 200
    });
    const matching = deliveries.filter((delivery) =>
      delivery.recipientHash === recipientHash &&
      new Date(delivery.createdAt).getTime() >= startedAt.getTime()
    );
    const delivery = matching[0] || null;
    const serializedDelivery = JSON.stringify(delivery || {});
    const failedEvents = appEvents.filter((event) =>
      event.type === "email_delivery_failed"
    );
    const genericMessage =
      "Si el correo existe, recibiras instrucciones para recuperar tu contrasena";

    const evidence = {
      httpStatus: response.status,
      genericResponse: payload?.message === genericMessage,
      resetRequestIdCreated:
        typeof delivery?.idempotencyKey === "string" &&
        delivery.idempotencyKey.startsWith("password-reset:"),
      deliveriesCreated: matching.length,
      eventType: delivery?.eventType || null,
      status: delivery?.status || null,
      recipientMaskedPresent: Boolean(delivery?.recipientMasked),
      recipientHashPresent: Boolean(delivery?.recipientHash),
      sensitiveFieldsAbsent:
        !serializedDelivery.includes("resetUrl") &&
        !serializedDelivery.includes("reset-password?token=") &&
        !serializedDelivery.includes("\"token\""),
      rawErrorAbsent:
        !delivery?.errorCategory &&
        !delivery?.errorCode &&
        !delivery?.errorMessage,
      providerCalls,
      providerAttemptsDelta: providerAttemptsAfter - providerAttemptsBefore,
      emailDeliveryFailedEvents: failedEvents.length,
      emailDryRun: true
    };

    console.log(JSON.stringify(evidence, null, 2));

    const valid =
      evidence.httpStatus === 200 &&
      evidence.genericResponse &&
      evidence.resetRequestIdCreated &&
      evidence.deliveriesCreated === 1 &&
      evidence.eventType === "PASSWORD_RESET" &&
      evidence.status === "dry_run" &&
      evidence.recipientMaskedPresent &&
      evidence.recipientHashPresent &&
      evidence.sensitiveFieldsAbsent &&
      evidence.rawErrorAbsent &&
      evidence.providerCalls === 0 &&
      evidence.providerAttemptsDelta === 0 &&
      evidence.emailDeliveryFailedEvents === 0;

    if (!valid) {
      throw new Error("La evidencia dry-run no cumplió el contrato esperado.");
    }
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
    await mongoose.disconnect().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
