function normalizeVehicleIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function getMatchedFields(vehicle, code, plate) {
  const fields = [];
  if (normalizeVehicleIdentity(vehicle?.code) === normalizeVehicleIdentity(code)) fields.push("code");
  if (normalizeVehicleIdentity(vehicle?.plate) === normalizeVehicleIdentity(plate)) fields.push("plate");
  return fields;
}

async function findVehicleIdentityConflict(
  store,
  { organizationId, code, plate, excludeVehicleId = null }
) {
  const vehicles = await store.listVehiclesForOrganization(organizationId, { includeRetired: true });
  const matches = (Array.isArray(vehicles) ? vehicles : [])
    .filter((vehicle) => vehicle && vehicle.id !== excludeVehicleId)
    .map((vehicle) => ({ vehicle, fields: getMatchedFields(vehicle, code, plate) }))
    .filter((entry) => entry.fields.length > 0);

  if (!matches.length) return null;

  const activeConflict = matches.find((entry) => !entry.vehicle.retiredAt);
  if (activeConflict) {
    return {
      code: "vehicle_identity_conflict",
      message: "Ya existe una unidad activa con ese nombre/codigo o placas.",
      data: {
        vehicleId: activeConflict.vehicle.id,
        fields: activeConflict.fields
      }
    };
  }

  return {
    code: "vehicle_archived_identity_conflict",
    message: "La identidad solicitada pertenece a una unidad retirada. Pulsa \"Mostrar retiradas\", elimina la ficha archivada y vuelve a crear la unidad; el historial y los documentos se conservaran.",
    data: {
      vehicles: matches.map(({ vehicle, fields }) => ({
        vehicleId: vehicle.id,
        code: vehicle.code,
        plate: vehicle.plate,
        retiredAt: vehicle.retiredAt,
        fields
      }))
    }
  };
}

module.exports = {
  findVehicleIdentityConflict
};
