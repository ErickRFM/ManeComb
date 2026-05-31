const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '../..'),
  testEnvironment: 'detox/runners/jest/testEnvironment',
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testTimeout: 120000,
  maxWorkers: 1,
  verbose: true,
  testMatch: ['<rootDir>/e2e/mobile/**/*.e2e.js'],
};
