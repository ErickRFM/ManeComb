class PlatformError extends Error {
  constructor({ statusCode = 500, code = "PLATFORM_INTERNAL_ERROR", message = "Error interno", details = null }) {
    super(message);
    this.name = "PlatformError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class PlatformNotFoundError extends PlatformError {
  constructor(message = "Recurso no encontrado", details = null) {
    super({ statusCode: 404, code: "PLATFORM_NOT_FOUND", message, details });
    this.name = "PlatformNotFoundError";
  }
}

class PlatformValidationError extends PlatformError {
  constructor(message = "Datos inválidos", details = null) {
    super({ statusCode: 400, code: "PLATFORM_VALIDATION_ERROR", message, details });
    this.name = "PlatformValidationError";
  }
}

class PlatformForbiddenError extends PlatformError {
  constructor(message = "No tienes permisos suficientes", details = null) {
    super({ statusCode: 403, code: "PLATFORM_FORBIDDEN", message, details });
    this.name = "PlatformForbiddenError";
  }
}

class PlatformConflictError extends PlatformError {
  constructor(message = "Conflicto con el estado actual", details = null) {
    super({ statusCode: 409, code: "PLATFORM_CONFLICT", message, details });
    this.name = "PlatformConflictError";
  }
}

class PlatformInternalError extends PlatformError {
  constructor(message = "Error interno del servidor", details = null) {
    super({ statusCode: 500, code: "PLATFORM_INTERNAL_ERROR", message, details });
    this.name = "PlatformInternalError";
  }
}

function toPlatformError(error) {
  if (error instanceof PlatformError) return error;
  return new PlatformInternalError(
    process.env.NODE_ENV === "production" ? "Error interno del servidor" : error.message
  );
}

module.exports = {
  PlatformError,
  PlatformNotFoundError,
  PlatformValidationError,
  PlatformForbiddenError,
  PlatformConflictError,
  PlatformInternalError,
  toPlatformError
};
