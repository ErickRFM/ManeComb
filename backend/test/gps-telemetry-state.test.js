const assert = require("node:assert/strict");
const {
  GPS_DELAYED_MAX_AGE_SECONDS,
  GPS_LIVE_MAX_AGE_SECONDS,
  GPS_STALE_MAX_AGE_SECONDS,
  buildGpsTelemetryState,
  toLegacyFreshness
} = require("../src/domain/gps-telemetry-state");
const { buildOperationalUnitSnapshot } = require("../src/domain/operational-unit-snapshot");
const { buildGpsFreshness } = require("../src/services/tracking-time");

const NOW = new Date("2026-08-14T09:00:00.000Z");
const POSITION = { latitude: 19.3139, longitude: -98.2404 };

function vehicleAt(secondsAgo, overrides = {}) {
  const timestamp = new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
  return {
    id: "vehicle-1",
    code: "C-3",
    status: "available",
    location: POSITION,
    locationTimestamp: timestamp,
    locationReceivedAt: timestamp,
    ...overrides
  };
}

// --- Unidad que jamas reporto -------------------------------------------------
// Es el caso que producia "GPS vencido" en una unidad recien dada de alta.
{
  const telemetry = buildGpsTelemetryState({ id: "vehicle-2", code: "C-9" }, NOW.getTime());
  assert.equal(telemetry.state, "never_reported");
  assert.equal(telemetry.hasEverReported, false);
  assert.equal(telemetry.hasPosition, false);
  assert.equal(telemetry.ageSeconds, null, "no hay edad que reportar sin telemetria");
  assert.equal(toLegacyFreshness(telemetry.state), "missing");
}

// --- Escalera canonica --------------------------------------------------------
{
  const ladder = [
    [0, "live"],
    [GPS_LIVE_MAX_AGE_SECONDS, "live"],
    [GPS_LIVE_MAX_AGE_SECONDS + 1, "delayed"],
    [GPS_DELAYED_MAX_AGE_SECONDS, "delayed"],
    [GPS_DELAYED_MAX_AGE_SECONDS + 1, "stale"],
    [GPS_STALE_MAX_AGE_SECONDS, "stale"],
    [GPS_STALE_MAX_AGE_SECONDS + 1, "lost"],
    [86_400, "lost"]
  ];

  for (const [secondsAgo, expected] of ladder) {
    const telemetry = buildGpsTelemetryState(vehicleAt(secondsAgo), NOW.getTime());
    assert.equal(telemetry.state, expected, `edad ${secondsAgo}s deberia ser ${expected}`);
    assert.equal(telemetry.ageSeconds, secondsAgo);
    assert.equal(telemetry.latitude, POSITION.latitude, "la ultima posicion conocida nunca se descarta");
  }
}

// --- ALTA DE NUEVO CONDUCTOR SOBRE UNIDAD CON HISTORIAL ----------------------
// Empresa existente -> unidad existente con ultima ubicacion de otro momento ->
// se genera key -> nuevo conductor se registra -> se le asigna esa unidad.
//
// El sistema NO puede interpretar esa coordenada historica como GPS actual del
// conductor, y tampoco puede borrarla: sigue siendo la ultima posicion conocida
// de la unidad. La autoridad es la telemetria, jamas la antiguedad de la cuenta.
{
  const historicalFix = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const vehicle = {
    id: "vehicle-1",
    code: "C-3",
    status: "available",
    location: POSITION,
    locationTimestamp: historicalFix,
    locationReceivedAt: historicalFix,
    // Conductor recien activado hoy sobre una unidad que ya existia.
    driverId: "driver-nuevo"
  };

  const snapshot = buildOperationalUnitSnapshot({
    vehicle,
    driver: { id: "driver-nuevo", name: "Conductor Nuevo", createdAt: NOW.toISOString() },
    now: NOW
  });

  assert.equal(snapshot.gps.connectionState, "lost", "no puede afirmarse enlace vivo");
  assert.notEqual(snapshot.gps.connectionState, "never_reported", "la unidad si tiene historial");
  assert.equal(snapshot.gps.lat, POSITION.latitude, "la ultima posicion conocida se conserva");
  assert.equal(snapshot.gps.ageSeconds, 90 * 24 * 60 * 60, "la edad expone que es historica");
  assert.equal(snapshot.visibility, "visible");
  assert.equal(
    snapshot.operationalState,
    "no_route",
    "sin ruta y sin enlace vivo no se afirma operacion en curso"
  );

  // La misma unidad, antes de que el nuevo conductor encienda la app por primera
  // vez y sin historial previo, esta esperando su primera ubicacion.
  const sinHistorial = buildOperationalUnitSnapshot({
    vehicle: { id: "vehicle-9", code: "C-9", status: "available", driverId: "driver-nuevo" },
    driver: { id: "driver-nuevo", name: "Conductor Nuevo" },
    now: NOW
  });
  assert.equal(sinHistorial.gps.connectionState, "never_reported");
  assert.equal(sinHistorial.gps.lat, null);
  assert.equal(sinHistorial.visibility, "visible", "una unidad sin GPS sigue existiendo");
}

// --- La antiguedad de la cuenta no participa en la frescura -------------------
{
  const fresh = vehicleAt(3);
  const conCuentaVieja = buildOperationalUnitSnapshot({
    vehicle: { ...fresh, createdAt: "2019-01-01T00:00:00.000Z", driverId: "driver-1" },
    driver: { id: "driver-1", name: "Conductor", createdAt: "2019-01-01T00:00:00.000Z" },
    now: NOW
  });
  assert.equal(conCuentaVieja.gps.connectionState, "live");
  assert.equal(conCuentaVieja.gps.freshness, "fresh");
}

// --- Reloj del telefono desviado ---------------------------------------------
// La recepcion del servidor manda: un telefono 5 minutos atrasado no apaga una
// unidad que reporto hace 3 segundos.
{
  const telemetry = buildGpsTelemetryState(
    vehicleAt(300, { locationReceivedAt: new Date(NOW.getTime() - 3_000).toISOString() }),
    NOW.getTime()
  );
  assert.equal(telemetry.state, "live");
  assert.equal(telemetry.ageSeconds, 3);
}

// --- Cola offline: un backlog no rejuvenece al recuperar Internet -------------
{
  const telemetry = buildGpsTelemetryState(
    vehicleAt(1800, {
      locationReceivedAt: NOW.toISOString(),
      locationTimestampSource: "transport_queue_age"
    }),
    NOW.getTime()
  );
  assert.equal(telemetry.state, "lost", "30 min en cola no son una posicion viva");
  assert.equal(telemetry.ageSeconds, 1800);

  const immediate = buildGpsTelemetryState(
    vehicleAt(0, {
      locationReceivedAt: NOW.toISOString(),
      locationTimestampSource: "transport_queue_age"
    }),
    NOW.getTime()
  );
  assert.equal(immediate.state, "live", "una captura inmediata de la cola si es viva");
}

// --- Posicion conocida sin sello de tiempo ------------------------------------
{
  const telemetry = buildGpsTelemetryState(
    { id: "vehicle-1", location: POSITION },
    NOW.getTime()
  );
  assert.equal(telemetry.state, "lost", "sin sello no se puede afirmar enlace vivo");
  assert.equal(telemetry.ageSeconds, null);
  assert.equal(telemetry.latitude, POSITION.latitude);
}

// --- Sello sin coordenadas: no hay nada que ubicar ----------------------------
{
  const telemetry = buildGpsTelemetryState(
    { id: "vehicle-1", locationTimestamp: NOW.toISOString() },
    NOW.getTime()
  );
  assert.equal(telemetry.hasPosition, false);
  assert.equal(telemetry.state, "lost");
  assert.equal(telemetry.ageSeconds, null);
}

// --- Una sola autoridad: REST/socket y snapshot nunca se contradicen ----------
{
  for (const secondsAgo of [0, 5, 9, 14, 16, 25, 31, 600, 86_400]) {
    const vehicle = vehicleAt(secondsAgo);
    const rest = buildGpsFreshness(vehicle, NOW);
    const snapshot = buildOperationalUnitSnapshot({ vehicle, now: NOW });
    assert.equal(
      rest.connectionState,
      snapshot.gps.connectionState,
      `REST y snapshot discrepan con edad ${secondsAgo}s`
    );
    assert.equal(rest.state, snapshot.gps.freshness, `frescura legada discrepa con edad ${secondsAgo}s`);
    assert.equal(rest.ageSeconds, snapshot.gps.ageSeconds);
  }
}

console.log("ok - estado de telemetria GPS con autoridad unica y distincion never_reported/lost");
