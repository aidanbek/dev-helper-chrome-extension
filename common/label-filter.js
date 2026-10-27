// Фильтр задач по меткам — общий для «Задач Jira» (таблицы на странице задачи) и «Релизов Jira» (список релиза):
// выбор меток, отбор задач, панель с чипами и кликабельные метки в строках.
// Обе фичи работают на одной странице Jira в общем окружении content scripts — модуль подключается дважды
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  if (DevHelper.labelFilter) return;

  // Псевдометки чипов «без меток» и «без обязательных меток»: в метках Jira пробелов не бывает
  const NO_LABELS = ' none';
  const NO_REQUIRED = ' no-required';

  const CHIP_CLASS = 'dhl-chip';
  const LABEL_CLASS = 'dhl-label';
  const CHIP_HINT = 'Клик — показать задачи с меткой, Shift+клик — скрыть';

  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Обязательные метки из настройки: через запятую или пробел, без учёта регистра
  function parseRequired(value) {
    return (value || '').split(/[\s,]+/).map(normalize).filter(Boolean);
  }

  function isRequired(label, required) {
    return required.includes(normalize(label));
  }

  function hasRequired(labels, required) {
    return labels.some((label) => isRequired(label, required));
  }

  // Подходит ли задача под чип: обычная метка или служебные «без меток» / «без обязательных меток»
  function hasChip(labels, chip, required) {
    if (chip === NO_LABELS) return !labels.length;
    if (chip === NO_REQUIRED) return !hasRequired(labels, required);
    return labels.includes(chip);
  }

  function buildChip(text, attrs) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CHIP_CLASS;
    Object.assign(chip.dataset, attrs);
    chip.textContent = text;
    return chip;
  }

  // Строка не подходит под фильтр — атрибут, а не класс: React перезаписывает className, чужие атрибуты не трогает
  function setHidden(row, attr, hidden) {
    if (hidden === row.hasAttribute(attr)) return;
    if (hidden) row.setAttribute(attr, '');
    else row.removeAttribute(attr);
  }

  // Выбор меток одной страницы. selected: метка → 'include' (показать задачи с ней) или 'exclude' (скрыть задачи с ней);
  // mode — как сочетать несколько include: 'or' — хотя бы одна, 'and' — все. onChange — выбор изменился
  function create(onChange) {
    const selected = new Map();
    let mode = 'or';

    function chipsBy(state) {
      return Array.from(selected).filter(([, value]) => value === state).map(([chip]) => chip);
    }

    // Исключённые чипы скрывают задачу всегда; из включённых нужна хотя бы одна («ИЛИ») или все («И»).
    // Метки ещё не загружены или Jira задачу не вернула (labels — null) — задачу не скрываем
    function matches(labels, required) {
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
      onChange();
    }

    // Другая страница — выбор с начала
    function reset() {
      selected.clear();
      mode = 'or';
    }

    // Выбранная метка могла пропасть со страницы — не оставляем невидимый фильтр. true — выбор изменился
    function retain(present) {
      let removed = false;
      selected.forEach((state, label) => {
        if (present.has(label)) return;
        selected.delete(label);
        removed = true;
      });
      return removed;
    }

    // Чипы: метки задач с числом задач (обязательные — первыми, внутри групп частые — первыми),
    // затем «без меток» и «без обязательных меток». Служебные чипы показываем и с нулём — ноль тоже ответ
    function chipsFor(labelLists, required) {
      const counts = new Map();
      let noLabels = 0;
      let noRequired = 0;
      labelLists.forEach((labels) => {
        labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
        if (!labels.length) noLabels++;
        if (!hasRequired(labels, required)) noRequired++;
      });
      const chips = Array.from(counts)
        .map(([label, count]) => ({ label, text: label, count, required: isRequired(label, required) }))
        .sort((a, b) => b.required - a.required || b.count - a.count || a.label.localeCompare(b.label));
      chips.push({ label: NO_LABELS, text: 'без меток', count: noLabels, special: true });
      if (required.length) {
        chips.push({ label: NO_REQUIRED, text: 'без обязательных меток', count: noRequired, special: true });
      }
      return chips;
    }

    // Панель: «Метки:», чипы, статус и, после них, extra — свои элементы фичи (кнопки действий).
    // className — класс фичи: по нему фича находит и убирает свои панели, не трогая панели другой фичи
    function buildBar(className, extra = []) {
      const bar = document.createElement('div');
      bar.className = 'dhl-bar ' + className;
      const title = document.createElement('span');
      title.className = 'dhl-bar-title';
      title.textContent = 'Метки:';
      title.title = CHIP_HINT;
      const chips = document.createElement('div');
      chips.className = 'dhl-chips';
      const status = document.createElement('span');
      status.className = 'dhl-status';
      bar.append(title, chips, status, ...extra);

      bar.addEventListener('click', (event) => {
        const chip = event.target.closest('.' + CHIP_CLASS);
        if (!chip) return;
        if (chip.dataset.reset) {
          selected.clear();
          onChange();
        } else if (chip.dataset.mode) {
          mode = mode === 'or' ? 'and' : 'or';
          onChange();
        } else {
          toggle(chip.dataset.label, event.shiftKey);
        }
      });
      return bar;
    }

    // Чипы пересобираем только при изменении меток или выбора — иначе MutationObserver фичи зациклил бы sync
    function renderBar(bar, chips) {
      const list = bar.querySelector('.dhl-chips');
      const signature = JSON.stringify([chips, Array.from(selected), mode]);
      if (list.dataset.signature === signature) return;
      list.dataset.signature = signature;
      list.replaceChildren(
        ...chips.map((spec) => {
          const state = selected.get(spec.label);
          const chip = buildChip(spec.text + ' · ' + spec.count, { label: spec.label });
          chip.classList.toggle('dhl-selected', state === 'include');
          chip.classList.toggle('dhl-excluded', state === 'exclude');
          chip.classList.toggle('dhl-special', !!spec.special);
          chip.classList.toggle('dhl-required', !!spec.required);
          chip.title = (spec.required ? 'Обязательная метка. ' : '') + CHIP_HINT;
          chip.setAttribute('aria-pressed', String(!!state));
          return chip;
        })
      );
      if (chipsBy('include').length > 1) {
        const toggleMode = buildChip(mode === 'and' ? 'все выбранные (И)' : 'любая из выбранных (ИЛИ)', { mode: '1' });
        toggleMode.classList.add('dhl-mode');
        toggleMode.title = 'Как сочетать выбранные метки — переключить';
        list.append(toggleMode);
      }
      if (selected.size) list.append(buildChip('Сбросить', { reset: '1' }));
    }

    function setStatus(bar, text, isError) {
      const status = bar.querySelector('.dhl-status');
      if (status.textContent !== text) status.textContent = text;
      status.classList.toggle('dhl-error', !!isError);
    }

    // Метка в строке работает как её чип в фильтре; выбранная и исключённая — как чипы
    function buildLabel(label, required) {
      const chip = document.createElement('span');
      chip.className = LABEL_CLASS;
      chip.dataset.label = label;
      chip.setAttribute('role', 'button');
      const state = selected.get(label);
      const labelRequired = isRequired(label, required);
      chip.classList.toggle('dhl-required', labelRequired);
      chip.classList.toggle('dhl-selected', state === 'include');
      chip.classList.toggle('dhl-excluded', state === 'exclude');
      chip.title = (labelRequired ? 'Обязательная метка. ' : '') + CHIP_HINT;
      chip.textContent = label;
      return chip;
    }

    // Обработчик клика на блоке меток строки: строка Jira может быть кликабельной — клик по метке до неё не доходит
    function onLabelClick(event) {
      event.preventDefault();
      event.stopPropagation();
      const chip = event.target.closest('.' + LABEL_CLASS);
      if (chip) toggle(chip.dataset.label, event.shiftKey);
    }

    // Для подписей строк: при смене выбора метки в строке перерисовываются
    function stateOf(label) {
      return selected.get(label) || '';
    }

    return {
      get mode() {
        return mode;
      },
      get size() {
        return selected.size;
      },
      chipsBy,
      matches,
      toggle,
      reset,
      retain,
      chipsFor,
      buildBar,
      renderBar,
      setStatus,
      buildLabel,
      onLabelClick,
      stateOf
    };
  }

  DevHelper.labelFilter = { NO_LABELS, NO_REQUIRED, normalize, parseRequired, isRequired, setHidden, create };
})();
