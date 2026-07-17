const { USER_METHODS } = require("../data/repositories/user-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class UserService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, USER_METHODS);
  }
}

module.exports = {
  UserService
};
