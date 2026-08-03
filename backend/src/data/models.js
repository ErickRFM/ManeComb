const mongoose = require("mongoose");

const PLATFORM_ROLES = [
  "platform_owner",
  "platform_admin",
  "platform_support",
  "platform_finance",
  "platform_viewer"
];

const PLATFORM_USER_STATUSES = ["active", "suspended", "disabled"];

const ENTERPRISE_ROLES = [
  "owner",
  "admin",
  "dispatcher",
  "supervisor",
  "billing_manager",
  "support",
  "viewer",
  "driver"
];

const pointSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  { _id: false }
);

const plannedRouteSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    distanceMeters: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    durationInTrafficSeconds: { type: Number, default: 0 },
    trafficLevel: { type: String, default: "low" },
    polyline: { type: [pointSchema], default: [] }
  },
  { _id: false }
);

const stopSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: "" },
    order: { type: Number, required: true }
  },
  { _id: false }
);

const assignedRouteSchema = new mongoose.Schema(
  {
    routeId: { type: String, default: null },
    routeName: { type: String, default: "" },
    routeCode: { type: String, default: "" },
    routeColor: { type: String, default: null },
    originLabel: { type: String, default: "" },
    origin: { type: pointSchema, default: null },
    destinationLabel: { type: String, default: "" },
    destination: { type: pointSchema, required: true },
    stops: { type: [stopSchema], default: [] },
    assignedBy: { type: String, required: true },
    assignedAt: { type: Date, default: Date.now },
    provider: { type: String, default: "system" },
    route: { type: plannedRouteSchema, required: true },
    alternatives: { type: [plannedRouteSchema], default: [] }
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    color: { type: String, required: true },
    origin: { type: pointSchema, default: null },
    destination: { type: pointSchema, default: null },
    originLabel: { type: String, default: "" },
    destinationLabel: { type: String, default: "" },
    stops: { type: [stopSchema], default: [] },
    distanceMeters: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    durationInTrafficSeconds: { type: Number, default: 0 },
    polyline: { type: [pointSchema], default: [] },
    organizationId: { type: String, default: null },
    createdBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    collection: "routes",
    versionKey: false
  }
);

routeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const companyProfileSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "" },
    legalName: { type: String, default: "" },
    taxId: { type: String, default: "" },
    billingEmail: { type: String, default: "" },
    billingAddress: { type: String, default: "" }
  },
  {
    _id: false
  }
);

const paymentProfileSchema = new mongoose.Schema(
  {
    preferredMethod: { type: String, enum: ["card", "spei", "transfer"], default: "spei" },
    cardholderName: { type: String, default: "" },
    cardBrand: { type: String, default: "" },
    cardLast4: { type: String, default: "" },
    cardExpMonth: { type: String, default: "" },
    cardExpYear: { type: String, default: "" },
    customerReference: { type: String, default: "" }
  },
  {
    _id: false
  }
);

const operationalScheduleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    activeDays: { type: [Number], default: undefined },
    timezone: { type: String, default: null }
  },
  {
    _id: false
  }
);

const pushSubscriptionSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    platform: { type: String, default: "unknown" },
    deviceName: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    _id: false
  }
);

const e2eeBackupSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    publicKey: { type: String, default: "" },
    backupCipher: { type: String, default: "" },
    backupVersion: { type: String, default: "secretbox-v1" },
    platform: { type: String, default: "unknown" },
    label: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
    restoredAt: { type: Date, default: null }
  },
  {
    _id: false
  }
);

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ENTERPRISE_ROLES, required: true, index: true },
    accountType: { type: String, enum: ["operations", "company_owner"], default: "operations" },
    organizationId: { type: String, default: "", index: true },
    userStatus: {
      type: String,
      enum: ["active", "pending", "suspended"],
      default: "active",
      index: true
    },
    lastAccessAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    reactivatedAt: { type: Date, default: null },
    accountStatusVersion: { type: Number, default: 0 },
    credentialVersion: { type: Number, default: 0 },
    passwordChangedAt: { type: Date, default: null },
    emailChangedAt: { type: Date, default: null },
    phone: { type: String, default: "Pendiente" },
    shift: { type: String, default: "Pendiente asignacion" },
    status: { type: String, default: "offline" },
    avatar: { type: String, default: "" },
    avatarUrl: { type: String, default: null },
    vehicleId: { type: String, default: null },
    activationKeyId: { type: String, default: null, index: true },
    activatedAt: { type: Date, default: null },
    offboardedAt: { type: Date, default: null },
    offboardedBy: { type: String, default: null },
    offboardReason: { type: String, default: "" },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: String, default: null },
    deleteReason: { type: String, default: "" },
    fleetLifecycleVersion: { type: Number, default: 0 },
    e2eePublicKey: { type: String, default: "" },
    e2eeKeyRotatedAt: { type: Date, default: Date.now },
    e2eeBackups: { type: [e2eeBackupSchema], default: [] },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },
    companyProfile: { type: companyProfileSchema, default: () => ({}) },
    paymentProfile: { type: paymentProfileSchema, default: () => ({}) },
    operationalSchedule: { type: operationalScheduleSchema, default: null },
    resetTokenHash: { type: String, default: null, index: true },
    resetTokenExpiresAt: { type: Date, default: null }
  },
  {
    collection: "users",
    versionKey: false
  }
);

userSchema.index({ organizationId: 1, role: 1, userStatus: 1 });
userSchema.index({ organizationId: 1, accountType: 1 });

const platformUserSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: PLATFORM_ROLES, required: true, index: true },
    status: { type: String, enum: PLATFORM_USER_STATUSES, default: "active", index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    createdBy: { type: String, default: null },
    suspendedAt: { type: Date, default: null },
    suspendedReason: { type: String, default: "" },
    mfaEnabled: { type: Boolean, default: false },
    mfaEnrollmentRequired: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, default: null },
    mfaBackupCodes: { type: [String], default: [] },
    mfaSetupCompletedAt: { type: Date, default: null },
    mfaFailedAttempts: { type: Number, default: 0 },
    mfaLockedUntil: { type: Date, default: null }
  },
  {
    collection: "platform_users",
    versionKey: false
  }
);

platformUserSchema.index({ status: 1, createdAt: -1 });

const platformSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    platform: { type: String, default: "unknown" },
    deviceName: { type: String, default: "Sesion" },
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokedReason: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    mfaVerified: { type: Boolean, default: false }
  },
  {
    collection: "platform_sessions",
    versionKey: false
  }
);

platformSessionSchema.index({ userId: 1, isActive: 1, lastSeenAt: -1 });

const vehicleSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    code: { type: String, required: true },
    plate: { type: String, required: true },
    routeId: { type: String, default: null },
    driverId: { type: String, default: null },
    supervisorId: { type: String, default: null },
    status: { type: String, required: true },
    occupancy: { type: Number, default: 0 },
    capacity: { type: Number, required: true },
    etaMinutes: { type: Number, default: null },
    delayMinutes: { type: Number, default: 0 },
    heading: { type: Number, default: null },
    speed: { type: Number, default: 0 },
    fuel: { type: Number, default: 0 },
    currentKilometers: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    location: { type: pointSchema, default: null },
    locationTimestamp: { type: Date, default: null },
    locationClientTimestamp: { type: Date, default: null },
    locationReceivedAt: { type: Date, default: null },
    locationTimestampSource: { type: String, default: "server" },
    locationClockSkewMs: { type: Number, default: null },
    locationPacketId: { type: String, default: null },
    activeRouteProgress: { type: mongoose.Schema.Types.Mixed, default: null },
    assignedRoute: { type: assignedRouteSchema, default: null },
    retiredAt: { type: Date, default: null, index: true },
    retiredBy: { type: String, default: null },
    retirementReason: { type: String, default: "" },
    fleetLifecycleVersion: { type: Number, default: 0 }
  },
  {
    collection: "vehicles",
    versionKey: false
  }
);

vehicleSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
vehicleSchema.index({ organizationId: 1, routeId: 1 });
vehicleSchema.index({ organizationId: 1, code: 1 }, { unique: true });
vehicleSchema.index({ organizationId: 1, plate: 1 }, { unique: true });

const routeSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    routeId: { type: String, required: true, index: true },
    vehicleId: { type: String, required: true, index: true },
    packetId: { type: String, default: null },
    activeKey: { type: String, default: null },
    driverId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["ASSIGNED", "READY", "RUNNING", "PAUSED", "FINISHED", "CANCELLED"],
      default: "RUNNING",
      index: true
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    startedOdometer: { type: Number, default: null },
    finishedOdometer: { type: Number, default: null },
    startBattery: { type: Number, default: null },
    endBattery: { type: Number, default: null },
    startGpsAccuracy: { type: Number, default: null },
    endGpsAccuracy: { type: Number, default: null },
    finishReason: { type: String, default: null },
    totalDistance: { type: Number, default: null },
    totalDuration: { type: Number, default: null },
    movingTime: { type: Number, default: null },
    stoppedTime: { type: Number, default: null },
    gpsLostTime: { type: Number, default: null },
    offRouteTime: { type: Number, default: null },
    checkpointCount: { type: Number, default: null },
    completedCheckpoints: { type: Number, default: null },
    completedLaps: { type: Number, default: null },
    averageSpeed: { type: Number, default: null },
    maxSpeed: { type: Number, default: null },
    averageGpsAccuracy: { type: Number, default: null },
    gpsLostEvents: { type: Number, default: null },
    offRouteEvents: { type: Number, default: null },
    stopEvents: { type: Number, default: null },
    processingCompletedAt: { type: Date, default: null },
    processingError: { type: String, default: null },
    metrics: { type: mongoose.Schema.Types.Mixed, default: null },
    statisticsReady: { type: Boolean, default: false },
    processingStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true
    },
    deviceInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    assignedBy: { type: String, default: null },
    startedBy: { type: String, default: null },
    finishedBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "route_sessions", versionKey: false }
);

routeSessionSchema.index({ organizationId: 1, vehicleId: 1, startedAt: -1 });
routeSessionSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: "string" } } }
);

// RC-MULTI-ROUTE-DRIVER-01 F2 — Entidad de asignaciones multiples por unidad. NO duplica
// geometria: solo referencia a la ruta (routeId) + versionado para detectar que la ruta
// oficial cambio. Vehicle.assignedRoute se conserva como PROYECCION de la ACTIVE (no se
// vuelve array); F3 (activateVehicleRouteAssignment) es el unico dueno de esa proyeccion.
const vehicleRouteAssignmentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    vehicleId: { type: String, required: true, index: true },
    routeId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["AVAILABLE", "SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"],
      default: "AVAILABLE",
      index: true
    },
    priority: { type: Number, default: 0, min: 0 },
    selectableByDriver: { type: Boolean, default: true },
    scheduledFrom: { type: Date, default: null },
    scheduledUntil: {
      type: Date,
      default: null,
      validate: {
        validator: function validateScheduleWindow(value) {
          return !value || !this.scheduledFrom || value > this.scheduledFrom;
        },
        message: "scheduledUntil debe ser posterior a scheduledFrom"
      }
    },
    assignedBy: { type: String, default: null },
    assignedAt: { type: Date, default: Date.now },
    activatedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    // Contador monotono interno para idempotencia de activaciones (NO es una version de Route).
    activationVersion: { type: Number, default: 0, min: 0 },
    // routeRevision = revision de la RUTA OFICIAL en el momento de activar. Fuente canonica:
    // `Route.revision` (numerico incremental) — que hoy NO existe en el modelo Route. Contrato
    // en RC-MULTI-ROUTE-DRIVER-01-F2.1.md: F3 (o un prep) agrega Route.revision y lo copia aqui;
    // hasta entonces 0 = "sin versionar" y NO debe usarse para decidir drift. No se inventa un
    // numero sin fuente real.
    routeRevision: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "vehicle_route_assignments", versionKey: false }
);

vehicleRouteAssignmentSchema.index({ organizationId: 1, vehicleId: 1, routeId: 1, status: 1 });
// Consultas F3-F5: lista por unidad ordenada por prioridad (ASC: menor priority = mayor
// prioridad); catalogo por ruta; ventana horaria.
vehicleRouteAssignmentSchema.index({ organizationId: 1, vehicleId: 1, status: 1, priority: 1 });
vehicleRouteAssignmentSchema.index({ organizationId: 1, routeId: 1, status: 1 });
vehicleRouteAssignmentSchema.index({ organizationId: 1, vehicleId: 1, scheduledFrom: 1, scheduledUntil: 1 });
// Garantia dura a nivel indice: una sola asignacion ACTIVE por unidad.
vehicleRouteAssignmentSchema.index(
  { organizationId: 1, vehicleId: 1 },
  { unique: true, partialFilterExpression: { status: "ACTIVE" } }
);

const routeSessionPositionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    sessionId: { type: String, required: true, index: true },
    vehicleId: { type: String, required: true, index: true },
    packetId: { type: String, default: null },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    heading: { type: Number, default: null },
    speed: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    gpsQuality: { type: String, enum: ["GOOD", "NORMAL", "BAD"], default: "NORMAL", index: true },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "route_session_positions", versionKey: false }
);

routeSessionPositionSchema.index({ sessionId: 1, timestamp: 1 });
routeSessionPositionSchema.index(
  { sessionId: 1, packetId: 1 },
  { unique: true, partialFilterExpression: { packetId: { $type: "string" } } }
);

const learnedRouteCandidateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, required: true, index: true },
    groupKey: { type: String, required: true },
    corridorCluster: { type: String, required: true },
    vehicleId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["COLLECTING", "READY_FOR_REVIEW", "APPROVED", "REJECTED"],
      default: "COLLECTING",
      index: true
    },
    direction: { type: String, required: true },
    origin: { type: pointSchema, required: true },
    destination: { type: pointSchema, required: true },
    polyline: { type: [pointSchema], default: [] },
    distanceMeters: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    evidenceSessionIds: { type: [String], default: [] },
    evidenceVehicleIds: { type: [String], default: [] },
    evidenceCount: { type: Number, default: 0 },
    vehicleCount: { type: Number, default: 0 },
    representativeSessionId: { type: String, required: true },
    geometryVersion: { type: String, required: true },
    algorithmVersion: { type: String, required: true },
    approvedRouteId: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "learned_route_candidates", versionKey: false }
);
learnedRouteCandidateSchema.index({ organizationId: 1, groupKey: 1 }, { unique: true });
learnedRouteCandidateSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });

const autoRouteProcessingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    algorithmVersion: { type: String, required: true },
    status: { type: String, enum: ["PROCESSING", "COMPLETED", "REJECTED", "FAILED"], required: true },
    reason: { type: String, default: null },
    candidateId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "auto_route_processing", versionKey: false }
);
autoRouteProcessingSchema.index({ sessionId: 1, algorithmVersion: 1 }, { unique: true });

const routeEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    sessionId: { type: String, required: true, index: true },
    vehicleId: { type: String, required: true, index: true },
    routeId: { type: String, required: true, index: true },
    driverId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: [
        "SESSION_STARTED",
        "SESSION_PAUSED",
        "SESSION_RESUMED",
        "SESSION_FINISHED",
        "GPS_LOST",
        "GPS_RECOVERED",
        "CHECKPOINT_REACHED",
        "OFF_ROUTE",
        "ON_ROUTE",
        "VEHICLE_STOPPED",
        "VEHICLE_MOVING"
      ],
      required: true,
      index: true
    },
    timestamp: { type: Date, required: true, index: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { collection: "route_events", versionKey: false }
);

routeEventSchema.index({ sessionId: 1, timestamp: 1 });
routeEventSchema.index({ sessionId: 1, eventType: 1, timestamp: -1 });

const checkpointVisitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    sessionId: { type: String, required: true, index: true },
    checkpointId: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    distance: { type: Number, default: null },
    visitOrder: { type: Number, required: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "checkpoint_visits", versionKey: false }
);

checkpointVisitSchema.index({ sessionId: 1, visitOrder: 1 });

const incidentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    severity: { type: String, default: "medium" },
    status: { type: String, default: "open" },
    routeId: { type: String, default: null },
    vehicleId: { type: String, default: null },
    reporterId: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: Object, default: null },
    locationState: { type: String, enum: ["fresh", "stale", "missing"], default: "missing" },
    locationSourceTimestamp: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: null },
    media: { type: [String], default: [] }
  },
  {
    collection: "incidents",
    versionKey: false
  }
);

incidentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, vehicleId: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, routeId: 1, createdAt: -1 });

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    senderId: { type: String, required: true },
    kind: { type: String, default: "text" },
    text: { type: String, default: "" },
    textPreview: { type: String, default: "" },
    payloadEncrypted: { type: String, default: "" },
    isEncrypted: { type: Boolean, default: false },
    transcript: { type: String, default: "" },
    audioUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    videoUrl: { type: String, default: null },
    mimeType: { type: String, default: "" },
    durationSeconds: { type: Number, default: 0 },
    transmissionId: { type: String },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    conversationId: { type: String, required: true, index: true },
    organizationId: { type: String, default: "", index: true },
    senderId: { type: String, required: true, index: true },
    kind: { type: String, default: "text" },
    text: { type: String, default: "" },
    textPreview: { type: String, default: "" },
    payloadEncrypted: { type: String, default: "" },
    isEncrypted: { type: Boolean, default: false },
    transcript: { type: String, default: "" },
    audioUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    videoUrl: { type: String, default: null },
    mimeType: { type: String, default: "" },
    durationSeconds: { type: Number, default: 0 },
    transmissionId: { type: String },
    status: { type: String, default: "sent", index: true },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "chat_messages",
    versionKey: false
  }
);

chatMessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ organizationId: 1, conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ senderId: 1, createdAt: -1 });
chatMessageSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
chatMessageSchema.index({ organizationId: 1, kind: 1, createdAt: -1 });
chatMessageSchema.index(
  { organizationId: 1, transmissionId: 1 },
  { unique: true, partialFilterExpression: { transmissionId: { $type: "string" } } }
);

const chatAttachmentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    conversationId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    organizationId: { type: String, default: "", index: true },
    ownerId: { type: String, required: true, index: true },
    kind: { type: String, default: "file" },
    url: { type: String, required: true },
    mimeType: { type: String, default: "" },
    durationSeconds: { type: Number, default: 0 },
    status: { type: String, default: "available", index: true },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "chat_attachments",
    versionKey: false
  }
);

chatAttachmentSchema.index({ conversationId: 1, createdAt: -1 });
chatAttachmentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
chatAttachmentSchema.index({ messageId: 1, kind: 1 }, { unique: true });

const conversationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    kind: { type: String, default: "direct" },
    channelMode: { type: String, default: "chat" },
    description: { type: String, default: "" },
    encrypted: { type: Boolean, default: true },
    participants: { type: [String], default: [] },
    unreadBy: { type: Map, of: Number, default: {} },
    lastMessage: { type: mongoose.Schema.Types.Mixed, default: null },
    lastActivityAt: { type: Date, default: null, index: true },
    messageCount: { type: Number, default: 0 },
    messages: { type: [messageSchema], default: [] }
  },
  {
    collection: "conversations",
    versionKey: false
  }
);

conversationSchema.index({ participants: 1, channelMode: 1 });
conversationSchema.index({ organizationId: 1, channelMode: 1 });
conversationSchema.index({ organizationId: 1, lastActivityAt: -1 });

const documentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    ownerType: { type: String, enum: ["driver", "vehicle"], required: true },
    ownerId: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    fileUrl: { type: String, default: null },
    storageType: { type: String, default: "seed" },
    mimeType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true },
    originalFileName: { type: String, default: "" },
    storageKey: { type: String, default: "" },
    reviewStatus: { type: String, default: "pending_review" },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewNotes: { type: String, default: "" },
    reviewVersion: { type: Number, default: 0 },
    replacesDocumentId: { type: String, default: null, index: true },
    supersededByDocumentId: { type: String, default: null, index: true },
    version: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: String, default: null },
    deleteReason: { type: String, default: "" },
    assetDeletedAt: { type: Date, default: null },
    assetDeletionError: { type: String, default: "" },
    assetDeletionAttempts: { type: Number, default: 0 }
  },
  {
    collection: "documents",
    versionKey: false
  }
);

documentSchema.index({ organizationId: 1, ownerType: 1, ownerId: 1 });
documentSchema.index({ organizationId: 1, reviewStatus: 1, expiresAt: 1 });
documentSchema.index({ organizationId: 1, deletedAt: 1, supersededByDocumentId: 1 });

const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    level: { type: String, required: true },
    targetRoles: { type: [String], default: [] },
    targetUserIds: { type: [String], default: [] },
    category: { type: String, default: "system" },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
    readBy: { type: [String], default: [] }
  },
  {
    collection: "notifications",
    versionKey: false
  }
);

notificationSchema.index({ targetRoles: 1, createdAt: -1 });
notificationSchema.index({ targetUserIds: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, createdAt: -1 });

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    organizationId: { type: String, default: "", index: true },
    refreshTokenHash: { type: String, required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    platform: { type: String, default: "unknown" },
    deviceName: { type: String, default: "Sesion" },
    locationApprox: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokedReason: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true }
  },
  {
    collection: "sessions",
    versionKey: false
  }
);

sessionSchema.index({ userId: 1, isActive: 1, lastSeenAt: -1 });
sessionSchema.index({ organizationId: 1, isActive: 1, lastSeenAt: -1 });

const auditLogSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, default: null, index: true },
    organizationId: { type: String, default: "", index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: null, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    severity: { type: String, default: "info", index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "audit_logs",
    versionKey: false
  }
);

auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const tripLogSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    vehicleId: { type: String, required: true, index: true },
    vehicleCode: { type: String, required: true },
    lap: { type: Number, required: true },
    serviceDate: { type: String, required: true, index: true },
    originLabel: { type: String, required: true },
    destinationLabel: { type: String, required: true },
    origin: { type: pointSchema, required: true },
    destination: { type: pointSchema, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    durationSeconds: { type: Number, required: true },
    distanceMeters: { type: Number, default: 0 },
    plannedDurationSeconds: { type: Number, default: 0 },
    provider: { type: String, default: "system" },
    registeredBy: { type: String, required: true }
  },
  {
    collection: "trip_logs",
    versionKey: false
  }
);

tripLogSchema.index({
  vehicleId: 1,
  serviceDate: 1,
  finishedAt: -1
});
tripLogSchema.index({ organizationId: 1, serviceDate: 1, finishedAt: -1 });

const commercialChecklistItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    owner: { type: String, required: true },
    status: { type: String, required: true },
    description: { type: String, default: "" }
  },
  {
    _id: false
  }
);

const commercialStarterFleetSchema = new mongoose.Schema(
  {
    vehicleCode: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, required: true },
    suggestedDriver: { type: String, required: true },
    suggestedShift: { type: String, required: true }
  },
  {
    _id: false
  }
);

const commercialAddOnSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, default: 0 },
    included: { type: Boolean, default: false },
    description: { type: String, default: "" }
  },
  {
    _id: false
  }
);

const commercialLeadSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    referenceCode: { type: String, required: true, index: true },
    ownerUserId: { type: String, default: null, index: true },
    ownerAccountEmail: { type: String, default: "" },
    organizationId: { type: String, default: "", index: true },
    organizationSlug: { type: String, default: "" },
    accountStatus: { type: String, default: "registered" },
    companyName: { type: String, required: true },
    contactName: { type: String, required: true },
    email: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    billingProfile: { type: companyProfileSchema, default: () => ({}) },
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    fleetSize: { type: Number, required: true },
    basePlanPrice: { type: Number, required: true },
    addOns: { type: [commercialAddOnSchema], default: [] },
    addOnsTotal: { type: Number, default: 0 },
    radioFeatureEnabled: { type: Boolean, default: false },
    totalPrice: { type: Number, required: true },
    pricePerVehicle: { type: Number, required: true },
    strategy: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    paymentProvider: { type: String, default: "manual" },
    checkoutUrl: { type: String, default: null },
    paymentExternalReference: { type: String, default: "" },
    paymentProviderReference: { type: String, default: "" },
    providerPaymentId: { type: String, default: null },
    appliedPaymentTransitions: { type: [String], default: [] },
    paymentEffectsStatus: { type: String, default: null },
    paymentEffectsTransition: { type: String, default: null },
    paymentEffectsLeaseUntil: { type: Date, default: null },
    paymentEffectsWorker: { type: String, default: null },
    paymentEffectsCompletedAt: { type: Date, default: null },
    paymentStatus: { type: String, default: "pending" },
    paymentApprovedAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    paidUntil: { type: Date, default: null },
    nextBillingAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    financialStatus: { type: String, default: null },
    refundedAmountMinor: { type: Number, default: 0 },
    refundReservedMinor: { type: Number, default: 0 },
    refundableAmountMinor: { type: Number, default: 0 },
    chargebackStatus: { type: String, default: null },
    serviceSuspendedReason: { type: String, default: null },
    status: { type: String, default: "new" },
    source: { type: String, default: "landing-web" },
    needsOnboarding: { type: Boolean, default: true },
    needsInvoice: { type: Boolean, default: true },
    requestTrial: { type: Boolean, default: false },
    trialDays: { type: Number, default: 0 },
    trialStartedAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    trialStatus: { type: String, default: "not_requested" },
    notes: { type: String, default: "" },
    activationStatus: { type: String, default: "pending_payment" },
    activationStartedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    cancelAt: { type: Date, default: null },
    activationNotes: { type: String, default: "" },
    onboardingStatus: { type: String, default: "pending" },
    onboardingChecklist: { type: [commercialChecklistItemSchema], default: [] },
    fleetSetupStatus: { type: String, default: "pending" },
    fleetLifecycleVersion: { type: Number, default: 0 },
    starterFleet: { type: [commercialStarterFleetSchema], default: [] },
    launchSummary: { type: String, default: "" },
    lastEmailStatus: { type: String, default: "pending" },
    lastEmailError: { type: String, default: null },
    lastEmailProvider: { type: String, default: null },
    lastEmailTemplate: { type: String, default: null },
    lastNotificationDeliveryId: { type: String, default: null },
    lastNotificationStatus: { type: String, default: null },
    lastNotificationAt: { type: Date, default: null },
    lastWhatsappStatus: { type: String, default: "pending" },
    lastContactedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  {
    collection: "commercial_leads",
    versionKey: false
  }
);

commercialLeadSchema.index({ organizationId: 1, paymentStatus: 1, createdAt: -1 });
commercialLeadSchema.index({ ownerUserId: 1, createdAt: -1 });
commercialLeadSchema.index(
  { paymentProvider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } }
);

const checkoutIdempotencySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    scope: { type: String, required: true },
    keyHash: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    orderId: { type: String, required: true },
    providerIdempotencyKey: { type: String, required: true },
    status: { type: String, required: true },
    attemptCount: { type: Number, default: 1 },
    leaseOwner: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    safeResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    lastErrorCode: { type: String, default: null },
    readyAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "checkout_idempotency", versionKey: false }
);

checkoutIdempotencySchema.index({ scope: 1, keyHash: 1 }, { unique: true });
checkoutIdempotencySchema.index({ status: 1, leaseUntil: 1 });

const trialEntitlementSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, required: true },
    orderId: { type: String, required: true },
    planId: { type: String, required: true },
    status: { type: String, default: "active" },
    trialStartedAt: { type: Date, required: true },
    trialEndsAt: { type: Date, required: true },
    consumedAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "trial_entitlements", versionKey: false }
);

trialEntitlementSchema.index({ organizationId: 1 }, { unique: true });

const refundOperationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, provider: { type: String, required: true }, providerRefundId: { type: String, default: null },
    providerPaymentId: { type: String, required: true }, orderId: { type: String, required: true }, organizationId: { type: String, required: true },
    amountMinor: { type: Number, required: true }, currency: { type: String, required: true }, type: { type: String, required: true }, status: { type: String, required: true },
    idempotencyKeyHash: { type: String, required: true }, requestFingerprint: { type: String, required: true }, requestedBy: { type: String, required: true },
    requestedAt: { type: Date, required: true }, confirmedAt: { type: Date, default: null }, failedAt: { type: Date, default: null }, lastErrorCode: { type: String, default: null },
    leaseOwner: { type: String, default: null }, leaseUntil: { type: Date, default: null }, attemptCount: { type: Number, default: 1 }, safeResponse: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { collection: "refund_operations", versionKey: false }
);
refundOperationSchema.index({ organizationId: 1, idempotencyKeyHash: 1 }, { unique: true });
refundOperationSchema.index({ orderId: 1, status: 1 });

const chargebackSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, provider: { type: String, required: true }, providerChargebackId: { type: String, required: true }, providerPaymentId: { type: String, required: true },
    orderId: { type: String, required: true }, organizationId: { type: String, required: true }, amountMinor: { type: Number, required: true }, currency: { type: String, required: true }, status: { type: String, required: true },
    coverageEligible: { type: Boolean, default: false }, coverageApplied: { type: Boolean, default: false }, documentationRequired: { type: Boolean, default: false },
    documentationDeadline: { type: Date, default: null }, openedAt: { type: Date, required: true }, updatedAt: { type: Date, required: true }, resolvedAt: { type: Date, default: null }, resolution: { type: String, default: null }
  },
  { collection: "chargebacks", versionKey: false }
);
chargebackSchema.index({ provider: 1, providerChargebackId: 1 }, { unique: true });
chargebackSchema.index({ orderId: 1, updatedAt: -1 });

const activationKeySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    adminId: { type: String, required: true, index: true },
    planId: { type: String, required: true, index: true },
    orderId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["available", "used", "expired", "revoked"],
      default: "available",
      index: true
    },
    usedByDriverId: { type: String, default: null, index: true },
    usedByDriverState: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    sharedAt: { type: Date, default: null },
    sharedBy: { type: String, default: null, index: true },
    shareCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "activation_keys",
    versionKey: false
  }
);

activationKeySchema.index({ companyId: 1, status: 1, createdAt: -1 });
activationKeySchema.index({ companyId: 1, orderId: 1, status: 1 });

const webhookEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    providerEventId: { type: String, required: true },
    deliveryKey: { type: String, default: null, index: true },
    paymentId: { type: String, default: null, index: true },
    observedStatus: { type: String, default: null },
    requestId: { type: String, default: null },
    signatureTimestamp: { type: String, default: null },
    provider: { type: String, required: true, index: true },
    payloadHash: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    status: { type: String, default: "received", index: true },
    retries: { type: Number, default: 0 },
    attemptCount: { type: Number, default: 0 },
    leaseOwner: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    processingStartedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null },
    nextRetryAt: { type: Date, default: null },
    orderId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  {
    collection: "webhook_events",
    versionKey: false
  }
);

webhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, receivedAt: -1 });
webhookEventSchema.index({ status: 1, leaseUntil: 1, nextRetryAt: 1 });

const rtcSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    roomId: { type: String, required: true, index: true },
    initiatedBy: { type: String, default: null },
    participantUserIds: { type: [String], default: [] },
    participantNames: { type: [String], default: [] },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    status: { type: String, default: "active" },
    endReason: { type: String, default: null },
    mode: { type: String, default: null },
    usedRelay: { type: Boolean, default: null },
    sharedScreen: { type: Boolean, default: false },
    offerCount: { type: Number, default: 0 },
    lastEventAt: { type: Date, default: Date.now }
  },
  {
    collection: "rtc_sessions",
    versionKey: false
  }
);

rtcSessionSchema.index({ roomId: 1, startedAt: -1 });
rtcSessionSchema.index({ participantUserIds: 1, startedAt: -1 });
rtcSessionSchema.index({ organizationId: 1, startedAt: -1 });

const appEventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true, index: true },
    scope: { type: String, default: "system", index: true },
    level: { type: String, default: "info" },
    status: { type: String, default: "ok" },
    route: { type: String, default: "" },
    method: { type: String, default: "" },
    userId: { type: String, default: null },
    entityId: { type: String, default: null },
    message: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    collection: "app_events",
    versionKey: false
  }
);

appEventSchema.index({ scope: 1, createdAt: -1 });
appEventSchema.index({ userId: 1, createdAt: -1 });

function getModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  ActivationKeyModel: getModel("ActivationKey", activationKeySchema),
  AppEventModel: getModel("AppEvent", appEventSchema),
  AuditLogModel: getModel("AuditLog", auditLogSchema),
  AutoRouteProcessingModel: getModel("AutoRouteProcessing", autoRouteProcessingSchema),
  ChatAttachmentModel: getModel("ChatAttachment", chatAttachmentSchema),
  ChatMessageModel: getModel("ChatMessage", chatMessageSchema),
  CheckpointVisitModel: getModel("CheckpointVisit", checkpointVisitSchema),
  CheckoutIdempotencyModel: getModel("CheckoutIdempotency", checkoutIdempotencySchema),
  CommercialLeadModel: getModel("CommercialLead", commercialLeadSchema),
  ConversationModel: getModel("Conversation", conversationSchema),
  DocumentModel: getModel("Document", documentSchema),
  IncidentModel: getModel("Incident", incidentSchema),
  LearnedRouteCandidateModel: getModel("LearnedRouteCandidate", learnedRouteCandidateSchema),
  NotificationModel: getModel("Notification", notificationSchema),
  RtcSessionModel: getModel("RtcSession", rtcSessionSchema),
  RouteModel: getModel("Route", routeSchema),
  RouteEventModel: getModel("RouteEvent", routeEventSchema),
  RouteSessionModel: getModel("RouteSession", routeSessionSchema),
  RouteSessionPositionModel: getModel("RouteSessionPosition", routeSessionPositionSchema),
  RefundOperationModel: getModel("RefundOperation", refundOperationSchema),
  TripLogModel: getModel("TripLog", tripLogSchema),
  TrialEntitlementModel: getModel("TrialEntitlement", trialEntitlementSchema),
  ChargebackModel: getModel("Chargeback", chargebackSchema),
  PlatformUserModel: getModel("PlatformUser", platformUserSchema),
  PlatformSessionModel: getModel("PlatformSession", platformSessionSchema),
  UserModel: getModel("User", userSchema),
  SessionModel: getModel("Session", sessionSchema),
  VehicleModel: getModel("Vehicle", vehicleSchema),
  VehicleRouteAssignmentModel: getModel("VehicleRouteAssignment", vehicleRouteAssignmentSchema),
  WebhookEventModel: getModel("WebhookEvent", webhookEventSchema)
};
