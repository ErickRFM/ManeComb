const assert = require('node:assert/strict');
const http = require('node:http');
const createApp = require('../src/app');
const { createEmbeddedStore } = require('../src/data/store');

async function requestJson(baseUrl, route, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, payload: await response.json() };
}

async function main() {
  const store = createEmbeddedStore();
  store.getAppConfig = async () => ({
    name: 'ManeComb',
    version: '9.9.9',
    buildNumber: 999,
    sourceCommit: 'a'.repeat(40),
    sha256: 'b'.repeat(64),
    status: 'disponible',
    apkUrl: 'https://example.test/manecomb-9.9.9.apk',
    releaseDate: '2026-08-10',
    releaseNotes: ['Session update regression'],
    versionHistory: [
      {
        version: '9.9.9',
        date: '2026-08-10',
        current: true,
        mandatory: true,
      },
    ],
  });

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: 'embedded', message: 'auth-session-app-update-test' }),
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const login = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@combis.app',
        password: 'Ruta123!',
      },
    });
    assert.equal(login.response.status, 200);
    assert.ok(login.payload.token);

    const headers = { Authorization: `Bearer ${login.payload.token}` };
    const restored = await requestJson(baseUrl, '/auth/me?appVersion=1.0.0', { headers });

    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.ok, true);
    assert.equal(restored.payload.updateAvailable, true);
    assert.equal(restored.payload.latestVersion, '9.9.9');
    assert.equal(restored.payload.mandatory, true);
    assert.deepEqual(restored.payload.releaseNotes, ['Session update regression']);
    assert.equal(restored.payload.downloadUrl, 'https://example.test/manecomb-9.9.9.apk');

    const current = await requestJson(baseUrl, '/auth/session?appVersion=9.9.9', { headers });
    assert.equal(current.response.status, 200);
    assert.equal(current.payload.updateAvailable, false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  console.log('ok - restored auth session awaits and returns app update metadata');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
