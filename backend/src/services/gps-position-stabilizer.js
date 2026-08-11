const EARTH_RADIUS_METERS = 6371000;

// El GPS de consumo puede oscilar varios metros aun con la unidad detenida.
// Menos de 8 m no constituye por si solo movimiento operacional: el paquete
// sigue demostrando vida/conectividad, pero conserva la ultima posicion estable.
const GPS_STATIONARY_JITTER_METERS = 8;

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(left, right) {
  const from = normalizeCoordinate(left);
  const to = normalizeCoordinate(right);
  if (!from || !to) return null;

  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const latitudeA = toRadians(from.latitude);
  const latitudeB = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/**
 * Separa dos conceptos que antes viajaban mezclados en cada paquete GPS:
 *
 * - `movement`: hay desplazamiento suficiente y la coordenada puede avanzar.
 * - `heartbeat`: el GPS sigue reportando, pero el cambio cae dentro del radio
 *   de jitter; se refresca la vida del GPS sin mover el pin.
 * - `initial`: aun no existe una posicion estable y se acepta la primera.
 *
 * La decision se toma contra la ultima posicion persistida, no contra el fix
 * inmediatamente anterior. Asi, un movimiento real lento se acumula y cruza
 * naturalmente el umbral en lugar de quedar congelado para siempre.
 */
function stabilizeGpsPosition(previousPoint, incomingPoint, thresholdMeters = GPS_STATIONARY_JITTER_METERS) {
  const incoming = normalizeCoordinate(incomingPoint);
  if (!incoming) {
    throw new TypeError("stabilizeGpsPosition requiere una coordenada entrante valida");
  }

  const previous = normalizeCoordinate(previousPoint);
  if (!previous) {
    return {
      kind: "initial",
      coordinates: incoming,
      distanceMeters: null,
      stabilized: false,
      thresholdMeters
    };
  }

  const distanceMeters = distanceInMeters(previous, incoming);
  if (distanceMeters !== null && distanceMeters < thresholdMeters) {
    return {
      kind: "heartbeat",
      coordinates: previous,
      distanceMeters,
      stabilized: true,
      thresholdMeters
    };
  }

  return {
    kind: "movement",
    coordinates: incoming,
    distanceMeters,
    stabilized: false,
    thresholdMeters
  };
}

module.exports = {
  GPS_STATIONARY_JITTER_METERS,
  distanceInMeters,
  stabilizeGpsPosition
};
