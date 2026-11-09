// Фикстуры Playwright: Chromium с распакованным расширением и доступ к его service worker.
//
// Расширение копируется во временную папку с одной правкой манифеста: host_permissions на *.example.com.
// В жизни доступ к сайту пользователь выдаёт кнопкой в настройках (optional_host_permissions) —
// диалог Chrome из теста не нажать, поэтому доступ выдан заранее, а chrome.permissions.request сразу отвечает true.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test: base, expect, chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '../../..');
// Как в scripts/build.sh: только то, что попадает в пакет
const PACKAGE = ['manifest.json', 'background.js', 'common', 'features', 'options', 'popup', 'icons'];
const TEST_ORIGINS = ['*://*.example.com/*'];

function buildExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-helper-ext-'));
  for (const entry of PACKAGE) {
    fs.cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = TEST_ORIGINS;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

const test = base.extend({
  // Копия расширения — одна на воркер
  extensionPath: [async ({}, use) => {
    const dir = buildExtension();
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }, { scope: 'worker' }],

  // Свежий профиль на каждый тест: пустой chrome.storage, расширение только что установлено
  context: async ({ extensionPath, headless }, use) => {
    const context = await chromium.launchPersistentContext('', {
      // Расширения работают в полноценном Chromium (новый headless), а не в chromium-headless-shell
      channel: 'chromium',
      // --headed из командной строки
      headless,
      args: [
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath
      ]
    });
    await use(context);
    await context.close();
  },

  // Установка без сайтов открывает настройки (onInstalled) — дожидаемся этого до начала теста,
  // иначе открытие вкладки прервёт навигацию теста
  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const options = 'chrome-extension://' + new URL(worker.url()).host + '/options/options.html';
    await expect.poll(() => context.pages().some((page) => page.url().startsWith(options)),
      { message: 'после установки не открылись настройки' }).toBe(true);
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  // Страница настроек: на установке без сайтов background открывает её сам — переиспользуем её
  optionsPage: async ({ context, extensionId }, use) => {
    const url = 'chrome-extension://' + extensionId + '/options/options.html';
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error));
    await page.goto(url);
    await expect(page.locator('#nav .nav-item').first()).toBeVisible();
    await use(page);
    expect(errors, 'ошибки JS на странице настроек').toEqual([]);
  },

  ext: async ({ serviceWorker }, use) => {
    await use(extensionHelpers(serviceWorker));
  }
});

// Работа с расширением изнутри: storage, зарегистрированные content scripts, функции background
function extensionHelpers(worker) {
  return {
    worker,

    // items — ключи как в chrome.storage.sync: { 'mergeRequests.hosts': ['gitlab.example.com'] }
    setStorage(items) {
      return worker.evaluate((values) => chrome.storage.sync.set(values), items);
    },

    getStorage(keys) {
      return worker.evaluate((names) => chrome.storage.sync.get(names), keys);
    },

    async registeredScripts() {
      return worker.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).map((script) => ({ id: script.id, matches: script.matches })));
    },

    // Включить content script фичи на сайте и дождаться, пока background его зарегистрирует
    async enableOn(featureId, host, settings = {}) {
      const items = { [featureId + '.hosts']: [host] };
      for (const [name, value] of Object.entries(settings)) items[featureId + '.' + name] = value;
      await this.setStorage(items);
      await expect.poll(async () => {
        const script = (await this.registeredScripts()).find((s) => s.id === 'feature-' + featureId);
        return script ? script.matches.some((m) => m.includes(host)) : false;
      }, { message: 'content script фичи ' + featureId + ' не зарегистрирован на ' + host }).toBe(true);
    }
  };
}

module.exports = { test, expect };
