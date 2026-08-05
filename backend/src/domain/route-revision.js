// RC-MULTI-ROUTE-DRIVER-01 F3 (etapa 2) — Revision operativa de una Route.
//
// `Route.revision` es un entero monotono que solo cambia cuando la GEOMETRIA/operacion de la ruta
// cambia (origen, destino, etiquetas, paradas, polyline, distancia, duraciones). Cambios
// cosmeticos (name, code, color) NO incrementan la revision. La asignacion copia este valor en
// `routeRevision` al activar (motor F3) para detectar drift entre lo que el conductor vio y la
// ruta oficial vigente.
//
// Regla de versionado (F2.1 §2 / spec §9):
//   - Rutas NUEVAS comienzan en revision 1.
//   - revision 0 = "legado no migrado" (no debe usarse para decidir drift hasta migrar).
//   - Un cambio operativo hace revision = (prev || 0) + 1 (monotono; un edit legado sube a >=1).
//
// Logica PURA (sin DB): la usan ambos stores (mongo/embedded) para no duplicar la regla.

// Campos que definen la ruta OPERATIVA. El orden es irrelevante (se comparan por fingerprint).
const OPERATIONAL_FIELDS = Object.freeze([
  "origin",
  "destination",
  "originLabel",
  "destinationLabel",
  "stops",
  "polyline",
  "distanceMeters",
  "durationSeconds",
  "durationInTrafficSeconds"
]);

// Campos cosmeticos (documentado para claridad; NO afectan la revision).
const COSMETIC_FIELDS = Object.freeze(["name", "code", "color"]);

// Redondeo estable de numeros para evitar ruido de punto flotante en coordenadas/metricas.
// 6 decimales ~= 0.11 m de precision en lat/lng — suficiente para no detectar "cambios" espurios.
function roundStable(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

// Normalizacion estable y agnostica de forma: ordena claves de objetos, redondea numeros,
// preserva el orden de los arreglos (el orden de paradas/polyline SI es significativo).
function normalizeValue(value) {
  if (value == null) return null;
  if (typeof value === "number") return roundStable(value);
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    // Mongoose subdocs / lean: usar toObject si existe para no serializar internals.
    const plain = typeof value.toObject === "function" ? value.toObject() : value;
    const out = {};
    for (const key of Object.keys(plain).sort()) {
      if (key === "_id" || key === "id" || key === "__v") continue; // ids de subdoc no son operativos
      out[key] = normalizeValue(plain[key]);
    }
    return out;
  }
  return null;
}

function pickOperationalFields(route) {
  const source = route && typeof route.toObject === "function" ? route.toObject() : route || {};
  const picked = {};
  for (const field of OPERATIONAL_FIELDS) {
    picked[field] = normalizeValue(source[field]);
  }
  return picked;
}

// Huella estable de la ruta operativa. Dos rutas con la misma geometria producen la misma huella
// aunque difieran en name/code/color/orden-de-claves/ruido-flotante.
function routeOperationalFingerprint(route) {
  return JSON.stringify(pickOperationalFields(route));
}

// True si `prev` y `next` difieren en algun campo OPERATIVO. `next` puede ser la ruta ya fusionada
// con el update (recomendado) para no confundir "campo ausente en el payload" con "campo borrado".
function hasRouteOperationalChange(prev, next) {
  return routeOperationalFingerprint(prev) !== routeOperationalFingerprint(next);
}

// Siguiente revision dado el valor previo y si hubo cambio operativo. Monotona; nunca decrece.
// Sin cambio => se conserva el valor previo tal cual (la migracion es la unica que sube 0->1 sin edit).
function nextRouteRevision(prevRevision, changed) {
  const prev = Number.isFinite(Number(prevRevision)) ? Number(prevRevision) : 0;
  if (!changed) return prevRevision;
  return prev + 1;
}

module.exports = {
  OPERATIONAL_FIELDS,
  COSMETIC_FIELDS,
  pickOperationalFields,
  routeOperationalFingerprint,
  hasRouteOperationalChange,
  nextRouteRevision
};
