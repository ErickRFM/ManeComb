const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

async function run() {
  const apply = process.argv.includes("--apply");
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const dbName = process.env.MONGO_DB_NAME || "combisapp";
  if (!mongoUri) throw new Error("MONGO_URI or MONGODB_URI is required");
  await mongoose.connect(mongoUri, { dbName });
  const collection = mongoose.connection.collection("communication_history");
  const duplicates = await collection.aggregate([
    {
      $match: {
        tenantScope: { $type: "string" },
        eventType: { $type: "string" },
        idempotencyKey: { $type: "string" }
      }
    },
    {
      $group: {
        _id: { tenantScope: "$tenantScope", eventType: "$eventType", idempotencyKey: "$idempotencyKey" },
        count: { $sum: 1 },
        deliveryIds: { $push: "$deliveryId" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    database: dbName,
    duplicates
  }, null, 2));
  if (duplicates.length) throw new Error("Historical duplicates must be reconciled before creating the unique index");
  if (apply) {
    await collection.createIndex(
      { tenantScope: 1, eventType: 1, idempotencyKey: 1 },
      {
        unique: true,
        name: "email_delivery_idempotency",
        partialFilterExpression: {
          tenantScope: { $type: "string" },
          eventType: { $type: "string" },
          idempotencyKey: { $type: "string" }
        }
      }
    );
  }
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
