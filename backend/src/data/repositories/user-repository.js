const { StoreDomainRepository } = require("./store-domain-repository");
const { getEnterpriseOrganizationId, mapMaybePromise } = require("./tenant-repository-utils");
const { sanitizeUser } = require("../serializers");

const USER_METHODS = [
  "authenticate",
  "createUser",
  "changeDriverVehicle",
  "deleteDriverSafely",
  "deleteUser",
  "findUserByEmail",
  "getUserById",
  "getUserE2eeBackup",
  "getUserProfile",
  "getDriverLifecycleDependencies",
  "listPushSubscriptionsForRoles",
  "listPushSubscriptionsForUsers",
  "listUsers",
  "registerPushSubscription",
  "registerUser",
  "offboardDriverState",
  "reactivateDriverWithinCapacity",
  "upsertUserE2eeBackup",
  "unregisterPushSubscription",
  "updateUser"
];

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return profile;
  }

  return {
    ...profile,
    user: sanitizeUser(profile.user)
  };
}

function scopeUsersToEnterpriseActor(users, actor) {
  const sanitizedUsers = Array.isArray(users) ? users.map(sanitizeUser).filter(Boolean) : [];

  // Platform is the only product allowed to request a global user inventory and
  // does so explicitly with listUsers(null). Any enterprise actor must remain
  // inside its own organization regardless of role/accountType legacy values.
  if (!actor) {
    return sanitizedUsers;
  }

  const organizationId = getEnterpriseOrganizationId(actor);
  if (!organizationId) {
    return [];
  }

  return sanitizedUsers.filter(
    (entry) => String(entry.organizationId || "").trim() === organizationId
  );
}

class UserRepository extends StoreDomainRepository {
  constructor(store, { UserModel } = {}) {
    super(store, USER_METHODS);
    this.UserModel = UserModel || null;
  }

  async authenticate(email, password) {
    const user = await Promise.resolve(this.store.authenticate(email, password));
    return sanitizeUser(user);
  }

  async registerUser(payload) {
    const user = await Promise.resolve(this.store.registerUser(payload));
    return sanitizeUser(user);
  }

  async createUser(payload) {
    const user = await Promise.resolve(this.store.createUser(payload));
    return sanitizeUser(user);
  }

  async updateUser(userId, payload) {
    const user = await Promise.resolve(this.store.updateUser(userId, payload));
    return sanitizeUser(user);
  }

  listUsers(user) {
    return mapMaybePromise(
      this.store.listUsers(user),
      (users) => scopeUsersToEnterpriseActor(users, user)
    );
  }

  async getUserProfile(userId) {
    const profile = await Promise.resolve(this.store.getUserProfile(userId));
    return sanitizeProfile(profile);
  }

  async getUserById(userId) {
    if (!this.UserModel) {
      return sanitizeUser(await Promise.resolve(this.store.getUserById(userId)));
    }

    const user = await this.UserModel.findById(userId).lean();
    return sanitizeUser(user);
  }

  async findUserByEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return null;
    }

    if (!this.UserModel) {
      return sanitizeUser(await Promise.resolve(this.store.findUserByEmail(normalizedEmail)));
    }

    const user = await this.UserModel.findOne({ email: normalizedEmail }).lean();
    return sanitizeUser(user);
  }
}

module.exports = {
  USER_METHODS,
  UserRepository,
  sanitizeProfile,
  scopeUsersToEnterpriseActor
};
