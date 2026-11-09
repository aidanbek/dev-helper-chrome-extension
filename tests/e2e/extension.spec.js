// Расширение целиком: установка, service worker, страница настроек.
const { test, expect } = require('./support/fixtures');

const FEATURES = ['Merge requests', 'Задачи Jira', 'Релизы Jira', 'Переходы', 'Cookie'];

test('после установки без сайтов настройки открываются на разделе импорта', async ({ context, extensionId }) => {
  const url = 'chrome-extension://' + extensionId + '/options/options.html#backup';
  await expect.poll(() => context.pages().map((page) => page.url())).toContain(url);
  const page = context.pages().find((p) => p.url() === url);
  await expect(page.locator('section.panel#backup')).toBeVisible();
  await expect(page.locator('section.panel#merge-requests')).toBeHidden();
  await expect(page).toHaveTitle('Импорт и экспорт — Dev Helper');
});

test('страница настроек: все фичи, служебный раздел и версия', async ({ optionsPage }) => {
  const nav = optionsPage.locator('#nav .nav-item');
  await expect(nav).toHaveText(FEATURES);
  await expect(optionsPage.locator('.sidebar a.nav-item', { hasText: 'Импорт и экспорт' })).toBeVisible();

  const { version } = require('../../manifest.json');
  await expect(optionsPage.locator('#version')).toHaveText('v' + version);
});

test('переключение разделов по меню', async ({ optionsPage }) => {
  await expect(optionsPage.locator('section.panel#merge-requests')).toBeVisible();
  await optionsPage.locator('#nav .nav-item', { hasText: 'Переходы' }).click();
  await expect(optionsPage.locator('section.panel#redirects')).toBeVisible();
  await expect(optionsPage.locator('section.panel#merge-requests')).toBeHidden();
  await expect(optionsPage).toHaveTitle('Переходы — Dev Helper');
});

test('без сайтов content scripts не регистрируются', async ({ ext }) => {
  // onInstalled уже отработал к моменту, когда тест получил worker
  await expect.poll(() => ext.registeredScripts()).toEqual([]);
});
