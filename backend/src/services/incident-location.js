const { buildGpsFreshness } = require("./tracking-time");

function hasCoordinates(location) {
  return Boolean(
    location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude))
  );
}

function resolveIncidentLocation(vehicle, requestedLocation, evaluatedAt = new Date()) {
  if (!vehicle) {
    return {
      location: hasCoordinates(requestedLocation) ? requestedLocation : null,
      locationState: hasCoordinates(requestedLocation) ? "fresh" : "missing",
      locationSourceTimestamp: requestedLocation?.timestamp || null
    };
  }

  const freshness = buildGpsFreshness(vehicle.locationTimestamp, evaluatedAt);
  if (freshness.state !== "fresh" || !hasCoordinates(vehicle.location)) {
    return {
      location: null,
      locationState: freshness.state,
      locationSourceTimestamp: vehicle.locationTimestamp || null
    };
  }

  return {
    location: {
      latitude: Number(vehicle.location.latitude),
      longitude: Number(vehicle.location.longitude),
      accuracy: Number.isFinite(Number(requestedLocation?.accuracy)) ? Number(requestedLocation.accuracy) : null,
      timestamp: vehicle.locationTimestamp
    },
    locationState: "fresh",
    locationSourceTimestamp: vehicle.locationTimestamp
  };
}

module.exports = { resolveIncidentLocation };
