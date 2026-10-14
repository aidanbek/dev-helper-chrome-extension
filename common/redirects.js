// Правила переходов «страница → другая страница»: части адреса текущей страницы подставляются в ссылку.
//   title  — название правила, текст пункта контекстного меню
//   page   — хост и путь страницы: "{env}.example.com/product/*-{id:num}";
//            "{имя}" — сегмент пути (в хосте — часть до точки), "{имя:num}" — число,
//            "*" — любые символы внутри сегмента; query и hash не учитываются, регистр не важен
//   target — ссылка с теми же переменными: "https://{env}-admin.example.com/products/{id}"
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

  const TOKEN_RE = /(\*|\{[a-z_][a-z0-9_]*(?::num)?\})/i;
  const VAR_RE = /\{([a-z_][a-z0-9_]*)\}/gi;
  const HOST_LITERAL_RE = /^[a-z0-9.:-]*$/i;

  function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Шаблон страницы -> { host, path, names, re } или null, если шаблон кривой
  function compilePage(value) {
    const pattern = (value || '').trim()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/\/+$/, '');
    const slash = pattern.indexOf('/');
    if (slash <= 0) return null;
    const host = pattern.slice(0, slash);
    const path = pattern.slice(slash);

    const names = [];
    const toSource = (part, inHost) => {
      return part.split(TOKEN_RE).map((token, i) => {
        if (i % 2 === 0) {
          // Литерал: в хосте — только допустимые символы, фигурные скобки без переменной — ошибка
          if (/[{}]/.test(token) || (inHost && !HOST_LITERAL_RE.test(token))) throw new Error('bad');
          return escapeRe(token);
        }
        if (token === '*') return inHost ? '[^./]*' : '[^/]*';
        const [name, type] = token.slice(1, -1).toLowerCase().split(':');
        if (names.includes(name)) throw new Error('bad');
        names.push(name);
        if (type === 'num') return '(\\d+)';
        return inHost ? '([^./]+)' : '([^/]+)';
      }).join('');
    };

    try {
      const source = toSource(host, true) + toSource(path, false);
      return { host, path, names, re: new RegExp('^' + source + '/?$', 'i') };
    } catch (e) {
      return null;
    }
  }

  // Ссылка — http(s), все её переменные есть в шаблоне страницы
  function isValidTarget(value, names) {
    const target = (value || '').trim();
    if (!/^https?:\/\/[^/]/i.test(target)) return false;
    if (!names) return true;
    return Array.from(target.matchAll(VAR_RE)).every((m) => names.includes(m[1].toLowerCase()));
  }

  function isValidRule(rule) {
    const page = compilePage(rule.page);
    return !!page && isValidTarget(rule.target, page.names);
  }

  function titleOf(rule) {
    const title = (rule.title || '').trim();
    if (title) return title;
    const host = (rule.target || '').trim().replace(/^https?:\/\//i, '').split('/')[0];
    return 'Открыть ' + host;
  }

  // Ссылка по одному правилу для адреса страницы; null — правило не подошло или кривое
  function apply(rule, pageUrl) {
    let candidate;
    try {
      const u = new URL(pageUrl);
      if (!/^https?:$/.test(u.protocol)) return null;
      candidate = u.host + u.pathname;
    } catch (e) {
      return null;
    }

    const page = compilePage(rule.page);
    if (!page || !isValidTarget(rule.target, page.names)) return null;
    const match = page.re.exec(candidate);
    if (!match) return null;

    const values = {};
    page.names.forEach((name, i) => { values[name] = match[i + 1]; });
    return rule.target.trim().replace(VAR_RE, (_, name) => values[name.toLowerCase()]);
  }

  // Все подошедшие правила по порядку: [{ index, title, url }]
  function resolveAll(rules, pageUrl) {
    const found = [];
    (rules || []).forEach((rule, index) => {
      const url = apply(rule, pageUrl);
      if (url) found.push({ index, title: titleOf(rule), url });
    });
    return found;
  }

  // Match patterns страниц правила — чтобы пункт контекстного меню был только там, где правило может сработать.
  // Шире самого правила ("*" в match pattern захватывает и "/", переменная в хосте — все поддомены),
  // точная проверка — в apply
  function urlPatterns(rule) {
    const page = compilePage(rule.page);
    if (!page || !isValidTarget(rule.target, page.names)) return [];

    let hostname = page.host.replace(/:\d+$/, '').toLowerCase();
    const labels = hostname.split('.');
    const dynamic = (label) => TOKEN_RE.test(label);
    if (labels.some(dynamic)) {
      // "{env}.example.com" -> "*.example.com" (покрывает и сам example.com); переменная глубже — любой хост
      const rest = labels.slice(1);
      hostname = dynamic(labels[0]) && rest.length && !rest.some(dynamic) ? '*.' + rest.join('.') : '*';
    }
    const path = page.path.split(TOKEN_RE).map((token, i) => (i % 2 ? '*' : token)).join('');
    return ['*://' + hostname + path + '*'];
  }

  DevHelper.redirects = { compilePage, isValidTarget, isValidRule, titleOf, apply, resolveAll, urlPatterns };
})();
