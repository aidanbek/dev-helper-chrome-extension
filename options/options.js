// Страница настроек: меню фич, раздел на фичу, загрузка и сохранение.
// Раздел фичи — фрагмент features/<slug>/options.html; поля с data-field
// привязываются к одноимённым настройкам автоматически, остальное делает feature.options.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const navEl = document.getElementById('nav');
  const panelsEl = document.getElementById('panels');
  const statusEl = document.getElementById('status');
  const saveBar = document.querySelector('.savebar');

  const sections = [];

  function fieldsOf(root) {
    return Array.from(root.querySelectorAll('[data-field]'));
  }

  function loadFields(root, values) {
    for (const el of fieldsOf(root)) {
      const value = values[el.dataset.field];
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value == null ? '' : value;
      const tags = tagInputs.get(el);
      if (tags) tags.render();
    }
  }

  // ---------- поле-список меток ----------
  // input с data-tags прячется, вместо него — чипы и поле ввода. Значение в storage прежнее:
  // строка через запятую, так что content-скрипты и импорт настроек ничего не замечают.

  const tagInputs = new WeakMap();
  const TAG_SEPARATOR = /[\s,]+/;

  function parseTags(text) {
    const tags = [];
    for (const tag of text.split(TAG_SEPARATOR)) {
      if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
    }
    return tags;
  }

  function initTags(root) {
    for (const field of root.querySelectorAll('input[data-tags]')) {
      const box = document.createElement('div');
      box.className = 'tags';
      const list = document.createElement('span');
      list.className = 'tags-list';
      const editor = document.createElement('input');
      editor.type = 'text';
      editor.className = 'tags-editor';
      editor.spellcheck = false;
      // Подпись поля должна фокусировать поле ввода, а не спрятанный input
      editor.id = field.id;
      field.removeAttribute('id');
      const placeholder = field.placeholder;
      box.append(list, editor);
      field.hidden = true;
      field.after(box);

      const getTags = () => parseTags(field.value);
      const setTags = (tags) => {
        field.value = tags.join(', ');
        render();
      };

      function render() {
        list.textContent = '';
        const tags = getTags();
        for (const tag of tags) {
          const chip = document.createElement('span');
          chip.className = 'tag';
          chip.dataset.tag = tag.toLowerCase();
          chip.textContent = tag;
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '✕';
          remove.title = 'Убрать метку';
          // Без этого blur поля ввода перерисует чипы раньше, чем дойдёт клик
          remove.addEventListener('mousedown', (event) => event.preventDefault());
          remove.addEventListener('click', () => {
            setTags(getTags().filter((t) => t !== tag));
            editor.focus();
          });
          chip.append(remove);
          list.append(chip);
        }
        editor.placeholder = tags.length ? '' : placeholder;
      }

      // Добавить введённое; уже добавленную метку подсвечиваем, а не дублируем
      function commit() {
        const added = parseTags(editor.value);
        editor.value = '';
        if (!added.length) return;
        const tags = getTags();
        const known = tags.map((t) => t.toLowerCase());
        const dups = added.filter((t) => known.includes(t.toLowerCase()));
        setTags([...tags, ...added.filter((t) => !known.includes(t.toLowerCase()))]);
        for (const dup of dups) {
          const chip = list.querySelector('[data-tag="' + CSS.escape(dup.toLowerCase()) + '"]');
          if (!chip) continue;
          chip.classList.add('tag-dup');
          setTimeout(() => chip.classList.remove('tag-dup'), 800);
        }
      }

      editor.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Backspace' && !editor.value) {
          setTags(getTags().slice(0, -1));
        }
      });
      // Вставка списка целиком: всё, что до последнего разделителя, — сразу в чипы
      editor.addEventListener('input', () => {
        if (!TAG_SEPARATOR.test(editor.value)) return;
        const rest = editor.value.split(TAG_SEPARATOR).pop();
        editor.value = editor.value.slice(0, editor.value.length - rest.length);
        commit();
        editor.value = rest;
      });
      editor.addEventListener('blur', commit);
      box.addEventListener('click', (event) => {
        if (event.target === box || event.target === list) editor.focus();
      });

      tagInputs.set(field, { render });
      render();
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

    const section = { feature, panel, body, nav, enabledInput, renderEnabled, hosts: [] };
    if (feature.content) buildSites(section);
    initTags(body);
    if (feature.options && feature.options.init) feature.options.init(body);

    return section;
  }

  // Служебный раздел (не фича): свой пункт меню под фичами, без переключателя и кнопки «Сохранить»
  function buildToolSection(page) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = page.slug;
    panel.hidden = true;

    const header = document.createElement('header');
    header.className = 'panel-header';
    const text = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = page.title;
    const description = document.createElement('p');
    description.textContent = page.description || '';
    text.append(title, description);
    header.append(text);

    const body = document.createElement('div');
    body.className = 'panel-body';
    panel.append(header, body);
    panelsEl.appendChild(panel);

    const caption = document.createElement('div');
    caption.className = 'nav-caption';
    caption.textContent = 'Сервис';
    const nav = document.createElement('a');
    nav.className = 'nav-item';
    nav.href = '#' + page.slug;
    nav.textContent = page.title;
    navEl.after(caption, nav);

    page.build(body, {
      setStatus,
      reload: () => Promise.all(featureSections().map(loadSection))
    });
    return { feature: { slug: page.slug, title: page.title }, panel, nav, tool: true, hosts: [] };
  }

  function featureSections() {
    return sections.filter((section) => !section.tool);
  }

  // ---------- сайты фичи ----------
  // Список сайтов сохраняется сразу, без кнопки «Сохранить»: он должен совпадать с выданными доступами.

  const SITES_TEMPLATE =
    '<legend>Сайты</legend>' +
    '<p class="hint hint-top">Фича работает только на добавленных сайтах — Chrome спросит разрешение на доступ ' +
    'к каждому. После добавления обновите уже открытые вкладки этого сайта.</p>' +
    '<div class="sites-list"></div>' +
    '<p class="hint sites-empty">Сайты не добавлены — фича нигде не работает.</p>' +
    '<label></label>' +
    '<div class="row"><input type="text" spellcheck="false">' +
    '<button type="button">Добавить</button></div>';

  function buildSites(section) {
    const { feature, body } = section;
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'sites';
    fieldset.innerHTML = SITES_TEMPLATE;
    body.prepend(fieldset);

    const input = fieldset.querySelector('input');
    const id = feature.slug + '-site';
    input.id = id;
    input.placeholder = feature.content.sitesPlaceholder || 'example.com';
    const label = fieldset.querySelector('label');
    label.htmlFor = id;
    label.textContent = feature.content.sitesLabel || 'Адрес сайта';

    section.sites = {
      list: fieldset.querySelector('.sites-list'),
      empty: fieldset.querySelector('.sites-empty')
    };

    const add = () => addHost(section, input);
    fieldset.querySelector('.row button').addEventListener('click', add);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') add();
    });
  }

  async function renderSites(section) {
    if (!section.sites) return;
    const access = await Promise.all(section.hosts.map((host) => DevHelper.sites.hasAccess(host)));
    const { list, empty } = section.sites;
    list.textContent = '';

    section.hosts.forEach((host, i) => {
      const row = document.createElement('div');
      row.className = 'site';

      const name = document.createElement('span');
      name.className = 'site-host';
      name.textContent = host;
      row.append(name);

      if (!access[i]) {
        const warning = document.createElement('span');
        warning.className = 'site-warning';
        warning.textContent = 'нет доступа';
        const grant = document.createElement('button');
        grant.type = 'button';
        grant.className = 'secondary small';
        grant.textContent = 'Разрешить';
        grant.addEventListener('click', () => grantHost(host));
        row.append(warning, grant);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = '✕';
      remove.title = 'Убрать сайт и отозвать доступ';
      remove.addEventListener('click', () => removeHost(section, host));
      row.append(remove);

      list.append(row);
    });
    empty.hidden = section.hosts.length > 0;
  }

  // permissions.request работает только из обработчика действия пользователя — вызываем его до любых await
  function requestAccess(host) {
    return chrome.permissions.request({ origins: [DevHelper.sites.originPattern(host)] });
  }

  async function grantHost(host) {
    try {
      if (!(await requestAccess(host))) setStatus('Доступ к ' + host + ' не выдан', true);
      // Перерисовку сделает permissions.onAdded
    } catch (e) {
      setStatus('Не удалось запросить доступ: ' + e.message, true);
    }
  }

  async function addHost(section, input) {
    const host = DevHelper.sites.normalizeHost(input.value);
    if (!host) {
      setStatus('Не похоже на адрес сайта: ' + input.value.trim(), true);
      return;
    }
    if (section.hosts.includes(host)) {
      input.value = '';
      return;
    }

    try {
      const granted = await requestAccess(host);
      if (!granted) {
        setStatus('Доступ к ' + host + ' не выдан — сайт не добавлен', true);
        return;
      }
      section.hosts = [...section.hosts, host];
      await DevHelper.storage.setFeature(section.feature.id, { hosts: section.hosts });
      input.value = '';
      await renderSites(section);
      setStatus('Сайт добавлен');
    } catch (e) {
      setStatus('Не удалось добавить сайт: ' + e.message, true);
    }
  }

  async function removeHost(section, host) {
    try {
      section.hosts = section.hosts.filter((h) => h !== host);
      await DevHelper.storage.setFeature(section.feature.id, { hosts: section.hosts });
      await renderSites(section);
      setStatus('Сайт убран');
    } catch (e) {
      setStatus('Не удалось убрать сайт: ' + e.message, true);
      return;
    }

    // Доступ отзываем, только если сайт не нужен другим фичам. Скрипты уже сняты по списку сайтов,
    // так что неудача (например, доступ выдан как обязательный) ни на что не влияет
    if (sections.some((s) => s.hosts.includes(host))) return;
    try {
      await chrome.permissions.remove({ origins: [DevHelper.sites.originPattern(host)] });
    } catch (e) {
      DevHelper.log('не удалось отозвать доступ к', host + ':', e && e.message);
    }
  }

  async function loadSection(section) {
    const { feature, body, enabledInput, renderEnabled } = section;
    const values = await DevHelper.storage.getFeature(feature.id, feature.defaults);
    enabledInput.checked = !!values.enabled;
    renderEnabled();
    loadFields(body, values);
    section.hosts = values.hosts || [];
    await renderSites(section);
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
    document.title = active.feature.title + ' — Dev Helper';
    saveBar.hidden = !!active.tool;
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', !!isError);
    if (!isError) setTimeout(() => { statusEl.textContent = ''; }, 1500);
  }

  async function save() {
    try {
      for (const { feature, body, enabledInput } of featureSections()) {
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
    if (DevHelper.backupPage) sections.push(buildToolSection(DevHelper.backupPage));
    await Promise.all(featureSections().map(loadSection));

    showSection();
    window.addEventListener('hashchange', showSection);
    document.getElementById('save').addEventListener('click', save);

    // Доступ могли выдать или отозвать в chrome://extensions
    const rerender = () => sections.forEach(renderSites);
    chrome.permissions.onAdded.addListener(rerender);
    chrome.permissions.onRemoved.addListener(rerender);
  }

  init();
})();
