// Фича «Релизы Jira»: фильтр по меткам над списком задач релиза (Releases → версия → Work items).
// В строках списка меток нет — метки задач версии берём из REST API Jira того же сайта.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('jiraRelease');
  const log = DevHelper.log;

  const BAR_CLASS = 'dhr-labels';
  const CHIP_CLASS = 'dhr-chip';
  const STATUS_CLASS = 'dhr-labels-status';
  const ROW_LABELS_CLASS = 'dhr-row-labels';
  // Атрибут, а не класс: React перезаписывает className строк при перерисовке, чужие атрибуты не трогает
  const HIDDEN_ATTR = 'data-dhr-hidden';
  // Псевдометки чипов «без меток» и «без обязательных меток»: в метках Jira пробелов не бывает
  const NO_LABELS = ' none';
  const NO_REQUIRED = ' no-required';

  const VERSION_RE = /\/versions\/(\d+)/;
  const KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
  const BROWSE_RE = /\/browse\/([A-Z][A-Z0-9_]*-\d+)(?:[/?#]|$)/;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;
  // Новые задачи в списке (добавили в релиз без перезагрузки) — перезапрашиваем метки не чаще раза в 10 секунд
  const REFETCH_DELAY = 10000;

  // Состояние текущей версии: метки задач, выбранные чипы, загрузка
  let version = null;
  let labelsByKey = null;
  let loading = false;
  let error = '';
  let fetchedAt = 0;
  let selected = new Set();
  // Ключи со ссылками на странице, которых не было в ответе: по каждому перезапрашиваем не больше одного раза
  let checked = new Set();

  function versionId() {
    const m = location.pathname.match(VERSION_RE);
    return m ? m[1] : null;
  }

  // Все задачи версии с метками; новый поиск Jira Cloud (/search/jql) листается по nextPageToken
  async function fetchLabels(id) {
    const result = new Map();
    let token = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ jql: 'fixVersion = ' + id, fields: 'labels', maxResults: String(PAGE_SIZE) });
      if (token) params.set('nextPageToken', token);
      const response = await fetch('/rest/api/3/search/jql?' + params, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      (data.issues || []).forEach((issue) => result.set(issue.key, (issue.fields && issue.fields.labels) || []));
      token = data.nextPageToken;
      if (!token || data.isLast) break;
    }
    return result;
  }

  function load(id) {
    loading = true;
    fetchedAt = Date.now();
    fetchLabels(id)
      .then((map) => {
        if (version !== id) return;
        labelsByKey = map;
        error = '';
        log('метки задач релиза загружены:', map.size);
      })
      .catch((e) => {
        if (version !== id) return;
        error = (e && e.message) || 'ошибка';
        log('не удалось загрузить метки задач релиза:', error);
      })
      .finally(() => {
        if (version !== id) return;
        loading = false;
        sync();
      });
  }

  // Элементы с ключом задачи версии: ссылки /browse/KEY и листовые элементы с текстом ключа
  function keyElements() {
    const found = [];
    const main = document.querySelector('main, [role="main"]') || document.body;
    main.querySelectorAll('*').forEach((el) => {
      if (el.closest('.' + BAR_CLASS + ', .' + ROW_LABELS_CLASS)) return;
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

  function normalize(text) {
    return (text || '').trim().toLowerCase();
  }

  // Обязательные метки из настроек: через запятую или пробел, без учёта регистра
  function requiredLabels() {
    const value = (settings && settings.requiredLabels) || '';
    return value.split(/[\s,]+/).map(normalize).filter(Boolean);
  }

  function hasRequired(labels, required) {
    return labels.some((label) => required.includes(normalize(label)));
  }

  // Задача остаётся, если подходит хотя бы под один выбранный чип
  function matches(key, required) {
    if (!selected.size) return true;
    const labels = labelsByKey.get(key);
    return Array.from(selected).some((chip) => {
      if (chip === NO_LABELS) return !labels.length;
      if (chip === NO_REQUIRED) return !hasRequired(labels, required);
      return labels.includes(chip);
    });
  }

  // Чипы: метки задач в списке с числом задач (частые — первыми), затем «без меток» и «без обязательных меток».
  // Служебные чипы показываем и с нулём — ноль тоже ответ: все задачи размечены
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
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, text: label, count, required: required.includes(normalize(label)) }));
    chips.push({ label: NO_LABELS, text: 'без меток', count: noLabels, special: true });
    if (required.length) {
      chips.push({ label: NO_REQUIRED, text: 'без обязательных меток', count: noRequired, special: true });
    }
    return chips;
  }

  function buildBar() {
    const bar = document.createElement('div');
    bar.className = BAR_CLASS;
    const title = document.createElement('span');
    title.className = 'dhr-labels-title';
    title.textContent = 'Метки:';
    const chips = document.createElement('div');
    chips.className = 'dhr-chips';
    const status = document.createElement('span');
    status.className = STATUS_CLASS;
    bar.append(title, chips, status);

    bar.addEventListener('click', (event) => {
      const chip = event.target.closest('.' + CHIP_CLASS);
      if (!chip) return;
      const label = chip.dataset.label;
      if (chip.dataset.reset) selected.clear();
      else if (selected.has(label)) selected.delete(label);
      else selected.add(label);
      sync();
    });
    return bar;
  }

  function buildChip(text, attrs) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CHIP_CLASS;
    Object.assign(chip.dataset, attrs);
    chip.textContent = text;
    return chip;
  }

  // Чипы пересобираем только при изменении меток или выбора — иначе наш же MutationObserver зациклил бы sync
  function renderBar(bar, chips, shown, total) {
    const list = bar.querySelector('.dhr-chips');
    const signature = JSON.stringify([chips, Array.from(selected)]);
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.replaceChildren(
        ...chips.map((spec) => {
          const chip = buildChip(spec.text + ' · ' + spec.count, { label: spec.label });
          chip.classList.toggle('dhr-selected', selected.has(spec.label));
          chip.classList.toggle('dhr-special', !!spec.special);
          chip.classList.toggle('dhr-required', !!spec.required);
          if (spec.required) chip.title = 'Обязательная метка';
          chip.setAttribute('aria-pressed', String(selected.has(spec.label)));
          return chip;
        })
      );
      if (selected.size) list.append(buildChip('Сбросить', { reset: '1' }));
    }
    setStatus(bar, selected.size ? 'Показано ' + shown + ' из ' + total : '', false);
  }
  function setStatus(bar, text, isError) {
    const status = bar.querySelector('.' + STATUS_CLASS);
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('dhr-error', isError);
  }

  // Название задачи — листовой элемент строки с самым длинным текстом (ключ, статус, приоритет короче)
  function summaryOf(row) {
    let best = null;
    let bestLength = 0;
    row.querySelectorAll('*').forEach((el) => {
      if (el.children.length || el.closest('.' + ROW_LABELS_CLASS)) return;
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
    if (!block) {
      block = document.createElement('span');
      block.className = ROW_LABELS_CLASS;
    }
    if (summary.nextElementSibling !== block) summary.insertAdjacentElement('afterend', block);

    const signature = JSON.stringify([labels, required]);
    if (block.dataset.signature === signature) return;
    block.dataset.signature = signature;
    block.replaceChildren(
      ...labels.map((label) => {
        const chip = document.createElement('span');
        chip.className = 'dhr-row-label';
        chip.classList.toggle('dhr-required', required.includes(normalize(label)));
        chip.textContent = label;
        return chip;
      })
    );
  }

  function setHidden(row, hidden) {
    if (hidden === row.hasAttribute(HIDDEN_ATTR)) return;
    if (hidden) row.setAttribute(HIDDEN_ATTR, '');
    else row.removeAttribute(HIDDEN_ATTR);
  }

  function mount() {
    const id = versionId();
    if (id !== version) {
      unmount();
      version = id;
      labelsByKey = null;
      error = '';
      selected = new Set();
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
    const chips = chipsFor(Array.from(rows.values()), required);
    const present = new Set(chips.map((chip) => chip.label));
    selected.forEach((label) => {
      if (!present.has(label)) selected.delete(label);
    });

    let shown = 0;
    rows.forEach((key, row) => {
      const visible = matches(key, required);
      if (visible) shown++;
      setHidden(row, !visible);
      renderRowLabels(row, key, required, settings.rowLabels);
    });
    // Блоки меток в строках, которые больше не строки списка
    document.querySelectorAll('.' + ROW_LABELS_CLASS).forEach((block) => {
      const row = Array.from(rows.keys()).find((candidate) => candidate.contains(block));
      if (!row) block.remove();
    });
    // Строки, которые больше не строки списка (перерисовка), не должны остаться скрытыми
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach((row) => {
      if (!rows.has(row)) row.removeAttribute(HIDDEN_ATTR);
    });

    renderBar(bar, chips, shown, rows.size);
    if (error) setStatus(bar, 'Не удалось обновить метки: ' + error, true);
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
    document.querySelectorAll('.' + BAR_CLASS + ', .' + ROW_LABELS_CLASS).forEach((el) => el.remove());
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
      sync();
    });
  } catch (e) { /* storage недоступен — работаем на загруженных настройках */ }

  // Jira — SPA: на страницу релиза переходят без перезагрузки, список догружается и перерисовывается
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
