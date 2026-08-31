import { defineConfig } from '@playwright/test';

const configuredBaseUrl = String(process.env.CERT_BASE_URL || '').trim();
const baseURL = configuredBaseUrl || 'http://127.0.0.1:8081';
const runsAgainstLocalServer = !configuredBaseUrl;

const viewports = [
  { name: 'phone-320', width: 320, height: 720 },
  { name: 'phone-360', width: 360, height: 800 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

export default defineConfig({
  testDir: './e2e/certification',
  outputDir: './test-results/portal-certification',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-certification-report', open: 'never' }],
    ['json', { outputFile: 'playwright-certification-results.json' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  ...(runsAgainstLocalServer
    ? {
        webServer: {
          command: 'npm --prefix ../ventas run dev -- --host 127.0.0.1 --port 8081',
          url: 'http://127.0.0.1:8081/ventas',
          reuseExistingServer: true,
          timeout: 180_000,
        },
      }
    : {}),
  projects: viewports.map(({ name, width, height }) => ({
    name,
    use: {
      viewport: { width, height },
    },
  })),
});
