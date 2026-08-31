const { StoreDomainRepository } = require("./store-domain-repository");

const APP_RELEASE_METHODS = [
  "getAppConfig",
  "updateAppConfig",
  "recordDeviceVersion",
  "getDeviceVersionStats"
];

const APP_CONFIG_ID = "app-config";
const APP_CONFIG_FIELDS = [
  "name",
  "version",
  "buildNumber",
  "sourceCommit",
  "sha256",
  "status",
  "apkUrl",
  "androidMin",
  "size",
  "releaseDate",
  "releaseNotes",
  "versionHistory"
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function pickAppConfig(source = {}) {
  return APP_CONFIG_FIELDS.reduce((config, field) => {
    if (source[field] !== undefined) config[field] = clone(source[field]);
    return config;
  }, {});
}

function serializeAppConfig(doc) {
  if (!doc) return null;
  const source = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return pickAppConfig(source);
}

class AppReleaseRepository extends StoreDomainRepository {
  constructor(store, { AppConfigModel, AppClientVersionModel } = {}) {
    super(store, APP_RELEASE_METHODS);
    this.AppConfigModel = AppConfigModel || null;
    this.AppClientVersionModel = AppClientVersionModel || null;
  }

  // El adapter embebido contiene fixtures historicos para pruebas. Nunca deben
  // convertirse en valores iniciales del singleton durable de produccion.
  async getSeedConfig() {
    return {};
  }

  async ensureAppConfig() {
    if (!this.AppConfigModel) {
      return typeof this.store.getAppConfig === "function"
        ? Promise.resolve(this.store.getAppConfig())
        : null;
    }

    const seed = await this.getSeedConfig();
    const now = new Date();

    try {
      const doc = await this.AppConfigModel.findOneAndUpdate(
        { _id: APP_CONFIG_ID },
        {
          $setOnInsert: {
            ...seed,
            createdAt: now,
            updatedAt: now
          }
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true
        }
      ).lean();
      return serializeAppConfig(doc);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await this.AppConfigModel.findById(APP_CONFIG_ID).lean();
      return serializeAppConfig(existing);
    }
  }

  async getAppConfig() {
    if (!this.AppConfigModel) {
      return typeof this.store.getAppConfig === "function"
        ? Promise.resolve(this.store.getAppConfig())
        : null;
    }
    return this.ensureAppConfig();
  }

  async updateAppConfig(data = {}) {
    if (!this.AppConfigModel) {
      return typeof this.store.updateAppConfig === "function"
        ? Promise.resolve(this.store.updateAppConfig(data))
        : null;
    }

    const patch = pickAppConfig(data);
    if (!Object.keys(patch).length) return this.getAppConfig();

    const now = new Date();

    try {
      const doc = await this.AppConfigModel.findOneAndUpdate(
        { _id: APP_CONFIG_ID },
        {
          $set: {
            ...patch,
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now
          }
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true
        }
      ).lean();
      return serializeAppConfig(doc);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const doc = await this.AppConfigModel.findOneAndUpdate(
        { _id: APP_CONFIG_ID },
        {
          $set: {
            ...patch,
            updatedAt: now
          }
        },
        { returnDocument: "after" }
      ).lean();
      return serializeAppConfig(doc);
    }
  }

  async recordDeviceVersion(userId, versionInfo = {}) {
    if (!this.AppClientVersionModel) {
      return typeof this.store.recordDeviceVersion === "function"
        ? Promise.resolve(this.store.recordDeviceVersion(userId, versionInfo))
        : null;
    }

    const normalizedUserId = safeText(userId, 128);
    const version = safeText(versionInfo.version, 40);
    if (!normalizedUserId || !version) return null;

    const now = new Date();
    const doc = await this.AppClientVersionModel.findOneAndUpdate(
      { _id: normalizedUserId },
      {
        $set: {
          version,
          buildNumber: safeText(versionInfo.buildNumber, 40),
          platform: safeText(versionInfo.platform, 40),
          deviceModel: safeText(versionInfo.deviceModel, 160),
          updatedAt: now
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true
      }
    ).lean();

    if (!doc) return null;
    return {
      userId: String(doc._id),
      version: doc.version,
      buildNumber: doc.buildNumber || "",
      platform: doc.platform || "",
      deviceModel: doc.deviceModel || "",
      updatedAt: doc.updatedAt || now
    };
  }

  async getDeviceVersionStats() {
    if (!this.AppClientVersionModel) {
      return typeof this.store.getDeviceVersionStats === "function"
        ? Promise.resolve(this.store.getDeviceVersionStats())
        : { total: 0, versions: {}, mostUsedVersion: null, lastPublication: null };
    }

    const rows = await this.AppClientVersionModel.aggregate([
      { $match: { version: { $type: "string", $ne: "" } } },
      { $group: { _id: "$version", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);

    const versions = {};
    let total = 0;
    for (const row of rows) {
      const version = safeText(row?._id, 40);
      const count = Math.max(0, Number(row?.count) || 0);
      if (!version || !count) continue;
      versions[version] = count;
      total += count;
    }

    const appConfig = await this.getAppConfig();
    return {
      total,
      versions,
      mostUsedVersion: Object.keys(versions)[0] || null,
      lastPublication: appConfig?.releaseDate || null
    };
  }
}

module.exports = {
  APP_RELEASE_METHODS,
  APP_CONFIG_ID,
  APP_CONFIG_FIELDS,
  AppReleaseRepository,
  pickAppConfig,
  serializeAppConfig
};
