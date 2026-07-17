function pickMethods(store, methodNames) {
  return methodNames.reduce((repository, methodName) => {
    if (typeof store[methodName] === "function") {
      repository[methodName] = store[methodName];
    }

    return repository;
  }, {});
}

class StoreDomainRepository {
  constructor(store, methodNames) {
    this.store = store;
    const fallbackMethods = pickMethods(store, methodNames);

    Object.entries(fallbackMethods).forEach(([methodName, method]) => {
      if (typeof this[methodName] !== "function") {
        this[methodName] = method;
      }
    });
  }
}

module.exports = {
  StoreDomainRepository,
  pickMethods
};
