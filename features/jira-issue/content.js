// Фича «Задачи Jira»: под рядом кнопок со статусом задачи — предупреждение о метках и блок кнопок
// «Залить на stage» и «Pipeline ветки».
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('jiraIssue');
  const log = DevHelper.log;

  const BLOCK_CLASS = 'dhj-block';
  const BTN_CLASS = 'dhj-btn';
  const NOTE_CLASS = 'dhj-note';
  const WARNING_CLASS = 'dhj-labels-warning';
  const OWN_SELECTOR = '.' + BLOCK_CLASS + ', .' + WARNING_CLASS;
  // Вариант в списке меток — атрибут, а не класс: React перезаписывает className, чужие атрибуты не трогает
  const REQUIRED_OPTION_ATTR = 'data-dhj-required-option';
  const WARNING_TEXT = '⚠ Нет обязательной метки';
  // Обязательные метки — общие с фичей «Релизы Jira», задаются в её настройках
  const RELEASE_ID = 'jiraRelease';
  const RELEASE_DEFAULTS = { requiredLabels: '' };
  const { isRequired, parseRequired } = DevHelper.labelFilter;

  // Кнопки блока в порядке показа. Обе открывают MR из поля задачи с меткой, дальше — фича «Merge requests»
  const BUTTONS = [
    {
      kind: 'stage',
      label: 'Залить на stage',
      hash: DevHelper.STAGE_HASH,
      hint: 'Открыть MR в GitLab: если он апрувнут, без конфликтов и не Draft — откроется форма MR на stage'
    },
    {
      kind: 'pipeline',
      label: 'Pipeline ветки',
      hash: DevHelper.PIPELINE_HASH,
      hint: 'Открыть последний pipeline исходной ветки MR в GitLab — запустить preview-окружение'
    }
  ];

  // Разметка Jira Cloud: кнопка статуса и заголовки полей в правой колонке задачи
  const STATUS_ANCHOR = '[data-testid="ref-spotlight-target-status-spotlight"]';
  const STATUS_BUTTON = '[data-testid="issue-field-status.ui.status-view.status-button.status-button"]';
  const STATUS_TEXT = '[data-testid="issue-field-status.ui.status-view.status-button.status-button--text"]';
  const FIELD_HEADING = '[data-component-selector="jira-issue-field-heading-field-heading-title"]';
  // Ключ задачи: последняя крошка над названием; фолбэк — адрес /browse/KEY или ?selectedIssue=KEY
  const CURRENT_ISSUE = '[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]';
  const KEY_RE = /\/browse\/([A-Z][A-Z0-9_]*)-\d+(?:[/?#]|$)/i;
  const SELECTED_RE = /^([A-Z][A-Z0-9_]*)-\d+$/i;

  const normalize = DevHelper.normalize;

  // «готово к тесту»; фолбэк — aria-label «готово к тесту - Change status»
  function statusOf(anchor) {
    const text = anchor.querySelector(STATUS_TEXT);
    if (text) return normalize(text.textContent);
    const button = anchor.querySelector(STATUS_BUTTON);
    return normalize(button && (button.getAttribute('aria-label') || '').split(' - ')[0]);
  }

  // Строка поля со значением: поднимаемся от заголовка, пока в предке нет заголовков других полей
  function fieldContainer(heading) {
    let el = heading;
    while (el.parentElement && el.parentElement.querySelectorAll(FIELD_HEADING).length === 1) el = el.parentElement;
    return el;
  }

  // Поле ищем в той же задаче, что и статус: ближайший предок статуса, где есть заголовок с таким названием.
  // Выше предка с другим статусом не поднимаемся — там уже другая задача (например, страница под модальным окном)
  function findField(anchor, name) {
    for (let el = anchor.parentElement; el; el = el.parentElement) {
      if (el.querySelectorAll(STATUS_ANCHOR).length > 1) break;
      const heading = Array.from(el.querySelectorAll(FIELD_HEADING)).find((h) => normalize(h.textContent) === name);
      if (heading) return fieldContainer(heading);
    }
    return null;
  }

  // Проект задачи (ключ до дефиса, в верхнем регистре) или null, если ключ не нашли.
  // Крошку ищем, как и поле, в той же задаче: страница под модальным окном — другая задача
  function projectOf(anchor) {
    for (let el = anchor.parentElement; el; el = el.parentElement) {
      if (el.querySelectorAll(STATUS_ANCHOR).length > 1) break;
      const link = el.querySelector(CURRENT_ISSUE + ' a[href], a' + CURRENT_ISSUE + '[href]');
      const m = link && (link.getAttribute('href') || '').match(KEY_RE);
      if (m) return m[1].toUpperCase();
    }
    const selected = new URLSearchParams(location.search).get('selectedIssue') || '';
    const m = selected.match(SELECTED_RE) || location.pathname.match(KEY_RE);
    return m ? m[1].toUpperCase() : null;
  }

  // Ссылки на MR из поля: и из <a href>, и из текста (поле может быть текстовым).
  function mrUrlsIn(field) {
    const urls = new Set();
    field.querySelectorAll('a[href]').forEach((a) => DevHelper.mrLinks.find(a.href).forEach((url) => urls.add(url)));
    DevHelper.mrLinks.find(field.textContent).forEach((url) => urls.add(url));
    return Array.from(urls);
  }

  // Выпадающий список редактора меток («Recent labels» и подсказки) рендерится внутри поля — это не метки задачи
  const LABELS_MENU = '[role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [id*="listbox"]';
  const LABEL_OPTION = '[role="option"], [role="menuitem"]';

  // Метки задачи: тексты листовых элементов поля без заголовка (чипы меток — ссылки с текстом метки).
  // null — поля нет на странице, метки неизвестны
  function labelsOf(anchor, fieldName) {
    const field = findField(anchor, normalize(fieldName));
    if (!field) return null;
    return Array.from(field.querySelectorAll('*'))
      .filter((el) => !el.children.length && !el.closest(FIELD_HEADING) && !el.closest(LABELS_MENU))
      .map((el) => normalize(el.textContent))
      .filter(Boolean);
  }

  // Метки Jira без пробелов — разделяем и запятыми, и пробелами
  function parseLabels(value) {
    return (value || '').split(/[\s,]+/).map(normalize).filter(Boolean);
  }

  // Какие кнопки нужны в задаче: stage — по статусу, pipeline — по меткам
  function kindsFor(anchor) {
    const current = settings || feature.defaults;
    const kinds = [];
    if (current.stageButton && statusOf(anchor) === normalize(current.stageStatus || feature.defaults.stageStatus)) {
      kinds.push('stage');
    }
    const wanted = current.pipelineButton ? parseLabels(current.pipelineLabels) : [];
    if (wanted.length) {
      const labels = labelsOf(anchor, current.labelsField || feature.defaults.labelsField);
      if (labels && labels.some((label) => wanted.includes(label))) kinds.push('pipeline');
    }
    return kinds;
  }

  // Обязательные метки из настроек; предупреждение выключено или задача не из заданных проектов — как будто их нет.
  // Проект задачи не узнали, а проекты заданы — тоже не показываем: лучше промолчать, чем предупредить не там
  function activeRequired(anchor) {
    const current = settings || feature.defaults;
    if (!current.labelsWarning) return [];
    const projects = parseLabels(current.labelsProjects).map((key) => key.toUpperCase());
    if (projects.length && !projects.includes(projectOf(anchor))) return [];
    return parseRequired(requiredValue);
  }

  // Поля нет на странице (свёрнуто в «More fields») — метки неизвестны, зря не предупреждаем
  function missesRequired(anchor) {
    const required = activeRequired(anchor);
    if (!required.length) return false;
    const labels = labelsOf(anchor, (settings || feature.defaults).labelsField || feature.defaults.labelsField);
    return !!labels && !labels.some((label) => isRequired(label, required));
  }

  // Выделяем обязательные метки в выпадающем списке редактора поля. Пишем только при изменении
  function markRequiredOptions(anchor) {
    const name = (settings || feature.defaults).labelsField || feature.defaults.labelsField;
    const field = findField(anchor, normalize(name));
    if (!field) return;
    const required = activeRequired(anchor);
    field.querySelectorAll(LABEL_OPTION).forEach((option) => {
      const wanted = isRequired(option.textContent, required);
      if (option.hasAttribute(REQUIRED_OPTION_ATTR) !== wanted) option.toggleAttribute(REQUIRED_OPTION_ATTR, wanted);
    });
  }

  // url — MR, который можно открывать; note — строка рядом с кнопками: какой MR или что мешает
  function describe(anchor) {
    const current = settings || feature.defaults;
    const fieldName = current.mrField || feature.defaults.mrField;
    const field = findField(anchor, normalize(fieldName));
    if (!field) return { note: 'В задаче нет поля «' + fieldName + '»' };

    const urls = mrUrlsIn(field);
    if (!urls.length) return { note: 'В поле «' + fieldName + '» нет ссылки на MR' };
    if (urls.length > 1) {
      return { note: 'В поле «' + fieldName + '» несколько MR (' + urls.length + ') — оставьте одну ссылку', error: true };
    }
    return { url: urls[0], note: 'MR ' + DevHelper.mrLinks.ref(urls[0]) };
  }

  // Ряд кнопок со статусом (статус, Agents, …): ближайший предок — горизонтальный flex с несколькими детьми.
  // Блок встаёт сразу под ним; не нашли ряд — под самим статусом
  const ROW_SEARCH_DEPTH = 6;

  function statusRow(anchor) {
    let el = anchor.parentElement;
    for (let i = 0; el && i < ROW_SEARCH_DEPTH; i++, el = el.parentElement) {
      const style = getComputedStyle(el);
      const flex = style.display === 'flex' || style.display === 'inline-flex';
      if (flex && style.flexDirection.startsWith('row') && el.children.length > 1) return el;
    }
    return anchor;
  }

  // Ссылка, а не кнопка: работают средний клик и «открыть в новой вкладке»
  function buildButton(spec) {
    const btn = document.createElement('a');
    btn.className = BTN_CLASS;
    btn.dataset.kind = spec.kind;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.setAttribute('role', 'button');
    btn.textContent = spec.label;
    btn.addEventListener('click', (event) => {
      if (!btn.hasAttribute('href')) event.preventDefault();
    });
    return btn;
  }

  function renderButton(btn, spec, info) {
    const url = info.url ? info.url + spec.hash : '';
    if (url) {
      if (btn.getAttribute('href') !== url) btn.setAttribute('href', url);
    } else if (btn.hasAttribute('href')) {
      btn.removeAttribute('href');
    }
    btn.classList.toggle('dhj-disabled', !url);
    btn.setAttribute('aria-disabled', String(!url));
    const hint = url ? spec.hint : info.note;
    if (btn.title !== hint) btn.title = hint;
  }

  // Пишем только при изменении: иначе наш же MutationObserver зациклил бы sync.
  // Кнопки добавляем и убираем по месту: метки и статус меняются без перерисовки задачи
  function render(block, kinds, info) {
    const note = block.querySelector('.' + NOTE_CLASS);
    BUTTONS.forEach((spec) => {
      let btn = block.querySelector('.' + BTN_CLASS + '[data-kind="' + spec.kind + '"]');
      if (!kinds.includes(spec.kind)) {
        if (btn) btn.remove();
        return;
      }
      if (!btn) {
        btn = buildButton(spec);
        note.before(btn);
      }
      renderButton(btn, spec, info);
    });

    if (note.textContent !== info.note) note.textContent = info.note;
    note.classList.toggle('dhj-error', !!info.error);
  }

  function build() {
    const block = document.createElement('div');
    block.className = BLOCK_CLASS;
    const note = document.createElement('span');
    note.className = NOTE_CLASS;
    block.append(note);
    return block;
  }

  // Наш элемент с классом сразу под рядом со статусом: предупреждение, затем блок кнопок
  function ownAfter(place, className) {
    for (let el = place.nextElementSibling; el && el.matches(OWN_SELECTOR); el = el.nextElementSibling) {
      if (el.classList.contains(className)) return el;
    }
    return null;
  }

  function renderWarning(place) {
    let warning = ownAfter(place, WARNING_CLASS);
    if (!warning) {
      warning = document.createElement('div');
      warning.className = WARNING_CLASS;
      place.insertAdjacentElement('afterend', warning);
    }
    if (warning.textContent !== WARNING_TEXT) warning.textContent = WARNING_TEXT;
    return warning;
  }

  function mount() {
    // Блоки, которые стали не нужны (сменили статус, поставили метку, закрыли задачу), в конце удаляем
    const stale = new Set(document.querySelectorAll(OWN_SELECTOR));

    document.querySelectorAll(STATUS_ANCHOR).forEach((anchor) => {
      markRequiredOptions(anchor);
      const kinds = kindsFor(anchor);
      const missing = missesRequired(anchor);
      if (!kinds.length && !missing) return;
      const place = statusRow(anchor);
      const warning = missing ? renderWarning(place) : null;
      if (warning) stale.delete(warning);
      if (!kinds.length) return;
      let block = ownAfter(place, BLOCK_CLASS);
      if (!block) {
        block = build();
        (warning || place).insertAdjacentElement('afterend', block);
        log('блок кнопок задачи вставлен');
      }
      stale.delete(block);
      render(block, kinds, describe(anchor));
    });

    stale.forEach((el) => el.remove());
  }

  function unmount() {
    document.querySelectorAll(OWN_SELECTOR).forEach((el) => el.remove());
    document.querySelectorAll('[' + REQUIRED_OPTION_ATTR + ']').forEach((el) => el.removeAttribute(REQUIRED_OPTION_ATTR));
  }

  // ---------- жизненный цикл ----------

  // До загрузки настроек ничего не вставляем — иначе у выключенной фичи мелькнёт кнопка
  let settings = null;
  let requiredValue = '';
  let scheduled = false;

  function active() {
    return !!settings && settings.enabled && (settings.stageButton || settings.pipelineButton || settings.labelsWarning);
  }

  function sync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (active()) mount();
      else unmount();
    });
  }

  DevHelper.storage.getFeature(feature.id, feature.defaults).then((values) => {
    settings = values;
    sync();
  });

  DevHelper.storage.getFeature(RELEASE_ID, RELEASE_DEFAULTS).then((values) => {
    requiredValue = values.requiredLabels;
    sync();
  });

  try {
    DevHelper.storage.onFeatureChanged(RELEASE_ID, (changes) => {
      if (!('requiredLabels' in changes)) return;
      requiredValue = changes.requiredLabels;
      sync();
    });
    DevHelper.storage.onFeatureChanged(feature.id, (changes) => {
      settings = { ...(settings || feature.defaults), ...changes };
      sync();
    });
  } catch (e) { /* storage недоступен — работаем на загруженных настройках */ }

  // Jira — SPA: задачи открываются модальным окном и перерисовываются без перезагрузки страницы.
  // characterData — смена статуса правит текст кнопки статуса
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  log('Задачи Jira: загружен на', location.pathname);
})();
