const config = require("../config");
const logger = require("../logger");

class ConnectionManager {
  constructor() {
    this.pools = new Map();
    this.maxConnections = 10;
    this.idleTimeoutMs = 30000;
  }

  configure(opts = {}) {
    if (opts.maxConnections) this.maxConnections = opts.maxConnections;
    if (opts.idleTimeoutMs) this.idleTimeoutMs = opts.idleTimeoutMs;
  }

  getTransport(type) {
    if (!this.pools.has(type)) {
      this.pools.set(type, this._createPool(type));
    }
    return this.pools.get(type);
  }

  _createPool(type) {
    const pool = {
      transporters: [],
      available: [],
      activeCount: 0,
      type
    };
    return pool;
  }

  async acquire(type, factory) {
    const pool = this.getTransport(type);
    if (pool.available.length > 0) {
      const entry = pool.available.pop();
      if (this._isAlive(entry)) {
        pool.activeCount++;
        return entry.transporter;
      }
    }
    if (pool.activeCount + pool.available.length >= this.maxConnections) {
      throw new Error(`Connection pool exhausted for ${type} (max: ${this.maxConnections})`);
    }
    const transporter = await factory();
    pool.transporters.push(transporter);
    pool.activeCount++;
    return transporter;
  }

  release(type, transporter) {
    const pool = this.pools.get(type);
    if (!pool) return;
    pool.activeCount--;
    pool.available.push({
      transporter,
      lastUsed: Date.now()
    });
    this._scheduleCleanup(type);
  }

  _isAlive(entry) {
    return (Date.now() - entry.lastUsed) < this.idleTimeoutMs;
  }

  _scheduleCleanup(type) {
    setTimeout(() => {
      const pool = this.pools.get(type);
      if (!pool) return;
      const now = Date.now();
      pool.available = pool.available.filter((entry) => (now - entry.lastUsed) < this.idleTimeoutMs);
      const toRemove = pool.transporters.length - (pool.activeCount + pool.available.length);
      for (let i = 0; i < toRemove && pool.transporters.length > 0; i++) {
        const t = pool.transporters.shift();
        if (t.close) t.close().catch(() => {});
      }
    }, this.idleTimeoutMs + 1000).unref();
  }

  async drainAll() {
    for (const [type, pool] of this.pools) {
      for (const entry of pool.available) {
        if (entry.transporter.close) {
          try { await entry.transporter.close(); } catch {}
        }
      }
      pool.available = [];
      pool.transporters = [];
    }
  }

  getHealth() {
    const pools = {};
    for (const [type, pool] of this.pools) {
      pools[type] = {
        active: pool.activeCount,
        available: pool.available.length,
        total: pool.transporters.length
      };
    }
    return { pools };
  }
}

const connectionManager = new ConnectionManager();

module.exports = connectionManager;
