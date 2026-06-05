module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: [
    'android/',
    'ios/',
    'dist/',
    'web-build/',
    'node_modules/',
    'playwright-report/',
    'test-results/',
  ],
  overrides: [
    {
      files: ['e2e/**/*.js'],
      globals: {
        by: 'readonly',
        device: 'readonly',
        element: 'readonly',
        waitFor: 'readonly',
      },
      env: {
        jest: true,
      },
    },
  ],
};
