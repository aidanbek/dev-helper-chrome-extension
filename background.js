'use strict';

importScripts(
  'common/core.js',
  'common/storage.js',
  'features/merge-requests/feature.js'
);

// Настройки до разделения на фичи хранились без префикса — переносим при установке/обновлении.
chrome.runtime.onInstalled.addListener(() => {
  DevHelper.storage.migrateLegacy(DevHelper.features).catch((e) => {
    DevHelper.log('не удалось перенести настройки:', e && e.message);
  });
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
