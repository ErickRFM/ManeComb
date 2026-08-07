// Autoridad de canal (floor control) de Radio. Unica implementacion del lock
// distribuido: se extrajo de sockets/index.js para poder certificar adquisicion,
// refresco, liberacion y el comportamiento ante Redis caido sin levantar sockets.
//
// Regla de seguridad: si Redis esta habilitado pero no disponible, estas
// funciones fallan en vez de degradar a memoria local. Es preferible dejar Radio
// indisponible que permitir dos transmisores creyendose duenios del canal.

const RADIO_LOCK_TTL_MS = 10000;
const RADIO_LOCK_PREFIX = "manecomb:radio:channel:";

const REFRESH_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

function parseOwner(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {object|null} options.redisClient
 * @param {{ enabled: boolean }} options.redisReadiness
 * @param {() => boolean} options.isClusterReady adaptador Socket.IO/Redis listo.
 * @param {(channelId: string) => object|null} options.getLocalOwner autoridad en
 *   memoria usada solo cuando Redis esta deshabilitado (despliegue de una instancia).
 */
function createRadioFloorControl({
  redisClient,
  redisReadiness,
  isClusterReady,
  getLocalOwner
}) {
  function assertDistributedAuthority(action) {
    if (!redisClient?.isReady || !isClusterReady()) {
      throw new Error(`Redis no esta disponible para ${action} Radio`);
    }
  }

  async function acquire(channelId, owner) {
    if (!redisReadiness.enabled) return { acquired: true, owner: null };
    assertDistributedAuthority("arbitrar");

    const key = `${RADIO_LOCK_PREFIX}${channelId}`;
    const value = JSON.stringify(owner);
    const acquired = await redisClient.set(key, value, { NX: true, PX: RADIO_LOCK_TTL_MS });
    if (acquired === "OK") return { acquired: true, key, value, owner: null };

    return { acquired: false, key, value, owner: parseOwner(await redisClient.get(key)) };
  }

  async function getOwner(channelId) {
    if (!redisReadiness.enabled) {
      const local = getLocalOwner(channelId);
      return local
        ? {
            socketId: local.socketId,
            transmissionId: local.id,
            userId: local.userId,
            userName: local.userName
          }
        : null;
    }
    assertDistributedAuthority("consultar");

    return parseOwner(await redisClient.get(`${RADIO_LOCK_PREFIX}${channelId}`));
  }

  /** Renueva el TTL solo si el lock sigue siendo nuestro. Falso = autoridad perdida. */
  async function refresh(transmission) {
    if (!redisReadiness.enabled) return true;
    if (!redisClient?.isReady || !isClusterReady() || !transmission.lockKey || !transmission.lockValue) {
      return false;
    }

    const refreshed = await redisClient.eval(REFRESH_SCRIPT, {
      keys: [transmission.lockKey],
      arguments: [transmission.lockValue, String(RADIO_LOCK_TTL_MS)]
    });
    return Number(refreshed) === 1;
  }

  /** Libera el lock solo si nos pertenece: nunca borra el de otro transmisor. */
  async function release(transmission) {
    if (!redisReadiness.enabled) return true;
    if (!redisClient || !transmission.lockKey || !transmission.lockValue) return false;

    const released = await redisClient.eval(RELEASE_SCRIPT, {
      keys: [transmission.lockKey],
      arguments: [transmission.lockValue]
    });
    return Number(released) === 1;
  }

  return { acquire, getOwner, refresh, release };
}

module.exports = {
  RADIO_LOCK_PREFIX,
  RADIO_LOCK_TTL_MS,
  createRadioFloorControl
};
