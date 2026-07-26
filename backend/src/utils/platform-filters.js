function sanitizeText(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed;
}

function sanitizeEnum(value, allowedValues) {
  if (!allowedValues || !Array.isArray(allowedValues)) return null;
  const str = String(value || "").trim();
  return allowedValues.includes(str) ? str : null;
}

function sanitizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function rejectMongoOperators(obj) {
  if (!obj || typeof obj !== "object") return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) {
      delete obj[key];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      rejectMongoOperators(obj[key]);
    }
  }
  return obj;
}

module.exports = {
  sanitizeText,
  sanitizeEnum,
  sanitizeDate,
  sanitizeBoolean,
  rejectMongoOperators
};
