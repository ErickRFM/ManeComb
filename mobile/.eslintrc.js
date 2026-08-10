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
  rules: {
    // ManeComb uses explicit void expressions to mark intentionally fire-and-forget async work.
    // The React Native base no-void rule conflicts with that convention and produced 48 noise warnings.
    'no-void': 'off',
  },
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
