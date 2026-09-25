// Фича «Merge requests»: кнопка копирования на странице MR и в списках MR.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('mergeRequests');
  const log = DevHelper.log;

  const BTN_ID = 'glmrh-copy-btn';
  const JIRA_BTN_ID = 'glmrh-jira-btn';
  const STAGE_BTN_ID = 'glmrh-stage-btn';
  const ROW_BTN_CLASS = 'glmrh-row-btn';
  const ACTIONS_ID = 'glmrh-actions';
  const CONFLICT_ID = 'glmrh-conflict-warning';
  const STAGE_NOTICE_ID = 'glmrh-stage-notice';

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

  // <a class="author-link" data-username="jdoe" href="/jdoe"> — username, а не отображаемое имя
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

  // "@jdoe, other" -> ['jdoe', 'other']
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

  // Ключ задачи Jira: PROJ-123. Только заглавные — как в Jira; «release-1» в ветке не примем за задачу
  const JIRA_KEY_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9_]+-[1-9]\d*)(?!\d)/;

  function findJiraKey(text) {
    const m = (text || '').match(JIRA_KEY_RE);
    return m ? m[1] : '';
  }

  // https://jira.example.com, https://jira.example.com/browse/ -> https://jira.example.com/browse/PROJ-123
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
  const ICON_WARNING = 'warning-solid';
  const ICON_MERGE_REQUEST = 'merge-request';

  // Фолбэк, если спрайт иконок GitLab на странице не нашёлся
  const FALLBACK_ICON_PATHS = {
    [ICON_COPY]:
      'M5 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V2Zm2-.5h6a.5.5 0 0 1 .5.5v8' +
      'a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5ZM3.5 4H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6' +
      'a2 2 0 0 0 2-2v-.5H9.5v.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5h.5V4Z',
    [ICON_WARNING]:
      'M7.13 1.5a1 1 0 0 1 1.74 0l6.5 11.5a1 1 0 0 1-.87 1.5h-13a1 1 0 0 1-.87-1.5l6.5-11.5Z' +
      'M7.25 5.5h1.5V10h-1.5V5.5Zm0 5.75h1.5v1.5h-1.5v-1.5Z',
    [ICON_EXTERNAL]:
      'M9 1.75A.75.75 0 0 1 9.75 1h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V3.56L8.53 8.53a.75.75 ' +
      '0 0 1-1.06-1.06l4.97-4.97H9.75A.75.75 0 0 1 9 1.75ZM3.5 3A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8' +
      'a1.5 1.5 0 0 0 1.5-1.5V10a.75.75 0 0 0-1.5 0v2.5h-8v-8H6A.75.75 0 0 0 6 3H3.5Z',
    [ICON_MERGE_REQUEST]:
      'M4 1a2 2 0 1 0 0 4a2 2 0 1 0 0-4Zm0 1a1 1 0 1 1 0 2a1 1 0 1 1 0-2ZM3.5 5.5h1v5.5h-1ZM4 11a2 2 0 1 0 0 4' +
      'a2 2 0 1 0 0-4Zm0 1a1 1 0 1 1 0 2a1 1 0 1 1 0-2ZM12 11a2 2 0 1 0 0 4a2 2 0 1 0 0-4Zm0 1a1 1 0 1 1 0 2' +
      'a1 1 0 1 1 0-2ZM11.5 5.5h1V11h-1ZM8 4.5h4.5v1H8ZM8 2.5v5L5.5 5Z'
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
  const LABEL_APPROVED = 'MR апрувнут';
  const HINT_APPROVED = 'MR набрал нужное число апрувов и все треды решены — отправлять на ревью не нужно';

  // Почему кнопка неактивна: Draft — на ревью рано, пока статус не снимут;
  // апрувнут — на ревью уже не нужно, кнопка в состоянии success
  const BLOCKED_DRAFT = 'draft';
  const BLOCKED_APPROVED = 'approved';
  const HINT_CONFLICTS = 'В MR конфликты с целевой веткой — разрешите их перед отправкой на ревью';
  const HINT_CONFLICTS_OTHER = 'В MR конфликты с целевой веткой — автору нужно разрешить их перед мержем';

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

  // Тултипы GitLab (tooltips.vue) при первом наведении запоминают title у себя и переносят его
  // в data-original-title — дальнейшие правки атрибутов не видны, пока элемент не уберут из DOM.
  // Поэтому при смене текста переставляем элемент на то же место: GitLab сбрасывает запомненный
  // тултип (он следит за удалением узла) и при следующем наведении прочитает новый title
  function setTooltip(btn, text) {
    const tracked = btn.hasAttribute('data-original-title');
    const current = tracked ? btn.getAttribute('data-original-title') : btn.getAttribute('title');
    if (current === text) return;

    btn.title = text;
    if (!tracked) return;
    // При уничтожении тултип возвращает title из data-original-title — кладём туда тоже новый текст
    btn.setAttribute('data-original-title', text);
    if (btn.parentNode) btn.parentNode.insertBefore(btn, btn.nextSibling);
    reshowTooltip(btn);
  }

  // Курсор остался над элементом — после пересоздания тултипа показываем его снова.
  // GitLab подключает тултип на mouseenter асинхронно (Vue), поэтому событие шлём дважды: создать и показать
  function reshowTooltip(btn) {
    if (!btn.matches(':hover')) return;
    const enter = () => {
      if (btn.isConnected && btn.matches(':hover')) btn.dispatchEvent(new MouseEvent('mouseenter'));
    };
    setTimeout(enter, 0);
    setTimeout(enter, 100);
  }

  function renderButton(btn) {
    // Не перебиваем «Скопировано…», пока оно на экране
    if (btn.classList.contains('glmrh-done') || btn.classList.contains('glmrh-error')) return;

    const url = btn.dataset.glmrhUrl || getMrUrl();
    const blocked = btn._glmrhBlocked;
    const action = describeAction(url, shiftHeld && hoveredBtn === btn);
    const label = blocked === BLOCKED_APPROVED ? LABEL_APPROVED : action.label;
    const text = btn.querySelector('.gl-button-text');
    if (text) text.textContent = label;
    btn.setAttribute('aria-label', label);
    setTooltip(btn,
      blocked === BLOCKED_APPROVED ? HINT_APPROVED
        : blocked === BLOCKED_DRAFT ? HINT_DRAFT
          : btn._glmrhConflicts ? HINT_CONFLICTS + '. ' + action.hint
            : action.hint);
  }

  function setBlocked(btn, reason) {
    if (btn._glmrhBlocked === reason) return;
    btn._glmrhBlocked = reason;
    btn.disabled = !!reason;
    btn.classList.toggle('disabled', !!reason);
    btn.classList.toggle('glmrh-success', reason === BLOCKED_APPROVED);
    setIcon(btn, reason === BLOCKED_APPROVED ? 'check' : ICON_COPY);
    renderButton(btn);
  }

  // В списке MR апрувов в разметке нет — там гасим только Draft
  function blockReason(title, url) {
    if (isDraftTitle(title)) return BLOCKED_DRAFT;
    if (url && describeApproval(url).approved) return BLOCKED_APPROVED;
    return '';
  }

  function renderAllButtons() {
    const page = document.getElementById(BTN_ID);
    if (page) renderButton(page);
    const jira = document.getElementById(JIRA_BTN_ID);
    if (jira) renderJiraButton(jira);
    const stage = document.getElementById(STAGE_BTN_ID);
    if (stage) renderStageButton(stage);
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
  const HINT_JIRA_NO_KEY = 'Ключ задачи Jira (например PROJ-123) не найден ни в ветке, ни в названии MR';
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

  // ---------- апрув MR ----------

  // Всё берём из DOM страницы MR, без запросов: GitLab сам перерисовывает виджет апрувов
  // и счётчик тредов, а MutationObserver подхватывает изменения сразу.
  // Апрувнутый MR гасит «Отправить на ревью» и открывает «Создать MR на stage»

  function textOf(el) {
    return (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Сводка виджета апрувов: «Approved by» и аватары одобривших (у пользователя без аватара — identicon).
  // null — виджета нет на странице (он есть только на вкладке Overview)
  function readApprovals() {
    const summary = document.querySelector('[data-testid="approvals-summary-content"], .approvals-summary');
    if (!summary) return null;
    const users = new Set();
    summary.querySelectorAll('img.avatar, .gl-avatar').forEach((el) => {
      const link = el.closest('a[href]');
      users.add(link ? link.getAttribute('href') : el);
    });
    return users.size;
  }

  // Счётчик в шапке MR: «3 open threads» / «3 unresolved threads» / «All threads resolved!», в старых версиях «2/5 threads resolved».
  // Язык интерфейса любой — смотрим только на числа. null — обсуждения ещё не загружены
  function readUnresolved() {
    const counter = document.querySelector('[data-testid="discussions-counter-text"], .discussions-counter');
    if (!counter) {
      // Счётчика нет и когда в MR нет ни одного resolvable-треда — но это ясно, только если обсуждения уже на странице
      return document.querySelector('#notes-list, .main-notes-list') ? 0 : null;
    }
    const text = textOf(counter);
    const ratio = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (ratio) return Math.max(0, Number(ratio[2]) - Number(ratio[1]));
    const count = text.match(/\d+/);
    return count ? Number(count[0]) : 0;
  }

  // На вкладках Changes / Commits виджета апрувов может не быть — помним последнее увиденное по этому MR
  let approvalSeen = { url: '', approvals: null, unresolved: null };

  function readApprovalState(url) {
    if (approvalSeen.url !== url) approvalSeen = { url, approvals: null, unresolved: null };
    const approvals = readApprovals();
    const unresolved = readUnresolved();
    if (approvals !== null) approvalSeen.approvals = approvals;
    if (unresolved !== null) approvalSeen.unresolved = unresolved;
    return approvalSeen;
  }

  function minApprovals() {
    const value = parseInt((settings || feature.defaults).minApprovals, 10);
    return Number.isFinite(value) && value >= 0 ? value : feature.defaults.minApprovals;
  }

  // MR апрувнут: апрувов не меньше порога и нет нерешённых тредов.
  // blockers — что мешает так считать; пока данных нет на странице, MR апрувнутым не считается
  function describeApproval(url) {
    const seen = readApprovalState(url);
    const need = minApprovals();
    const blockers = [];
    if (need > 0 && seen.approvals === null) blockers.push('апрувы не видны — откройте вкладку Overview');
    else if (seen.approvals < need) blockers.push('апрувов ' + seen.approvals + ' из ' + need);
    if (seen.unresolved === null) blockers.push('треды ещё не загрузились — откройте вкладку Overview');
    else if (seen.unresolved) blockers.push('нерешённых тредов: ' + seen.unresolved);
    const known = !(need > 0 && seen.approvals === null) && seen.unresolved !== null;
    return { approved: !blockers.length, known, approvals: seen.approvals, blockers };
  }

  // ---------- кнопка «Создать MR на stage» ----------

  const HINT_STAGE_FORK = 'MR из форка — создайте MR на stage вручную';

  // «X requested to merge <source> into <target>»: цель — второй .ref-container шапки (липкий дубль пропускаем)
  function getTargetBranch() {
    const explicit = firstText(['[data-testid="target-branch"]', '.js-target-branch']);
    if (explicit) return explicit;
    const refs = Array.from(document.querySelectorAll('.ref-container'))
      .filter((el) => !el.closest('#js-merge-sticky-header'));
    return textOf(refs[1]);
  }

  function stageBranchFor(url) {
    const current = settings || feature.defaults;
    return DevHelper.rules.resolve(current.stageRules, current.defaultStageBranch, url);
  }

  // https://gitlab.example.com/group/project/-/merge_requests/new?merge_request[source_branch]=…&merge_request[target_branch]=stage
  function newMrUrl(mrUrl, source, target) {
    const u = new URL(mrUrl);
    const params = new URLSearchParams({
      'merge_request[source_branch]': source,
      'merge_request[target_branch]': target
    });
    return u.origin + '/' + projectPathOf(u.pathname) + '/-/merge_requests/new?' + params;
  }

  // url — можно создавать; иначе reason — что мешает.
  // hidden — кнопку не показываем: ветки в шапке не нашлись или MR и так нацелен в stage.
  // pending — апрувы или треды ещё не прочитаны со страницы, ответ может измениться
  function describeStage() {
    const mrUrl = getMrUrl();
    const target = stageBranchFor(mrUrl);
    const source = getSourceBranch();
    if (!target || !source) return { hidden: true, reason: 'не удалось определить ветки MR' };
    if (getTargetBranch() === target) return { hidden: true, reason: 'MR и так нацелен в ' + target };

    const label = 'Создать MR на ' + target;
    // У MR из форка исходная ветка в шапке — «namespace/project:branch»; двоеточие в имени ветки git не допускает
    if (source.includes(':')) return { label, hint: HINT_STAGE_FORK, reason: HINT_STAGE_FORK };

    const approval = describeApproval(mrUrl);
    const blockers = [];
    if (isDraftTitle(getMrTitle())) blockers.push('MR в статусе Draft');
    if (hasConflicts()) blockers.push('есть конфликты с целевой веткой');
    blockers.push(...approval.blockers);
    if (blockers.length) {
      const reason = blockers.join(', ');
      return { label, hint: 'Пока нельзя: ' + reason, reason, pending: !approval.known };
    }

    return {
      label,
      url: newMrUrl(mrUrl, source, target),
      hint: 'Открыть форму нового MR: ' + source + ' → ' + target
    };
  }

  // Как у Jira: пишем только при изменении, иначе MutationObserver зациклил бы sync
  function renderStageButton(link, info = describeStage()) {
    const { url, hint, label } = info;
    if (url) {
      if (link.getAttribute('href') !== url) link.setAttribute('href', url);
    } else if (link.hasAttribute('href')) {
      link.removeAttribute('href');
    }
    const text = link.querySelector('.gl-button-text');
    if (label && text.textContent !== label) text.textContent = label;
    if (label && link.getAttribute('aria-label') !== label) link.setAttribute('aria-label', label);
    link.classList.toggle('glmrh-disabled', !url);
    link.setAttribute('aria-disabled', String(!url));
    setTooltip(link, hint || '');
  }

  function buildStageButton(info) {
    const link = document.createElement('a');
    link.id = STAGE_BTN_ID;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'gl-button btn btn-md btn-default has-tooltip';
    link.setAttribute('data-placement', 'bottom');
    link.setAttribute('data-container', 'body');

    const label = document.createElement('span');
    label.className = 'gl-button-text';
    link.append(buildIcon(ICON_MERGE_REQUEST), label);

    renderStageButton(link, info);
    return link;
  }

  // ---------- «Залить на stage» из Jira ----------

  // Jira открывает MR с меткой DevHelper.STAGE_HASH. Ждём, пока со страницы прочитаются апрувы и треды,
  // и по условиям «Создать MR на stage» переходим в форму нового MR или пишем в шапке, что мешает
  const STAGE_REQUEST_WAIT = 20 * 1000;
  // Виджет MR дорисовывается частями: конфликты (merge checks) могут появиться чуть позже апрувов —
  // переходим, только если условия выполнены и не поменялись за это время
  const STAGE_REQUEST_SETTLE = 1500;
  const STAGE_REQUEST_POLL = 500;

  let stageRequest = null; // { url, since, readyAt, timer }
  let stageNotice = null; // { url, text }

  // Метку сразу убираем из адреса, чтобы обновление страницы не повторило переход
  function takeStageRequest() {
    if (!isMrPage() || location.hash !== DevHelper.STAGE_HASH) return;
    stageRequest = { url: getMrUrl(), since: Date.now(), readyAt: 0, timer: 0 };
    stageNotice = null;
    history.replaceState(history.state, '', location.pathname + location.search);
    log('MR открыт из Jira для заливки на stage');
  }

  // Повторная проверка по таймеру: к концу ожидания DOM может больше не меняться
  function recheckStageRequest(request) {
    if (request.timer) return;
    request.timer = setTimeout(() => {
      request.timer = 0;
      sync();
    }, STAGE_REQUEST_POLL);
  }

  function processStageRequest() {
    const url = getMrUrl();
    if (stageNotice && stageNotice.url !== url) stageNotice = null;
    const request = stageRequest;
    if (!request) return;
    if (request.url !== url) {
      stageRequest = null;
      return;
    }

    const info = describeStage();
    const now = Date.now();
    if (info.url) {
      if (!request.readyAt) request.readyAt = now;
      if (now - request.readyAt >= STAGE_REQUEST_SETTLE) {
        stageRequest = null;
        log('открываю форму MR на stage');
        location.assign(info.url);
        return;
      }
      recheckStageRequest(request);
      return;
    }

    request.readyAt = 0;
    if (info.pending && now - request.since < STAGE_REQUEST_WAIT) {
      recheckStageRequest(request);
      return;
    }
    stageRequest = null;
    stageNotice = { url, text: 'Залить на stage нельзя: ' + info.reason };
    log(stageNotice.text);
  }

  // Причина — текстом прямо в ряду кнопок (не в тултипе): её ждут сразу после перехода из Jira
  function renderStageNotice(actions) {
    const existing = document.getElementById(STAGE_NOTICE_ID);
    if (!actions || !stageNotice) {
      if (existing) existing.remove();
      return;
    }
    let notice = existing;
    if (!notice) {
      notice = document.createElement('span');
      notice.id = STAGE_NOTICE_ID;
      notice.className = 'glmrh-conflict-warning';
      notice.setAttribute('role', 'alert');
      notice.append(buildIcon(ICON_WARNING), document.createElement('span'));
    }
    const text = notice.lastElementChild;
    if (text.textContent !== stageNotice.text) text.textContent = stageNotice.text;
    if (actions.lastElementChild !== notice) actions.appendChild(notice);
  }

  // ---------- предупреждение о конфликтах ----------

  // Кнопка «Resolve conflicts» ведёт на /-/merge_requests/<iid>/conflicts и есть только при конфликтах.
  // Сам виджет GitLab опрашивает сервер, поэтому по DOM конфликт виден сразу и пропадает сразу.
  function domHasConflicts() {
    return !!document.querySelector('a[href*="/-/merge_requests/"][href$="/conflicts"]');
  }

  // Кнопки «Resolve conflicts» нет без прав на push и при свёрнутом списке проверок —
  // тогда спрашиваем widget.json (его же опрашивает виджет MR), не чаще раза в минуту
  const CONFLICTS_TTL = 60 * 1000;
  let conflictsState = { url: '', value: null, at: 0, pending: false };

  function refreshConflicts(url) {
    const state = conflictsState;
    if (state.url === url && (state.pending || Date.now() - state.at < CONFLICTS_TTL)) return;

    const next = { url, value: state.url === url ? state.value : null, at: Date.now(), pending: true };
    conflictsState = next;
    fetch(url + '/widget.json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((data) => {
        if (conflictsState !== next) return;
        next.pending = false;
        next.at = Date.now();
        if (data && typeof data.has_conflicts === 'boolean') next.value = data.has_conflicts;
        sync();
      });
  }

  function hasConflicts() {
    if (!isMrPage()) return false;
    if (domHasConflicts()) return true;
    return conflictsState.url === getMrUrl() && conflictsState.value === true;
  }

  function buildConflictWarning() {
    const warning = document.createElement('span');
    warning.id = CONFLICT_ID;
    warning.className = 'glmrh-conflict-warning has-tooltip';
    warning.setAttribute('role', 'status');
    warning.setAttribute('data-placement', 'bottom');
    warning.setAttribute('data-container', 'body');

    const label = document.createElement('span');
    label.textContent = 'Есть конфликты';
    warning.append(buildIcon(ICON_WARNING), label);
    return warning;
  }

  // Перерисовываем только при смене состояния: правка текста кнопки снова дёрнула бы MutationObserver
  function setConflicts(btn, value) {
    if (!!btn._glmrhConflicts === value) return;
    btn._glmrhConflicts = value;
    renderButton(btn);
  }

  // Предупреждение в ряду кнопок, только пока конфликты есть: сразу после «Отправить на ревью»,
  // а если её нет (чужой MR) — первым в ряду
  function renderConflictWarning(actions, btn) {
    const existing = document.getElementById(CONFLICT_ID);
    if (!actions) {
      if (existing) existing.remove();
      return;
    }
    const warning = existing || buildConflictWarning();
    // Своя MR — есть кнопка отправки на ревью; на чужой советовать «отправить на ревью» незачем
    const own = !!btn && btn.parentElement === actions;
    setTooltip(warning, own ? HINT_CONFLICTS : HINT_CONFLICTS_OTHER);
    if (own) {
      if (warning.previousElementSibling !== btn) btn.insertAdjacentElement('afterend', warning);
    } else if (actions.firstElementChild !== warning) {
      actions.prepend(warning);
    }
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

    refreshConflicts(getMrUrl());
    const conflicts = hasConflicts();

    const stageInfo = stageOnThisMr() ? describeStage() : { hidden: true };
    const showStage = !stageInfo.hidden;
    if (!showStage) removeById(STAGE_BTN_ID);

    processStageRequest();

    const inHeader = !!anchor && (showCopy || showJira || showStage || conflicts || !!stageNotice);

    if (inHeader) {
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
      if (showStage) {
        const stage = document.getElementById(STAGE_BTN_ID) || buildStageButton(stageInfo);
        // Последней в ряду (за ней — только уведомление о заливке), даже если Jira включили позже
        const last = actions.lastElementChild;
        const onPlace = last === stage || (last && last.id === STAGE_NOTICE_ID && last.previousElementSibling === stage);
        if (!onPlace) {
          actions.appendChild(stage);
          log('кнопка «Создать MR на stage» вставлена в шапку MR');
        }
        renderStageButton(stage, stageInfo);
      }
      renderConflictWarning(conflicts ? actions : null, btn);
      renderStageNotice(actions);
    } else if (showCopy && !btn) {
      // Разметка GitLab не распознана — плавающая кнопка в правом нижнем углу (Jira без шапки не показываем)
      btn = buildButton();
      btn.classList.add('glmrh-floating');
      document.body.appendChild(btn);
      log('шапка MR не найдена, кнопка вставлена плавающей');
    }

    if (!inHeader) {
      renderConflictWarning(null);
      renderStageNotice(null);
    }

    const actions = document.getElementById(ACTIONS_ID);
    if (actions && !actions.children.length) actions.remove();

    if (btn) {
      setBlocked(btn, blockReason(getMrTitle(), getMrUrl()));
      setConflicts(btn, conflicts);
    }
    if (jira) renderJiraButton(jira);
  }

  function unmount() {
    for (const id of [BTN_ID, JIRA_BTN_ID, STAGE_BTN_ID, CONFLICT_ID, STAGE_NOTICE_ID, ACTIONS_ID]) removeById(id);
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
    setBlocked(btn, blockReason(title));
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
        if (existing._glmrhLink === link) setBlocked(existing, blockReason(link.textContent));
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
  let stageButtonEnabled = feature.defaults.stageButton;
  let myUsernames = [];
  let scheduled = false;

  function showOnThisMr() {
    return enabled && isMrPage() && isOwnMr(getAuthorUsername());
  }

  // Задачу полезно открыть и при ревью чужой MR — фильтр «Только мои MR» не применяем
  function jiraOnThisMr() {
    return enabled && isMrPage() && jiraButtonEnabled;
  }

  // MR на stage создаёт и тот, кто мержит чужую MR, — фильтр «Только мои MR» не применяем
  function stageOnThisMr() {
    return enabled && isMrPage() && stageButtonEnabled;
  }

  function applySettings(values) {
    settings = { ...(settings || feature.defaults), ...values };
    if ('enabled' in values) enabled = !!values.enabled;
    if ('hotkey' in values) hotkeyEnabled = !!values.hotkey;
    if ('listButtons' in values) listButtonsEnabled = !!values.listButtons;
    if ('jiraButton' in values) jiraButtonEnabled = !!values.jiraButton;
    if ('stageButton' in values) stageButtonEnabled = !!values.stageButton;
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
      // Предупреждение о конфликтах — на любом MR, даже если обе кнопки скрыты
      if (enabled && isMrPage()) {
        takeStageRequest();
        mount();
      }
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
      // Telegram, топики, Jira, stage — меняют название и ссылки уже вставленных кнопок
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
  // Вернулись на вкладку — конфликты могли появиться или уйти, пока нас не было
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    conflictsState.at = 0;
    sync();
  });

  // GitLab дорисовывает содержимое асинхронно — несколько повторных попыток
  [0, 300, 1000, 2500].forEach((delay) => setTimeout(sync, delay));

  log('Merge requests: загружен на', location.pathname, '| MR-страница:', isMrPage());
  sync();
})();
