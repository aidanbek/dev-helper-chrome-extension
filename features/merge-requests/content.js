// Фича «Merge requests»: кнопка копирования на странице MR и в списках MR.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('mergeRequests');
  const log = DevHelper.log;

  const BTN_ID = 'glmrh-copy-btn';
  const JIRA_BTN_ID = 'glmrh-jira-btn';
  const ROW_BTN_CLASS = 'glmrh-row-btn';
  const ACTIONS_ID = 'glmrh-actions';

  const MR_PATH_RE = /\/-\/merge_requests\/(\d+)/;
  const MR_LINK_RE = /\/-\/merge_requests\/\d+(?:[?#]|$)/;

  const TITLE_SELECTORS = [
    '[data-testid="title-content"]',
    'h1.merge-request-title-text',
    '.merge-request-details h1.title',
    '.detail-page-description h1.title',
    '.detail-page-header h1',
    'h1.title'
  ];

  function getSettings() {
    return DevHelper.storage.getFeature(feature.id, feature.defaults);
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

  // Префиксы, по которым GitLab считает MR черновиком (включая устаревшие WIP)
  const DRAFT_TITLE_RE = /^\s*(?:\[draft\]|\(draft\)|draft:|draft\s+-\s|\[wip\]|\(wip\)|wip:)/i;

  function isDraftTitle(title) {
    return DRAFT_TITLE_RE.test(title || '');
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

  // ---------- автор MR ----------

  // <a class="author-link" data-username="aidanbek" href="/aidanbek"> — username, а не отображаемое имя
  function usernameOf(link) {
    if (!link) return '';
    const fromData = link.getAttribute('data-username');
    if (fromData) return fromData.toLowerCase();
    const href = link.getAttribute('href') || '';
    const m = href.match(/^(?:https?:\/\/[^/]+)?\/([^/?#]+)\/?$/);
    return m ? decodeURIComponent(m[1]).toLowerCase() : '';
  }

  function getAuthorUsername() {
    return usernameOf(document.querySelector(
      '.merge-request-author-container .author-link, [data-testid="author-link"], .detail-page-header .author-link'
    ));
  }

  function getRowAuthorUsername(row) {
    if (!row) return '';
    return usernameOf(row.querySelector(
      '[data-testid="issuable-author"], .issuable-authored .author-link, .author-link'
    ));
  }

  // "@aidanbek, other" -> ['aidanbek', 'other']
  function parseUsernames(value) {
    return (value || '')
      .split(/[\s,;]+/)
      .map((name) => name.replace(/^@/, '').trim().toLowerCase())
      .filter(Boolean);
  }

  // Username не указан — кнопки на всех MR. Автора не удалось определить — тоже показываем:
  // лучше лишняя кнопка, чем пропавшая из-за изменившейся разметки GitLab.
  function isOwnMr(author) {
    if (!myUsernames.length || !author) return true;
    return myUsernames.includes(author);
  }

  // ---------- правила по проектам ----------

  const projectPathOf = DevHelper.rules.projectPathOf;

  function resolveTopicUrl(settings, mrUrl) {
    return DevHelper.rules.resolve(settings.rules, settings.defaultTopicUrl, mrUrl);
  }

  // Ключ задачи Jira: CC-123. Только заглавные — как в Jira; «release-1» в ветке не примем за задачу
  const JIRA_KEY_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9_]+-[1-9]\d*)(?!\d)/;

  function findJiraKey(text) {
    const m = (text || '').match(JIRA_KEY_RE);
    return m ? m[1] : '';
  }

  // https://jira.example.com, https://jira.example.com/browse/ -> https://jira.example.com/browse/CC-123
  function jiraIssueUrl(base, key) {
    return base.replace(/\/+$/, '').replace(/\/browse$/i, '') + '/browse/' + key;
  }

  // ---------- шаблон ----------

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

  // ---------- кнопки ----------

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICON_COPY = 'copy-to-clipboard';
  const ICON_EXTERNAL = 'external-link';

  // Фолбэк, если спрайт иконок GitLab на странице не нашёлся
  const FALLBACK_ICON_PATHS = {
    [ICON_COPY]:
      'M5 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V2Zm2-.5h6a.5.5 0 0 1 .5.5v8' +
      'a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5ZM3.5 4H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6' +
      'a2 2 0 0 0 2-2v-.5H9.5v.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5h.5V4Z',
    [ICON_EXTERNAL]:
      'M9 1.75A.75.75 0 0 1 9.75 1h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V3.56L8.53 8.53a.75.75 ' +
      '0 0 1-1.06-1.06l4.97-4.97H9.75A.75.75 0 0 1 9 1.75ZM3.5 3A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8' +
      'a1.5 1.5 0 0 0 1.5-1.5V10a.75.75 0 0 0-1.5 0v2.5h-8v-8H6A.75.75 0 0 0 6 3H3.5Z'
  };

  // /assets/icons-<hash>.svg — берём у любой иконки GitLab на странице
  function iconSprite() {
    const use = document.querySelector('svg use[href*=".svg#"]');
    return use ? use.getAttribute('href').split('#')[0] : '';
  }

  function buildIcon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 's16 gl-icon gl-button-icon');
    svg.setAttribute('aria-hidden', 'true');

    const sprite = iconSprite();
    if (sprite) {
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', sprite + '#' + name);
      svg.appendChild(use);
    } else {
      svg.setAttribute('viewBox', '0 0 16 16');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('fill-rule', 'evenodd');
      path.setAttribute('d', FALLBACK_ICON_PATHS[name]);
      svg.appendChild(path);
    }
    return svg;
  }

  function setIcon(btn, name) {
    const use = btn.querySelector('svg use');
    if (use) use.setAttribute('href', use.getAttribute('href').split('#')[0] + '#' + name);
  }

  function flash(btn, message, isError) {
    const label = btn.querySelector('.gl-button-text');
    if (label) label.textContent = message;
    btn.setAttribute('aria-label', message);
    setIcon(btn, isError ? 'error' : 'check');

    btn.classList.toggle('glmrh-error', !!isError);
    btn.classList.toggle('glmrh-done', !isError);
    clearTimeout(btn._glmrhFlash);
    btn._glmrhFlash = setTimeout(() => {
      btn.classList.remove('glmrh-done', 'glmrh-error');
      setIcon(btn, ICON_COPY);
      renderButton(btn);
    }, 1800);
  }

  // ---------- название кнопки ----------

  const LABEL_SHARE = 'Отправить на ревью';
  const LABEL_COPY = 'Скопировать ссылку на MR';
  const HINT_COPY = 'Скопировать название и ссылку MR';
  const HINT_DRAFT = 'MR в статусе Draft — снимите его, чтобы отправить на ревью';

  // Название зависит от того, что сделает клик: настройка «открывать Telegram»,
  // найден ли топик для проекта этой MR и зажат ли Shift (он инвертирует настройку)
  function describeAction(url, shiftKey) {
    const current = settings || feature.defaults;
    const topicUrl = resolveTopicUrl(current, url);
    const opens = shiftKey ? !current.openTelegram : !!current.openTelegram;

    if (opens && topicUrl) {
      return {
        label: LABEL_SHARE,
        hint: HINT_COPY + ' и открыть топик в Telegram' + (shiftKey ? '' : '. Shift+клик — только скопировать')
      };
    }
    if (opens) {
      return { label: LABEL_COPY, hint: HINT_COPY + '. Топик в Telegram для этого проекта не настроен' };
    }
    return {
      label: LABEL_COPY,
      hint: HINT_COPY + (topicUrl && !shiftKey ? '. Shift+клик — ещё и открыть топик в Telegram' : '')
    };
  }

  // GitLab при показе тултипа переносит title в data-original-title — обновляем оба
  function setTooltip(btn, text) {
    if (btn.hasAttribute('data-original-title')) btn.setAttribute('data-original-title', text);
    else btn.title = text;
  }

  function renderButton(btn) {
    // Не перебиваем «Скопировано…», пока оно на экране
    if (btn.classList.contains('glmrh-done') || btn.classList.contains('glmrh-error')) return;

    const url = btn.dataset.glmrhUrl || getMrUrl();
    const { label, hint } = describeAction(url, shiftHeld && hoveredBtn === btn);
    const text = btn.querySelector('.gl-button-text');
    if (text) text.textContent = label;
    btn.setAttribute('aria-label', label);
    setTooltip(btn, btn.disabled ? HINT_DRAFT : hint);
  }

  // Draft-MR на ревью не отправляем: кнопка неактивна, пока статус не снимут
  function setDraft(btn, isDraft) {
    if (btn.disabled === isDraft) return;
    btn.disabled = isDraft;
    btn.classList.toggle('disabled', isDraft);
    renderButton(btn);
  }

  function renderAllButtons() {
    const page = document.getElementById(BTN_ID);
    if (page) renderButton(page);
    const jira = document.getElementById(JIRA_BTN_ID);
    if (jira) renderJiraButton(jira);
    document.querySelectorAll('.' + ROW_BTN_CLASS).forEach(renderButton);
  }

  // Shift меняет название только у кнопки под курсором — иначе шапка мигала бы при наборе текста
  let shiftHeld = false;
  let hoveredBtn = null;

  function trackHover(btn) {
    btn.addEventListener('mouseenter', () => {
      hoveredBtn = btn;
      renderButton(btn);
    });
    btn.addEventListener('mouseleave', () => {
      if (hoveredBtn === btn) hoveredBtn = null;
      renderButton(btn);
    });
  }

  function setShift(value) {
    if (shiftHeld === value) return;
    shiftHeld = value;
    if (hoveredBtn) renderButton(hoveredBtn);
  }

  document.addEventListener('keydown', (event) => { if (event.key === 'Shift') setShift(true); }, true);
  document.addEventListener('keyup', (event) => { if (event.key === 'Shift') setShift(false); }, true);
  window.addEventListener('blur', () => setShift(false));

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
    if (btn.disabled) return;
    const settings = await getSettings();
    const template = settings.template || feature.defaults.template;
    const data = buildData(title, url);

    const text = renderPlain(template, data);
    const html = settings.boldTitle ? renderHtml(template, data) : null;

    const copied = await DevHelper.clipboard.write(text, html);
    if (!copied) {
      flash(btn, 'Не удалось скопировать', true);
      return;
    }

    // Shift+клик инвертирует настройку «открывать Telegram»
    const shouldOpen = event && event.shiftKey ? !settings.openTelegram : settings.openTelegram;
    const topicUrl = resolveTopicUrl(settings, url);

    if (shouldOpen && topicUrl) {
      DevHelper.telegram.open(topicUrl, settings.telegramApp);
      flash(btn, 'Скопировано, открываю Telegram');
    } else if (shouldOpen && !topicUrl) {
      flash(btn, 'Скопировано (топик не настроен)');
    } else {
      flash(btn, 'Скопировано');
    }
  }

  // Кнопка в стиле GitLab UI (gl-button) — стили берутся у самого GitLab
  function buildButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'gl-button btn btn-md btn-default glmrh-page-btn has-tooltip';
    btn.setAttribute('data-placement', 'bottom');
    btn.setAttribute('data-container', 'body');

    const label = document.createElement('span');
    label.className = 'gl-button-text';
    btn.append(buildIcon(ICON_COPY), label);

    btn.addEventListener('click', (event) => handleCopy(btn, event, getMrTitle(), getMrUrl()));
    trackHover(btn);
    renderButton(btn);
    return btn;
  }

  // ---------- кнопка «Открыть задачу в Jira» ----------

  const LABEL_JIRA = 'Открыть задачу в Jira';
  const HINT_JIRA_NO_KEY = 'Ключ задачи Jira (например CC-123) не найден ни в ветке, ни в названии MR';
  const HINT_JIRA_NO_URL = 'Jira для этого проекта не настроена — укажите URL в настройках расширения';

  // Ключ ищем сначала в исходной ветке, затем в названии MR
  function describeJira() {
    const current = settings || feature.defaults;
    const key = findJiraKey(getSourceBranch()) || findJiraKey(getMrTitle());
    if (!key) return { hint: HINT_JIRA_NO_KEY };

    const base = DevHelper.rules.resolve(current.jiraRules, current.defaultJiraUrl, getMrUrl());
    if (!base) return { hint: HINT_JIRA_NO_URL };

    const url = jiraIssueUrl(base, key);
    return { url, hint: 'Открыть ' + key + ' в Jira' };
  }

  // Ветка дорисовывается асинхронно — перерисовываем на каждом sync.
  // Меняем только атрибуты: их MutationObserver не слушает, иначе sync зациклился бы
  function renderJiraButton(link) {
    const { url, hint } = describeJira();
    if (url) {
      if (link.getAttribute('href') !== url) link.setAttribute('href', url);
    } else if (link.hasAttribute('href')) {
      link.removeAttribute('href');
    }
    link.classList.toggle('glmrh-disabled', !url);
    link.setAttribute('aria-disabled', String(!url));
    setTooltip(link, hint);
  }

  // Ссылка, а не кнопка: работают средний клик и «открыть в новой вкладке».
  // Неактивное состояние — своим классом: у .btn.disabled GitLab отключает pointer-events и тултип
  function buildJiraButton() {
    const link = document.createElement('a');
    link.id = JIRA_BTN_ID;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'gl-button btn btn-md btn-default has-tooltip';
    link.setAttribute('data-placement', 'bottom');
    link.setAttribute('data-container', 'body');
    link.setAttribute('aria-label', LABEL_JIRA);

    const label = document.createElement('span');
    label.className = 'gl-button-text';
    label.textContent = LABEL_JIRA;
    link.append(buildIcon(ICON_EXTERNAL), label);

    renderJiraButton(link);
    return link;
  }

  // Ряд кнопок встаёт между строкой «X requested to merge … into …» и вкладками MR.
  // Липкий дубль шапки (#js-merge-sticky-header) пропускаем.
  function findHeaderAnchor() {
    const candidates = document.querySelectorAll(
      '.merge-request-details .merge-request-tabs-container, .merge-request-tabs-holder, .merge-request-tabs-container'
    );
    for (const el of candidates) {
      if (!el.closest('#js-merge-sticky-header')) return el;
    }
    return null;
  }

  function ensureActions(anchor) {
    let actions = document.getElementById(ACTIONS_ID);
    if (!actions) {
      actions = document.createElement('div');
      actions.id = ACTIONS_ID;
      actions.className = 'glmrh-actions';
    }
    if (actions.nextElementSibling !== anchor) anchor.insertAdjacentElement('beforebegin', actions);
    return actions;
  }

  function removeById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function mount() {
    const showCopy = showOnThisMr();
    const showJira = jiraOnThisMr();
    if (!showCopy) removeById(BTN_ID);
    if (!showJira) removeById(JIRA_BTN_ID);

    let btn = document.getElementById(BTN_ID);
    let jira = document.getElementById(JIRA_BTN_ID);
    const anchor = findHeaderAnchor();

    if (anchor && (showCopy || showJira)) {
      const actions = ensureActions(anchor);

      if (showCopy) {
        if (!btn) btn = buildButton();
        if (btn.parentElement !== actions) {
          btn.classList.remove('glmrh-floating');
          actions.prepend(btn);
          log('кнопка вставлена в шапку MR');
        }
      }
      if (showJira) {
        if (!jira) jira = buildJiraButton();
        if (jira.parentElement !== actions) {
          actions.appendChild(jira);
          log('кнопка Jira вставлена в шапку MR');
        }
      }
    } else if (showCopy && !btn) {
      // Разметка GitLab не распознана — плавающая кнопка в правом нижнем углу (Jira без шапки не показываем)
      btn = buildButton();
      btn.classList.add('glmrh-floating');
      document.body.appendChild(btn);
      log('шапка MR не найдена, кнопка вставлена плавающей');
    }

    const actions = document.getElementById(ACTIONS_ID);
    if (actions && !actions.children.length) actions.remove();

    if (btn) setDraft(btn, isDraftTitle(getMrTitle()));
    if (jira) renderJiraButton(jira);
  }

  function unmount() {
    for (const id of [BTN_ID, JIRA_BTN_ID, ACTIONS_ID]) removeById(id);
  }

  // ---------- список merge requests ----------

  // Иконка-кнопка как у «Copy branch name» в шапке MR
  function buildRowButton(link, title, url) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gl-button btn btn-icon btn-sm btn-default btn-default-tertiary ' + ROW_BTN_CLASS + ' has-tooltip';
    btn.dataset.glmrhUrl = url;
    btn._glmrhLink = link;
    btn.setAttribute('data-container', 'body');
    btn.appendChild(buildIcon(ICON_COPY));
    trackHover(btn);
    setDraft(btn, isDraftTitle(title));
    renderButton(btn);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleCopy(btn, event, title, url);
    });
    return btn;
  }

  function mountListButtons() {
    if (isMrPage()) return;

    const links = document.querySelectorAll('a[href*="/-/merge_requests/"]');
    let added = 0;

    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!MR_LINK_RE.test(href)) continue;

      const row = link.closest('[data-testid="merge-request"], li, .issuable-info-container');
      const existing = row
        ? row.querySelector('.' + ROW_BTN_CLASS)
        : link.nextElementSibling && link.nextElementSibling.classList.contains(ROW_BTN_CLASS)
          ? link.nextElementSibling
          : null;

      if (!isOwnMr(getRowAuthorUsername(row))) {
        if (existing) existing.remove();
        continue;
      }
      if (existing) {
        // В строке бывает несколько ссылок на MR (например, счётчик комментариев) — статус берём по названию
        if (existing._glmrhLink === link) setDraft(existing, isDraftTitle(link.textContent));
        continue;
      }

      const title = cleanTitle(link.textContent);
      if (!title) continue;

      // link.href уже абсолютный; отрезаем хвост вида /diffs, #note_1, ?tab=
      const url = link.href.replace(/(\/-\/merge_requests\/\d+).*$/, '$1');
      link.insertAdjacentElement('afterend', buildRowButton(link, title, url));
      added++;
    }

    if (added) log('кнопок в списке добавлено:', added);
  }

  function unmountListButtons() {
    document.querySelectorAll('.' + ROW_BTN_CLASS).forEach((btn) => btn.remove());
  }

  // ---------- жизненный цикл ----------

  // До загрузки настроек ничего не вставляем — иначе у выключенной фичи мелькнёт кнопка
  let settings = null;
  let enabled = false;
  let listButtonsEnabled = feature.defaults.listButtons;
  let hotkeyEnabled = feature.defaults.hotkey;
  let jiraButtonEnabled = feature.defaults.jiraButton;
  let myUsernames = [];
  let scheduled = false;

  function showOnThisMr() {
    return enabled && isMrPage() && isOwnMr(getAuthorUsername());
  }

  // Задачу полезно открыть и при ревью чужой MR — фильтр «Только мои MR» не применяем
  function jiraOnThisMr() {
    return enabled && isMrPage() && jiraButtonEnabled;
  }

  function applySettings(values) {
    settings = { ...(settings || feature.defaults), ...values };
    if ('enabled' in values) enabled = !!values.enabled;
    if ('hotkey' in values) hotkeyEnabled = !!values.hotkey;
    if ('listButtons' in values) listButtonsEnabled = !!values.listButtons;
    if ('jiraButton' in values) jiraButtonEnabled = !!values.jiraButton;
    if ('myUsername' in values) {
      myUsernames = parseUsernames(values.myUsername);
      // Фильтр поменялся — перестраиваем кнопки списка с нуля
      unmountListButtons();
    }
  }

  function sync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (showOnThisMr() || jiraOnThisMr()) mount();
      else unmount();
      if (enabled && listButtonsEnabled) mountListButtons();
      else unmountListButtons();
    });
  }

  getSettings().then((settings) => {
    applySettings(settings);
    sync();
  });

  // ---------- горячая клавиша Alt+Shift+C ----------

  let lastCopyAt = 0;

  function copyCurrentMr() {
    if (!showOnThisMr()) return;
    // Команда из background и локальный keydown могут прийти оба — не дублируем
    if (Date.now() - lastCopyAt < 700) return;
    lastCopyAt = Date.now();

    mount();
    const btn = document.getElementById(BTN_ID);
    if (btn && !btn.disabled) handleCopy(btn, null, getMrTitle(), getMrUrl());
  }

  document.addEventListener('keydown', (event) => {
    if (!enabled || !hotkeyEnabled) return;
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    if ((event.code || '') !== 'KeyC') return;
    event.preventDefault();
    copyCurrentMr();
  }, true);

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'command' && message.command === 'copy-mr') copyCurrentMr();
    });
  } catch (e) { /* messaging недоступен — остаётся локальный keydown */ }

  try {
    DevHelper.storage.onFeatureChanged(feature.id, (changes) => {
      applySettings(changes);
      // Telegram, топики, Jira — меняют название и ссылки уже вставленных кнопок
      renderAllButtons();
      sync();
    });
  } catch (e) { /* storage недоступен — работаем на дефолтах */ }

  // GitLab перерисовывает шапку и список — держим кнопки на месте.
  // characterData — Vue меняет название MR («Draft: …» после «Mark as ready») правкой текстового узла
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

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

  log('Merge requests: загружен на', location.pathname, '| MR-страница:', isMrPage());
  sync();
})();
