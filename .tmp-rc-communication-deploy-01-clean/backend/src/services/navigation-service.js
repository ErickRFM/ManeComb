const {
  MAPBOX_ACCESS_TOKEN,
  MAP_GEOCODING_PROVIDER,
  MAP_HTTP_USER_AGENT,
  MAP_ROUTING_PROVIDER,
  NOMINATIM_API_URL,
  OSRM_API_URL,
  PHOTON_API_URL,
  VALHALLA_API_URL
} = require("../config/env");

const REQUEST_TIMEOUT_MS = 9000;

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": MAP_HTTP_USER_AGENT,
        Accept: "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proveedor de mapas respondio ${response.status}: ${errorText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function toPoint(point) {
  return {
    latitude: Number(point.latitude),
    longitude: Number(point.longitude)
  };
}

function normalizeStops(stops = []) {
  return (Array.isArray(stops) ? stops : [])
    .map((stop, index) => {
      const latitude = Number(stop.latitude);
      const longitude = Number(stop.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        return null;
      }

      return {
        id: String(stop.id || `stop-${index + 1}`).trim() || `stop-${index + 1}`,
        latitude,
        longitude,
        address: String(stop.address || "").trim(),
        order: Math.max(0, Number(stop.order) || index)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order)
    .map((stop, index) => ({
      ...stop,
      order: index
    }));
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

function decodePolyline6(encoded) {
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

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({
      latitude: latitude / 1e6,
      longitude: longitude / 1e6
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

function buildPolylineVariant(origin, destination, stops = [], bend = 0) {
  const routePoints = [toPoint(origin), ...normalizeStops(stops).map(toPoint), toPoint(destination)];

  if (routePoints.length > 2) {
    return routePoints;
  }

  const middleLatitude = (origin.latitude + destination.latitude) / 2 + bend;
  const middleLongitude = (origin.longitude + destination.longitude) / 2 - bend;

  return [
    routePoints[0],
    {
      latitude: middleLatitude,
      longitude: middleLongitude
    },
    routePoints[1]
  ];
}

function sumSegmentDistances(points) {
  return points.slice(1).reduce((total, point, index) => {
    return total + haversineDistanceMeters(points[index], point);
  }, 0);
}

function buildFallbackRoute(label, origin, destination, multiplier, bend, stops = []) {
  const polyline = buildPolylineVariant(origin, destination, stops, bend);
  const distanceMeters = Math.round(sumSegmentDistances(polyline));
  const durationSeconds = Math.max(60, Math.round(distanceMeters / 11));
  const durationInTrafficSeconds = Math.round(durationSeconds * multiplier);

  return {
    label,
    distanceMeters,
    durationSeconds,
    durationInTrafficSeconds,
    trafficLevel: buildTrafficLevel(durationSeconds, durationInTrafficSeconds),
    polyline
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

function buildAddressLabel(properties) {
  return [
    properties.name,
    properties.street,
    properties.city || properties.locality || properties.county,
    properties.state,
    properties.country
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizeExternalPlace(entry, index, provider) {
  if (provider === "mapbox") {
    const [longitude, latitude] = entry.center || entry.geometry?.coordinates || [];
    const label = entry.text || entry.place_name || "Destino";

    return {
      id: entry.id || `${provider}-${index}`,
      label,
      address: entry.place_name || label,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude)
      }
    };
  }

  if (provider === "photon") {
    const [longitude, latitude] = entry.geometry?.coordinates || [];
    const label = buildAddressLabel(entry.properties || {}) || "Destino";

    return {
      id: entry.properties?.osm_id ? `${provider}-${entry.properties.osm_id}` : `${provider}-${index}`,
      label,
      address: label,
      location: {
        latitude: Number(latitude),
        longitude: Number(longitude)
      }
    };
  }

  return {
    id: entry.osm_id ? `${provider}-${entry.osm_type || "place"}-${entry.osm_id}` : `${provider}-${index}`,
    label: entry.name || entry.display_name || "Destino",
    address: entry.display_name || entry.name || "",
    location: {
      latitude: Number(entry.lat),
      longitude: Number(entry.lon)
    }
  };
}

function cleanPlaceResults(results) {
  return results.filter((result) => (
    result.label &&
    Number.isFinite(result.location.latitude) &&
    Number.isFinite(result.location.longitude)
  ));
}

async function searchMapboxPlaces(query, origin) {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error("MAPBOX_ACCESS_TOKEN no configurado");
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
  );
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);
  url.searchParams.set("country", "mx");
  url.searchParams.set("language", "es");
  url.searchParams.set("limit", "5");
  url.searchParams.set("types", "address,poi,place,locality,neighborhood");

  if (origin) {
    url.searchParams.set("proximity", `${origin.longitude},${origin.latitude}`);
  }

  const payload = await fetchJson(url);

  return {
    provider: "mapbox",
    results: cleanPlaceResults((payload.features || []).map((entry, index) => normalizeExternalPlace(entry, index, "mapbox")))
  };
}

async function searchPhotonPlaces(query, origin) {
  const url = new URL(`${trimSlash(PHOTON_API_URL)}/api`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "es");

  if (origin) {
    url.searchParams.set("lat", String(origin.latitude));
    url.searchParams.set("lon", String(origin.longitude));
  }

  const payload = await fetchJson(url);

  return {
    provider: "photon",
    results: cleanPlaceResults((payload.features || []).map((entry, index) => normalizeExternalPlace(entry, index, "photon")))
  };
}

async function searchNominatimPlaces(query, origin) {
  const url = new URL(`${trimSlash(NOMINATIM_API_URL)}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es-MX,es");

  if (origin) {
    const lat = Number(origin.latitude);
    const lon = Number(origin.longitude);
    url.searchParams.set("viewbox", `${lon - 0.35},${lat + 0.35},${lon + 0.35},${lat - 0.35}`);
    url.searchParams.set("bounded", "0");
  }

  const payload = await fetchJson(url);

  return {
    provider: "nominatim",
    results: cleanPlaceResults((payload || []).map((entry, index) => normalizeExternalPlace(entry, index, "nominatim")))
  };
}

async function reversePhoton(point) {
  const url = new URL(`${trimSlash(PHOTON_API_URL)}/reverse`);
  url.searchParams.set("lat", String(point.latitude));
  url.searchParams.set("lon", String(point.longitude));
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "es");

  const payload = await fetchJson(url);
  const result = cleanPlaceResults((payload.features || []).map((entry, index) => normalizeExternalPlace(entry, index, "photon")))[0];

  return result || null;
}

async function reverseNominatim(point) {
  const url = new URL(`${trimSlash(NOMINATIM_API_URL)}/reverse`);
  url.searchParams.set("lat", String(point.latitude));
  url.searchParams.set("lon", String(point.longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "es-MX,es");

  const payload = await fetchJson(url);
  return cleanPlaceResults([normalizeExternalPlace(payload, 0, "nominatim")])[0] || null;
}

async function reverseMapbox(point) {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error("MAPBOX_ACCESS_TOKEN no configurado");
  }

  const location = toPoint(point);
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${location.longitude},${location.latitude}.json`
  );
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);
  url.searchParams.set("country", "mx");
  url.searchParams.set("language", "es");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,poi,place,locality,neighborhood");

  const payload = await fetchJson(url);
  return cleanPlaceResults((payload.features || []).map((entry, index) => normalizeExternalPlace(entry, index, "mapbox")))[0] || null;
}

async function searchPlaces(query, origin, store) {
  const openProviders =
    MAP_GEOCODING_PROVIDER === "nominatim"
      ? [searchNominatimPlaces, searchPhotonPlaces]
      : [searchPhotonPlaces, searchNominatimPlaces];
  const providers =
    MAP_GEOCODING_PROVIDER === "mapbox"
      ? [searchMapboxPlaces, ...openProviders]
      : [...openProviders, searchMapboxPlaces];

  for (const provider of providers) {
    try {
      const response = await provider(query, origin);

      if (response.results.length) {
        return response;
      }
    } catch {
      // Try the next configured provider before falling back to local data.
    }
  }

  const liveLocations = store ? await store.getLiveLocations() : null;
  return {
    provider: "system",
    results: buildFallbackPlaceResults(query, liveLocations, origin)
  };
}

async function reverseGeocode(point) {
  const openProviders =
    MAP_GEOCODING_PROVIDER === "nominatim"
      ? [reverseNominatim, reversePhoton]
      : [reversePhoton, reverseNominatim];
  const providers =
    MAP_GEOCODING_PROVIDER === "mapbox"
      ? [reverseMapbox, ...openProviders]
      : [...openProviders, reverseMapbox];

  for (const provider of providers) {
    try {
      const result = await provider(toPoint(point));

      if (result) {
        return {
          provider: result.id.startsWith("mapbox") || result.id.startsWith("poi") || result.id.startsWith("address")
            ? "mapbox"
            : result.id.startsWith("nominatim") ? "nominatim" : "photon",
          result
        };
      }
    } catch {
      // Try the next configured provider before returning coordinates.
    }
  }

  const location = toPoint(point);
  const label = `${location.latitude}, ${location.longitude}`;

  return {
    provider: "system",
    result: {
      id: `coordinates-${label}`,
      label,
      address: label,
      location
    }
  };
}

async function planOsrmRoute(origin, destination, stops = []) {
  const baseUrl = trimSlash(OSRM_API_URL);
  const routePoints = [toPoint(origin), ...normalizeStops(stops).map(toPoint), toPoint(destination)];
  const coordinates = routePoints.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const url = new URL(
    `${baseUrl}/route/v1/driving/${coordinates}`
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "polyline");
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("steps", "false");

  const payload = await fetchJson(url);

  return {
    provider: "osrm",
    origin: toPoint(origin),
    destination: toPoint(destination),
    stops: normalizeStops(stops),
    routes: (payload.routes || []).slice(0, 3).map((route, index) => {
      const durationSeconds = Math.round(Number(route.duration || 0));

      return {
        label: index === 0 ? "Ruta recomendada" : `Alternativa ${index}`,
        distanceMeters: Math.round(Number(route.distance || 0)),
        durationSeconds,
        durationInTrafficSeconds: durationSeconds,
        trafficLevel: "low",
        polyline: decodePolyline(route.geometry || "")
      };
    })
  };
}

async function planValhallaRoute(origin, destination, stops = []) {
  if (!VALHALLA_API_URL) {
    throw new Error("VALHALLA_API_URL no configurado");
  }
  const routePoints = [toPoint(origin), ...normalizeStops(stops).map(toPoint), toPoint(destination)];

  const payload = await fetchJson(`${trimSlash(VALHALLA_API_URL)}/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      locations: routePoints.map((point) => ({ lat: point.latitude, lon: point.longitude })),
      costing: "auto",
      directions_options: {
        language: "es-MX",
        units: "kilometers"
      }
    })
  });
  const summary = payload.trip?.summary || {};
  const durationSeconds = Math.round(Number(summary.time || 0));

  return {
    provider: "valhalla",
    origin: toPoint(origin),
    destination: toPoint(destination),
    stops: normalizeStops(stops),
    routes: [
      {
        label: "Ruta recomendada",
        distanceMeters: Math.round(Number(summary.length || 0) * 1000),
        durationSeconds,
        durationInTrafficSeconds: durationSeconds,
        trafficLevel: "low",
        polyline: decodePolyline6(payload.trip?.legs?.[0]?.shape || "")
      }
    ]
  };
}

async function planMapboxRoute(origin, destination, stops = []) {
  if (!MAPBOX_ACCESS_TOKEN) {
    throw new Error("MAPBOX_ACCESS_TOKEN no configurado");
  }

  const routePoints = [toPoint(origin), ...normalizeStops(stops).map(toPoint), toPoint(destination)];
  const coordinates = routePoints.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}`);
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN);
  url.searchParams.set("alternatives", "true");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("language", "es");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");

  const payload = await fetchJson(url);

  return {
    provider: "mapbox",
    origin: toPoint(origin),
    destination: toPoint(destination),
    stops: normalizeStops(stops),
    routes: (payload.routes || []).slice(0, 3).map((route, index) => {
      const durationSeconds = Math.round(Number(route.duration_typical || route.duration || 0));
      const durationInTrafficSeconds = Math.round(Number(route.duration || durationSeconds));

      return {
        label: index === 0 ? "Ruta recomendada" : `Alternativa ${index}`,
        distanceMeters: Math.round(Number(route.distance || 0)),
        durationSeconds,
        durationInTrafficSeconds,
        trafficLevel: buildTrafficLevel(durationSeconds, durationInTrafficSeconds),
        polyline: (route.geometry?.coordinates || []).map(([longitude, latitude]) => ({
          latitude: Number(latitude),
          longitude: Number(longitude)
        }))
      };
    })
  };
}

async function planRoute(origin, destination, stops = []) {
  const normalizedStops = normalizeStops(stops);
  const openProviders =
    MAP_ROUTING_PROVIDER === "valhalla"
      ? [planValhallaRoute, planOsrmRoute]
      : [planOsrmRoute, planValhallaRoute];
  const providers =
    MAP_ROUTING_PROVIDER === "mapbox"
      ? [planMapboxRoute, ...openProviders]
      : [...openProviders, planMapboxRoute];

  for (const provider of providers) {
    try {
      const response = await provider(toPoint(origin), toPoint(destination), normalizedStops);
      const routes = response.routes.filter((route) => route.polyline.length >= 2);

      if (routes.length) {
        return {
          ...response,
          routes
        };
      }
    } catch {
      // Try the next configured provider before falling back.
    }
  }

  return {
    provider: "system",
    origin: toPoint(origin),
    destination: toPoint(destination),
    stops: normalizedStops,
    routes: [
      buildFallbackRoute("Ruta recomendada", origin, destination, 1.1, 0.01, normalizedStops),
      buildFallbackRoute("Alternativa por congestion", origin, destination, 1.22, -0.012, normalizedStops)
    ]
  };
}

module.exports = {
  planRoute,
  reverseGeocode,
  searchPlaces
};
