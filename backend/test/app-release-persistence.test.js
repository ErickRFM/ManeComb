const assert = require("node:assert/strict");
const { AppReleaseRepository } = require("../src/data/repositories/app-release-repository");

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
    appConfigWrites: 0
  };

  const AppConfigModel = {
    findOneAndUpdate(filter, update, options = {}) {
      return query(() => {
        if (!state.appConfig && options.upsert) {
          state.appConfig = { _id: filter._id, ...clone(update.$setOnInsert || {}) };
        }
        if (!state.appConfig) return null;
        if (
          (filter.sourceCommit !== undefined && state.appConfig.sourceCommit !== filter.sourceCommit)
          || (filter.sha256 !== undefined && state.appConfig.sha256 !== filter.sha256)
        ) {
          return null;
        }
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
        const current = state.clients.get(filter._id) || {
          _id: filter._id,
          ...clone(update.$setOnInsert || {})
        };
        Object.assign(current, clone(update.$set || {}));
        state.clients.set(filter._id, current);
        return current;
      });
    },
    async aggregate() {
      const counts = new Map();
      for (const client of state.clients.values()) {
        if (!client.version) continue;
        counts.set(client.version, (counts.get(client.version) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([version, count]) => ({ _id: version, count }))
        .sort((left, right) => right.count - left.count || String(left._id).localeCompare(String(right._id)));
    }
  };

  return { state, AppConfigModel, AppClientVersionModel };
}

function createEmbeddedFixture() {
  return {
    getAppConfig() {
      return {
        name: "ManeComb",
        version: "0.0.1-fixture",
        apkUrl: "https://fixture.invalid/app.apk",
        releaseDate: "2000-01-01"
      };
    },
    updateAppConfig(patch) {
      return clone(patch);
    },
    recordDeviceVersion() {
      return null;
    },
    getDeviceVersionStats() {
      return { total: 0, versions: {}, mostUsedVersion: null, lastPublication: null };
    }
  };
}

async function main() {
  const harness = createHarness();
  const repository = new AppReleaseRepository(createEmbeddedFixture(), {
    AppConfigModel: harness.AppConfigModel,
    AppClientVersionModel: harness.AppClientVersionModel
  });

  const unconfigured = await repository.getAppConfig();
  assert.equal(unconfigured.version, undefined);
  assert.equal(unconfigured.apkUrl, undefined);
  assert.equal(unconfigured.releaseDate, undefined);
  assert.equal(harness.state.appConfigWrites, 1);

  const published = await repository.updateAppConfig({
    name: "ManeComb",
    version: "1.3.0",
    buildNumber: 22,
    sourceCommit: "a".repeat(40),
    sha256: "b".repeat(64),
    apkUrl: "https://github.com/ErickRFM/ManeComb/releases/download/v1.3.0/app-release.apk",
    releaseDate: "2026-08-15",
    releaseNotes: ["Publicacion controlada"],
    mandatory: true
  });
  assert.equal(published.version, "1.3.0");
  assert.equal(published.buildNumber, 22);
  assert.equal(published.sourceCommit, "a".repeat(40));
  assert.equal(published.sha256, "b".repeat(64));
  assert.equal(published.releaseDate, "2026-08-15");
  assert.equal(published.mandatory, true);

  const restarted = new AppReleaseRepository(createEmbeddedFixture(), {
    AppConfigModel: harness.AppConfigModel,
    AppClientVersionModel: harness.AppClientVersionModel
  });
  const persisted = await restarted.getAppConfig();
  assert.equal(persisted.version, "1.3.0");
  assert.equal(persisted.buildNumber, 22);
  assert.equal(persisted.sourceCommit, "a".repeat(40));
  assert.equal(persisted.sha256, "b".repeat(64));
  assert.equal(persisted.releaseDate, "2026-08-15");
  assert.equal(persisted.mandatory, true);

  await repository.recordDeviceVersion("user-a", {
    version: "1.2.0",
    buildNumber: "20",
    platform: "android",
    deviceModel: "Device A"
  });
  await repository.recordDeviceVersion("user-a", {
    version: "1.3.0",
    buildNumber: "22",
    platform: "android",
    deviceModel: "Device A"
  });
  await repository.recordDeviceVersion("user-b", {
    version: "1.3.0",
    buildNumber: "22",
    platform: "android",
    deviceModel: "Device B"
  });

  assert.equal(harness.state.clients.size, 2);
  const stats = await restarted.getDeviceVersionStats();
  assert.equal(stats.total, 2);
  assert.deepEqual(stats.versions, { "1.3.0": 2 });
  assert.equal(stats.mostUsedVersion, "1.3.0");
  assert.equal(stats.lastPublication, "2026-08-15");

  const compareAndSet = await repository.updateAppConfig(
    { sourceCommit: "c".repeat(40), sha256: "d".repeat(64) },
    { expectedSourceCommit: "a".repeat(40), expectedSha256: "b".repeat(64) }
  );
  assert.equal(compareAndSet.sourceCommit, "c".repeat(40));
  await assert.rejects(
    repository.updateAppConfig(
      { sourceCommit: "e".repeat(40), sha256: "f".repeat(64) },
      { expectedSourceCommit: "a".repeat(40), expectedSha256: "b".repeat(64) }
    ),
    (error) => error?.code === "APP_CONFIG_CONFLICT"
  );
  assert.equal((await repository.getAppConfig()).sourceCommit, "c".repeat(40));

  const embeddedOnly = new AppReleaseRepository(createEmbeddedFixture());
  assert.equal((await embeddedOnly.getAppConfig()).version, "0.0.1-fixture");

  console.log("ok - durable app releases do not inherit embedded fixtures and client version telemetry persists");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
