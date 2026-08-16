import assert from 'node:assert/strict';

const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const ALLOWED_PORTAL_HOSTS = new Set(['manecomb.com', 'www.manecomb.com']);
const ALLOWED_API_HOSTS = new Set(['manecomb.onrender.com', 'api.manecomb.com']);
const KNOWN_CAPABILITIES = new Set([
  'storage',
  'payments',
  'rtc',
  'transcription',
  'email',
  'whatsapp',
  'communication_queue',
]);

function normalizeCommit(value) {
  const commit = String(value || '').trim().toLowerCase();
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error('CERT_EXPECTED_COMMIT debe ser un SHA Git completo de 40 caracteres.');
  }
  return commit;
}

function parseHttpsTarget(value, { label, allowedHosts, expectedPath = '/' }) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${label} debe ser una URL absoluta válida.`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} debe usar HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} no debe incluir credenciales.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} no debe incluir query ni fragmento.`);
  }
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(`${label} apunta a un host no autorizado: ${parsed.hostname}.`);
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath !== expectedPath) {
    throw new Error(`${label} debe usar la ruta ${expectedPath}.`);
  }

  return parsed;
}

function parseRequiredCapabilities(value) {
  const capabilities = String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  for (const capability of capabilities) {
    if (!KNOWN_CAPABILITIES.has(capability)) {
      throw new Error(`Capacidad requerida desconocida: ${capability}.`);
    }
  }

  return Array.from(new Set(capabilities));
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} no devolvió JSON válido (HTTP ${response.status}).`);
  }

  return { response, body };
}

async function verifyProductionTarget({
  portalUrl,
  apiUrl,
  expectedCommit,
  requiredCapabilities,
}) {
  const portal = parseHttpsTarget(portalUrl, {
    label: 'CERT_BASE_URL',
    allowedHosts: ALLOWED_PORTAL_HOSTS,
    expectedPath: '/',
  });
  const api = parseHttpsTarget(apiUrl, {
    label: 'CERT_API_URL',
    allowedHosts: ALLOWED_API_HOSTS,
    expectedPath: '/api',
  });
  const commit = normalizeCommit(expectedCommit);
  const required = parseRequiredCapabilities(requiredCapabilities);
  const cacheBuster = encodeURIComponent(commit);

  const portalMetadataUrl = new URL(`/build-meta.json?certification=${cacheBuster}`, portal.origin);
  const portalMetadata = await fetchJson(portalMetadataUrl, 'Ventas build metadata');
  assert.equal(portalMetadata.response.status, 200, 'Ventas build-meta.json debe responder HTTP 200');
  assert.equal(portalMetadata.body?.product, 'ventas', 'el metadata live debe pertenecer a Ventas');
  assert.equal(
    String(portalMetadata.body?.commit || '').toLowerCase(),
    commit,
    'Cloudflare está sirviendo un commit distinto al que se pidió certificar'
  );

  const readinessUrl = new URL(`${api.pathname.replace(/\/$/, '')}/health/ready`, api.origin);
  readinessUrl.searchParams.set('certification', commit);
  const readiness = await fetchJson(readinessUrl, 'Backend readiness');
  assert.equal(readiness.response.status, 200, 'el backend debe estar core-ready antes de usar credenciales live');
  assert.equal(readiness.body?.ok, true, 'readiness debe responder ok=true');
  assert.equal(readiness.body?.ready, true, 'readiness debe responder ready=true');
  assert.equal(
    ['ok', 'degraded'].includes(String(readiness.body?.status || '')),
    true,
    'un backend not_ready no puede certificarse'
  );
  assert.equal(
    String(readiness.body?.runtime?.commit || '').toLowerCase(),
    commit,
    'Render está ejecutando un commit distinto al que se pidió certificar'
  );

  const degradedCapabilities = new Set(
    Array.isArray(readiness.body?.readiness?.degradedCapabilities)
      ? readiness.body.readiness.degradedCapabilities.map((entry) => String(entry).toLowerCase())
      : []
  );
  const unavailableRequired = required.filter((capability) => degradedCapabilities.has(capability));
  assert.deepEqual(
    unavailableRequired,
    [],
    `faltan capacidades requeridas para esta certificación: ${unavailableRequired.join(', ')}`
  );

  return {
    commit,
    portalOrigin: portal.origin,
    apiOrigin: api.origin,
    status: readiness.body.status,
    degradedCapabilities: Array.from(degradedCapabilities),
    requiredCapabilities: required,
  };
}

function runSelfTest() {
  assert.equal(
    parseHttpsTarget('https://manecomb.com', {
      label: 'portal',
      allowedHosts: ALLOWED_PORTAL_HOSTS,
      expectedPath: '/',
    }).origin,
    'https://manecomb.com'
  );
  assert.throws(
    () => parseHttpsTarget('http://manecomb.com', {
      label: 'portal',
      allowedHosts: ALLOWED_PORTAL_HOSTS,
      expectedPath: '/',
    }),
    /HTTPS/
  );
  assert.throws(
    () => parseHttpsTarget('https://example.com', {
      label: 'portal',
      allowedHosts: ALLOWED_PORTAL_HOSTS,
      expectedPath: '/',
    }),
    /host no autorizado/
  );
  assert.throws(
    () => parseHttpsTarget('https://manecomb.com.evil.example', {
      label: 'portal',
      allowedHosts: ALLOWED_PORTAL_HOSTS,
      expectedPath: '/',
    }),
    /host no autorizado/
  );
  assert.equal(normalizeCommit('a'.repeat(40)), 'a'.repeat(40));
  assert.throws(() => normalizeCommit('abc123'), /40 caracteres/);
  assert.deepEqual(parseRequiredCapabilities('storage,payments,storage'), ['storage', 'payments']);
  assert.throws(() => parseRequiredCapabilities('storage,root_access'), /desconocida/);
  console.log('ok - production certification target policy');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const result = await verifyProductionTarget({
    portalUrl: process.env.CERT_BASE_URL,
    apiUrl: process.env.CERT_API_URL,
    expectedCommit: process.env.CERT_EXPECTED_COMMIT,
    requiredCapabilities: process.env.CERT_REQUIRED_CAPABILITIES,
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

export {
  parseHttpsTarget,
  parseRequiredCapabilities,
  verifyProductionTarget,
};
