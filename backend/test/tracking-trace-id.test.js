const assert = require('node:assert/strict');
const http = require('node:http');
const createApp = require('../src/app');
const { createEmbeddedStore } = require('../src/data/store');
const { signToken } = require('../src/utils/jwt');

async function main() {
  const store = createEmbeddedStore();
  const driver = store.getUserById('user-driver-01');
  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: 'embedded' }),
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const traceId = 'tracking-trace-contract-01';
  const captured = [];
  const originalLog = console.log;
  console.log = (line, ...rest) => {
    captured.push(String(line));
    originalLog(line, ...rest);
  };

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/locations/update`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signToken(driver)}`,
        'Content-Type': 'application/json',
        'x-trace-id': traceId,
      },
      body: JSON.stringify({
        vehicleId: 'vehicle-101',
        packetId: 'trace-packet-01',
        timestamp: new Date().toISOString(),
        coordinates: { latitude: 19.4326, longitude: -99.1332 },
        accuracy: 8,
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-trace-id'), traceId);
    const trackingLog = captured
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .find((entry) => entry?.module === 'Tracking' && entry?.action === 'location.temporal_decision');
    assert.ok(trackingLog, 'HTTP location ingestion must emit a Tracking decision log');
    assert.equal(trackingLog.requestId, traceId);
    assert.equal(trackingLog.metadata.packetId, 'trace-packet-01');
  } finally {
    console.log = originalLog;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log('tracking trace-id propagation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
