function createFakeRedis(shared = new Map()) {
  const client = {
    isReady: true,
    async get(key) {
      return shared.has(key) ? shared.get(key) : null;
    },
    async set(key, value, options = {}) {
      if (options?.NX && shared.has(key)) return null;
      shared.set(key, String(value));
      return "OK";
    },
    async eval(script, { keys = [], arguments: args = [] } = {}) {
      const key0 = keys[0] || "";

      // live-authority reserve: user(caller), user(callee), call.
      if (script.includes('local caller = redis.call("get", KEYS[1])')) {
        const caller = shared.get(keys[0]);
        if (caller) return [-1, caller];
        const callee = shared.get(keys[1]);
        if (callee) return [-2, callee];
        shared.set(keys[0], String(args[0]));
        shared.set(keys[1], String(args[0]));
        shared.set(keys[2], String(args[1]));
        return [1, String(args[0])];
      }

      // live-authority compare-and-set.
      if (script.includes('redis.call("set", KEYS[1], ARGV[2], "PX", ARGV[4])')) {
        const current = shared.get(keys[0]);
        if (!current) return 0;
        if (current !== args[0]) return -1;
        shared.set(keys[0], String(args[1]));
        for (const key of keys.slice(1)) {
          if (shared.get(key) === args[2]) shared.set(key, shared.get(key));
        }
        return 1;
      }

      // live-authority compare-and-refresh.
      if (script.includes('redis.call("pexpire", KEYS[1], ARGV[3])')) {
        const current = shared.get(keys[0]);
        if (!current) return 0;
        if (current !== args[0]) return -1;
        return 1;
      }

      // live-authority release: compare call JSON, then delete call + matching user reservations.
      if (
        key0.startsWith("manecomb:rtc:call:") &&
        args.length === 2 &&
        script.includes('redis.call("del", KEYS[1])')
      ) {
        const current = shared.get(keys[0]);
        if (!current) return 0;
        if (current !== args[0]) return -1;
        shared.delete(keys[0]);
        for (const key of keys.slice(1)) {
          if (shared.get(key) === args[1]) shared.delete(key);
        }
        return 1;
      }

      // Stale user reservation cleanup or CDR pointer/create-lock compare-and-delete.
      if (args.length === 1 && script.includes('redis.call("del", KEYS[1])')) {
        if (shared.get(keys[0]) !== args[0]) return 0;
        shared.delete(keys[0]);
        return 1;
      }

      throw new Error(`Unsupported fake Redis eval operation for key ${key0}`);
    },
    _data: shared
  };
  return client;
}

module.exports = {
  createFakeRedis
};
