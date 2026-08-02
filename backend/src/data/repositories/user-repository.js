const { StoreDomainRepository } = require("./store-domain-repository");
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

class UserRepository extends StoreDomainRepository {
  constructor(store, { UserModel } = {}) {
    super(store, USER_METHODS);
    this.UserModel = UserModel || null;
  }

  async getUserById(userId) {
    if (!this.UserModel) {
      return this.store.getUserById(userId);
    }

    const user = await this.UserModel.findById(userId).lean();
    return sanitizeUser(user);
  }

  async findUserByEmail(email) {
    if (!this.UserModel) {
      return this.store.findUserByEmail(email);
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return null;
    }

    const user = await this.UserModel.findOne({ email: normalizedEmail }).lean();
    return sanitizeUser(user);
  }
}

module.exports = {
  USER_METHODS,
  UserRepository
};
