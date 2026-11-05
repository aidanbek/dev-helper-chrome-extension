// E2E-тесты расширения: настоящий Chromium с загруженным расширением, сайты подменяются фикстурами.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  // Каждый тест — свой профиль Chromium; параллельно по воркерам, внутри файла по порядку
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
