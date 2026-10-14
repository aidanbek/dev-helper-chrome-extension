'use strict';

importScripts(
  'common/core.js',
  'common/storage.js',
  'common/sites.js',
  'common/redirects.js',
  'features/merge-requests/feature.js',
  'features/jira-issue/feature.js',
  'features/redirects/feature.js'
);

const SCRIPT_PREFIX = 'feature-';

function contentFeatures() {
  return DevHelper.features.filter((feature) => feature.content);
}

// Content scripts фич — только на хостах из настроек, к которым пользователь выдал доступ.
// Включённость фичи здесь не учитываем: content script сам слушает enabled и реагирует без перезагрузки.
async function syncContentScripts() {
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const ours = registered.map((script) => script.id).filter((id) => id.startsWith(SCRIPT_PREFIX));
  if (ours.length) await chrome.scripting.unregisterContentScripts({ ids: ours });

  const scripts = [];
  for (const feature of contentFeatures()) {
    const { hosts } = await DevHelper.storage.getFeature(feature.id, { hosts: [] });
    const allowed = [];
    for (const host of hosts || []) {
      if (await DevHelper.sites.hasAccess(host)) allowed.push(host);
    }
    const matches = DevHelper.sites.matchesFor(feature, allowed);
    if (!matches.length) continue;

    scripts.push({
      id: SCRIPT_PREFIX + feature.id,
      matches,
      js: feature.content.js,
      css: feature.content.css || [],
      runAt: 'document_idle'
    });
  }
  if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
}

// Обработчики событий приходят параллельно — синхронизируем строго по очереди
let syncQueue = Promise.resolve();
function scheduleSync() {
  syncQueue = syncQueue.then(syncContentScripts).catch((e) => {
    DevHelper.log('не удалось зарегистрировать content scripts:', e && e.message);
  });
  return syncQueue;
}

async function hasAnySites() {
  for (const feature of contentFeatures()) {
    const { hosts } = await DevHelper.storage.getFeature(feature.id, { hosts: [] });
    if (hosts && hosts.length) return true;
  }
  return false;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Настройки до разделения на фичи хранились без префикса — переносим при установке/обновлении.
  try {
    await DevHelper.storage.migrateLegacy(DevHelper.features);
  } catch (e) {
    DevHelper.log('не удалось перенести настройки:', e && e.message);
  }
  await scheduleSync();
  await scheduleRedirectMenus();

  // Без добавленного сайта ни одна фича не работает — сразу ведём в настройки
  if ((reason === 'install' || reason === 'update') && !(await hasAnySites())) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(() => {
  scheduleSync();
  scheduleRedirectMenus();
});

// Доступ можно выдать и отозвать и в chrome://extensions, не только на странице настроек
chrome.permissions.onAdded.addListener(scheduleSync);
chrome.permissions.onRemoved.addListener(scheduleSync);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  const keys = Object.keys(changes);
  if (keys.some((key) => key.endsWith('.hosts'))) scheduleSync();
  if (keys.some((key) => key.startsWith(REDIRECTS_PREFIX))) scheduleRedirectMenus();
});

// Клик по иконке расширения открывает страницу настроек.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Горячие клавиши из manifest.commands пересылаются во вкладку — их обрабатывает фича.
// Content script дополнительно слушает свои комбинации сам и защищён от двойного срабатывания.
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (command === 'open-redirect') {
      await openRedirectFromHotkey(tab);
      return;
    }
    if (tab && tab.id != null) {
      await chrome.tabs.sendMessage(tab.id, { type: 'command', command });
    }
  } catch (e) {
    // Вкладка без content script — ничего не делаем
  }
});

// ---------- «Переходы» ----------
// Работают без доступа к сайтам: адрес страницы или ссылки приходит в событии контекстного меню,
// а горячая клавиша выдаёт activeTab — адрес активной вкладки становится доступен.

const REDIRECTS_FEATURE = DevHelper.getFeature('redirects');
const REDIRECTS_PREFIX = REDIRECTS_FEATURE.id + '.';
// Пункт меню: redirect-<page|link>-<номер правила>
const REDIRECT_MENU_RE = /^redirect-(page|link)-(\d+)$/;

function getRedirectSettings() {
  return DevHelper.storage.getFeature(REDIRECTS_FEATURE.id, REDIRECTS_FEATURE.defaults);
}

function createMenu(properties) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(properties, () => {
      if (chrome.runtime.lastError) {
        DevHelper.log('не удалось добавить пункт меню:', chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

// Пункт на каждое правило — виден только на страницах и ссылках, подходящих под его шаблон.
// Несколько пунктов Chrome сам собирает в подменю с названием расширения
async function syncRedirectMenus() {
  await chrome.contextMenus.removeAll();
  const settings = await getRedirectSettings();
  if (!settings.enabled || !settings.contextMenu) return;

  const rules = settings.rules || [];
  for (let i = 0; i < rules.length; i++) {
    const patterns = DevHelper.redirects.urlPatterns(rules[i]);
    if (!patterns.length) continue;
    const title = DevHelper.redirects.titleOf(rules[i]);

    // Отдельные пункты: documentUrlPatterns у пункта ссылки скрыл бы его на страницах каталога
    await createMenu({ id: 'redirect-page-' + i, title, contexts: ['page'], documentUrlPatterns: patterns });
    await createMenu({ id: 'redirect-link-' + i, title, contexts: ['link'], targetUrlPatterns: patterns });
  }
}

let redirectMenusQueue = Promise.resolve();
function scheduleRedirectMenus() {
  redirectMenusQueue = redirectMenusQueue.then(syncRedirectMenus).catch((e) => {
    DevHelper.log('не удалось обновить контекстное меню:', e && e.message);
  });
  return redirectMenusQueue;
}

async function openNextTo(url, tab) {
  const properties = { url };
  if (tab && tab.id != null && tab.id !== chrome.tabs.TAB_ID_NONE) {
    properties.index = tab.index + 1;
    properties.openerTabId = tab.id;
  }
  await chrome.tabs.create(properties);
}

// Match pattern пункта шире правила — если правило на деле не подошло, ничего не открываем
async function openByRule(index, pageUrl, tab) {
  const { rules } = await getRedirectSettings();
  const rule = (rules || [])[index];
  const url = rule && DevHelper.redirects.apply(rule, pageUrl);
  if (!url) {
    DevHelper.log('правило перехода не подошло к', pageUrl);
    return;
  }
  await openNextTo(url, tab);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const match = REDIRECT_MENU_RE.exec(String(info.menuItemId));
  if (!match) return;
  const pageUrl = match[1] === 'link' ? info.linkUrl : info.pageUrl;
  openByRule(Number(match[2]), pageUrl, tab).catch((e) => {
    DevHelper.log('не удалось открыть переход:', e && e.message);
  });
});

async function openRedirectFromHotkey(tab) {
  if (!tab || !tab.url) return;
  const { enabled, hotkey, rules } = await getRedirectSettings();
  if (!enabled || !hotkey) return;
  const [first] = DevHelper.redirects.resolveAll(rules, tab.url);
  if (first) await openNextTo(first.url, tab);
  else DevHelper.log('нет правила перехода для', tab.url);
}
