// Фича «Задачи Jira»: блок «Залить на stage» под рядом кнопок со статусом задачи.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('jiraIssue');
  const log = DevHelper.log;

  const BLOCK_CLASS = 'dhj-stage-block';
  const BTN_CLASS = 'dhj-stage-btn';
  const LABEL = 'Залить на stage';

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

  // «group/sub/project!12» — какой MR будет залит
  function mrRef(url) {
    const m = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
    return m ? m[1] + '!' + m[2] : url;
  }

  // url — можно открывать; note — строка под кнопкой: какой MR или что мешает
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
    return {
      url: urls[0] + DevHelper.STAGE_HASH,
      note: 'MR ' + mrRef(urls[0]),
      hint: 'Открыть MR в GitLab: если он апрувнут, без конфликтов и не Draft — откроется форма MR на stage'
    };
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

  // Пишем только при изменении: иначе наш же MutationObserver зациклил бы sync
  function render(block, info) {
    const btn = block.querySelector('.' + BTN_CLASS);
    if (info.url) {
      if (btn.getAttribute('href') !== info.url) btn.setAttribute('href', info.url);
    } else if (btn.hasAttribute('href')) {
      btn.removeAttribute('href');
    }
    btn.classList.toggle('dhj-disabled', !info.url);
    btn.setAttribute('aria-disabled', String(!info.url));
    const hint = info.hint || info.note;
    if (btn.title !== hint) btn.title = hint;

    const note = block.querySelector('.dhj-stage-note');
    if (note.textContent !== info.note) note.textContent = info.note;
    note.classList.toggle('dhj-error', !!info.error);
  }

  // Ссылка, а не кнопка: работают средний клик и «открыть в новой вкладке»
  function build() {
    const block = document.createElement('div');
    block.className = BLOCK_CLASS;

    const btn = document.createElement('a');
    btn.className = BTN_CLASS;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.setAttribute('role', 'button');
    btn.textContent = LABEL;
    btn.addEventListener('click', (event) => {
      if (!btn.hasAttribute('href')) event.preventDefault();
    });

    const note = document.createElement('span');
    note.className = 'dhj-stage-note';

    block.append(btn, note);
    return block;
  }

  function mount() {
    const current = settings || feature.defaults;
    const status = normalize(current.stageStatus || feature.defaults.stageStatus);
    // Блоки, которым не нашлось статуса (сменили статус, закрыли задачу), в конце удаляем
    const stale = new Set(document.querySelectorAll('.' + BLOCK_CLASS));

    document.querySelectorAll(STATUS_ANCHOR).forEach((anchor) => {
      if (statusOf(anchor) !== status) return;
      const place = statusRow(anchor);
      const next = place.nextElementSibling;
      let block = next && next.classList.contains(BLOCK_CLASS) ? next : null;
      if (!block) {
        block = build();
        place.insertAdjacentElement('afterend', block);
        log('блок «Залить на stage» вставлен');
      }
      stale.delete(block);
      render(block, describe(anchor));
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
    return !!settings && settings.enabled && settings.stageButton;
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
