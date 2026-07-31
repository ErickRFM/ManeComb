const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const EXPECTED_INDEXES = [
  {
    collection: "auto_route_processing",
    name: "auto_route_session_algorithm_unique",
    key: { sessionId: 1, algorithmVersion: 1 },
    duplicateGroup: { sessionId: "$sessionId", algorithmVersion: "$algorithmVersion" }
  },
  {
    collection: "learned_route_candidates",
    name: "learned_route_organization_group_unique",
    key: { organizationId: 1, groupKey: 1 },
    duplicateGroup: { organizationId: "$organizationId", groupKey: "$groupKey" }
  }
];

function sameKey(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function listIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === "NamespaceNotFound") return [];
    throw error;
  }
}

async function findDuplicates(collection, duplicateGroup) {
  return collection.aggregate([
    { $group: { _id: duplicateGroup, count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 25 }
  ]).toArray();
}

async function run() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;
  if (apply && process.argv.includes("--dry-run")) throw new Error("Use --dry-run o --apply, no ambos");
  const mongoUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGO_DB_NAME || "combisapp").trim();
  if (!mongoUri) throw new Error("MONGO_URI o MONGODB_URI es obligatoria");
  await mongoose.connect(mongoUri, { dbName });

  const report = { mode: dryRun ? "dry-run" : "apply", database: dbName, collections: [] };
  for (const expected of EXPECTED_INDEXES) {
    const collection = mongoose.connection.collection(expected.collection);
    const duplicates = await findDuplicates(collection, expected.duplicateGroup);
    const indexesBefore = await listIndexes(collection);
    const matchingBefore = indexesBefore.find((index) => sameKey(index.key, expected.key));
    if (duplicates.length) {
      report.collections.push({
        collection: expected.collection,
        duplicates: duplicates.map((entry) => ({ key: entry._id, count: entry.count })),
        uniqueIndex: Boolean(matchingBefore?.unique),
        action: "blocked_duplicates"
      });
      continue;
    }
    if (apply && matchingBefore && !matchingBefore.unique) {
      report.collections.push({
        collection: expected.collection,
        duplicates: [],
        uniqueIndex: false,
        indexName: matchingBefore.name,
        action: "blocked_non_unique_index"
      });
      continue;
    }
    if (apply && !matchingBefore) {
      await collection.createIndex(expected.key, { unique: true, name: expected.name });
    }
    const indexesAfter = apply ? await listIndexes(collection) : indexesBefore;
    const matchingAfter = indexesAfter.find((index) => sameKey(index.key, expected.key));
    report.collections.push({
      collection: expected.collection,
      duplicates: [],
      uniqueIndex: Boolean(matchingAfter?.unique),
      indexName: matchingAfter?.name || null,
      action: apply && !matchingBefore ? "created" : "verified"
    });
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.collections.some((entry) => entry.duplicates.length || !entry.uniqueIndex)) {
    throw new Error("No se puede certificar la unicidad de los índices de rutas aprendidas");
  }
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
