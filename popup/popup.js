// Окно по клику на иконку расширения: таблица cookie сайта активной вкладки (common/cookie-table.js)
// и ссылка на настройки. Cookie читает и меняет background — окно присылает cookies.*.
// ?tab=<id> — показать cookie другой вкладки (для тестов и отладки: у открытого как страница окна
// активная вкладка — оно само).
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const contentEl = document.getElementById('content');
  const hostEl = document.getElementById('host');

  let tabId = null;

  // Почему таблицы нет — и что сделать
  const MESSAGES = {
    disabled: () => 'Фича «Cookie» выключена в настройках.',
    unsupported: () => 'На этой странице cookie не показываются — только на сайтах http и https.',
    'no-site': (host) => 'Сайт ' + host + ' не добавлен в «Cookie» → «Сайты».',
    'no-access': (host) => 'Нет доступа к ' + host + ' — выдайте его в настройках «Cookie».'
  };
  const ACTIONS = {
    disabled: 'Включить',
    'no-site': 'Добавить сайт',
    'no-access': 'Выдать доступ'
  };

  function openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#cookies') });
    window.close();
  }

  function send(message) {
    return chrome.runtime.sendMessage({ ...message, tabId }).catch((e) => ({ error: e.message }));
  }

  function renderMessage(state) {
    const old = contentEl.querySelector('.message-box');
    if (old) old.remove();
    if (!state || state.status === 'ok') return;
    const box = document.createElement('div');
    box.className = 'message-box';
    const text = document.createElement('p');
    text.className = 'message';
    text.dataset.status = state.status || 'error';
    const message = MESSAGES[state.status];
    text.textContent = state.error ? 'Ошибка: ' + state.error : message ? message(state.host) : state.status;
    box.append(text);

    const label = ACTIONS[state.status];
    if (label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary';
      button.textContent = label;
      button.addEventListener('click', openSettings);
      box.append(button);
    }
    contentEl.prepend(box);
  }

  async function init() {
    const style = document.createElement('style');
    style.textContent = DevHelper.cookieTable.CSS;
    document.head.append(style);
    document.getElementById('settings').addEventListener('click', openSettings);

    const param = new URLSearchParams(location.search).get('tab');
    if (param) {
      tabId = Number(param);
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab ? tab.id : null;
    }
    if (tabId == null) {
      renderMessage({ status: 'unsupported' });
      return;
    }

    const table = DevHelper.cookieTable.create({
      container: contentEl,
      send,
      // Окно расширения Chrome — не выше 600px
      maxHeight: '440px',
      onLoad: (state) => {
        hostEl.textContent = (state && state.host) || '';
        renderMessage(state);
      }
    });
    await table.load();
  }

  init();
})();
