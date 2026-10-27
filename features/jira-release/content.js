// Фича «Релизы Jira»: фильтр по меткам над списком задач релиза (Releases → версия → Work items),
// метки и ссылки на MR в строках списка, копирование отфильтрованных задач и ссылка на тот же отбор в поиске Jira.
// В строках списка меток и MR нет — берём их из REST API Jira того же сайта.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('jiraRelease');
  const log = DevHelper.log;

  const BAR_CLASS = 'dhr-labels';
  const ROW_LABELS_CLASS = 'dhr-row-labels';
  const ROW_MRS_CLASS = 'dhr-row-mrs';
  // Наши блоки в строках: в них не ищем ключи задач и название
  const OWN_SELECTOR = '.' + BAR_CLASS + ', .' + ROW_LABELS_CLASS + ', .' + ROW_MRS_CLASS;
  // Атрибут, а не класс: React перезаписывает className строк при перерисовке, чужие атрибуты не трогает
  const HIDDEN_ATTR = 'data-dhr-hidden';
  const { NO_LABELS, NO_REQUIRED, normalize, isRequired, parseRequired, setHidden } = DevHelper.labelFilter;

  const VERSION_RE = /\/versions\/(\d+)/;
  const KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
  const BROWSE_RE = /\/browse\/([A-Z][A-Z0-9_]*-\d+)(?:[/?#]|$)/;
  // Ссылка на MR в значении поля (текст, URL или документ Atlassian): хвост /diffs, #note_… отрезаем
  const MR_RE = /https?:\/\/[^\s"'<>\\]+?\/-\/merge_requests\/\d+/g;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  // Новые задачи в списке (добавили в релиз без перезагрузки) — перезапрашиваем метки не чаще раза в 10 секунд
  const REFETCH_DELAY = 10000;

  // Сколько держится «Скопировано» на кнопке копирования
  const COPIED_DELAY = 1500;

  // Состояние текущей версии: метки задач, выбранные чипы, загрузка
  let version = null;
  let labelsByKey = null;
  // Ключ → ссылки на MR из поля задачи; mrNote — почему ссылок нет (нет поля с таким названием)
  let mrsByKey = new Map();
  // Ключ → название статуса: по нему находим статус в строке, справа от него — кнопки MR
  let statusByKey = new Map();
  // Ключ → название задачи: копируем и задачи, которых ещё нет на странице (Jira догружает список частями)
  let summaryByKey = new Map();
  let mrNote = '';
  // Номер загрузки: ответ устаревшей загрузки (сменили релиз или настройки) не применяем
  let loadSeq = 0;
  let loading = false;
  let error = '';
  let fetchedAt = 0;
  const filter = DevHelper.labelFilter.create(() => sync());
  let copiedUntil = 0;
  // Ключи со ссылками на странице, которых не было в ответе: по каждому перезапрашиваем не больше одного раза
  let checked = new Set();

  function versionId() {
    const m = location.pathname.match(VERSION_RE);
    return m ? m[1] : null;
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  // id поля по названию, как в задаче («Merge Request» → customfield_10050); null — такого поля нет
  async function fieldId(name) {
    const fields = await getJson('/rest/api/3/field');
    const field = (fields || []).find((f) => normalize(f.name) === normalize(name));
    return field ? field.id : null;
  }

  function mrUrlsIn(value) {
    if (value == null) return [];
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return Array.from(new Set(text.match(MR_RE) || []));
  }

  // Все задачи версии с метками, названием и, если нужно, полем MR; новый поиск Jira Cloud (/search/jql)
  // листается по nextPageToken
  async function fetchIssues(id, mrFieldId) {
    const labels = new Map();
    const mrs = new Map();
    const statuses = new Map();
    const summaries = new Map();
    let token = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const fields = mrFieldId ? 'labels,summary,status,' + mrFieldId : 'labels,summary';
      const params = new URLSearchParams({ jql: 'fixVersion = ' + id, fields, maxResults: String(PAGE_SIZE) });
      if (token) params.set('nextPageToken', token);
      const data = await getJson('/rest/api/3/search/jql?' + params);
      (data.issues || []).forEach((issue) => {
        const values = issue.fields || {};
        labels.set(issue.key, values.labels || []);
        summaries.set(issue.key, values.summary || '');
        if (mrFieldId) {
          mrs.set(issue.key, mrUrlsIn(values[mrFieldId]));
          statuses.set(issue.key, (values.status && values.status.name) || '');
        }
      });
      token = data.nextPageToken;
      if (!token || data.isLast) break;
    }
    return { labels, mrs, statuses, summaries };
  }

  async function fetchAll(id) {
    const fieldName = settings.mrField || feature.defaults.mrField;
    let mrFieldId = null;
    let note = '';
    if (settings.rowMrLinks) {
      mrFieldId = await fieldId(fieldName);
      if (!mrFieldId) note = 'Нет поля «' + fieldName + '» — ссылки на MR не показаны';
    }
    return { ...(await fetchIssues(id, mrFieldId)), note };
  }

  function load(id) {
    const seq = ++loadSeq;
    const current = () => seq === loadSeq && version === id;
    loading = true;
    fetchedAt = Date.now();
    fetchAll(id)
      .then((result) => {
        if (!current()) return;
        labelsByKey = result.labels;
        mrsByKey = result.mrs;
        statusByKey = result.statuses;
        summaryByKey = result.summaries;
        mrNote = result.note;
        error = '';
        log('метки задач релиза загружены:', result.labels.size);
      })
      .catch((e) => {
        if (!current()) return;
        error = (e && e.message) || 'ошибка';
        log('не удалось загрузить метки задач релиза:', error);
      })
      .finally(() => {
        if (!current()) return;
        loading = false;
        sync();
      });
  }

  // Элементы с ключом задачи версии: ссылки /browse/KEY и листовые элементы с текстом ключа
  function keyElements() {
    const found = [];
    const main = document.querySelector('main, [role="main"]') || document.body;
    main.querySelectorAll('*').forEach((el) => {
      if (el.closest(OWN_SELECTOR)) return;
      let key = null;
      if (el.tagName === 'A') {
        const m = (el.getAttribute('href') || '').match(BROWSE_RE);
        if (m) key = m[1];
      } else if (!el.children.length) {
        const text = (el.textContent || '').trim();
        if (KEY_RE.test(text)) key = text;
      }
      if (key && labelsByKey.has(key)) found.push({ el, key });
    });
    return found;
  }

  // Строка задачи — самый высокий предок ключа, в котором нет ключей других задач.
  // Считаем, сколько разных ключей под каждым предком; строке нужен родитель с несколькими задачами
  function findRows() {
    const keysUnder = new Map();
    const items = keyElements();
    items.forEach(({ el, key }) => {
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        let keys = keysUnder.get(a);
        if (!keys) keysUnder.set(a, (keys = new Set()));
        keys.add(key);
      }
    });

    const rows = new Map();
    items.forEach(({ el, key }) => {
      let row = null;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        if (keysUnder.get(a).size > 1) break;
        row = a;
      }
      if (row && row.parentElement && keysUnder.has(row.parentElement)) rows.set(row, key);
    });
    return rows;
  }

  // Панель встаёт перед списком; таблицу не разрываем — поднимаемся до неё самой
  function listAnchor(rows) {
    let el = rows.keys().next().value.parentElement;
    while (el.parentElement && /^(TABLE|TBODY|THEAD|TFOOT|TR)$/.test(el.tagName)) el = el.parentElement;
    return el;
  }

  // Обязательные метки из настроек: через запятую или пробел, без учёта регистра
  function requiredLabels() {
    return parseRequired(settings && settings.requiredLabels);
  }

  function matches(key, required) {
    return filter.matches(labelsByKey.get(key), required);
  }

  // ---------- поиск Jira ----------

  function jqlString(value) {
    return '"' + value.replace(/["\\]/g, '\\$&') + '"';
  }

  // Метки в JQL сравниваются как есть — к обязательным из настроек добавляем их написания из задач релиза
  function requiredJql(required) {
    const variants = new Set(required);
    labelsByKey.forEach((labels) => labels.forEach((label) => {
      if (isRequired(label, required)) variants.add(label);
    }));
    return '(' + Array.from(variants).map(jqlString).join(', ') + ')';
  }

  // labels != x и labels not in (…) в JQL не находят задачи без меток — добавляем их явно
  function chipJql(chip, required, negate) {
    if (chip === NO_LABELS) return negate ? 'labels is not EMPTY' : 'labels is EMPTY';
    if (chip === NO_REQUIRED) {
      const list = requiredJql(required);
      return negate ? 'labels in ' + list : '(labels is EMPTY OR labels not in ' + list + ')';
    }
    return negate ? '(labels is EMPTY OR labels not in (' + jqlString(chip) + '))' : 'labels = ' + jqlString(chip);
  }

  // Тот же отбор, что в фильтре, — для поиска Jira, где видны все задачи и колонки
  function searchUrl(required) {
    const parts = ['fixVersion = ' + version];
    const included = filter.chipsBy('include').map((chip) => chipJql(chip, required, false));
    if (included.length) parts.push('(' + included.join(filter.mode === 'and' ? ' AND ' : ' OR ') + ')');
    filter.chipsBy('exclude').forEach((chip) => parts.push(chipJql(chip, required, true)));
    return location.origin + '/issues/?jql=' + encodeURIComponent(parts.join(' AND ') + ' ORDER BY key');
  }

  // ---------- копирование ----------

  function escapeHtml(text) {
    return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  // Задачи релиза под фильтром, а не только строки на странице: Jira показывает список частями.
  // Порядок — как в списке, затем ещё не показанные по ключу
  function matchingKeys() {
    const required = requiredLabels();
    const keys = new Set(Array.from(findRows().values()));
    Array.from(labelsByKey.keys())
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .forEach((key) => keys.add(key));
    return Array.from(keys).filter((key) => matches(key, required));
  }

  // «KEY — название», по строке на задачу; в HTML ключ — ссылка на задачу
  async function copyMatching() {
    const items = matchingKeys().map((key) => ({ key, summary: (summaryByKey.get(key) || '').trim() }));
    if (!items.length) return;
    const line = (item) => (item.summary ? item.key + ' — ' + item.summary : item.key);
    const text = items.map(line).join('\n');
    const html = items
      .map((item) => {
        const link = '<a href="' + escapeHtml(location.origin + '/browse/' + item.key) + '">' + item.key + '</a>';
        return item.summary ? link + ' — ' + escapeHtml(item.summary) : link;
      })
      .join('<br>');
    if (await DevHelper.clipboard.write(text, html)) {
      copiedUntil = Date.now() + COPIED_DELAY;
      setTimeout(sync, COPIED_DELAY);
      sync();
    }
  }

  // Панель фильтра с кнопками копирования и поиска справа
  function buildBar() {
    const actions = document.createElement('div');
    actions.className = 'dhr-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'dhr-action';
    copy.dataset.action = 'copy';
    copy.title = 'Скопировать задачи релиза под фильтром, в том числе ещё не показанные в списке: '
      + '«KEY — название», по строке на задачу';
    copy.addEventListener('click', () => {
      copyMatching().catch((e) => log('не удалось скопировать задачи:', e && e.message));
    });
    const search = document.createElement('a');
    search.className = 'dhr-action';
    search.target = '_blank';
    search.rel = 'noopener noreferrer';
    search.textContent = 'Открыть в поиске';
    search.title = 'Тот же отбор в поиске Jira (JQL)';
    actions.append(copy, search);
    return filter.buildBar(BAR_CLASS, [actions]);
  }

  // Чипы — метки задач релиза (всех, не только показанных в списке)
  function renderBar(bar, chips, shown, total, onPage, required) {
    filter.renderBar(bar, chips);
    // Счётчики — по всем задачам релиза; в списке Jira их может быть меньше, пока он не догружен
    const parts = [];
    if (filter.size) parts.push('Показано ' + shown + ' из ' + total);
    if (onPage < total) parts.push('в списке пока ' + onPage + ' из ' + total + ' — счётчики и копирование по всем');
    filter.setStatus(bar, parts.join('; '), false);

    const copy = bar.querySelector('[data-action="copy"]');
    const copyText = Date.now() < copiedUntil ? 'Скопировано: ' + shown : 'Скопировать задачи (' + shown + ')';
    if (copy.textContent !== copyText) copy.textContent = copyText;
    copy.disabled = !shown;

    const search = bar.querySelector('a.dhr-action');
    const href = searchUrl(required);
    if (search.getAttribute('href') !== href) search.setAttribute('href', href);
  }

  // Название задачи — листовой элемент строки с самым длинным текстом (ключ, статус, приоритет короче)
  function summaryOf(row) {
    let best = null;
    let bestLength = 0;
    row.querySelectorAll('*').forEach((el) => {
      if (el.children.length || el.closest(OWN_SELECTOR)) return;
      const length = (el.textContent || '').trim().length;
      if (length > bestLength) {
        best = el;
        bestLength = length;
      }
    });
    return best;
  }

  // Метки задачи в строке — все, по алфавиту, сразу после названия. Обязательные выделены как в чипах.
  // Без меток блок не показываем; пересобираем только при изменении
  function renderRowLabels(row, key, required, show) {
    let block = row.querySelector('.' + ROW_LABELS_CLASS);
    const labels = show ? labelsByKey.get(key).slice().sort((a, b) => a.localeCompare(b)) : [];
    if (!labels.length) {
      if (block) block.remove();
      return;
    }

    const summary = summaryOf(row);
    if (!summary) return;
    if (!block) block = buildRowLabels();
    if (summary.nextElementSibling !== block) summary.insertAdjacentElement('afterend', block);

    const signature = JSON.stringify([labels, required, labels.map(filter.stateOf)]);
    if (block.dataset.signature === signature) return;
    block.dataset.signature = signature;
    block.replaceChildren(...labels.map((label) => filter.buildLabel(label, required)));
  }

  // Строка Jira целиком кликабельна (открывает задачу), а над названием Jira показывает тултип у курсора.
  // События мыши наших блоков до строки не доходят: клик не открывает задачу, наведение не вызывает тултип
  const ROW_EVENTS = [
    'pointerdown', 'mousedown', 'mouseup', 'pointerup', 'auxclick',
    'pointerover', 'pointerout', 'mouseover', 'mouseout', 'pointermove', 'mousemove'
  ];

  function stopRowEvents(block) {
    ROW_EVENTS.forEach((type) => block.addEventListener(type, (event) => event.stopPropagation()));
  }

  function buildRowLabels() {
    const block = document.createElement('span');
    block.className = ROW_LABELS_CLASS;
    stopRowEvents(block);
    block.addEventListener('click', filter.onLabelClick);
    return block;
  }

  function mrIid(url) {
    const m = url.match(/\/merge_requests\/(\d+)/);
    return m ? m[1] : '';
  }

  // «group/sub/project!12» — какой MR откроется
  function mrRef(url) {
    const m = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
    return m ? m[1] + '!' + m[2] : url;
  }

  // Статус задачи в строке: последний листовой элемент с текстом статуса из API (статус — справа),
  // поднятый до обёртки-лозенджа — самого высокого предка с тем же текстом
  function statusOf(row, key) {
    const status = normalize(statusByKey.get(key));
    if (!status) return null;
    let found = null;
    row.querySelectorAll('*').forEach((el) => {
      if (!el.children.length && !el.closest(OWN_SELECTOR) && normalize(el.textContent) === status) found = el;
    });
    while (found && found.parentElement !== row && normalize(found.parentElement.textContent) === status) {
      found = found.parentElement;
    }
    return found;
  }

  // Кнопки MR задачи — справа от статуса. Строки Jira фиксированной высоты: под метками места нет,
  // туда — только если статус не нашёлся
  function renderRowMrs(row, key, show) {
    let block = row.querySelector('.' + ROW_MRS_CLASS);
    const urls = show ? mrsByKey.get(key) || [] : [];
    if (!urls.length) {
      if (block) block.remove();
      return;
    }

    const status = statusOf(row, key);
    const after = status || row.querySelector('.' + ROW_LABELS_CLASS) || summaryOf(row);
    if (!after) return;
    if (!block) block = buildRowMrs();
    block.classList.toggle('dhr-row-mrs-below', !status);
    if (after.nextElementSibling !== block) after.insertAdjacentElement('afterend', block);

    const signature = JSON.stringify(urls);
    if (block.dataset.signature === signature) return;
    block.dataset.signature = signature;
    // Кнопка — ссылка: работают средний клик и «открыть в новой вкладке». Несколько MR различаем номером,
    // какой это MR — в подсказке
    block.replaceChildren(
      ...urls.map((url) => {
        const button = document.createElement('a');
        button.className = 'dhr-row-mr';
        button.href = url;
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
        button.setAttribute('role', 'button');
        button.title = 'Открыть MR ' + mrRef(url) + ' в новой вкладке';
        button.textContent = urls.length > 1 ? 'Посмотреть MR !' + mrIid(url) : 'Посмотреть MR';
        return button;
      })
    );
  }

  // Ссылки открываются сами (браузер берёт ближайшую ссылку); клик до строки Jira не доходит
  function buildRowMrs() {
    const block = document.createElement('span');
    block.className = ROW_MRS_CLASS;
    stopRowEvents(block);
    block.addEventListener('click', (event) => event.stopPropagation());
    return block;
  }

  function mount() {
    const id = versionId();
    if (id !== version) {
      unmount();
      version = id;
      labelsByKey = null;
      error = '';
      mrsByKey = new Map();
      statusByKey = new Map();
      summaryByKey = new Map();
      mrNote = '';
      filter.reset();
      checked = new Set();
      if (id) load(id);
    }
    if (!id || !labelsByKey) return;

    const rows = findRows();
    const bars = Array.from(document.querySelectorAll('.' + BAR_CLASS));
    if (!rows.size) {
      bars.forEach((bar) => bar.remove());
      return;
    }

    const anchor = listAnchor(rows);
    let bar = anchor.previousElementSibling;
    if (!bar || !bar.classList.contains(BAR_CLASS)) {
      bar = buildBar();
      anchor.insertAdjacentElement('beforebegin', bar);
      log('фильтр меток релиза вставлен');
    }
    bars.filter((other) => other !== bar).forEach((other) => other.remove());

    // Выбранная метка могла пропасть из списка — не оставляем невидимый фильтр
    const required = requiredLabels();
    const keys = Array.from(labelsByKey.keys());
    const chips = filter.chipsFor(keys.map((key) => labelsByKey.get(key)), required);
    filter.retain(new Set(chips.map((chip) => chip.label)));

    const shown = keys.filter((key) => matches(key, required)).length;
    rows.forEach((key, row) => {
      setHidden(row, HIDDEN_ATTR, !matches(key, required));
      renderRowLabels(row, key, required, settings.rowLabels);
      renderRowMrs(row, key, settings.rowMrLinks);
    });
    // Блоки меток и MR в строках, которые больше не строки списка
    document.querySelectorAll('.' + ROW_LABELS_CLASS + ', .' + ROW_MRS_CLASS).forEach((block) => {
      const row = Array.from(rows.keys()).find((candidate) => candidate.contains(block));
      if (!row) block.remove();
    });
    // Строки, которые больше не строки списка (перерисовка), не должны остаться скрытыми
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach((row) => {
      if (!rows.has(row)) row.removeAttribute(HIDDEN_ATTR);
    });

    renderBar(bar, chips, shown, keys.length, new Set(rows.values()).size, required);
    if (error) filter.setStatus(bar, 'Не удалось обновить метки: ' + error, true);
    else if (settings.rowMrLinks && mrNote) filter.setStatus(bar, mrNote, true);
  }

  // Ключи со ссылками, которых нет в загруженных метках: задачу могли добавить в релиз после загрузки.
  // Ссылки на задачи не из релиза тоже попадут сюда — поэтому каждый ключ проверяем один раз
  function newUnknownKeys() {
    const main = document.querySelector('main, [role="main"]') || document.body;
    const keys = new Set();
    main.querySelectorAll('a[href*="/browse/"]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(BROWSE_RE);
      if (m && !labelsByKey.has(m[1]) && !checked.has(m[1])) keys.add(m[1]);
    });
    return Array.from(keys);
  }

  function unmount() {
    document.querySelectorAll(OWN_SELECTOR).forEach((el) => el.remove());
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach((row) => row.removeAttribute(HIDDEN_ATTR));
  }

  // ---------- жизненный цикл ----------

  let settings = null;
  let scheduled = false;

  function active() {
    return !!settings && settings.enabled;
  }

  function sync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!active()) {
        unmount();
        version = null;
        return;
      }
      mount();
      if (!labelsByKey || loading || Date.now() - fetchedAt < REFETCH_DELAY) return;
      const unknown = newUnknownKeys();
      if (!unknown.length) return;
      unknown.forEach((key) => checked.add(key));
      load(version);
    });
  }

  DevHelper.storage.getFeature(feature.id, feature.defaults).then((values) => {
    settings = values;
    sync();
  });

  try {
    DevHelper.storage.onFeatureChanged(feature.id, (changes) => {
      settings = { ...(settings || feature.defaults), ...changes };
      // Поле MR приходит в том же запросе, что и метки: включили ссылки или сменили поле — загружаем заново
      if (version && ('rowMrLinks' in changes || 'mrField' in changes)) load(version);
      sync();
    });
  } catch (e) { /* storage недоступен — работаем на загруженных настройках */ }

  // Jira — SPA: на страницу релиза переходят без перезагрузки, список догружается и перерисовывается
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
