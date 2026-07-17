require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const { RouteModel, RouteSessionModel, VehicleModel } = require("../src/data/models");

async function main() {
  const db = await connectDB();
  if (!db.connected) throw new Error("MongoDB no disponible para la auditoria de solo lectura");

  const orphanFilter = { $or: [{ organizationId: null }, { organizationId: "" }, { organizationId: { $exists: false } }] };
  const routes = await RouteModel.find(orphanFilter, { _id: 1, name: 1, code: 1 }).lean();
  const routeIds = routes.map((route) => route._id);
  const [assignedVehicles, sessions] = await Promise.all([
    VehicleModel.countDocuments({ routeId: { $in: routeIds } }),
    RouteSessionModel.countDocuments({ routeId: { $in: routeIds } })
  ]);

  console.log(JSON.stringify({
    auditedAt: new Date().toISOString(),
    orphanRoutes: routes.length,
    impact: { assignedVehicles, routeSessions: sessions },
    migrationRequired: routes.length > 0,
    priority: assignedVehicles > 0 || sessions > 0 ? "high" : routes.length > 0 ? "medium" : "none",
    routeIds
  }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
