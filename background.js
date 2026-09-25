'use strict';

importScripts(
  'common/core.js',
  'common/storage.js',
  'common/sites.js',
  'features/merge-requests/feature.js'
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

  // Без добавленного сайта ни одна фича не работает — сразу ведём в настройки
  if ((reason === 'install' || reason === 'update') && !(await hasAnySites())) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(scheduleSync);

// Доступ можно выдать и отозвать и в chrome://extensions, не только на странице настроек
chrome.permissions.onAdded.addListener(scheduleSync);
chrome.permissions.onRemoved.addListener(scheduleSync);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some((key) => key.endsWith('.hosts'))) scheduleSync();
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
    if (tab && tab.id != null) {
      await chrome.tabs.sendMessage(tab.id, { type: 'command', command });
    }
  } catch (e) {
    // Вкладка без content script — ничего не делаем
  }
});
