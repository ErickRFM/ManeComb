class RateLimiter {
  constructor() {
    this.limiters = new Map();
  }

  configure(name, options = {}) {
    const limiter = {
      maxTokens: options.maxTokens || 10,
      refillRate: options.refillRate || 1,
      refillIntervalMs: options.refillIntervalMs || 1000,
      tokens: options.maxTokens || 10,
      lastRefill: Date.now(),
      queue: [],
      processing: false
    };
    this.limiters.set(name, limiter);
  }

  async waitForToken(name) {
    const limiter = this.limiters.get(name);
    if (!limiter) return true;

    this._refill(limiter);
    if (limiter.tokens > 0) {
      limiter.tokens--;
      return true;
    }

    return new Promise((resolve) => {
      limiter.queue.push(resolve);
      if (!limiter.processing) {
        limiter.processing = true;
        this._processQueue(limiter);
      }
    });
  }

  _refill(limiter) {
    const now = Date.now();
    const elapsed = now - limiter.lastRefill;
    if (elapsed >= limiter.refillIntervalMs) {
      const intervals = Math.floor(elapsed / limiter.refillIntervalMs);
      limiter.tokens = Math.min(limiter.tokens + intervals * limiter.refillRate, limiter.maxTokens);
      limiter.lastRefill = now - (elapsed % limiter.refillIntervalMs);
    }
  }

  _processQueue(limiter) {
    const process = () => {
      this._refill(limiter);
      const toProcess = Math.min(limiter.tokens, limiter.queue.length);
      for (let i = 0; i < toProcess; i++) {
        const resolve = limiter.queue.shift();
        limiter.tokens--;
        resolve(true);
      }
      if (limiter.queue.length > 0) {
        setTimeout(process, limiter.refillIntervalMs / limiter.refillRate).unref();
      } else {
        limiter.processing = false;
      }
    };
    process();
  }

  reset(name) {
    const limiter = this.limiters.get(name);
    if (limiter) {
      limiter.tokens = limiter.maxTokens;
      limiter.lastRefill = Date.now();
    }
  }

  resetAll() {
    for (const name of this.limiters.keys()) {
      this.reset(name);
    }
  }

  getState() {
    const state = {};
    for (const [name, limiter] of this.limiters) {
      state[name] = {
        tokens: limiter.tokens,
        maxTokens: limiter.maxTokens,
        queueLength: limiter.queue.length
      };
    }
    return state;
  }
}

const rateLimiter = new RateLimiter();

module.exports = rateLimiter;
