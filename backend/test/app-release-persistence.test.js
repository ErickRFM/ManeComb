const assert = require("node:assert/strict");
const { AppReleaseRepository } = require("../src/data/repositories/app-release-repository");
const { buildBackendStore } = require("../src/data/backend-store");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function query(resolver) {
  return {
    lean() {
      return Promise.resolve(clone(typeof resolver === "function" ? resolver() : resolver));
    }
  };
}

function createHarness() {
  const state = {
    appConfig: null,
    clients: new Map(),
    appConfigWrites: 0,
    clientWrites: 0
  };

  const AppConfigModel = {
    findOneAndUpdate(filter, update, options = {}) {
      return query(() => {
        if (!state.appConfig && options.upsert) {
          state.appConfig = clone(update.$setOnInsert || { _id: filter._id });
        }
        if (!state.appConfig) return null;
        if (update.$set) Object.assign(state.appConfig, clone(update.$set));
        state.appConfigWrites += 1;
        return state.appConfig;
      });
    },
    findById(id) {
      return query(() => state.appConfig?._id === id ? state.appConfig : null);
    }
  };

  const AppClientVersionModel = {
    findOneAndUpdate(filter, update) {
      return query(() => {
        const id = filter._id;
        const existing = state.clients.get(id) || clone(update.$setOnInsert || { _id: id });
        Object.assign(existing, clone(update.$set || {}));
        state.clients.set(id, existing);
        state.clientWrites += 1;
        return existing;
      });
    },
    async aggregate() {
      const counts = new Map();
      for (const entry of state.clients.values()) {
        if (!entry.version) continue;
        counts.set(entry.version, (counts.get(entry.version) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([version, count]) => ({ _id: version, count }))
        .sort((left, right) => right.count - left.count || String(left._id).localeCompare(String(right._id)));
    }
  };

  return { state, AppConfigModel, AppClientVersionModel };
}

function createBaseStore(version = "1.0.2") {
  let config = {
    name: "ManeComb",
    version,
    status: "disponible",
    apkUrl: "https://example.test/manecomb.apk",
    androidMin: "8.0",
    size: "42 MB",
    releaseDate: "2026-07-20",
    releaseNotes: ["seed"],
    versionHistory: [{ version, date: "2026-07-20", current: true }]
  };
  const inMemoryVersions = new Map();

  return {
    getAppConfig() {
      return clone(config);
    },
    updateAppConfig(patch) {
      config = { ...config, ...clone(patch) };
      return clone(config);
    },
    recordDeviceVersion(userId, info) {
      inMemoryVersions.set(userId, clone(info));
      return clone(info);
    },
    getDeviceVersionStats() {
      return { total: inMemoryVersions.size, versions: {}, mostUsedVersion: null, lastPublication: config.releaseDate };
    }
  };
}

async function main() {
  const harness = createHarness();
  const models = {
    AppConfigModel: harness.AppConfigModel,
    AppClientVersionModel: harness.AppClientVersionModel
  };

  const first = new AppReleaseRepository(createBaseStore("1.0.2"), models);
  const seeded = await first.getAppConfig();
  assert.equal(seeded.version, "1.0.2");
  assert.equal(harness.state.appConfig._id, "app-config");
  assert.equal(harness.state.appConfigWrites, 1, "first read lazily seeds the singleton once");

  const updated = await first.updateAppConfig({
    version: "1.0.3",
    releaseDate: "2026-08-09",
    internalField: "must-not-persist"
  });
  assert.equal(updated.version, "1.0.3");
  assert.equal(updated.releaseDate, "2026-08-09");
  assert.equal(Object.hasOwn(updated, "internalField"), false);

  const afterRestart = new AppReleaseRepository(createBaseStore("0.0.1"), models);
  const persisted = await afterRestart.getAppConfig();
  assert.equal(persisted.version, "1.0.3", "a new repository instance reads the shared persisted singleton");
  assert.equal(persisted.releaseDate, "2026-08-09");

  await first.recordDeviceVersion("user-1", {
    version: "1.0.1",
    buildNumber: "10",
    platform: "android",
    deviceModel: "OnePlus"
  });
  await first.recordDeviceVersion("user-1", {
    version: "1.0.3",
    buildNumber: "12",
    platform: "android",
    deviceModel: "OnePlus 9"
  });
  await first.recordDeviceVersion("user-2", {
    version: "1.0.3",
    buildNumber: "12",
    platform: "android",
    deviceModel: "Pixel"
  });

  assert.equal(harness.state.clients.size, 2, "same user overwrites its latest client report instead of creating devices");
  assert.equal(harness.state.clients.get("user-1").version, "1.0.3");
  assert.equal(harness.state.clients.get("user-1").deviceModel, "OnePlus 9");

  const stats = await afterRestart.getDeviceVersionStats();
  assert.equal(stats.total, 2);
  assert.deepEqual(stats.versions, { "1.0.3": 2 });
  assert.equal(stats.mostUsedVersion, "1.0.3");
  assert.equal(stats.lastPublication, "2026-08-09");

  const embeddedBase = createBaseStore("2.0.0");
  const embeddedRepository = new AppReleaseRepository(embeddedBase);
  assert.equal((await embeddedRepository.getAppConfig()).version, "2.0.0");
  assert.equal((await embeddedRepository.updateAppConfig({ version: "2.0.1" })).version, "2.0.1");

  const mongoStore = buildBackendStore(createBaseStore("1.0.0"), { models });
  assert.equal((await mongoStore.getAppConfig()).version, "1.0.3", "Mongo build overrides legacy memory methods with durable service");
  await mongoStore.recordDeviceVersion("user-3", { version: "1.0.2", platform: "android" });
  const storeStats = await mongoStore.getDeviceVersionStats();
  assert.equal(storeStats.total, 3);
  assert.deepEqual(storeStats.versions, { "1.0.3": 2, "1.0.2": 1 });

  console.log("ok - app release config and latest-per-user client versions are durable through the Mongo store service");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
