// Правила «путь проекта GitLab → ссылка» (топики Telegram, Jira).
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

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

  // rules — [{ project, url }]; pageUrl — адрес MR, по проекту которого ищем правило.
  // Выигрывает самое вложенное правило, если ни одно не подошло — fallback.
  function resolve(rules, fallback, pageUrl) {
    let host = location.host;
    let project = projectPathOf(location.pathname);
    try {
      const u = new URL(pageUrl, location.origin);
      host = u.host;
      project = projectPathOf(u.pathname);
    } catch (e) { /* остаёмся на текущей странице */ }

    project = project.toLowerCase();
    const withHost = (host + '/' + project).toLowerCase();
    let best = null;

    for (const rule of rules || []) {
      const pattern = normalizePattern(rule.project);
      const url = (rule.url || '').trim();
      if (!pattern || !url) continue;
      if (!ruleMatches(pattern, project) && !ruleMatches(pattern, withHost)) continue;

      // Чем длиннее (более вложенный) путь в правиле, тем выше приоритет
      const weight = pattern.split('/').length * 1000 + pattern.length;
      if (!best || weight > best.weight) best = { weight, url };
    }
    if (best) return best.url;
    return (fallback || '').trim();
  }

  DevHelper.rules = { projectPathOf, resolve };
})();
