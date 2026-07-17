class StoreDomainService {
  constructor(repository) {
    this.repository = repository;
  }

  bind(methodName) {
    const method = this.repository?.[methodName];

    if (typeof method !== "function") {
      return undefined;
    }

    return method.bind(this.repository);
  }
}

function exposeRepositoryMethods(service, methodNames) {
  methodNames.forEach((methodName) => {
    const boundMethod = service.bind(methodName);

    if (boundMethod) {
      service[methodName] = boundMethod;
    }
  });

  return service;
}

module.exports = {
  StoreDomainService,
  exposeRepositoryMethods
};
