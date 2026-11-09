// Расширение целиком: установка, service worker, страница настроек.
const { test, expect } = require('./support/fixtures');

const FEATURES = ['Merge requests', 'Задачи Jira', 'Релизы Jira', 'Переходы', 'Cookie'];

test('после установки без сайтов открывается страница настроек', async ({ context, extensionId }) => {
  const url = 'chrome-extension://' + extensionId + '/options/options.html';
  // Chrome открывает настройки в уже открытой пустой вкладке — события page может не быть
  await expect.poll(() => context.pages().map((page) => page.url())).toContain(url);
  const page = context.pages().find((p) => p.url() === url);
  await expect(page.locator('#nav')).toContainText('Merge requests');
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
