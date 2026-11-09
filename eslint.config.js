// ESLint: код расширения — обычные скрипты без бандлера (общаются через глобальный DevHelper),
// тесты и конфиги — Node (CommonJS).
const js = require('@eslint/js');
const globals = require('globals');
const playwright = require('eslint-plugin-playwright');

const extensionGlobals = {
  ...globals.webextensions,
  DevHelper: 'readonly'
};

module.exports = [
  {
    ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/']
  },

  js.configs.recommended,

  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-shadow': 'error',
      // `catch (e) {}` — осознанно игнорируем ошибку
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },

  // Content scripts и страница настроек
  {
    files: ['common/**/*.js', 'features/**/*.js', 'options/**/*.js', 'popup/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...extensionGlobals }
    }
  },

  // Service worker: те же общие файлы подключаются через importScripts
  {
    files: ['background.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...extensionGlobals }
    }
  },

  // Тесты и конфиги
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      // chrome — в колбэках evaluate, они выполняются в service worker расширения
      globals: { ...globals.node, chrome: 'readonly' }
    },
    rules: {
      // Фикстура Playwright без зависимостей объявляется как async ({}, use) => …
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }]
    }
  },

  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**/*.spec.js'],
    languageOptions: {
      ...playwright.configs['flat/recommended'].languageOptions,
      // Колбэки evaluate выполняются в расширении или на странице
      globals: { ...globals.node, ...globals.browser, chrome: 'readonly' }
    },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Свои проверки-помощники тоже считаются ассертами
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['expectOpenedNextTo'] }]
    }
  }
];
