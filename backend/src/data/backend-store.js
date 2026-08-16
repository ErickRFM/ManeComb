const { AppReleaseRepository } = require("./repositories/app-release-repository");
const { AuditLogRepository } = require("./repositories/audit-log-repository");
const { DocumentRepository } = require("./repositories/document-repository");
const { FleetRepository } = require("./repositories/fleet-repository");
const { IncidentRepository } = require("./repositories/incident-repository");
const { NotificationRepository } = require("./repositories/notification-repository");
const { OrganizationRepository } = require("./repositories/organization-repository");
const { PaymentRepository } = require("./repositories/payment-repository");
const { SessionRepository } = require("./repositories/session-repository");
const { TrackingRepository } = require("./repositories/tracking-repository");
const { UserRepository } = require("./repositories/user-repository");
const { AppConfigModel, AppClientVersionModel } = require("./app-release-models");
const { AppReleaseStoreService } = require("../services/app-release-store-service");
const { AuditLogService } = require("../services/audit-log-service");
const { DocumentService } = require("../services/document-service");
const { FleetService } = require("../services/fleet-service");
const { IncidentService } = require("../services/incident-service");
const { NotificationService } = require("../services/notification-service");
const { OrganizationService } = require("../services/organization-service");
const { PaymentStoreService } = require("../services/payment-store-service");
const { SessionStoreService } = require("../services/session-store-service");
const { TrackingService } = require("../services/tracking-service");
const { UserService } = require("../services/user-service");
const { installOperationalCommunicationsGuard } = require("../services/operational-communications-guard");
const { installRouteSessionCreationGuard } = require("../services/route-session-creation-guard");

function buildBackendStore(baseStore, dependencies = {}) {
  const models = dependencies.models || {};
  const useDefaultAppReleaseModels = Boolean(models.AppEventModel);
  const appReleaseModels = dependencies.models
    ? {
        AppConfigModel:
          models.AppConfigModel || (useDefaultAppReleaseModels ? AppConfigModel : null),
        AppClientVersionModel:
          models.AppClientVersionModel || (useDefaultAppReleaseModels ? AppClientVersionModel : null)
      }
    : {};
  const repositories = {
    appRelease: new AppReleaseRepository(baseStore, appReleaseModels),
    auditLogs: new AuditLogRepository(baseStore, models),
    documents: new DocumentRepository(baseStore, models),
    fleet: new FleetRepository(baseStore, models),
    incidents: new IncidentRepository(baseStore),
    notifications: new NotificationRepository(baseStore),
    organization: new OrganizationRepository(baseStore),
    payments: new PaymentRepository(baseStore, models),
    sessions: new SessionRepository(baseStore, models),
    tracking: new TrackingRepository(baseStore),
    users: new UserRepository(baseStore, models)
  };

  const services = {
    appRelease: new AppReleaseStoreService(repositories.appRelease),
    auditLogs: new AuditLogService(repositories.auditLogs),
    documents: new DocumentService(repositories.documents),
    fleet: new FleetService(repositories.fleet),
    incidents: new IncidentService(repositories.incidents),
    notifications: new NotificationService(repositories.notifications),
    organization: new OrganizationService(repositories.organization),
    payments: new PaymentStoreService(repositories.payments),
    sessions: new SessionStoreService(repositories.sessions),
    tracking: new TrackingService(repositories.tracking),
    users: new UserService(repositories.users)
  };

  const serviceMethods = dependencies.models
    ? Object.values(services).reduce((methods, service) => {
        Object.entries(service).forEach(([key, value]) => {
          if (typeof value === "function" && key !== "repository") {
            methods[key] = value.bind(service);
          }
        });

        return methods;
      }, {})
    : {};

  // These methods enforce enterprise tenant/identity boundaries independently
  // of the persistence adapter. Keep them behind repositories in embedded/test
  // too, while other legacy embedded domains migrate deliberately.
  const invariantMethods = {
    createAuditLog: services.auditLogs.createAuditLog.bind(services.auditLogs),
    deleteRoute: services.fleet.deleteRoute.bind(services.fleet),
    getDashboardOverview: services.fleet.getDashboardOverview.bind(services.fleet),
    getNotificationsForUser: services.notifications.getNotificationsForUser.bind(services.notifications),
    listAuditLogsForActor: services.auditLogs.listAuditLogsForActor.bind(services.auditLogs),
    listIncidents: services.incidents.listIncidents.bind(services.incidents),
    listRoutes: services.fleet.listRoutes.bind(services.fleet),
    listUsers: services.users.listUsers.bind(services.users),
    markNotificationAsRead: services.notifications.markNotificationAsRead.bind(services.notifications),
    updateRoute: services.fleet.updateRoute.bind(services.fleet),
    updateRouteIfRevision: services.fleet.updateRouteIfRevision.bind(services.fleet),
    updateUser: services.users.updateUser.bind(services.users)
  };

  const backendStore = {
    ...baseStore,
    ...invariantMethods,
    ...serviceMethods,
    repositories,
    services
  };

  // Route-session creation is a lifecycle boundary, not merely persistence.
  // Keep this canonical installation shape because its architectural contract
  // verifies that every adapter crosses the same route-session guard first.
  const routeSessionGuardedStore = installRouteSessionCreationGuard(backendStore);

  // Communication eligibility is another shared backend boundary. Persistence
  // may retain history, while only non-suspended, non-deleted users are exposed
  // to live Chat/Radio/push projections.
  return installOperationalCommunicationsGuard(routeSessionGuardedStore);
}

module.exports = {
  buildBackendStore
};
