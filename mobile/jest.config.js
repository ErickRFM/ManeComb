module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  // Mobile tests are discovered by convention. Keep this list about locations,
  // never individual test files, so adding a regression test automatically
  // makes it part of the default CI gate.
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/src/**/*.test.js',
    '<rootDir>/src/**/*.test.jsx',
    '<rootDir>/scripts/**/*.test.js',
  ],
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
