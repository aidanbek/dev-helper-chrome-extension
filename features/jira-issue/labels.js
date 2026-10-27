// Фича «Задачи Jira»: метки задач под названием в строках таблиц на странице задачи — Child work items эпика —
// и фильтр по меткам над таблицей. В колонке Labels Jira показывает одну метку и «+N», а колонки может и не быть —
// все метки берём из REST API Jira того же сайта.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('jiraIssue');
  const log = DevHelper.log;

  const BLOCK_CLASS = 'dhj-labels';
  // Атрибут на ячейке с названием, а не класс: React перезаписывает className, чужие атрибуты не трогает.
  // Ячейке-flex по нему разрешаем перенос, чтобы метки встали под названием
  const CELL_ATTR = 'data-dhj-labels-cell';
  const BAR_CLASS = 'dhj-filter';
  // Строка не подходит под фильтр — атрибут, а не класс, по той же причине
  const HIDDEN_ATTR = 'data-dhj-hidden';
  const OWN_SELECTOR = '.' + BLOCK_CLASS + ', .' + BAR_CLASS;
  const { NO_LABELS, NO_REQUIRED, isRequired, parseRequired, setHidden } = DevHelper.labelFilter;

  const TABLE = 'table, [role="table"], [role="grid"], [role="treegrid"]';
  const ROW = 'tr, [role="row"]';
  const CELL = 'td, th, [role="cell"], [role="gridcell"], [role="rowheader"]';
  const BROWSE_RE = /\/browse\/([A-Z][A-Z0-9_]*-\d+)(?:[/?#]|$)/;
  // Только страница задачи (/browse/KEY): в списках поиска и модальных окнах строки не трогаем,
  // на странице релиза метки в строках показывает фича «Релизы Jira»
  const PAGE_RE = /^\/browse\/[A-Z][A-Z0-9_]*-\d+\/?$/;
  // Ключей в одном запросе (key in (…)) — не больше страницы поиска
  const BATCH = 100;
  // Обязательные метки — общие с фичей «Релизы Jira», задаются в её настройках
  const RELEASE_ID = 'jiraRelease';
  const RELEASE_DEFAULTS = { requiredLabels: '' };

  // Ключ → метки задачи; ключа нет — ещё не загружали, null — Jira задачу не вернула
  const labelsByKey = new Map();
  const queued = new Set();
  let loading = false;
  // Строка → её текст от Jira при последней загрузке: задачу правили в таблице — загружаем метки заново
  const sourceText = new WeakMap();

  // Фильтр — на страницу задачи: другая задача — выбор сбрасывается
  let page = null;
  const filter = DevHelper.labelFilter.create(() => sync());

  // Через запятую или пробел, без учёта регистра — как в «Релизах Jira»
  function requiredLabels() {
    return parseRequired(requiredValue);
  }

  // ---------- загрузка ----------

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  async function fetchLabels(keys) {
    const params = new URLSearchParams({
      jql: 'key in (' + keys.join(', ') + ')',
      fields: 'labels',
      maxResults: String(keys.length)
    });
    const data = await getJson('/rest/api/3/search/jql?' + params);
    const found = new Map();
    (data.issues || []).forEach((issue) => found.set(issue.key, (issue.fields && issue.fields.labels) || []));
    return found;
  }

  function request(key) {
    if (queued.has(key)) return;
    queued.add(key);
    if (!loading) load();
  }

  // Ключи копятся, пока идёт запрос, и уходят следующим. Ошибка — задачи считаем без данных,
  // строки остаются как у Jira
  async function load() {
    loading = true;
    while (queued.size) {
      const keys = Array.from(queued).slice(0, BATCH);
      keys.forEach((key) => queued.delete(key));
      try {
        const found = await fetchLabels(keys);
        keys.forEach((key) => labelsByKey.set(key, found.has(key) ? found.get(key) : null));
        log('метки задач в таблице загружены:', found.size);
      } catch (e) {
        keys.forEach((key) => labelsByKey.set(key, null));
        log('не удалось загрузить метки задач:', e && e.message);
      }
    }
    loading = false;
    sync();
  }

  // ---------- поиск строк ----------

  function keyOf(row) {
    const keys = new Set();
    row.querySelectorAll('a[href*="/browse/"]').forEach((a) => {
      if (a.closest(OWN_SELECTOR)) return;
      const m = (a.getAttribute('href') || '').match(BROWSE_RE);
      if (m) keys.add(m[1]);
    });
    return keys.size === 1 ? keys.values().next().value : null;
  }

  // Таблицы задач: таблица → (строка → ключ). Строка — со ссылкой ровно на одну задачу;
  // шапка и вложенные таблицы отсеиваются сами
  function findTables() {
    const tables = new Map();
    document.querySelectorAll(TABLE).forEach((table) => {
      const rows = new Map();
      table.querySelectorAll(ROW).forEach((row) => {
        if (row.closest(TABLE) !== table) return;
        const key = keyOf(row);
        if (key) rows.set(row, key);
      });
      if (rows.size) tables.set(table, rows);
    });
    return tables;
  }

  // ---------- фильтр ----------

  // Панель — перед таблицей; без загруженных меток (запрос не прошёл) её нет
  function mountBar(table, rows, required) {
    let bar = table.previousElementSibling;
    if (!bar || !bar.classList.contains(BAR_CLASS)) bar = null;
    const keys = Array.from(new Set(rows.values())).filter((key) => labelsByKey.get(key));
    if (!keys.length) {
      if (bar) bar.remove();
      return null;
    }
    if (!bar) {
      bar = filter.buildBar(BAR_CLASS);
      table.insertAdjacentElement('beforebegin', bar);
      log('фильтр меток таблицы вставлен');
    }
    const shown = keys.filter((key) => matches(key, required)).length;
    filter.renderBar(bar, filter.chipsFor(keys.map((key) => labelsByKey.get(key)), required));
    filter.setStatus(bar, filter.size ? 'Показано ' + shown + ' из ' + keys.length : '');
    return bar;
  }

  function matches(key, required) {
    return filter.matches(labelsByKey.get(key), required);
  }

  // Метки встают последним элементом ячейки со ссылкой на задачу — под ключом и названием.
  // Ячейку берём по ссылке, а не по тексту: при большом масштабе Jira меняет разметку строки,
  // и самый длинный текст может оказаться в другой колонке
  function placeOf(row) {
    const link = Array.from(row.querySelectorAll('a[href*="/browse/"]')).find((a) => !a.closest(OWN_SELECTOR));
    if (!link) return null;
    const cell = link.closest(CELL);
    return cell && row.contains(cell) ? cell : link.parentElement;
  }

  // Отступ слева — до первого видимого элемента ячейки (иконка типа задачи): у ячейки Jira отступ
  // во внутренней обёртке, а наш блок лежит в самой ячейке
  function alignLeft(block, place) {
    let left = Infinity;
    place.querySelectorAll('*').forEach((el) => {
      if (el.closest('.' + BLOCK_CLASS) || (el.children.length && !/^(svg|img)$/i.test(el.tagName))) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.left < left) left = rect.left;
    });
    if (left === Infinity) return;
    // Свой padding не сдвигает левую границу блока — отступ просто разница координат
    const value = Math.max(0, Math.round(left - block.getBoundingClientRect().left)) + 'px';
    if (block.style.paddingLeft !== value) block.style.paddingLeft = value;
  }

  // Текст строки от Jira — без нашего блока
  function textOf(row) {
    const block = row.querySelector('.' + BLOCK_CLASS);
    const text = row.textContent || '';
    return block ? text.replace(block.textContent, '') : text;
  }

  // ---------- отрисовка ----------

  // Строка таблицы может быть кликабельной — клик по метке до неё не доходит
  function buildBlock() {
    const block = document.createElement('span');
    block.className = BLOCK_CLASS;
    block.addEventListener('click', filter.onLabelClick);
    return block;
  }

  // Обязательные — первыми, внутри групп — по алфавиту. Без меток блок не показываем;
  // пересобираем только при изменении — иначе наш же MutationObserver зациклил бы sync
  function render(row, labels, required) {
    let block = row.querySelector('.' + BLOCK_CLASS);
    if (!labels.length) {
      if (block) block.remove();
      return;
    }

    const place = placeOf(row);
    if (!place) return;
    if (!block) block = buildBlock();
    if (block.parentElement !== place || place.lastElementChild !== block) place.append(block);
    if (!place.hasAttribute(CELL_ATTR)) place.setAttribute(CELL_ATTR, '');
    alignLeft(block, place);

    const first = (label) => isRequired(label, required);
    const sorted = labels.slice().sort((a, b) => first(b) - first(a) || a.localeCompare(b));
    const signature = JSON.stringify([sorted, required, sorted.map(filter.stateOf)]);
    if (block.dataset.signature === signature) return;
    block.dataset.signature = signature;
    block.replaceChildren(...sorted.map((label) => filter.buildLabel(label, required)));
  }

  function show(row, key, required) {
    const text = textOf(row);
    if (!labelsByKey.has(key)) {
      sourceText.set(row, text);
      request(key);
      return;
    }
    // Задачу правили в таблице (метки, статус) — Jira перерисовала строку; пока грузим, показываем прежние
    if (!sourceText.has(row)) sourceText.set(row, text);
    else if (sourceText.get(row) !== text && !queued.has(key)) {
      sourceText.set(row, text);
      request(key);
    }
    render(row, settings.rowLabels ? labelsByKey.get(key) || [] : [], required);
  }

  function mount() {
    const onPage = PAGE_RE.test(location.pathname);
    if (location.pathname !== page) {
      page = location.pathname;
      filter.reset();
    }
    const tables = onPage ? findTables() : new Map();
    const required = requiredLabels();
    const rows = new Map();
    const bars = new Set();

    tables.forEach((tableRows, table) => {
      tableRows.forEach((key, row) => {
        rows.set(row, key);
        show(row, key, required);
      });
      const bar = settings.labelsFilter ? mountBar(table, tableRows, required) : null;
      if (bar) bars.add(bar);
      tableRows.forEach((key, row) => setHidden(row, HIDDEN_ATTR, !!bar && !matches(key, required)));
    });

    // Выбранная метка могла пропасть из таблиц — не оставляем невидимый фильтр.
    // Таблиц нет (свернули Child work items, Jira перерисовывает) — выбор не трогаем
    const present = new Set([NO_LABELS, NO_REQUIRED]);
    rows.forEach((key) => (labelsByKey.get(key) || []).forEach((label) => present.add(label)));
    if (rows.size && filter.retain(present)) sync();

    // Наше вне таблиц (React пересоздал строку, ушли со страницы, выключили фильтр) — убираем
    document.querySelectorAll('.' + BLOCK_CLASS).forEach((block) => {
      const row = block.closest(ROW);
      if (!row || !rows.has(row)) block.remove();
    });
    document.querySelectorAll('[' + CELL_ATTR + ']').forEach((cell) => {
      if (!cell.querySelector(':scope > .' + BLOCK_CLASS)) cell.removeAttribute(CELL_ATTR);
    });
    document.querySelectorAll('.' + BAR_CLASS).forEach((bar) => {
      if (!bars.has(bar)) bar.remove();
    });
    // Строки, которые больше не строки таблиц, не должны остаться скрытыми
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach((row) => {
      if (!rows.has(row)) row.removeAttribute(HIDDEN_ATTR);
    });
  }

  function unmount() {
    document.querySelectorAll(OWN_SELECTOR).forEach((el) => el.remove());
    document.querySelectorAll('[' + CELL_ATTR + ']').forEach((cell) => cell.removeAttribute(CELL_ATTR));
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach((row) => row.removeAttribute(HIDDEN_ATTR));
  }

  // ---------- жизненный цикл ----------

  let settings = null;
  let requiredValue = '';
  let scheduled = false;

  function active() {
    return !!settings && settings.enabled && (settings.rowLabels || settings.labelsFilter);
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

  // Масштаб и ширина окна меняют отступ ячейки — выравниваем метки заново
  window.addEventListener('resize', sync);

  // Jira — SPA: таблица догружается, сворачивается и перерисовывается без перезагрузки страницы
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
