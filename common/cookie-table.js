// Таблица cookie в окне расширения: разметка, стили, действия.
// Данные и изменения — через background (сообщения cookies.*), см. features/cookies/background.js.
// В строке: имя, значение (клик — правка на месте), ✕ — удалить (второй клик подтверждает);
// под ней — сохранённые значения: клик ставит значение, × убирает его из списка, «+» добавляет.
// Справа от фильтра — «Удалить все» (второй клик подтверждает) и «Очистить кэш» источника вкладки.
// Внизу — строка добавления cookie. Стили — строкой: окно расширения вставляет их само.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  if (DevHelper.cookieTable) return;

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  // Сколько ждём второго клика по ✕
  const CONFIRM_DELAY = 3000;
  // confirmId кнопки «Удалить все»: id строк — другого вида
  const CLEAR_ID = '*clear*';

  const CSS = `
.ct { font: 13px/1.4 ${FONT}; color: #303030; }
.ct * { box-sizing: border-box; }
.ct-input {
  width: 100%;
  min-width: 0;
  padding: 4px 7px;
  border: 1px solid #bfbfc3;
  border-radius: 5px;
  background: #fff;
  color: #303030;
  font: 12px/18px ${MONO};
}
.ct-input:focus { outline: none; border-color: #1f75cb; box-shadow: 0 0 0 1px #1f75cb; }
select.ct-input { font-family: ${FONT}; }
.ct-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.ct-filter { flex: 1; font-family: ${FONT}; font-size: 13px; }
.ct-notice { margin: 6px 0 0; color: #108548; font: 500 12px/1.4 ${FONT}; }
.ct-notice[hidden] { display: none; }
.ct-header, .ct-row {
  display: grid;
  grid-template-columns: minmax(90px, 28%) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 4px 6px;
}
.ct-header {
  border-bottom: 1px solid #dcdcde;
  color: #89888d;
  font: 600 11px/16px ${FONT};
  letter-spacing: .04em;
  text-transform: uppercase;
}
.ct-rows { overflow-y: auto; }
.ct-row { border-bottom: 1px solid #f0f0f2; }
.ct-row:hover { background: #f8f9fb; }
.ct-name { padding: 1px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 12px/18px ${MONO}; cursor: help; }
.ct-row.ct-absent .ct-name { color: #89888d; }
.ct-value-cell { min-width: 0; }
.ct-value {
  display: block;
  width: 100%;
  margin: 0;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: #444;
  font: 12px/18px ${MONO};
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.ct-value.ct-muted { color: #89888d; font-family: ${FONT}; font-style: italic; }
.ct-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; min-width: 70px; }
.ct-icon {
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: #89888d;
  font: 600 13px/22px ${FONT};
  cursor: pointer;
}
.ct-icon:hover { background: #e9f3fc; color: #1068bf; }
.ct-icon.ct-danger:hover { background: #fdf1f0; color: #dd2b0e; }
.ct-icon:disabled { opacity: .5; cursor: progress; }
.ct-btn {
  flex: 0 0 auto;
  margin: 0;
  padding: 1px 8px;
  border: 1px solid #bfbfc3;
  border-radius: 5px;
  background: #fff;
  color: #303030;
  font: 500 12px/18px ${FONT};
  cursor: pointer;
  white-space: nowrap;
}
.ct-btn:disabled { opacity: .5; cursor: progress; }
.ct-btn.ct-confirm { border-color: #dd2b0e; background: #dd2b0e; color: #fff; }
.ct-btn.ct-primary { border-color: #1068bf; background: #1f75cb; color: #fff; }
.ct-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 3px 0 2px 4px; }
.ct-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid #dcdcde;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.ct-chip.ct-active { border-color: #1068bf; background: #e9f3fc; }
.ct-chip-set {
  min-width: 0;
  margin: 0;
  padding: 0 3px 0 8px;
  border: 0;
  background: none;
  color: #303030;
  font: 12px/18px ${MONO};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.ct-chip.ct-active .ct-chip-set { color: #1068bf; font-weight: 600; }
.ct-chip-set:disabled { cursor: progress; }
.ct-chip-del {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 6px 0 2px;
  border: 0;
  background: none;
  color: #bfbfc3;
  font: 11px/18px ${FONT};
  cursor: pointer;
}
.ct-chip:hover .ct-chip-del { color: #89888d; }
.ct-chip-del:hover { color: #dd2b0e !important; }
.ct-chip-input { width: 160px; padding: 0 7px; border-radius: 10px; }
.ct-add { display: flex; gap: 6px; margin-top: 8px; }
.ct-add .ct-add-name { flex: 1 1 0; }
.ct-add .ct-add-value { flex: 1.4 1 0; }
.ct-add .ct-add-domain { flex: 0 1 auto; width: auto; max-width: 34%; }
.ct-empty { margin: 8px 0 0; color: #666; }
.ct-error { margin: 6px 0 0; color: #dd2b0e; font: 500 12px/1.4 ${FONT}; word-break: break-word; }
.ct-error[hidden] { display: none; }
`;

  const SAME_SITE_LABEL = { lax: 'Lax', strict: 'Strict', no_restriction: 'None' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, text, title) {
    const node = el('button', className, text);
    node.type = 'button';
    if (title) node.title = title;
    return node;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatExpiry(cookie) {
    if (cookie.session || !cookie.expirationDate) return 'сессия';
    const d = new Date(cookie.expirationDate * 1000);
    return 'до ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function keyOf(cookie) {
    return { name: cookie.name, domain: cookie.domain, path: cookie.path, storeId: cookie.storeId };
  }

  function rowId(cookie) {
    return cookie.name + '\n' + cookie.domain + '\n' + cookie.path;
  }

  // container — куда рисовать; send(message) — сообщение в background; onLoad(state) — после каждой загрузки;
  // maxHeight — высота списка строк
  function create({ container, send, onLoad = () => {}, maxHeight = '360px' }) {
    let state = null;
    let filter = '';
    let busy = false;
    let error = '';
    // Итог последнего действия панели: «Удалено cookie: 3», «Кэш очищен»
    let notice = '';
    // Строка, где открыта правка значения или поле нового значения списка: { id, mode: 'value' | 'chip' }
    let editing = null;
    let confirmId = null;
    let confirmTimer = null;
    // Строка добавления: введённое переживает перерисовку
    const draft = { name: '', value: '', domain: '' };

    const root = el('div', 'ct');
    container.append(root);

    async function load() {
      state = (await send({ type: 'cookies.list' })) || { error: 'нет ответа' };
      onLoad(state);
      render();
      return state;
    }

    // Действие и перезагрузка таблицы; ошибка — внизу таблицы
    // done(result) — текст итога при успехе
    async function act(message, done) {
      busy = true;
      error = '';
      notice = '';
      render();
      const result = await send(message);
      busy = false;
      if (!result || result.error) error = 'Не удалось: ' + ((result && result.error) || 'нет ответа');
      else if (done) notice = done(result);
      editing = null;
      await load();
      return !error;
    }

    function matches(cookie) {
      if (!filter) return true;
      const needle = filter.toLowerCase();
      return cookie.name.toLowerCase().includes(needle) ||
        (cookie.value || '').toLowerCase().includes(needle) ||
        cookie.values.some((value) => value.toLowerCase().includes(needle));
    }

    function render() {
      // Фокус и курсор в поле фильтра и строке добавления сохраняем при перерисовке
      const focused = root.querySelector(':focus');
      const focusRole = focused && focused.dataset.role;
      // Прокрутку списка тоже: после смены значения таблица остаётся там, где была
      const oldRows = root.querySelector('.ct-rows');
      const scrollTop = oldRows ? oldRows.scrollTop : 0;
      root.textContent = '';
      if (!state || state.status !== 'ok') return;

      const search = el('input', 'ct-input ct-filter');
      search.type = 'search';
      search.placeholder = 'Фильтр по имени или значению';
      search.value = filter;
      search.spellcheck = false;
      search.dataset.role = 'filter';
      search.setAttribute('aria-label', 'Фильтр cookie');
      search.addEventListener('input', () => {
        filter = search.value.trim();
        fillRows();
      });
      const top = el('div', 'ct-top');
      top.append(search, clearCookiesButton(), clearCacheButton());
      root.append(top);

      root.append(header());
      const rows = el('div', 'ct-rows');
      rows.style.maxHeight = maxHeight;
      root.append(rows);
      const fillRows = () => {
        rows.textContent = '';
        const shown = state.cookies.filter(matches);
        if (!shown.length) rows.append(el('p', 'ct-empty', state.cookies.length ? 'Ничего не нашлось.' : 'У сайта нет cookie.'));
        shown.forEach((cookie) => rows.append(rowEl(cookie)));
      };
      fillRows();
      rows.scrollTop = scrollTop;

      root.append(addRow());
      const errorEl = el('p', 'ct-error', error);
      errorEl.hidden = !error;
      root.append(errorEl);
      const noticeEl = el('p', 'ct-notice', notice);
      noticeEl.hidden = !notice || !!error;
      noticeEl.setAttribute('role', 'status');
      root.append(noticeEl);

      if (focusRole) {
        const again = root.querySelector('[data-role="' + focusRole + '"]');
        if (again) again.focus({ preventScroll: true });
      }
      const open = root.querySelector('[data-role="edit"]');
      if (open) {
        open.focus({ preventScroll: true });
        open.select();
      }
    }

    // Строка — одна линия: имя | значение (под ним — чипы, если есть список) | «+» и ✕.
    // Домен, путь, флаги и срок — в подсказке к имени, чтобы таблица читалась
    function rowEl(cookie) {
      const id = rowId(cookie);
      const row = el('div', 'ct-row' + (cookie.absent ? ' ct-absent' : ''));
      row.dataset.name = cookie.name;

      const name = el('span', 'ct-name', cookie.name);
      name.title = cookie.name + '\n' + metaText(cookie);

      const valueCell = el('div', 'ct-value-cell');
      valueCell.append(editing && editing.id === id && editing.mode === 'value' ? valueInput(cookie) : valueEl(cookie));
      const list = chips(cookie, id);
      if (list) valueCell.append(list);

      const actions = el('div', 'ct-actions');
      if (!cookie.absent) actions.append(editButton(cookie));
      actions.append(addValueButton(cookie));
      if (!cookie.absent) actions.append(removeButton(cookie, id));

      row.append(name, valueCell, actions);
      return row;
    }

    function header() {
      const head = el('div', 'ct-header');
      head.append(el('span', '', 'Имя'), el('span', '', 'Значение'), el('span', '', ''));
      return head;
    }

    function valueEl(cookie) {
      if (cookie.absent) return el('span', 'ct-value ct-muted', 'нет на сайте — выберите значение');
      // Обычный текст: выделяется и копируется; правка — кнопкой ✎
      const node = el('span', 'ct-value', cookie.value || '—');
      node.title = valueTitle(cookie.value);
      return node;
    }

    function editButton(cookie) {
      const edit = button('ct-icon', '✎', 'Изменить значение');
      edit.disabled = busy;
      edit.setAttribute('aria-label', 'Изменить значение ' + cookie.name);
      edit.addEventListener('click', () => startEdit(cookie, 'value'));
      return edit;
    }

    function valueTitle(value) {
      let decoded = value || '';
      try {
        decoded = decodeURIComponent(decoded);
      } catch (e) {
        // Не URL-кодировано — показываем как есть
      }
      // У URL-кодированного значения — ещё и раскодированное
      return decoded !== value ? value + '\n\n' + decoded : value || '';
    }

    function startEdit(cookie, mode) {
      editing = { id: rowId(cookie), mode };
      render();
    }

    function stopEdit() {
      editing = null;
      render();
    }

    // Поле на месте значения: Enter — сохранить, Esc или уход фокуса — отмена
    function inlineInput(initial, placeholder, onCommit, className) {
      const input = el('input', 'ct-input ' + (className || ''));
      input.type = 'text';
      input.value = initial;
      input.placeholder = placeholder;
      input.spellcheck = false;
      input.dataset.role = 'edit';
      let done = false;
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          done = true;
          onCommit(input.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          done = true;
          stopEdit();
        }
      });
      input.addEventListener('blur', () => {
        if (!done) setTimeout(() => editing && stopEdit(), 0);
      });
      return input;
    }

    function valueInput(cookie) {
      const input = inlineInput(cookie.value || '', '',
        (value) => act({ type: 'cookies.setValue', cookie: keyOf(cookie), value }), 'ct-value-input');
      input.setAttribute('aria-label', 'Значение ' + cookie.name);
      input.style.flex = '1';
      return input;
    }

    function removeButton(cookie, id) {
      const confirming = confirmId === id;
      const node = button(confirming ? 'ct-btn ct-confirm' : 'ct-icon ct-danger', confirming ? 'Удалить?' : '✕',
        confirming ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить cookie');
      node.disabled = busy;
      node.setAttribute('aria-label', 'Удалить ' + cookie.name);
      node.addEventListener('click', () => {
        clearTimeout(confirmTimer);
        if (confirming) {
          confirmId = null;
          act({ type: 'cookies.remove', cookie: keyOf(cookie) });
          return;
        }
        confirmId = id;
        confirmTimer = setTimeout(() => {
          confirmId = null;
          render();
        }, CONFIRM_DELAY);
        render();
      });
      return node;
    }

    // Все cookie, которые видит сайт; второй клик — подтверждение, как у ✕ в строке
    function clearCookiesButton() {
      const confirming = confirmId === CLEAR_ID;
      const count = state.cookies.filter((cookie) => !cookie.absent).length;
      const node = button(confirming ? 'ct-btn ct-confirm' : 'ct-btn', confirming ? 'Удалить все?' : 'Удалить все cookie',
        confirming
          ? 'Нажмите ещё раз, чтобы удалить ' + count + ' cookie'
          : 'Удалить все cookie, которые видит сайт, — и доменные: они пропадут и на других поддоменах. Списки значений останутся');
      node.disabled = busy || !count;
      node.addEventListener('click', () => {
        clearTimeout(confirmTimer);
        if (confirming) {
          confirmId = null;
          act({ type: 'cookies.clear' }, (result) => 'Удалено cookie: ' + result.removed);
          return;
        }
        confirmId = CLEAR_ID;
        confirmTimer = setTimeout(() => {
          confirmId = null;
          render();
        }, CONFIRM_DELAY);
        render();
      });
      return node;
    }

    function clearCacheButton() {
      const node = button('ct-btn', 'Очистить кэш',
        'Очистить кэш браузера для ' + state.host + ': HTTP-кэш и Cache Storage. Cookie и localStorage не трогаются');
      node.disabled = busy;
      node.addEventListener('click', () => act({ type: 'cookies.clearCache' }, () => 'Кэш ' + state.host + ' очищен'));
      return node;
    }

    function chips(cookie, id) {
      const adding = editing && editing.id === id && editing.mode === 'chip';
      if (!cookie.values.length && !adding) return null;
      const box = el('div', 'ct-chips');
      cookie.values.forEach((value, i) => {
        const chip = el('span', 'ct-chip' + (i === cookie.active ? ' ct-active' : ''));
        const set = button('ct-chip-set', value === '' ? '(пусто)' : value,
          i === cookie.active ? 'Текущее значение' : 'Поставить это значение');
        set.disabled = busy;
        set.setAttribute('aria-pressed', i === cookie.active ? 'true' : 'false');
        set.addEventListener('click', () => {
          if (i !== cookie.active) act({ type: 'cookies.setValue', cookie: keyOf(cookie), value });
        });
        const del = button('ct-chip-del', '×', 'Убрать из списка (cookie не меняется)');
        del.disabled = busy;
        del.setAttribute('aria-label', 'Убрать ' + value + ' из списка');
        del.addEventListener('click', () => act({ type: 'cookies.removeValue', cookie: keyOf(cookie), value }));
        chip.append(set, del);
        box.append(chip);
      });

      if (adding) {
        // Текущего значения нет в списке — предлагаем его: «запомнить текущее» одним Enter
        const current = !cookie.absent && !cookie.values.includes(cookie.value) ? cookie.value : '';
        const input = inlineInput(current, 'значение', (value) =>
          act({ type: 'cookies.addValue', cookie: keyOf(cookie), value }), 'ct-chip-input');
        input.setAttribute('aria-label', 'Новое значение для ' + cookie.name);
        box.append(input);
      }
      return box;
    }

    function addValueButton(cookie) {
      const add = button('ct-icon', '+', 'Добавить значение в список для быстрого переключения');
      add.disabled = busy;
      add.setAttribute('aria-label', 'Добавить значение для ' + cookie.name);
      add.addEventListener('click', () => startEdit(cookie, 'chip'));
      return add;
    }

    // «stage.example.com · /checkout · HttpOnly · Secure · SameSite=Strict · до 06.10.2027 16:38»
    function metaText(cookie) {
      if (cookie.absent) return cookie.domain + ' · нет на сайте';
      const parts = [cookie.domain];
      if (cookie.path !== '/') parts.push(cookie.path);
      if (cookie.httpOnly) parts.push('HttpOnly');
      if (cookie.secure) parts.push('Secure');
      if (SAME_SITE_LABEL[cookie.sameSite]) parts.push('SameSite=' + SAME_SITE_LABEL[cookie.sameSite]);
      parts.push(formatExpiry(cookie));
      return parts.join(' · ');
    }

    function addRow() {
      const form = el('form', 'ct-add');
      form.noValidate = true;
      const name = el('input', 'ct-input ct-add-name');
      name.placeholder = 'имя';
      name.value = draft.name;
      name.spellcheck = false;
      name.dataset.role = 'add-name';
      name.setAttribute('aria-label', 'Имя новой cookie');
      const value = el('input', 'ct-input ct-add-value');
      value.placeholder = 'значение';
      value.value = draft.value;
      value.spellcheck = false;
      value.dataset.role = 'add-value';
      value.setAttribute('aria-label', 'Значение новой cookie');
      const domain = el('select', 'ct-input ct-add-domain');
      domain.dataset.role = 'add-domain';
      domain.setAttribute('aria-label', 'Домен новой cookie');
      domain.title = 'Только этот хост или домен со всеми поддоменами';
      for (const option of state.domains) {
        const node = el('option', '', option);
        node.title = option === state.host ? 'Только этот хост' : 'Домен и все поддомены';
        node.value = option;
        domain.append(node);
      }
      domain.value = draft.domain || state.host;
      const submit = button('ct-btn ct-primary', 'Добавить', 'Новая cookie: сессионная, путь /, без флагов');
      submit.type = 'submit';
      submit.disabled = busy;

      name.addEventListener('input', () => { draft.name = name.value; });
      value.addEventListener('input', () => { draft.value = value.value; });
      domain.addEventListener('change', () => { draft.domain = domain.value; });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const ok = await act({ type: 'cookies.add', cookie: { name: name.value.trim(), value: value.value, domain: domain.value } });
        if (ok) {
          draft.name = '';
          draft.value = '';
          render();
        }
      });
      form.append(name, value, domain, submit);
      return form;
    }

    return { load, render };
  }

  DevHelper.cookieTable = { CSS, create };
})();
