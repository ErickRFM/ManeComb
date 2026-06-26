const mongoose = require("mongoose");

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

const assignedRouteSchema = new mongoose.Schema(
  {
    originLabel: { type: String, default: "" },
    destinationLabel: { type: String, default: "" },
    destination: { type: pointSchema, required: true },
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
    polyline: { type: [pointSchema], default: [] }
  },
  {
    collection: "routes",
    versionKey: false
  }
);

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
    phone: { type: String, default: "Pendiente" },
    shift: { type: String, default: "Pendiente asignacion" },
    status: { type: String, default: "offline" },
    avatar: { type: String, default: "" },
    avatarUrl: { type: String, default: null },
    vehicleId: { type: String, default: null },
    activationKeyId: { type: String, default: null, index: true },
    activatedAt: { type: Date, default: null },
    e2eePublicKey: { type: String, default: "" },
    e2eeKeyRotatedAt: { type: Date, default: Date.now },
    e2eeBackups: { type: [e2eeBackupSchema], default: [] },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },
    companyProfile: { type: companyProfileSchema, default: () => ({}) },
    paymentProfile: { type: paymentProfileSchema, default: () => ({}) },
    operationalSchedule: { type: operationalScheduleSchema, default: null }
  },
  {
    collection: "users",
    versionKey: false
  }
);

userSchema.index({ organizationId: 1, role: 1, userStatus: 1 });
userSchema.index({ organizationId: 1, accountType: 1 });

const vehicleSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    code: { type: String, required: true },
    plate: { type: String, required: true },
    routeId: { type: String, required: true },
    driverId: { type: String, default: null },
    supervisorId: { type: String, default: null },
    status: { type: String, required: true },
    occupancy: { type: Number, default: 0 },
    capacity: { type: Number, required: true },
    etaMinutes: { type: Number, default: null },
    delayMinutes: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    fuel: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    location: { type: pointSchema, required: true },
    assignedRoute: { type: assignedRouteSchema, default: null }
  },
  {
    collection: "vehicles",
    versionKey: false
  }
);

vehicleSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
vehicleSchema.index({ organizationId: 1, routeId: 1 });

const incidentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    organizationId: { type: String, default: "", index: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    severity: { type: String, default: "medium" },
    status: { type: String, default: "open" },
    routeId: { type: String, required: true },
    vehicleId: { type: String, default: null },
    reporterId: { type: String, required: true },
    description: { type: String, required: true },
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
    mimeType: { type: String, default: "" },
    durationSeconds: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

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
    messages: { type: [messageSchema], default: [] }
  },
  {
    collection: "conversations",
    versionKey: false
  }
);

conversationSchema.index({ participants: 1, channelMode: 1 });
conversationSchema.index({ organizationId: 1, channelMode: 1 });

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
    reviewNotes: { type: String, default: "" }
  },
  {
    collection: "documents",
    versionKey: false
  }
);

documentSchema.index({ organizationId: 1, ownerType: 1, ownerId: 1 });
documentSchema.index({ organizationId: 1, reviewStatus: 1, expiresAt: 1 });

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
    paymentStatus: { type: String, default: "pending" },
    paymentApprovedAt: { type: Date, default: null },
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
    starterFleet: { type: [commercialStarterFleetSchema], default: [] },
    launchSummary: { type: String, default: "" },
    lastEmailStatus: { type: String, default: "pending" },
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
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
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
    provider: { type: String, required: true, index: true },
    payloadHash: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    status: { type: String, default: "received", index: true },
    retries: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  {
    collection: "webhook_events",
    versionKey: false
  }
);

webhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, receivedAt: -1 });

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
  CommercialLeadModel: getModel("CommercialLead", commercialLeadSchema),
  ConversationModel: getModel("Conversation", conversationSchema),
  DocumentModel: getModel("Document", documentSchema),
  IncidentModel: getModel("Incident", incidentSchema),
  NotificationModel: getModel("Notification", notificationSchema),
  RtcSessionModel: getModel("RtcSession", rtcSessionSchema),
  RouteModel: getModel("Route", routeSchema),
  TripLogModel: getModel("TripLog", tripLogSchema),
  UserModel: getModel("User", userSchema),
  SessionModel: getModel("Session", sessionSchema),
  VehicleModel: getModel("Vehicle", vehicleSchema),
  WebhookEventModel: getModel("WebhookEvent", webhookEventSchema)
};
