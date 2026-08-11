const assert = require("node:assert/strict");
const {
  GPS_FRESH_MAX_AGE_SECONDS,
  GPS_STALE_MAX_AGE_SECONDS,
  buildOperationalUnitSnapshot
} = require("../src/domain/operational-unit-snapshot");

const NOW = new Date("2026-07-18T10:08:00.000Z");

function vehicleAt(secondsAgo, overrides = {}) {
  return {
    id: "veh-1",
    code: "C-1",
    plate: "FBZ-404",
    status: "available",
    location: { latitude: 19.3139, longitude: -98.2404 },
    locationTimestamp: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
    ...overrides
  };
}

// --- Unidad recien dada de alta: sin GPS, sin sesion, sin ruta ------------
// Caso real C-2. Debe seguir siendo visible.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: { id: "veh-2", code: "C-2", plate: "ABC-123", status: "available" },
    now: NOW
  });

  assert.equal(snapshot.unitId, "veh-2");
  assert.equal(snapshot.label, "C-2");
  assert.equal(snapshot.plates, "ABC-123");
  assert.equal(snapshot.visibility, "visible", "una unidad nueva no puede desaparecer");
  assert.equal(snapshot.gps.freshness, "missing");
  assert.equal(snapshot.gps.lat, null);
  assert.equal(snapshot.gps.lng, null);
  assert.equal(snapshot.gps.ageSeconds, null);
  assert.equal(snapshot.route, null);
  assert.equal(snapshot.driver, null);
  assert.equal(snapshot.session, null);
  assert.equal(snapshot.status, "idle");
  assert.equal(snapshot.operationalState, "no_route");
}

// --- visibility nunca depende de la frescura del GPS ----------------------
{
  for (const secondsAgo of [0, 60, 300, 86_400]) {
    const snapshot = buildOperationalUnitSnapshot({ vehicle: vehicleAt(secondsAgo), now: NOW });
    assert.equal(snapshot.visibility, "visible", `visibility cambio con antiguedad ${secondsAgo}s`);
  }

  const stale = buildOperationalUnitSnapshot({ vehicle: vehicleAt(86_400), now: NOW });
  assert.equal(stale.gps.freshness, "missing");
  assert.equal(stale.visibility, "visible", "GPS vencido no puede ocultar la unidad");
}

// --- Unidad archivada: unico motivo de ocultamiento -----------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(10, { status: "archived" }),
    now: NOW
  });
  assert.equal(snapshot.visibility, "hidden");
}

// --- Umbrales de frescura ------------------------------------------------
{
  const fresh = buildOperationalUnitSnapshot({ vehicle: vehicleAt(GPS_FRESH_MAX_AGE_SECONDS), now: NOW });
  assert.equal(fresh.gps.freshness, "fresh");
  assert.equal(fresh.gps.ageSeconds, GPS_FRESH_MAX_AGE_SECONDS);

  const stale = buildOperationalUnitSnapshot({ vehicle: vehicleAt(GPS_FRESH_MAX_AGE_SECONDS + 1), now: NOW });
  assert.equal(stale.gps.freshness, "stale");

  const stillStale = buildOperationalUnitSnapshot({ vehicle: vehicleAt(GPS_STALE_MAX_AGE_SECONDS), now: NOW });
  assert.equal(stillStale.gps.freshness, "stale");

  const expired = buildOperationalUnitSnapshot({ vehicle: vehicleAt(GPS_STALE_MAX_AGE_SECONDS + 1), now: NOW });
  assert.equal(expired.gps.freshness, "missing");
  assert.notEqual(expired.gps.lat, null, "GPS vencido conserva la ultima posicion conocida");
}

// --- Ultima posicion conocida sin sello de tiempo -------------------------
// El mini-mapa de ruta dibuja con solo `vehicle.location`; el mapa de
// seguimiento debe poder hacer lo mismo. Una posicion conocida no se descarta
// por no saber cuando se tomo.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: {
      id: "veh-1",
      code: "C-1",
      status: "available",
      location: { latitude: 19.3139, longitude: -98.2404 }
      // sin locationTimestamp
    },
    now: NOW
  });

  assert.equal(snapshot.gps.lat, 19.3139, "la posicion conocida se conserva");
  assert.equal(snapshot.gps.lng, -98.2404);
  assert.equal(snapshot.gps.recordedAt, null, "no inventamos una fecha que no tenemos");
  assert.equal(snapshot.gps.ageSeconds, null);
  assert.equal(snapshot.gps.freshness, "missing");
  assert.equal(snapshot.visibility, "visible");
}

// Timestamp invalido: mismo trato que ausente, sin lanzar excepcion.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: {
      id: "veh-1",
      code: "C-1",
      status: "available",
      location: { latitude: 19.3139, longitude: -98.2404 },
      locationTimestamp: "no-es-una-fecha"
    },
    now: NOW
  });

  assert.equal(snapshot.gps.lat, 19.3139);
  assert.equal(snapshot.gps.recordedAt, null);
  assert.equal(snapshot.gps.freshness, "missing");
}

// Sin coordenadas si no hay nada que dibujar.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: { id: "veh-1", code: "C-1", status: "available", locationTimestamp: NOW.toISOString() },
    now: NOW
  });

  assert.equal(snapshot.gps.lat, null);
  assert.equal(snapshot.gps.freshness, "missing");
}

// --- Velocidad convertida en backend, nunca en cliente --------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(30, { speed: 10 }),
    now: NOW
  });
  assert.equal(snapshot.gps.speedKmh, 36, "10 m/s son 36 km/h");
  assert.equal("speedMetersPerSecond" in snapshot.gps, false);
}

// --- Mantenimiento -------------------------------------------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(30, { status: "maintenance" }),
    now: NOW
  });
  assert.equal(snapshot.status, "maintenance");
  assert.equal(snapshot.operationalState, "maintenance");
  assert.equal(snapshot.visibility, "visible");
}

// --- Ruta activa: etaAt es el unico ETA ----------------------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(5, {
      status: "on-route",
      speed: 12,
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" },
      activeRouteProgress: {
        progressPercent: 40,
        timeRemainingSeconds: 540,
        etaAt: "2026-07-18T10:17:00.000Z",
        distanceFromRoute: 12.4,
        checkpointCount: 4,
        currentCheckpointIndex: 1,
        speedMetersPerSecond: 12,
        timestamp: NOW.toISOString()
      }
    }),
    activeSession: {
      id: "ses-1",
      status: "RUNNING",
      driverId: "usr-9",
      startedAt: "2026-07-18T09:38:00.000Z"
    },
    driver: { id: "usr-9", name: "Erik" },
    now: NOW
  });

  assert.equal(snapshot.route.id, "rt-1");
  assert.equal(snapshot.route.name, "Santa Ana");
  assert.equal(snapshot.route.etaAt, "2026-07-18T10:17:00.000Z");
  assert.equal(snapshot.route.progressRatio, 0.4);
  assert.equal(snapshot.route.remainingTimeSeconds, 540);
  assert.equal(snapshot.route.deviationMeters, 12);
  assert.equal(snapshot.route.currentCheckpoint, "1/4");
  assert.equal("etaMinutes" in snapshot.route, false, "etaMinutes no puede existir en el contrato");
  assert.equal(snapshot.status, "active");
  assert.equal(snapshot.operationalState, "on_route");
  assert.equal(snapshot.session.id, "ses-1");
  assert.equal(snapshot.session.elapsedSeconds, 30 * 60);
}

// --- Conductor: prioridad sesion -> asignacion -> ninguno -----------------
{
  const fromSession = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(10, { driverId: "usr-asignado", driverName: "Asignado" }),
    activeSession: { id: "s", status: "RUNNING", driverId: "usr-sesion", startedAt: NOW.toISOString() },
    driver: { id: "usr-sesion", name: "En jornada" },
    now: NOW
  });
  assert.equal(fromSession.driver.source, "session");
  assert.equal(fromSession.driver.id, "usr-sesion");

  const fromAssignment = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(10, { driverId: "usr-asignado", driverName: "Asignado" }),
    now: NOW
  });
  assert.equal(fromAssignment.driver.source, "assignment");
  assert.equal(fromAssignment.driver.id, "usr-asignado");

  const none = buildOperationalUnitSnapshot({ vehicle: vehicleAt(10), now: NOW });
  assert.equal(none.driver, null);
}

// --- Incidencias como conteos -------------------------------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(10),
    incidents: [
      { id: "i1", status: "open", createdAt: "2026-07-18T09:00:00.000Z" },
      { id: "i2", status: "open", createdAt: "2026-07-18T09:30:00.000Z" },
      { id: "i3", status: "in_progress", createdAt: "2026-07-18T08:00:00.000Z" },
      { id: "i4", status: "resolved", createdAt: "2026-07-18T07:00:00.000Z" }
    ],
    now: NOW
  });

  assert.equal(snapshot.incidents.open, 2);
  assert.equal(snapshot.incidents.inProgress, 1);
  assert.equal(snapshot.incidents.lastAt, "2026-07-18T09:30:00.000Z");
}

{
  const snapshot = buildOperationalUnitSnapshot({ vehicle: vehicleAt(10), now: NOW });
  assert.deepEqual(snapshot.incidents, { open: 0, inProgress: 0, lastAt: null });
}

// --- Datos faltantes no lanzan excepcion ---------------------------------
{
  const snapshot = buildOperationalUnitSnapshot({ vehicle: { id: "veh-x" }, now: NOW });
  assert.equal(snapshot.label, "Unidad sin folio");
  assert.equal(snapshot.plates, null);
  assert.equal(snapshot.visibility, "visible");
  assert.equal(snapshot.route, null);
  assert.equal(snapshot.gps.freshness, "missing");

  assert.throws(() => buildOperationalUnitSnapshot({}), TypeError);
}

// --- Sesion terminal no cuenta como jornada activa ------------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(10),
    activeSession: { id: "s", status: "FINISHED", driverId: "usr-1", startedAt: NOW.toISOString() },
    now: NOW
  });
  assert.equal(snapshot.session, null);
  assert.equal(snapshot.driver, null, "una sesion terminada no aporta conductor");
}

// --- Sin GPS sobre ruta: no se afirma que este detenida -------------------
// Caso real C-1 del 2026-07-18: el panel decia "Detenida" con "Sin GPS".
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: {
      id: "veh-1",
      code: "C-1",
      plate: "FBZ-404",
      status: "available",
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" }
    },
    now: NOW
  });

  assert.equal(snapshot.gps.freshness, "missing");
  assert.notEqual(snapshot.route, null, "la ruta asignada se conserva");
  assert.equal(
    snapshot.operationalState,
    "unknown",
    "sin GPS no se puede afirmar que la unidad este detenida"
  );
}

// Velocidad 0 heredada del esquema (`speed: default 0`) con GPS viejo.
// Caso real C-1 del 2026-07-18: el panel decia "Detenida" con posicion de
// hace 5 dias, porque la velocidad se evaluaba antes que la frescura.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(5 * 24 * 60 * 60, {
      speed: 0,
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" }
    }),
    now: NOW
  });

  assert.equal(snapshot.gps.freshness, "missing");
  assert.equal(snapshot.gps.speedKmh, 0, "el 0 del esquema sigue viajando en el contrato");
  assert.equal(
    snapshot.operationalState,
    "unknown",
    "una velocidad de hace 5 dias no sostiene la afirmacion 'detenida'"
  );
}

// Con GPS realmente live, la velocidad si manda.
{
  const detenida = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(5, {
      speed: 0,
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" }
    }),
    now: NOW
  });
  assert.equal(detenida.gps.connectionState, "live");
  assert.equal(detenida.operationalState, "stopped");

  const circulando = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(5, {
      status: "on-route",
      speed: 12,
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" }
    }),
    now: NOW
  });
  assert.equal(circulando.operationalState, "on_route");
}

// GPS vencido tampoco sostiene una afirmacion de movimiento.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(GPS_FRESH_MAX_AGE_SECONDS + 1, {
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" }
    }),
    now: NOW
  });

  assert.equal(snapshot.gps.freshness, "stale");
  assert.equal(snapshot.operationalState, "unknown");
}

// Una jornada pausada si es una afirmacion explicita: vale aunque falte GPS.
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: {
      id: "veh-1",
      code: "C-1",
      status: "available",
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" }
    },
    activeSession: { id: "s", status: "PAUSED", driverId: "d", startedAt: NOW.toISOString() },
    now: NOW
  });

  assert.equal(snapshot.operationalState, "stopped");
}

// --- Unidad detenida sobre ruta -----------------------------------------
{
  const snapshot = buildOperationalUnitSnapshot({
    vehicle: vehicleAt(5, {
      status: "on-route",
      speed: 0.2,
      assignedRoute: { routeId: "rt-1", routeName: "Santa Ana" },
      activeRouteProgress: { progressPercent: 55, timeRemainingSeconds: 300, etaAt: null, speedMetersPerSecond: 0.2 }
    }),
    activeSession: { id: "s", status: "RUNNING", driverId: "d", startedAt: NOW.toISOString() },
    now: NOW
  });
  assert.equal(snapshot.operationalState, "stopped");
  assert.equal(snapshot.route.etaAt, null);
}

console.log("operational unit snapshot tests passed");