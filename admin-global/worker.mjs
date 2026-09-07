const PLATFORM_PATH_PREFIX = '/api/platform';
const FORWARDED_REQUEST_HEADERS = Object.freeze([
  'accept',
  'authorization',
  'content-type',
  'idempotency-key',
  'if-match',
  'origin',
  'x-trace-id',
  'cf-access-jwt-assertion',
]);

function jsonResponse(status, code, message) {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      pragma: 'no-cache',
    },
  });
}

function normalizeUpstreamOrigin(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('ADMIN_API_ORIGIN debe ser una URL HTTPS absoluta.');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('ADMIN_API_ORIGIN debe ser un origen HTTPS sin credenciales.');
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('ADMIN_API_ORIGIN debe contener solo el origen, sin ruta, query o hash.');
  }

  return parsed.origin;
}

function isPlatformRequest(pathname) {
  return pathname === PLATFORM_PATH_PREFIX || pathname.startsWith(`${PLATFORM_PATH_PREFIX}/`);
}

function buildUpstreamRequest(request, upstreamOrigin) {
  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, `${upstreamOrigin}/`);
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  return new Request(upstreamUrl, init);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!isPlatformRequest(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    if (!request.headers.get('cf-access-jwt-assertion')) {
      return jsonResponse(403, 'PLATFORM_ACCESS_REQUIRED', 'Acceso privado requerido');
    }

    let upstreamOrigin;
    try {
      upstreamOrigin = normalizeUpstreamOrigin(env.ADMIN_API_ORIGIN);
    } catch {
      return jsonResponse(503, 'PLATFORM_PROXY_NOT_CONFIGURED', 'API privada no configurada');
    }

    try {
      const upstreamResponse = await fetch(buildUpstreamRequest(request, upstreamOrigin));

      if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
        return jsonResponse(
          502,
          'PLATFORM_UPSTREAM_REDIRECT',
          'La API privada respondió con una redirección no permitida'
        );
      }

      const headers = new Headers(upstreamResponse.headers);
      headers.set('cache-control', 'no-store, max-age=0');
      headers.set('pragma', 'no-cache');

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    } catch {
      return jsonResponse(502, 'PLATFORM_UPSTREAM_UNAVAILABLE', 'API privada no disponible');
    }
  },
};
