const { USER_METHODS } = require("../data/repositories/user-repository");
const {
  assertManagedUserIdentityStable
} = require("./managed-user-profile-policy");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class UserService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(
      this,
      USER_METHODS.filter((methodName) => methodName !== "updateUser")
    );
  }

  async updateUser(userId, payload = {}) {
    const targetUser = await this.repository.getUserById(userId);
    if (!targetUser) {
      return null;
    }

    assertManagedUserIdentityStable(targetUser, payload);
    return this.repository.updateUser(userId, payload);
  }
}

module.exports = {
  UserService
};
