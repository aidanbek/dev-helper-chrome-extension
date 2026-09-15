(() => {
  'use strict';

  const BTN_ID = 'glmrh-copy-btn';
  const ROW_BTN_CLASS = 'glmrh-row-btn';
  const LOG_PREFIX = '[CarCity Dev Helper]';

  const MR_PATH_RE = /\/-\/merge_requests\/(\d+)/;
  const MR_LINK_RE = /\/-\/merge_requests\/\d+(?:[?#]|$)/;

  const DEFAULT_TEMPLATE = '{title}\n\n{url}';

  const DEFAULTS = {
    template: DEFAULT_TEMPLATE,
    boldTitle: true,
    hotkey: true,
    listButtons: true,
    openTelegram: true,
    telegramApp: true,
    defaultTopicUrl: '',
    rules: []
  };

  const TITLE_SELECTORS = [
    '[data-testid="title-content"]',
    'h1.merge-request-title-text',
    '.merge-request-details h1.title',
    '.detail-page-description h1.title',
    '.detail-page-header h1',
    'h1.title'
  ];

  function log(...args) {
    console.info(LOG_PREFIX, ...args);
  }

  function getSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (items) => resolve(items || DEFAULTS));
      } catch (e) {
        resolve(DEFAULTS);
      }
    });
  }

  // ---------- страница MR ----------

  function isMrPage() {
    return MR_PATH_RE.test(location.pathname);
  }

  // https://gitlab.example.com/group/project/-/merge_requests/123/diffs?x=1 ->
  // https://gitlab.example.com/group/project/-/merge_requests/123
  function getMrUrl() {
    const m = location.pathname.match(MR_PATH_RE);
    if (!m) return location.href;
    const end = m.index + m[0].length;
    return location.origin + location.pathname.slice(0, end);
  }

  function cleanTitle(raw) {
    return (raw || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\(![0-9]+\)\s*$/, '')
      .trim();
  }

  function getMrTitle() {
    for (const sel of TITLE_SELECTORS) {
      const el = document.querySelector(sel);
      const text = cleanTitle(el && el.textContent);
      if (text) return text;
    }
    // Фолбэк: "Название (!123) · Merge requests · Group / Project · GitLab"
    return cleanTitle(document.title.split(' · ')[0]);
  }

  function firstText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = (el && el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '';
  }

  function getSourceBranch() {
    return firstText([
      '[data-testid="source-branch"]',
      '.js-source-branch',
      '.mr-source-target .ref-container',
      '.ref-container'
    ]);
  }

  function getAuthor() {
    return firstText([
      '[data-testid="author-link"] .author',
      '[data-testid="author-link"]',
      '.detail-page-header .author-link .author',
      '.detail-page-header .author-link'
    ]);
  }

  // ---------- правила топиков ----------

  // Полный путь проекта с любым числом вложенных подгрупп:
  // /group/sub/subsub/project/-/merge_requests/12 -> group/sub/subsub/project
  function projectPathOf(pathname) {
    const idx = pathname.indexOf('/-/');
    if (idx === -1) return '';
    return pathname.slice(1, idx).replace(/^\/+|\/+$/g, '');
  }

  function normalizePattern(value) {
    return (value || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^\/+|\/+$/g, '');
  }

  // Правило матчится по сегментам пути, а не по подстроке:
  // "billing" совпадёт с "group/billing" и "group/billing/api",
  // но не с "group/billing-legacy". Поддерживается "*" внутри сегмента.
  function ruleMatches(pattern, candidate) {
    if (!pattern || !candidate) return false;
    const escaped = pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    return new RegExp('(^|/)' + escaped + '(/|$)').test(candidate);
  }

  function resolveTopicUrl(settings, mrUrl) {
    let host = location.host;
    let project = projectPathOf(location.pathname);
    try {
      const u = new URL(mrUrl, location.origin);
      host = u.host;
      project = projectPathOf(u.pathname);
    } catch (e) { /* остаёмся на текущей странице */ }

    project = project.toLowerCase();
    const withHost = (host + '/' + project).toLowerCase();
    let best = null;

    for (const rule of settings.rules || []) {
      const pattern = normalizePattern(rule.project);
      const url = (rule.url || '').trim();
      if (!pattern || !url) continue;
      if (!ruleMatches(pattern, project) && !ruleMatches(pattern, withHost)) continue;

      // Чем длиннее (более вложенный) путь в правиле, тем выше приоритет
      const weight = pattern.split('/').length * 1000 + pattern.length;
      if (!best || weight > best.weight) best = { weight, url };
    }
    if (best) return best.url;
    return (settings.defaultTopicUrl || '').trim();
  }

  const TG_HOSTS = ['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'];

  // https://t.me/c/<channel>/<post>             -> tg://privatepost?channel=<channel>&post=<post>
  // https://t.me/c/<channel>/<topic>/<post>     -> tg://privatepost?channel=..&post=<post>&thread=<topic>
  // https://t.me/<username>[/<topic>]/<post>    -> tg://resolve?domain=<username>&post=..[&thread=..]
  // Страница t.me сама приложение не открывает — поэтому идём сразу по tg://.
  // Инвайты (+hash, joinchat) и прочие форматы не конвертируем — вернётся null.
  function toTgUri(url) {
    if (/^tg:/i.test(url)) return url;

    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return null;
    }
    if (!TG_HOSTS.includes(u.hostname.toLowerCase())) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    const params = new URLSearchParams();
    const isNum = (s) => /^\d+$/.test(s || '');
    let base;
    let rest;

    if (parts[0] === 'c' && isNum(parts[1])) {
      base = 'tg://privatepost';
      params.set('channel', parts[1]);
      rest = parts.slice(2);
      if (!rest.length) return null;
    } else if (/^[a-z][a-z0-9_]{3,}$/i.test(parts[0] || '') && parts[0].toLowerCase() !== 'joinchat') {
      base = 'tg://resolve';
      params.set('domain', parts[0]);
      rest = parts.slice(1);
    } else {
      return null;
    }

    if (rest.length > 2 || !rest.every(isNum)) return null;
    if (rest.length === 2) {
      params.set('post', rest[1]);
      params.set('thread', rest[0]);
    } else if (rest.length === 1) {
      params.set('post', rest[0]);
    }

    for (const key of ['thread', 'comment']) {
      const value = u.searchParams.get(key);
      if (isNum(value)) params.set(key, value);
    }
    return base + '?' + params.toString();
  }

  function openTelegram(topicUrl, inApp) {
    const tgUri = inApp ? toTgUri(topicUrl) : null;
    if (!tgUri) {
      window.open(topicUrl, '_blank', 'noopener');
      return;
    }
    // Внешний протокол не уводит со страницы — браузер лишь предлагает открыть приложение
    const a = document.createElement('a');
    a.href = tgUri;
    a.click();
  }

  // ---------- буфер обмена ----------

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const PLACEHOLDER_RE = /\{(\w+)\}/g;

  function tidy(text) {
    return text
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function renderPlain(template, data) {
    const text = template.replace(PLACEHOLDER_RE, (match, key) =>
      Object.prototype.hasOwnProperty.call(data, key) ? data[key] : match
    );
    return tidy(text);
  }

  // Telegram (Desktop и Web) при вставке подхватывает флейвор text/html,
  // поэтому название приезжает жирным; text/plain — фолбэк для всего остального.
  function renderHtml(template, data) {
    let out = '';
    let last = 0;
    let match;
    PLACEHOLDER_RE.lastIndex = 0;

    while ((match = PLACEHOLDER_RE.exec(template))) {
      out += escapeHtml(template.slice(last, match.index));
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = escapeHtml(data[key]);
        out += key === 'title' && value ? '<b>' + value + '</b>' : value;
      } else {
        out += escapeHtml(match[0]);
      }
      last = match.index + match[0].length;
    }
    out += escapeHtml(template.slice(last));

    return out
      .replace(/[ \t]+(?=\n|$)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .replace(/\n/g, '<br>');
  }

  // Кладёт в буфер оба флейвора через событие copy (нужен выделенный узел)
  function copyViaEvent(text, html) {
    let ok = false;
    const onCopy = (event) => {
      event.clipboardData.setData('text/plain', text);
      if (html) event.clipboardData.setData('text/html', html);
      event.preventDefault();
      ok = true;
    };

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();

    document.addEventListener('copy', onCopy, true);
    try {
      if (!document.execCommand('copy')) ok = false;
    } catch (e) {
      ok = false;
    }
    document.removeEventListener('copy', onCopy, true);
    ta.remove();
    return ok;
  }

  async function copyToClipboard(text, html) {
    if (html && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' })
          })
        ]);
        return true;
      } catch (e) {
        log('ClipboardItem не сработал, фолбэк на execCommand:', e && e.message);
      }
    }

    if (!html) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        log('writeText не сработал, фолбэк на execCommand:', e && e.message);
      }
    }

    return copyViaEvent(text, html);
  }

  // ---------- кнопки ----------

  function flash(btn, message, isError) {
    const label = btn.querySelector('.glmrh-label');
    const prev = label ? label.textContent : null;
    if (label) label.textContent = message;
    else btn.title = message;

    btn.classList.toggle('glmrh-error', !!isError);
    btn.classList.toggle('glmrh-done', !isError);
    setTimeout(() => {
      if (label) label.textContent = prev;
      btn.classList.remove('glmrh-done', 'glmrh-error');
    }, 1800);
  }

  function buildData(title, url) {
    const parsed = (() => {
      try {
        return new URL(url, location.origin);
      } catch (e) {
        return null;
      }
    })();
    const pathname = parsed ? parsed.pathname : location.pathname;
    const iidMatch = pathname.match(MR_PATH_RE);
    // branch и author есть только в DOM самой страницы MR
    const onMrPage = isMrPage() && getMrUrl() === url;

    return {
      title,
      url,
      iid: iidMatch ? iidMatch[1] : '',
      project: projectPathOf(pathname),
      branch: onMrPage ? getSourceBranch() : '',
      author: onMrPage ? getAuthor() : ''
    };
  }

  async function handleCopy(btn, event, title, url) {
    const settings = await getSettings();
    const template = (settings.template || DEFAULT_TEMPLATE);
    const data = buildData(title, url);

    const text = renderPlain(template, data);
    const html = settings.boldTitle ? renderHtml(template, data) : null;

    const copied = await copyToClipboard(text, html);
    if (!copied) {
      flash(btn, 'Не удалось скопировать', true);
      return;
    }

    // Shift+клик инвертирует настройку «открывать Telegram»
    const shouldOpen = event && event.shiftKey ? !settings.openTelegram : settings.openTelegram;
    const topicUrl = resolveTopicUrl(settings, url);

    if (shouldOpen && topicUrl) {
      openTelegram(topicUrl, settings.telegramApp);
      flash(btn, 'Скопировано, открываю Telegram');
    } else if (shouldOpen && !topicUrl) {
      flash(btn, 'Скопировано (топик не настроен)');
    } else {
      flash(btn, 'Скопировано');
    }
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'glmrh-btn glmrh-floating';
    btn.title = 'Скопировать название и ссылку MR (Shift+клик — инвертировать открытие Telegram)';
    btn.innerHTML =
      '<span class="glmrh-icon" aria-hidden="true">⧉</span>' +
      '<span class="glmrh-label">Копировать MR</span>';
    btn.addEventListener('click', (event) => handleCopy(btn, event, getMrTitle(), getMrUrl()));
    return btn;
  }

  function mount() {
    if (!isMrPage()) return;
    if (document.getElementById(BTN_ID)) return;

    const btn = buildButton();
    document.body.appendChild(btn);
    log('кнопка вставлена (плавающая, правый нижний угол)');
  }

  function unmountIfNotMr() {
    if (isMrPage()) return;
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
  }

  // ---------- список merge requests ----------

  function buildRowButton(title, url) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'glmrh-btn ' + ROW_BTN_CLASS;
    btn.title = 'Скопировать название и ссылку MR (Shift+клик — инвертировать открытие Telegram)';
    btn.innerHTML = '<span class="glmrh-icon" aria-hidden="true">⧉</span>';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleCopy(btn, event, title, url);
    });
    return btn;
  }

  function mountListButtons(enabled) {
    if (!enabled || isMrPage()) return;

    const links = document.querySelectorAll('a[href*="/-/merge_requests/"]');
    let added = 0;

    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!MR_LINK_RE.test(href)) continue;

      const row = link.closest('[data-testid="merge-request"], li, .issuable-info-container');
      const already = row
        ? row.querySelector('.' + ROW_BTN_CLASS)
        : link.nextElementSibling && link.nextElementSibling.classList.contains(ROW_BTN_CLASS);
      if (already) continue;

      const title = cleanTitle(link.textContent);
      if (!title) continue;

      // link.href уже абсолютный; отрезаем хвост вида /diffs, #note_1, ?tab=
      const url = link.href.replace(/(\/-\/merge_requests\/\d+).*$/, '$1');
      link.insertAdjacentElement('afterend', buildRowButton(title, url));
      added++;
    }

    if (added) log('кнопок в списке добавлено:', added);
  }

  function unmountListButtons() {
    document.querySelectorAll('.' + ROW_BTN_CLASS).forEach((btn) => btn.remove());
  }

  // ---------- жизненный цикл ----------

  let listButtonsEnabled = DEFAULTS.listButtons;
  let hotkeyEnabled = DEFAULTS.hotkey;
  let scheduled = false;

  function sync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      unmountIfNotMr();
      mount();
      if (listButtonsEnabled) mountListButtons(true);
      else unmountListButtons();
    });
  }

  getSettings().then((settings) => {
    listButtonsEnabled = !!settings.listButtons;
    hotkeyEnabled = !!settings.hotkey;
    sync();
  });

  // ---------- горячая клавиша Alt+Shift+C ----------

  let lastCopyAt = 0;

  function copyCurrentMr() {
    if (!isMrPage()) return;
    // Команда из background и локальный keydown могут прийти оба — не дублируем
    if (Date.now() - lastCopyAt < 700) return;
    lastCopyAt = Date.now();

    mount();
    const btn = document.getElementById(BTN_ID);
    if (btn) handleCopy(btn, null, getMrTitle(), getMrUrl());
  }

  document.addEventListener('keydown', (event) => {
    if (!hotkeyEnabled) return;
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    if ((event.code || '') !== 'KeyC') return;
    event.preventDefault();
    copyCurrentMr();
  }, true);

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'copy-mr') copyCurrentMr();
    });
  } catch (e) { /* messaging недоступен — остаётся локальный keydown */ }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.hotkey) hotkeyEnabled = !!changes.hotkey.newValue;
      if (changes.listButtons) {
        listButtonsEnabled = !!changes.listButtons.newValue;
        if (!listButtonsEnabled) unmountListButtons();
        sync();
      }
    });
  } catch (e) { /* storage недоступен — работаем на дефолтах */ }

  // GitLab перерисовывает шапку и список — держим кнопки на месте
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(sync, 50);
      return result;
    };
  }
  window.addEventListener('popstate', () => setTimeout(sync, 50));

  // GitLab дорисовывает содержимое асинхронно — несколько повторных попыток
  [0, 300, 1000, 2500].forEach((delay) => setTimeout(sync, delay));

  log('загружен на', location.pathname, '| MR-страница:', isMrPage());
  sync();
})();
