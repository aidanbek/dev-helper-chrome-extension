'use strict';

// Клик по иконке расширения открывает страницу настроек.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Горячая клавиша (по умолчанию Alt+Shift+C, меняется в chrome://extensions/shortcuts).
// Content script дополнительно слушает эту комбинацию сам и защищён от двойного срабатывания.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'copy-mr') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) {
      await chrome.tabs.sendMessage(tab.id, { type: 'copy-mr' });
    }
  } catch (e) {
    // Вкладка без content script — ничего не делаем
  }
});
