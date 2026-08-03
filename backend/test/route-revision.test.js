const assert = require("node:assert/strict");
const {
  OPERATIONAL_FIELDS,
  COSMETIC_FIELDS,
  routeOperationalFingerprint,
  hasRouteOperationalChange,
  nextRouteRevision
} = require("../src/domain/route-revision");
const { createEmbeddedStore } = require("../src/data/store");
const { RouteModel } = require("../src/data/models");

function baseRoute(overrides = {}) {
  return {
    name: "R-1",
    code: "R-1",
    color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 },
    destination: { latitude: 19.4452, longitude: -99.1513 },
    originLabel: "Pantitlan",
    destinationLabel: "Tacuba",
    stops: [{ latitude: 19.43, longitude: -99.1 }],
    distanceMeters: 1000,
    durationSeconds: 600,
    durationInTrafficSeconds: 650,
    polyline: [
      { latitude: 19.415, longitude: -99.073 },
      { latitude: 19.4452, longitude: -99.1513 }
    ],
    revision: 1,
    ...overrides
  };
}

(async () => {
  // --- Dominio puro: fingerprint / hasRouteOperationalChange ---

  // Identicas -> sin cambio.
  assert.equal(hasRouteOperationalChange(baseRoute(), baseRoute()), false, "identicas: sin cambio");

  // Cambios COSMETICOS (name/code/color) NO cuentan como cambio operativo.
  for (const field of COSMETIC_FIELDS) {
    const changed = hasRouteOperationalChange(baseRoute(), baseRoute({ [field]: "DISTINTO-XYZ" }));
    assert.equal(changed, false, `cosmetico ${field}: no debe contar como operativo`);
  }

  // Cada campo OPERATIVO, al cambiar, dispara cambio.
  const operationalMutations = {
    origin: { latitude: 19.5, longitude: -99.0 },
    destination: { latitude: 19.6, longitude: -99.2 },
    originLabel: "Otro origen",
    destinationLabel: "Otro destino",
    stops: [{ latitude: 19.44, longitude: -99.11 }],
    polyline: [
      { latitude: 19.415, longitude: -99.073 },
      { latitude: 19.5, longitude: -99.2 }
    ],
    distanceMeters: 2000,
    durationSeconds: 700,
    durationInTrafficSeconds: 800
  };
  for (const field of OPERATIONAL_FIELDS) {
    assert.ok(field in operationalMutations, `cobertura: falta mutacion para ${field}`);
    const changed = hasRouteOperationalChange(baseRoute(), baseRoute({ [field]: operationalMutations[field] }));
    assert.equal(changed, true, `operativo ${field}: debe contar como cambio`);
  }

  // Ruido de punto flotante por debajo del umbral (>6 decimales) NO cuenta como cambio.
  const noisy = baseRoute({ origin: { latitude: 19.4150000001, longitude: -99.0730000002 } });
  assert.equal(hasRouteOperationalChange(baseRoute(), noisy), false, "ruido <1e-6: sin cambio");

  // Cambio real de coordenada (por encima del umbral) SI cuenta.
  const realMove = baseRoute({ origin: { latitude: 19.41501, longitude: -99.073 } });
  assert.equal(hasRouteOperationalChange(baseRoute(), realMove), true, "movimiento real: cambio");

  // Orden de claves y _id de subdocumentos son irrelevantes.
  const reordered = {
    ...baseRoute(),
    origin: { longitude: -99.073, latitude: 19.415, _id: "sub-1" },
    stops: [{ longitude: -99.1, latitude: 19.43, _id: "stop-1" }]
  };
  assert.equal(
    routeOperationalFingerprint(baseRoute()),
    routeOperationalFingerprint(reordered),
    "orden de claves / _id de subdoc no afectan la huella"
  );
  console.log("ok - route-revision dominio: fingerprint estable, cosmeticos ignorados, operativos detectados");

  // --- nextRouteRevision ---
  assert.equal(nextRouteRevision(1, false), 1, "sin cambio: conserva revision");
  assert.equal(nextRouteRevision(1, true), 2, "con cambio: +1");
  assert.equal(nextRouteRevision(0, true), 1, "legado 0 con cambio: sube a 1");
  assert.equal(nextRouteRevision(undefined, true), 1, "ausente con cambio: 1");
  assert.equal(nextRouteRevision(5, true), 6, "monotona desde >1");
  console.log("ok - route-revision: nextRouteRevision monotona (0/undefined -> 1, +1 en cambio)");

  // --- Integracion embedded store ---
  const store = createEmbeddedStore();
  const created = store.createRoute({
    id: "rev-route-1",
    name: "R-REV",
    code: "R-REV",
    color: "#1473E6",
    origin: { latitude: 19.415, longitude: -99.073 },
    destination: { latitude: 19.4452, longitude: -99.1513 },
    stops: [],
    distanceMeters: 1000,
    durationSeconds: 600,
    durationInTrafficSeconds: 600,
    polyline: [
      { latitude: 19.415, longitude: -99.073 },
      { latitude: 19.4452, longitude: -99.1513 }
    ],
    organizationId: "org-rev",
    createdBy: "admin-1"
  });
  assert.equal(created.revision, 1, "ruta nueva embedded: revision 1");

  // Cosmetico: no mueve la revision.
  const afterCosmetic = store.updateRoute("rev-route-1", { name: "R-REV-2", color: "#000000" });
  assert.equal(afterCosmetic.revision, 1, "cambio cosmetico: revision se conserva");

  // Update operativo con el MISMO valor: no mueve la revision (comparacion estable).
  const afterNoop = store.updateRoute("rev-route-1", { distanceMeters: 1000 });
  assert.equal(afterNoop.revision, 1, "update operativo equivalente: sin incremento");

  // Cambio operativo real: incrementa.
  const afterOp = store.updateRoute("rev-route-1", { distanceMeters: 1500 });
  assert.equal(afterOp.revision, 2, "cambio operativo real: revision 2");

  // Otro cambio operativo: sigue incrementando.
  const afterOp2 = store.updateRoute("rev-route-1", { destination: { latitude: 19.5, longitude: -99.2 } });
  assert.equal(afterOp2.revision, 3, "segundo cambio operativo: revision 3");
  console.log("ok - route-revision embedded: create=1, cosmetico estable, operativo incrementa");

  // --- Modelo mongoose: default 1 ---
  const doc = new RouteModel({ _id: "m-1", name: "R", code: "R", color: "#000" });
  await doc.validate();
  assert.equal(doc.revision, 1, "RouteModel: revision default 1");
  const legacy = new RouteModel({ _id: "m-2", name: "R", code: "R", color: "#000", revision: 0 });
  await legacy.validate();
  assert.equal(legacy.revision, 0, "RouteModel: revision 0 (legado) permitida");
  await assert.rejects(
    new RouteModel({ _id: "m-3", name: "R", code: "R", color: "#000", revision: -1 }).validate(),
    "RouteModel: revision negativa rechazada (min 0)"
  );
  console.log("ok - route-revision modelo: default 1, 0 permitido, negativo rechazado");

  console.log("ok - route-revision F3 etapa 2: revision operativa (schema + stores + migracion)");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
