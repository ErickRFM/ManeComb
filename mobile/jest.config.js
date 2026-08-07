const { unitTestExtensions, unitTestRoots } = require('./test/unit-test-policy.cjs');

module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  testMatch: unitTestRoots.flatMap((root) =>
    unitTestExtensions.map((extension) => `<rootDir>/${root}/**/*.test.${extension}`)
  ),
  moduleNameMapper: {
    // Debe preceder a '^@/': el contrato compartido vive fuera de rootDir.
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^react-native-keyboard-controller$': '<rootDir>/test/mocks/react-native-keyboard-controller.js',
  },
  // El contrato compartido vive fuera de rootDir y no tiene node_modules
  // propio: sus dependencias de runtime se resuelven contra las de mobile.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation)/)',
  ],
};
