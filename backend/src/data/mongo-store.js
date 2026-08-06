const mongoStoreCore = require("./mongo-store-core");
const { createPlatformUserMongoStore } = require("./platform-user-mongo-store");

async function createMongoStore(...args) {
  const store = await mongoStoreCore.createMongoStore(...args);

  return Object.assign(store, createPlatformUserMongoStore());
}

module.exports = {
  ...mongoStoreCore,
  createMongoStore
};
