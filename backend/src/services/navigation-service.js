const { GOOGLE_MAPS_API_KEY } = require("../config/env");

function toPoint(point) {
  return {
    latitude: Number(point.latitude),
    longitude: Number(point.longitude)
  };
}

function parseDurationSeconds(value) {
  if (!value || typeof value !== "string") {
    return 0;
  }

  return Number.parseFloat(value.replace("s", "")) || 0;
}

function haversineDistanceMeters(origin, destination) {
  const earthRadius = 6371000;
  const latitudeDelta = ((destination.latitude - origin.latitude) * Math.PI) / 180;
  const longitudeDelta = ((destination.longitude - origin.longitude) * Math.PI) / 180;
  const originLatitude = (origin.latitude * Math.PI) / 180;
  const destinationLatitude = (destination.latitude * Math.PI) / 180;

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function decodePolyline(encoded) {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const points = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = null;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += latitudeDelta;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const longitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += longitudeDelta;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5
    });
  }

  return points;
}

function buildTrafficLevel(durationSeconds, trafficDurationSeconds) {
  const effectiveDuration = trafficDurationSeconds || durationSeconds;
  const baseDuration = durationSeconds || effectiveDuration || 1;
  const multiplier = effectiveDuration / baseDuration;

  if (multiplier >= 1.35) {
    return "high";
  }

  if (multiplier >= 1.15) {
    return "medium";
  }

  return "low";
}

function buildPolylineVariant(origin, destination, bend = 0) {
  const middleLatitude = (origin.latitude + destination.latitude) / 2 + bend;
  const middleLongitude = (origin.longitude + destination.longitude) / 2 - bend;

  return [
    toPoint(origin),
    {
      latitude: middleLatitude,
      longitude: middleLongitude
    },
    toPoint(destination)
  ];
}

function buildFallbackRoute(label, origin, destination, multiplier, bend) {
  const distanceMeters = Math.round(haversineDistanceMeters(origin, destination));
  const durationSeconds = Math.max(60, Math.round(distanceMeters / 11));
  const durationInTrafficSeconds = Math.round(durationSeconds * multiplier);

  return {
    label,
    distanceMeters,
    durationSeconds,
    durationInTrafficSeconds,
    trafficLevel: buildTrafficLevel(durationSeconds, durationInTrafficSeconds),
    polyline: buildPolylineVariant(origin, destination, bend)
  };
}

function buildFallbackPlaceResults(query, liveLocations, origin) {
  const normalizedQuery = String(query || "").trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const routeResults = (liveLocations?.routes || [])
    .filter((route) => {
      return (
        route.name.toLowerCase().includes(normalizedQuery) ||
        route.code.toLowerCase().includes(normalizedQuery)
      );
    })
    .map((route) => {
      const lastPoint = route.polyline[route.polyline.length - 1] || origin;

      return {
        id: route.id,
        label: route.name,
        address: `Ruta ${route.code}`,
        location: toPoint(lastPoint)
      };
    });

  return routeResults.slice(0, 5);
}

async function searchPlaces(query, origin, store) {
  if (!GOOGLE_MAPS_API_KEY) {
    const liveLocations = store ? await store.getLiveLocations() : null;
    return {
      provider: "system",
      results: buildFallbackPlaceResults(query, liveLocations, origin)
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location"
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "es-MX",
      regionCode: "MX",
      pageSize: 5,
      locationBias: {
        circle: {
          center: {
            latitude: origin.latitude,
            longitude: origin.longitude
          },
          radius: 25000
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Places API respondio ${response.status}: ${errorText}`);
  }

  const payload = await response.json();

  return {
    provider: "google",
    results: (payload.places || []).map((place) => ({
      id: place.id,
      label: place.displayName?.text || place.formattedAddress || "Destino",
      address: place.formattedAddress || "",
      location: {
        latitude: Number(place.location?.latitude),
        longitude: Number(place.location?.longitude)
      }
    }))
  };
}

async function planRoute(origin, destination) {
  if (!GOOGLE_MAPS_API_KEY) {
    return {
      provider: "system",
      origin: toPoint(origin),
      destination: toPoint(destination),
      routes: [
        buildFallbackRoute("Ruta recomendada", origin, destination, 1.1, 0.01),
        buildFallbackRoute("Alternativa por congestion", origin, destination, 1.22, -0.012)
      ]
    };
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.routeLabels"
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: origin.latitude,
            longitude: origin.longitude
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.latitude,
            longitude: destination.longitude
          }
        }
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      computeAlternativeRoutes: true,
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "ENCODED_POLYLINE",
      languageCode: "es-MX",
      regionCode: "MX",
      units: "METRIC",
      departureTime: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Routes API respondio ${response.status}: ${errorText}`);
  }

  const payload = await response.json();

  return {
    provider: "google",
    origin: toPoint(origin),
    destination: toPoint(destination),
    routes: (payload.routes || []).map((route, index) => {
      const durationSeconds = parseDurationSeconds(route.staticDuration || route.duration);
      const durationInTrafficSeconds = parseDurationSeconds(route.duration);

      return {
        label: index === 0 ? "Ruta recomendada" : `Alternativa ${index}`,
        distanceMeters: Number(route.distanceMeters || 0),
        durationSeconds,
        durationInTrafficSeconds,
        trafficLevel: buildTrafficLevel(durationSeconds, durationInTrafficSeconds),
        polyline: decodePolyline(route.polyline?.encodedPolyline || "")
      };
    })
  };
}

module.exports = {
  planRoute,
  searchPlaces
};
