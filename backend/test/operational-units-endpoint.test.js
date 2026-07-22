/**
 * Integracion del contrato operacional canonico.
 *
 * Reproduce el escenario real observado en las capturas del 2026-07-18:
 *   C-1  unidad antigua, con ruta y GPS
 *   C-2  unidad recien dada de alta, sin GPS, sin ruta, sin conductor
 *   C-3  unidad antigua sin ruta activa
 *
 * El defecto que cierra esta prueba: C-2 desaparecia del mapa porque el
 * filtro de tracking exigia estado activo y GPS fresco.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

Object.assign(process.env, {
  MERCADO_PAGO_ACCESS_TOKEN: "",
  MERCADOPAGO_ACCESS_TOKEN: "",
  MONGODB_URI: "",
  MONGO_URI: "",
  PAYMENT_PROVIDER: "manual",
  REQUIRE_MONGO: "false"
});

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { buildCommercialActivationUpdate } = require("../src/services/commercial-activation");

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) }
  });
  return { payload: await response.json(), status: response.status };
}

async function startServer() {
  const store = createEmbeddedStore();
  const app = createApp({ store, getDbState: () => ({ connected: false, mode: "embedded", message: "test" }) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    store,
    url: `http://127.0.0.1:${server.address().port}/api`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

/** Registra un tenant con plan activo para superar requireOperationalAccess. */
async function createActiveTenant(context) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `ops-${stamp}@combis.app`;
  const companyName = `Fleet ${stamp}`;

  const register = await requestJson(`${context.url}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      name: "Operador Pruebas",
      email,
      password: "Ruta123!",
      phone: "+52 55 0000 3333",
      companyName,
      accountType: "company_owner"
    })
  });
  assert.equal(register.status, 201);
  const token = register.payload.token;

  const checkout = await requestJson(`${context.url}/commercial/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "operational-units-checkout-0001" },
    body: JSON.stringify({
      companyName,
      contactName: "Operador Pruebas",
      email,
      phone: "+52 55 0000 3333",
      planId: "value-4",
      paymentMethod: "card",
      requestTrial: false
    })
  });
  assert.equal(checkout.status, 201);

  await context.store.updateCommercialOrder(checkout.payload.data.id, {
    ...buildCommercialActivationUpdate(checkout.payload.data, "active"),
    paymentApprovedAt: new Date().toISOString(),
    paymentStatus: "paid",
    status: "active"
  });

  const confirm = await requestJson(`${context.url}/commercial/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      externalReference: checkout.payload.data.paymentExternalReference || checkout.payload.data.id
    })
  });
  assert.equal(confirm.status, 200);

  return { token, email };
}

async function createUnit(context, token, body) {
  const response = await requestJson(`${context.url}/vehicles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 201, `alta de unidad fallo: ${JSON.stringify(response.payload)}`);
  return response.payload.data;
}

async function run() {
  const context = await startServer();

  try {
    const { token } = await createActiveTenant(context);
    const auth = { Authorization: `Bearer ${token}` };

    const c1 = await createUnit(context, token, { code: "C-1", plate: "FBZ-404", status: "available" });
    const c2 = await createUnit(context, token, { code: "C-2", plate: "GHT-771", status: "available" });
    const c3 = await createUnit(context, token, { code: "C-3", plate: "JKM-902", status: "available" });

    // C-1 recibe posicion reciente. C-2 y C-3 permanecen sin GPS.
    await context.store.updateVehicleLocation({
      vehicleId: c1.id,
      coordinates: { latitude: 19.3139, longitude: -98.2404 },
      heading: 90,
      speed: 11,
      timestamp: new Date().toISOString()
    });

    const list = await requestJson(`${context.url}/operational-units`, { headers: auth });
    assert.equal(list.status, 200);
    assert.equal(list.payload.ok, true);

    const byLabel = new Map(list.payload.data.map((unit) => [unit.label, unit]));

    // --- El defecto de las capturas: las tres unidades deben estar ---------
    assert.deepEqual(
      [...byLabel.keys()].sort(),
      ["C-1", "C-2", "C-3"],
      "las tres unidades del tenant deben aparecer en la coleccion canonica"
    );

    // --- C-2: unidad nueva sin GPS sigue siendo visible --------------------
    const unitC2 = byLabel.get("C-2");
    assert.equal(unitC2.unitId, c2.id);
    assert.equal(unitC2.plates, "GHT-771");
    assert.equal(unitC2.visibility, "visible", "la unidad nueva no puede desaparecer del mapa");
    assert.equal(unitC2.gps.freshness, "missing");
    assert.equal(unitC2.gps.lat, null);
    assert.equal(unitC2.route, null);
    assert.equal(unitC2.driver, null);
    assert.equal(unitC2.operationalState, "no_route");

    // --- Identidad presente en todas: causa del titulo en blanco ----------
    for (const unit of list.payload.data) {
      assert.ok(unit.label && unit.label.trim(), `unidad ${unit.unitId} sin label`);
      assert.ok(unit.unitId, "unidad sin identificador");
      assert.equal(typeof unit.visibility, "string");
    }

    // --- C-1: GPS fresco, velocidad ya en km/h ----------------------------
    const unitC1 = byLabel.get("C-1");
    assert.equal(unitC1.gps.freshness, "fresh");
    assert.equal(typeof unitC1.gps.lat, "number");
    assert.ok(unitC1.gps.ageSeconds !== null && unitC1.gps.ageSeconds <= 5);
    assert.ok(unitC1.gps.speedKmh > 35 && unitC1.gps.speedKmh < 45, `speedKmh inesperado: ${unitC1.gps.speedKmh}`);

    // --- Ningun ETA derivado de minutos congelados ------------------------
    const serialized = JSON.stringify(list.payload.data);
    assert.equal(serialized.includes("etaMinutes"), false, "el contrato canonico no expone etaMinutes");
    assert.equal(serialized.includes("speedMetersPerSecond"), false, "el cliente no debe reconvertir velocidad");

    // --- Detalle individual identico al de la coleccion --------------------
    const detail = await requestJson(`${context.url}/operational-units/${c2.id}`, { headers: auth });
    assert.equal(detail.status, 200);
    assert.deepEqual(
      { ...detail.payload.data, gps: { ...detail.payload.data.gps, ageSeconds: null } },
      { ...unitC2, gps: { ...unitC2.gps, ageSeconds: null } },
      "coleccion y detalle deben serializar el mismo objeto"
    );

    // --- Socket.IO entrega el mismo objeto que REST -----------------------
    // Si estos dos caminos divergen, vuelve la inconsistencia entre pantallas.
    const { buildSnapshotForVehicle } = require("../src/services/operational-units-service");
    const liveVehicles = (await context.store.getLiveLocations()).vehicles;
    const rawC1 = liveVehicles.find((vehicle) => vehicle.id === c1.id);
    const emitted = await buildSnapshotForVehicle({ store: context.store, vehicle: rawC1 });

    assert.deepEqual(
      { ...emitted, gps: { ...emitted.gps, ageSeconds: null }, lastEventAt: null },
      { ...unitC1, gps: { ...unitC1.gps, ageSeconds: null }, lastEventAt: null },
      "el snapshot emitido por socket debe ser identico al de REST"
    );

    // --- Caso C-1: ultima posicion conocida sin sello de tiempo -----------
    // `getFleetSummary` (store.js) conserva `location` aunque falte
    // `locationTimestamp` y no haya posiciones de sesion. El mini-mapa de ruta
    // dibuja con solo `vehicle.location`, asi que el mapa de seguimiento debe
    // recibir esa misma coordenada. Antes se descartaba y la unidad no se
    // dibujaba, mientras otra unidad con timestamp valido si aparecia.
    const { listOperationalUnits } = require("../src/services/operational-units-service");
    const storeStub = {
      getLiveLocations: async () => ({
        routes: [],
        incidents: [],
        vehicles: [
          {
            id: "c1",
            code: "C-1",
            plate: "FBZ-404",
            status: "available",
            organizationId: "org-1",
            // Ultimo registro conocido, sin fecha asociada.
            location: { latitude: 19.2483, longitude: -98.2617 },
            locationTimestamp: null,
            speed: 0
          },
          {
            id: "c3",
            code: "C-3",
            plate: "JKM-902",
            status: "available",
            organizationId: "org-1",
            location: { latitude: 19.2939, longitude: -98.2334 },
            locationTimestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
            speed: 0
          }
        ]
      }),
      listIncidents: () => [],
      listUsers: () => [],
      listRouteSessions: () => []
    };

    const units = await listOperationalUnits({
      store: storeStub,
      user: { id: "u", role: "owner", organizationId: "org-1" },
      organizationId: "org-1"
    });

    const c1Unit = units.find((unit) => unit.label === "C-1");
    const c3Unit = units.find((unit) => unit.label === "C-3");

    assert.ok(c1Unit, "C-1 debe estar en la coleccion");
    assert.equal(c1Unit.gps.lat, 19.2483, "C-1 conserva su ultima posicion conocida");
    assert.equal(c1Unit.gps.lng, -98.2617);
    assert.equal(c1Unit.gps.recordedAt, null, "no se inventa una fecha inexistente");
    assert.equal(c1Unit.gps.freshness, "missing");
    assert.equal(c1Unit.visibility, "visible");

    // C-3, con posicion fechada de hace 5 dias, se comporta igual de visible.
    assert.ok(c3Unit);
    assert.equal(c3Unit.gps.lat, 19.2939);
    assert.equal(c3Unit.gps.freshness, "missing");

    // Ninguna de las dos afirma estar detenida: no hay dato fresco que lo sostenga.
    assert.equal(c1Unit.operationalState, "no_route");
    assert.equal(c3Unit.operationalState, "no_route");

    // Ambas son dibujables: tienen coordenada.
    assert.equal(
      units.filter((unit) => unit.gps.lat !== null && unit.gps.lng !== null).length,
      2,
      "las dos unidades deben poder dibujarse en el mapa de seguimiento"
    );

    const missing = await requestJson(`${context.url}/operational-units/no-existe`, { headers: auth });
    assert.equal(missing.status, 404);

    const unauthorized = await requestJson(`${context.url}/operational-units`);
    assert.equal(unauthorized.status, 401);

    // --- Aislamiento entre tenants ----------------------------------------
    const other = await createActiveTenant(context);
    const otherList = await requestJson(`${context.url}/operational-units`, {
      headers: { Authorization: `Bearer ${other.token}` }
    });
    assert.equal(otherList.status, 200);
    assert.equal(otherList.payload.data.length, 0, "un tenant no puede ver unidades de otro");

    console.log(`ok - contrato operacional expone C-1, C-2 y C-3 (${c3.code} incluida) sin ocultar por GPS`);
  } finally {
    await context.close();
  }
}

run().then(
  () => console.log("operational units endpoint tests passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
