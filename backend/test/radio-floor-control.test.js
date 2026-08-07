// Autoridad de canal de Radio: adquisicion, refresco, liberacion y cadencia.
// Ejercita la implementacion real extraida de sockets/index.js con un Redis
// falso; no requiere levantar transporte ni un Redis de verdad.

const assert = require("node:assert/strict");
const { createRadioFloorControl } = require("../src/modules/radio/floor-control");
const {
  evaluateFrame,
  FRAME_BASE64_LENGTH,
  FRAME_BYTES,
  MAX_TRANSMISSION_BYTES
} = require("../src/modules/radio/live-stream");

function createFakeRedis({ ready = true } = {}) {
  const entries = new Map();
  return {
    isReady: ready,
    entries,
    async set(key, value, options) {
      if (options?.NX && entries.has(key)) return null;
      entries.set(key, value);
      return "OK";
    },
    async get(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    async eval(script, { keys, arguments: args }) {
      const key = keys[0];
      if (entries.get(key) !== args[0]) return 0;
      if (script.includes("pexpire")) return 1;
      entries.delete(key);
      return 1;
    }
  };
}

function floorControl({ redisClient = null, enabled = true, clusterReady = true, localOwner = null } = {}) {
  return createRadioFloorControl({
    redisClient,
    redisReadiness: { enabled },
    isClusterReady: () => clusterReady,
    getLocalOwner: () => localOwner
  });
}

const ownerA = { socketId: "sock-a", transmissionId: "tx-a", userId: "user-1", userName: "C-01" };
const ownerB = { socketId: "sock-b", transmissionId: "tx-b", userId: "user-2", userName: "C-02" };

(async () => {
  // --- Instancia unica (Redis deshabilitado): la autoridad es la memoria local.
  {
    const floor = floorControl({
      enabled: false,
      localOwner: { socketId: "sock-a", id: "tx-a", userId: "user-1", userName: "C-01" }
    });

    assert.deepEqual(await floor.acquire("canal-1", ownerA), { acquired: true, owner: null });
    assert.deepEqual(await floor.getOwner("canal-1"), ownerA);
    assert.equal(await floor.refresh({}), true);
    assert.equal(await floor.release({}), true);
    console.log("ok - instancia unica: autoridad local sin Redis");
  }

  {
    const floor = floorControl({ enabled: false, localOwner: null });
    assert.equal(await floor.getOwner("canal-1"), null);
    console.log("ok - instancia unica: canal libre sin transmision local");
  }

  // --- Multi-instancia: un solo duenio del lock por canal.
  {
    const redisClient = createFakeRedis();
    const floor = floorControl({ redisClient });

    const first = await floor.acquire("canal-1", ownerA);
    assert.equal(first.acquired, true);
    assert.ok(first.key.endsWith("canal-1"));

    const second = await floor.acquire("canal-1", ownerB);
    assert.equal(second.acquired, false, "el segundo transmisor no obtiene el canal");
    assert.deepEqual(second.owner, ownerA, "conoce al duenio real para responder channel_busy");

    // Otro canal permanece libre: el lock es por canal, no global.
    assert.equal((await floor.acquire("canal-2", ownerB)).acquired, true);
    console.log("ok - multi-instancia: un unico duenio por canal");
  }

  {
    const redisClient = createFakeRedis();
    const floor = floorControl({ redisClient });
    const lock = await floor.acquire("canal-1", ownerA);
    const mine = { lockKey: lock.key, lockValue: lock.value };
    const foreign = { lockKey: lock.key, lockValue: JSON.stringify(ownerB) };

    assert.equal(await floor.refresh(mine), true, "el duenio renueva su TTL");
    assert.equal(await floor.refresh(foreign), false, "otro socket no renueva un lock ajeno");
    assert.equal(await floor.release(foreign), false, "otro socket no libera un lock ajeno");
    assert.equal(redisClient.entries.size, 1, "el lock ajeno sigue intacto");

    assert.equal(await floor.release(mine), true);
    assert.equal(redisClient.entries.size, 0, "liberar borra el lock del duenio");
    assert.equal(await floor.refresh(mine), false, "tras liberar se pierde la autoridad");
    console.log("ok - refresh/release solo operan sobre el lock propio");
  }

  {
    const redisClient = createFakeRedis();
    const floor = floorControl({ redisClient });
    const lock = await floor.acquire("canal-1", ownerA);
    // El lock expiro (TTL) y otro nodo tomo el canal.
    redisClient.entries.set(lock.key, JSON.stringify(ownerB));

    assert.equal(
      await floor.refresh({ lockKey: lock.key, lockValue: lock.value }),
      false,
      "authority_lost cuando el canal cambio de duenio"
    );
    console.log("ok - authority_lost al perder el lock por expiracion");
  }

  // --- Redis habilitado pero caido: indisponible antes que split-brain.
  {
    const floor = floorControl({ redisClient: createFakeRedis({ ready: false }) });
    await assert.rejects(() => floor.acquire("canal-1", ownerA), /Redis no esta disponible/);
    await assert.rejects(() => floor.getOwner("canal-1"), /Redis no esta disponible/);
    console.log("ok - Redis caido: acquire/getOwner fallan en vez de degradar");
  }

  {
    const floor = floorControl({ redisClient: createFakeRedis(), clusterReady: false });
    await assert.rejects(() => floor.acquire("canal-1", ownerA), /Redis no esta disponible/);
    assert.equal(
      await floor.refresh({ lockKey: "k", lockValue: "v" }),
      false,
      "sin adaptador listo la transmision pierde autoridad"
    );
    console.log("ok - adaptador Redis no listo: sin split-brain");
  }

  {
    const floor = floorControl({ redisClient: createFakeRedis() });
    assert.equal(await floor.refresh({ lockKey: null, lockValue: null }), false);
    assert.equal(await floor.release({ lockKey: null, lockValue: null }), false);
    console.log("ok - transmision sin lock nunca se considera autoritativa");
  }

  {
    const redisClient = createFakeRedis();
    redisClient.entries.set("manecomb:radio:channel:canal-1", "{ no es json");
    const floor = floorControl({ redisClient });
    assert.equal(await floor.getOwner("canal-1"), null, "un lock corrupto no bloquea el canal");
    console.log("ok - lock corrupto no propaga excepcion al handler");
  }

  // --- Cadencia, orden y tamanio de frames.
  {
    const base = () => ({ lastSequence: -1, byteLength: 0, startedAt: Date.now() });
    const validArgs = { sequence: 0, sentAt: Date.now(), base64Length: FRAME_BASE64_LENGTH };

    assert.deepEqual(evaluateFrame(base(), validArgs), { ok: true });

    assert.deepEqual(
      evaluateFrame({ ...base(), lastSequence: 5 }, { ...validArgs, sequence: 5 }),
      { ok: false, reason: "duplicate", fatal: false },
      "un frame repetido se descarta sin cortar la transmision"
    );

    assert.deepEqual(
      evaluateFrame({ ...base(), lastSequence: 5 }, { ...validArgs, sequence: 7 }),
      { ok: false, reason: "invalid_frame", fatal: true },
      "un hueco de secuencia corta la transmision"
    );

    assert.deepEqual(
      evaluateFrame(base(), { ...validArgs, sequence: 5000 }),
      { ok: false, reason: "rate_exceeded", fatal: true }
    );

    assert.deepEqual(
      evaluateFrame(
        { ...base(), byteLength: MAX_TRANSMISSION_BYTES - FRAME_BYTES + 1 },
        validArgs
      ),
      { ok: false, reason: "max_duration", fatal: true }
    );

    assert.deepEqual(
      evaluateFrame(base(), { ...validArgs, base64Length: 100 }),
      { ok: false, reason: "invalid_frame", fatal: true }
    );

    assert.deepEqual(
      evaluateFrame(base(), { ...validArgs, sentAt: Number.NaN }),
      { ok: false, reason: "invalid_frame", fatal: true }
    );

    assert.deepEqual(
      evaluateFrame(base(), { ...validArgs, sequence: 1.5 }),
      { ok: false, reason: "invalid_owner", fatal: false }
    );

    // La rafaga permitida cubre el jitter de red sin abrir la puerta a inundar:
    // a 1 s de transmision caben 50 frames de 20 ms mas 50 de holgura.
    const oneSecondIn = { ...base(), startedAt: Date.now() - 1000 };
    assert.deepEqual(
      evaluateFrame({ ...oneSecondIn, lastSequence: 98 }, { ...validArgs, sequence: 99 }),
      { ok: true }
    );
    assert.equal(
      evaluateFrame({ ...oneSecondIn, lastSequence: 100 }, { ...validArgs, sequence: 101 }).reason,
      "rate_exceeded"
    );
    console.log("ok - cadencia, orden y tamanio de frames PTT");
  }

  console.log("radio floor control tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
