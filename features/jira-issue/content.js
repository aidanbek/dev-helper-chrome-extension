// Фича «Задачи Jira»: блок под рядом кнопок со статусом задачи — «Залить на stage» и «Pipeline ветки».
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('jiraIssue');
  const log = DevHelper.log;

  const BLOCK_CLASS = 'dhj-block';
  const BTN_CLASS = 'dhj-btn';
  const NOTE_CLASS = 'dhj-note';

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

  const MR_HREF_RE = /^https?:\/\/[^\s?#]+?\/-\/merge_requests\/\d+/;
  const MR_TEXT_RE = /https?:\/\/[^\s"'<>]+?\/-\/merge_requests\/\d+/g;

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

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

  // Ссылки на MR из поля: и из <a href>, и из текста (поле может быть текстовым).
  // https://gitlab.example.com/group/project/-/merge_requests/12/diffs -> …/merge_requests/12
  function mrUrlsIn(field) {
    const urls = new Set();
    field.querySelectorAll('a[href]').forEach((a) => {
      const m = a.href.match(MR_HREF_RE);
      if (m) urls.add(m[0]);
    });
    (field.textContent.match(MR_TEXT_RE) || []).forEach((url) => urls.add(url));
    return Array.from(urls);
  }

  // Метки задачи: тексты листовых элементов поля без заголовка (чипы меток — ссылки с текстом метки)
  function labelsOf(anchor, fieldName) {
    const field = findField(anchor, normalize(fieldName));
    if (!field) return [];
    return Array.from(field.querySelectorAll('*'))
      .filter((el) => !el.children.length && !el.closest(FIELD_HEADING))
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
      if (labels.some((label) => wanted.includes(label))) kinds.push('pipeline');
    }
    return kinds;
  }

  // «group/sub/project!12» — какой MR будет открыт
  function mrRef(url) {
    const m = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
    return m ? m[1] + '!' + m[2] : url;
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
    return { url: urls[0], note: 'MR ' + mrRef(urls[0]) };
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

  function mount() {
    // Блоки, которым не нашлось кнопок (сменили статус, сняли метку, закрыли задачу), в конце удаляем
    const stale = new Set(document.querySelectorAll('.' + BLOCK_CLASS));

    document.querySelectorAll(STATUS_ANCHOR).forEach((anchor) => {
      const kinds = kindsFor(anchor);
      if (!kinds.length) return;
      const place = statusRow(anchor);
      const next = place.nextElementSibling;
      let block = next && next.classList.contains(BLOCK_CLASS) ? next : null;
      if (!block) {
        block = build();
        place.insertAdjacentElement('afterend', block);
        log('блок кнопок задачи вставлен');
      }
      stale.delete(block);
      render(block, kinds, describe(anchor));
    });

    stale.forEach((block) => block.remove());
  }

  function unmount() {
    document.querySelectorAll('.' + BLOCK_CLASS).forEach((block) => block.remove());
  }

  // ---------- жизненный цикл ----------

  // До загрузки настроек ничего не вставляем — иначе у выключенной фичи мелькнёт кнопка
  let settings = null;
  let scheduled = false;

  function active() {
    return !!settings && settings.enabled && (settings.stageButton || settings.pipelineButton);
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

  try {
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
