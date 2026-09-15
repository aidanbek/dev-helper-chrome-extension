'use strict';

const DEFAULT_TEMPLATE = '{title}\n\n{url}';

const DEFAULTS = {
  template: DEFAULT_TEMPLATE,
  boldTitle: true,
  hotkey: true,
  listButtons: true,
  openTelegram: true,
  telegramApp: true,
  defaultTopicUrl: '',
  rules: []
};

const rulesEl = document.getElementById('rules');
const statusEl = document.getElementById('status');

function addRuleRow(rule = { project: '', url: '' }) {
  const row = document.createElement('div');
  row.className = 'row';

  const project = document.createElement('input');
  project.type = 'text';
  project.className = 'project';
  project.placeholder = 'group/subgroup/project';
  project.value = rule.project || '';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'url';
  url.placeholder = 'https://t.me/c/2001234567/45';
  url.value = rule.url || '';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.title = 'Удалить правило';
  remove.addEventListener('click', () => row.remove());

  row.append(project, url, remove);
  rulesEl.appendChild(row);
}

function collectRules() {
  return Array.from(rulesEl.querySelectorAll('.row'))
    .map((row) => ({
      project: row.querySelector('.project').value.trim(),
      url: row.querySelector('.url').value.trim()
    }))
    .filter((rule) => rule.project && rule.url);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    document.getElementById('template').value = items.template || DEFAULT_TEMPLATE;
    document.getElementById('boldTitle').checked = !!items.boldTitle;
    document.getElementById('hotkey').checked = !!items.hotkey;
    document.getElementById('listButtons').checked = !!items.listButtons;
    document.getElementById('openTelegram').checked = !!items.openTelegram;
    document.getElementById('telegramApp').checked = !!items.telegramApp;
    document.getElementById('defaultTopicUrl').value = items.defaultTopicUrl || '';
    rulesEl.innerHTML = '';
    (items.rules || []).forEach(addRuleRow);
    if (!rulesEl.children.length) addRuleRow();
  });
}

function save() {
  const data = {
    template: document.getElementById('template').value || DEFAULT_TEMPLATE,
    boldTitle: document.getElementById('boldTitle').checked,
    hotkey: document.getElementById('hotkey').checked,
    listButtons: document.getElementById('listButtons').checked,
    openTelegram: document.getElementById('openTelegram').checked,
    telegramApp: document.getElementById('telegramApp').checked,
    defaultTopicUrl: document.getElementById('defaultTopicUrl').value.trim(),
    rules: collectRules()
  };
  chrome.storage.sync.set(data, () => {
    statusEl.textContent = 'Сохранено';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

document.getElementById('resetTemplate').addEventListener('click', () => {
  document.getElementById('template').value = DEFAULT_TEMPLATE;
});
document.getElementById('add').addEventListener('click', () => addRuleRow());
document.getElementById('save').addEventListener('click', save);
load();
