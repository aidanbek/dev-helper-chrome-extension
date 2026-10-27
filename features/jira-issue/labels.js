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
  const CHIP_CLASS = 'dhj-chip';
  // Строка не подходит под фильтр — атрибут, а не класс, по той же причине
  const HIDDEN_ATTR = 'data-dhj-hidden';
  const OWN_SELECTOR = '.' + BLOCK_CLASS + ', .' + BAR_CLASS;
  // Псевдометки чипов «без меток» и «без обязательных меток»: в метках Jira пробелов не бывает
  const NO_LABELS = ' none';
  const NO_REQUIRED = ' no-required';

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

  // Фильтр — на страницу задачи: другая задача — выбор сбрасывается.
  // selected: метка → 'include' (показать задачи с ней) или 'exclude' (скрыть задачи с ней);
  // mode — как сочетать несколько include: 'or' — хотя бы одна, 'and' — все
  let page = null;
  let selected = new Map();
  let mode = 'or';

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Через запятую или пробел, без учёта регистра — как в «Релизах Jira»
  function requiredLabels() {
    return (requiredValue || '').split(/[\s,]+/).map(normalize).filter(Boolean);
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

  function hasRequired(labels, required) {
    return labels.some((label) => required.includes(normalize(label)));
  }

  // Подходит ли задача под чип: обычная метка или служебные «без меток» / «без обязательных меток»
  function hasChip(labels, chip, required) {
    if (chip === NO_LABELS) return !labels.length;
    if (chip === NO_REQUIRED) return !hasRequired(labels, required);
    return labels.includes(chip);
  }

  function chipsBy(state) {
    return Array.from(selected).filter(([, value]) => value === state).map(([chip]) => chip);
  }

  // Исключённые чипы скрывают задачу всегда; из включённых нужна хотя бы одна («ИЛИ») или все («И»).
  // Метки ещё не загружены или Jira задачу не вернула — строку не скрываем
  function matches(key, required) {
    const labels = labelsByKey.get(key);
    if (!selected.size || !labels) return true;
    const test = (chip) => hasChip(labels, chip, required);
    if (chipsBy('exclude').some(test)) return false;
    const included = chipsBy('include');
    if (!included.length) return true;
    return mode === 'and' ? included.every(test) : included.some(test);
  }

  // Клик — показать задачи с меткой, Shift+клик — скрыть; повторный такой же клик снимает выбор
  function toggle(label, exclude) {
    const want = exclude ? 'exclude' : 'include';
    if (selected.get(label) === want) selected.delete(label);
    else selected.set(label, want);
    sync();
  }

  // Чипы: метки задач таблицы с числом задач (обязательные — первыми, внутри групп частые — первыми),
  // затем «без меток» и «без обязательных меток». Служебные чипы показываем и с нулём — ноль тоже ответ
  function chipsFor(keys, required) {
    const counts = new Map();
    let noLabels = 0;
    let noRequired = 0;
    keys.forEach((key) => {
      const labels = labelsByKey.get(key);
      labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
      if (!labels.length) noLabels++;
      if (!hasRequired(labels, required)) noRequired++;
    });
    const chips = Array.from(counts)
      .map(([label, count]) => ({ label, text: label, count, required: required.includes(normalize(label)) }))
      .sort((a, b) => b.required - a.required || b.count - a.count || a.label.localeCompare(b.label));
    chips.push({ label: NO_LABELS, text: 'без меток', count: noLabels, special: true });
    if (required.length) {
      chips.push({ label: NO_REQUIRED, text: 'без обязательных меток', count: noRequired, special: true });
    }
    return chips;
  }

  const CHIP_HINT = 'Клик — показать задачи с меткой, Shift+клик — скрыть';

  function buildChip(text, attrs) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CHIP_CLASS;
    Object.assign(chip.dataset, attrs);
    chip.textContent = text;
    return chip;
  }

  function buildBar() {
    const bar = document.createElement('div');
    bar.className = BAR_CLASS;
    const title = document.createElement('span');
    title.className = 'dhj-filter-title';
    title.textContent = 'Метки:';
    title.title = CHIP_HINT;
    const chips = document.createElement('div');
    chips.className = 'dhj-chips';
    const status = document.createElement('span');
    status.className = 'dhj-filter-status';
    bar.append(title, chips, status);

    bar.addEventListener('click', (event) => {
      const chip = event.target.closest('.' + CHIP_CLASS);
      if (!chip) return;
      if (chip.dataset.reset) {
        selected.clear();
        sync();
      } else if (chip.dataset.mode) {
        mode = mode === 'or' ? 'and' : 'or';
        sync();
      } else {
        toggle(chip.dataset.label, event.shiftKey);
      }
    });
    return bar;
  }

  // Чипы пересобираем только при изменении меток или выбора — иначе наш же MutationObserver зациклил бы sync
  function renderBar(bar, chips, shown, total) {
    const list = bar.querySelector('.dhj-chips');
    const signature = JSON.stringify([chips, Array.from(selected), mode]);
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.replaceChildren(
        ...chips.map((spec) => {
          const state = selected.get(spec.label);
          const chip = buildChip(spec.text + ' · ' + spec.count, { label: spec.label });
          chip.classList.toggle('dhj-selected', state === 'include');
          chip.classList.toggle('dhj-excluded', state === 'exclude');
          chip.classList.toggle('dhj-special', !!spec.special);
          chip.classList.toggle('dhj-required', !!spec.required);
          chip.title = (spec.required ? 'Обязательная метка. ' : '') + CHIP_HINT;
          chip.setAttribute('aria-pressed', String(!!state));
          return chip;
        })
      );
      if (chipsBy('include').length > 1) {
        const toggleMode = buildChip(mode === 'and' ? 'все выбранные (И)' : 'любая из выбранных (ИЛИ)', { mode: '1' });
        toggleMode.classList.add('dhj-mode');
        toggleMode.title = 'Как сочетать выбранные метки — переключить';
        list.append(toggleMode);
      }
      if (selected.size) list.append(buildChip('Сбросить', { reset: '1' }));
    }
    const status = bar.querySelector('.dhj-filter-status');
    const text = selected.size ? 'Показано ' + shown + ' из ' + total : '';
    if (status.textContent !== text) status.textContent = text;
  }

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
      bar = buildBar();
      table.insertAdjacentElement('beforebegin', bar);
      log('фильтр меток таблицы вставлен');
    }
    const shown = keys.filter((key) => matches(key, required)).length;
    renderBar(bar, chipsFor(keys, required), shown, keys.length);
    return bar;
  }

  function setHidden(row, hidden) {
    if (hidden === row.hasAttribute(HIDDEN_ATTR)) return;
    if (hidden) row.setAttribute(HIDDEN_ATTR, '');
    else row.removeAttribute(HIDDEN_ATTR);
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

  // Метка в строке работает как её чип в фильтре; выбранная и исключённая — как чипы
  function buildLabel(label, required) {
    const chip = document.createElement('span');
    chip.className = 'dhj-label';
    chip.dataset.label = label;
    chip.setAttribute('role', 'button');
    const isRequired = required.includes(normalize(label));
    const state = selected.get(label);
    chip.classList.toggle('dhj-required', isRequired);
    chip.classList.toggle('dhj-selected', state === 'include');
    chip.classList.toggle('dhj-excluded', state === 'exclude');
    chip.title = (isRequired ? 'Обязательная метка. ' : '') + CHIP_HINT;
    chip.textContent = label;
    return chip;
  }

  // Строка таблицы может быть кликабельной — клик по метке до неё не доходит
  function buildBlock() {
    const block = document.createElement('span');
    block.className = BLOCK_CLASS;
    block.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const chip = event.target.closest('.dhj-label');
      if (chip) toggle(chip.dataset.label, event.shiftKey);
    });
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

    const isRequired = (label) => required.includes(normalize(label));
    const sorted = labels.slice().sort((a, b) => isRequired(b) - isRequired(a) || a.localeCompare(b));
    const signature = JSON.stringify([sorted, required, sorted.map((label) => selected.get(label) || '')]);
    if (block.dataset.signature === signature) return;
    block.dataset.signature = signature;
    block.replaceChildren(...sorted.map((label) => buildLabel(label, required)));
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
      selected = new Map();
      mode = 'or';
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
      tableRows.forEach((key, row) => setHidden(row, !!bar && !matches(key, required)));
    });

    // Выбранная метка могла пропасть из таблиц — не оставляем невидимый фильтр.
    // Таблиц нет (свернули Child work items, Jira перерисовывает) — выбор не трогаем
    const present = new Set([NO_LABELS, NO_REQUIRED]);
    rows.forEach((key) => (labelsByKey.get(key) || []).forEach((label) => present.add(label)));
    selected.forEach((state, label) => {
      if (rows.size && !present.has(label)) {
        selected.delete(label);
        sync();
      }
    });

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
