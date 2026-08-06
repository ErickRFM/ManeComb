const { RouteSessionModel } = require("../data/models");

let applied = false;

function ensureJourneySessionSchema() {
  if (applied) return RouteSessionModel.schema;

  const schema = RouteSessionModel.schema;
  schema.add({
    scheduledStartAt: { type: Date, default: null, index: true },
    scheduledEndAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: null },
    pausedAt: { type: Date, default: null },
    resumedAt: { type: Date, default: null },
    timingMigrationVersion: { type: Number, default: 0, min: 0 }
  });

  applied = true;
  return schema;
}

module.exports = {
  ensureJourneySessionSchema
};
