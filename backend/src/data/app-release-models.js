const mongoose = require("mongoose");

const appVersionHistoryEntrySchema = new mongoose.Schema(
  {
    version: { type: String, default: "" },
    date: { type: String, default: "" },
    current: { type: Boolean, default: false },
    size: { type: String, default: "" },
    androidMin: { type: String, default: "" },
    notes: { type: [String], default: [] },
    archived: { type: Boolean, default: false },
    mandatory: { type: Boolean, default: false }
  },
  { _id: false }
);

const appConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, default: "ManeComb" },
    // La version no tiene default historico. Un release existe solo despues de
    // una publicacion explicita desde la autoridad Platform.
    version: { type: String, default: "" },
    buildNumber: { type: Number, default: null },
    sourceCommit: { type: String, default: "" },
    sha256: { type: String, default: "" },
    status: { type: String, default: "disponible" },
    apkUrl: { type: String, default: "" },
    androidMin: { type: String, default: "8.0" },
    size: { type: String, default: "" },
    releaseDate: { type: String, default: "" },
    releaseNotes: { type: [String], default: [] },
    versionHistory: { type: [appVersionHistoryEntrySchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    collection: "app_config",
    versionKey: false
  }
);

const appClientVersionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    version: { type: String, required: true, index: true },
    buildNumber: { type: String, default: "" },
    platform: { type: String, default: "" },
    deviceModel: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "app_client_versions",
    versionKey: false
  }
);

appClientVersionSchema.index({ version: 1, updatedAt: -1 });

function getModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  AppConfigModel: getModel("AppConfig", appConfigSchema),
  AppClientVersionModel: getModel("AppClientVersion", appClientVersionSchema),
  appConfigSchema,
  appClientVersionSchema
};
