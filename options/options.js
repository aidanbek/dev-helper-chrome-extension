// Страница настроек: меню фич, раздел на фичу, загрузка и сохранение.
// Раздел фичи — фрагмент features/<slug>/options.html; поля с data-field
// привязываются к одноимённым настройкам автоматически, остальное делает feature.options.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const navEl = document.getElementById('nav');
  const panelsEl = document.getElementById('panels');
  const statusEl = document.getElementById('status');

  const sections = [];

  function fieldsOf(root) {
    return Array.from(root.querySelectorAll('[data-field]'));
  }

  function loadFields(root, values) {
    for (const el of fieldsOf(root)) {
      const value = values[el.dataset.field];
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value == null ? '' : value;
    }
  }

  function collectFields(root, defaults) {
    const values = {};
    for (const el of fieldsOf(root)) {
      const name = el.dataset.field;
      if (el.type === 'checkbox') {
        values[name] = el.checked;
        continue;
      }
      // Текст многострочных полей не трогаем, однострочные подрезаем
      const value = el.tagName === 'TEXTAREA' ? el.value : el.value.trim();
      values[name] = value === '' && typeof defaults[name] === 'string' ? defaults[name] : value;
    }
    return values;
  }

  async function buildSection(feature) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = feature.slug;
    panel.hidden = true;

    const header = document.createElement('header');
    header.className = 'panel-header';
    const text = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = feature.title;
    const description = document.createElement('p');
    description.textContent = feature.description || '';
    text.append(title, description);

    const toggle = document.createElement('label');
    toggle.className = 'switch';
    toggle.innerHTML = '<input type="checkbox"><span class="switch-track"></span><span>Включено</span>';
    header.append(text, toggle);

    const body = document.createElement('div');
    body.className = 'panel-body';
    const response = await fetch('../features/' + feature.slug + '/options.html');
    body.innerHTML = await response.text();

    panel.append(header, body);
    panelsEl.appendChild(panel);

    const nav = document.createElement('a');
    nav.className = 'nav-item';
    nav.href = '#' + feature.slug;
    nav.innerHTML = '<span class="nav-dot"></span>';
    nav.append(feature.title);
    navEl.appendChild(nav);

    const enabledInput = toggle.querySelector('input');
    const renderEnabled = () => {
      panel.classList.toggle('is-disabled', !enabledInput.checked);
      nav.classList.toggle('disabled', !enabledInput.checked);
    };
    enabledInput.addEventListener('change', renderEnabled);

    if (feature.options && feature.options.init) feature.options.init(body);

    return { feature, panel, body, nav, enabledInput, renderEnabled };
  }

  async function loadSection(section) {
    const { feature, body, enabledInput, renderEnabled } = section;
    const values = await DevHelper.storage.getFeature(feature.id, feature.defaults);
    enabledInput.checked = !!values.enabled;
    renderEnabled();
    loadFields(body, values);
    if (feature.options && feature.options.load) feature.options.load(body, values);
  }

  function showSection() {
    const slug = location.hash.slice(1);
    const active = sections.find((s) => s.feature.slug === slug) || sections[0];
    if (!active) return;
    for (const section of sections) {
      section.panel.hidden = section !== active;
      section.nav.classList.toggle('active', section === active);
    }
    document.title = active.feature.title + ' — CarCity Dev Helper';
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', !!isError);
    if (!isError) setTimeout(() => { statusEl.textContent = ''; }, 1500);
  }

  async function save() {
    try {
      for (const { feature, body, enabledInput } of sections) {
        const values = {
          ...collectFields(body, feature.defaults),
          ...(feature.options && feature.options.collect ? feature.options.collect(body) : {}),
          enabled: enabledInput.checked
        };
        await DevHelper.storage.setFeature(feature.id, values);
      }
      setStatus('Сохранено');
    } catch (e) {
      setStatus('Не удалось сохранить: ' + e.message, true);
    }
  }

  async function init() {
    document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

    // Обычно перенос уже сделал background в onInstalled; повтор дешёвый и страхует гонку
    try {
      await DevHelper.storage.migrateLegacy(DevHelper.features);
    } catch (e) {
      DevHelper.log('не удалось перенести настройки:', e && e.message);
    }

    for (const feature of DevHelper.features) {
      sections.push(await buildSection(feature));
    }
    await Promise.all(sections.map(loadSection));

    showSection();
    window.addEventListener('hashchange', showSection);
    document.getElementById('save').addEventListener('click', save);
  }

  init();
})();
