const { DocumentRepository } = require("./repositories/document-repository");
const { FleetRepository } = require("./repositories/fleet-repository");
const { IncidentRepository } = require("./repositories/incident-repository");
const { NotificationRepository } = require("./repositories/notification-repository");
const { OrganizationRepository } = require("./repositories/organization-repository");
const { PaymentRepository } = require("./repositories/payment-repository");
const { SessionRepository } = require("./repositories/session-repository");
const { TrackingRepository } = require("./repositories/tracking-repository");
const { UserRepository } = require("./repositories/user-repository");
const { DocumentService } = require("../services/document-service");
const { FleetService } = require("../services/fleet-service");
const { IncidentService } = require("../services/incident-service");
const { NotificationService } = require("../services/notification-service");
const { OrganizationService } = require("../services/organization-service");
const { PaymentStoreService } = require("../services/payment-store-service");
const { SessionStoreService } = require("../services/session-store-service");
const { TrackingService } = require("../services/tracking-service");
const { UserService } = require("../services/user-service");

function buildBackendStore(baseStore, dependencies = {}) {
  const models = dependencies.models || {};
  const repositories = {
    documents: new DocumentRepository(baseStore, models),
    fleet: new FleetRepository(baseStore),
    incidents: new IncidentRepository(baseStore),
    notifications: new NotificationRepository(baseStore),
    organization: new OrganizationRepository(baseStore),
    payments: new PaymentRepository(baseStore, models),
    sessions: new SessionRepository(baseStore, models),
    tracking: new TrackingRepository(baseStore),
    users: new UserRepository(baseStore, models)
  };

  const services = {
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

  return {
    ...baseStore,
    ...serviceMethods,
    repositories,
    services
  };
}

module.exports = {
  buildBackendStore
};
