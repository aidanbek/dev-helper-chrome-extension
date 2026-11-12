// Фича «Cookie» в service worker: таблица cookie вкладки и её изменения.
// Окно расширения только присылает сообщения — cookie читает и меняет background (chrome.cookies).
//   { type: 'cookies.list', tabId }                       → { status, host, domains, cookies: [строка] }
//   { type: 'cookies.setValue', tabId, cookie, value }    → новое значение; остальные параметры — как были.
//                                                           Cookie нет, а строка из списка значений — создаётся
//   { type: 'cookies.add', tabId, cookie: { name, value, domain } } → новая сессионная cookie на пути /
//   { type: 'cookies.remove', tabId, cookie }             → удалить
//   { type: 'cookies.clear', tabId }                      → удалить все cookie, которые видит сайт → { ok, removed }
//   { type: 'cookies.clearCache', tabId }                 → очистить HTTP-кэш и Cache Storage источника вкладки
//   { type: 'cookies.addValue' / 'cookies.removeValue', tabId, cookie: { name, domain }, value } → список значений
// status: ok | disabled | unsupported (не http/https) | no-site (сайт не добавлен) | no-access
//
// Отвечаем только страницам расширения: значения HttpOnly cookie не должны попасть в контекст сайта.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('cookies');
  const { bareDomain, visibleOn, cookieUrl, parentDomains, sameKey } = DevHelper.cookies;

  // Лимит chrome.storage.sync на один ключ: все списки значений — одна настройка
  const ITEM_QUOTA = 8192;

  function getSettings() {
    return DevHelper.storage.getFeature(feature.id, feature.defaults);
  }

  function parseUrl(tab) {
    try {
      const url = new URL(tab.url || '');
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch (e) {
      return null;
    }
  }

  // Сайт вкладки добавлен в фичу и к нему есть доступ — или статус, почему нет
  async function siteOf(tab) {
    const settings = await getSettings();
    if (!settings.enabled) return { status: 'disabled' };
    const url = parseUrl(tab);
    if (!url) return { status: 'unsupported' };
    const host = url.hostname;
    if (!(settings.hosts || []).includes(host)) return { status: 'no-site', host };
    if (!(await DevHelper.sites.hasAccess(host))) return { status: 'no-access', host };
    return { status: 'ok', host, url, settings };
  }

  async function requireSite(tab) {
    const site = await siteOf(tab);
    if (site.status !== 'ok') throw new Error('cookie этого сайта недоступны (' + site.status + ')');
    return site;
  }

  // Все cookie, которые видит сайт: host-only и доменные, с любым путём
  async function visibleCookies(host) {
    return (await chrome.cookies.getAll({})).filter((cookie) => visibleOn(cookie, host));
  }

  function listsOf(settings) {
    return Array.isArray(settings.values) ? settings.values : [];
  }

  function row(cookie, list) {
    const values = list ? list.values : [];
    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      hostOnly: cookie.hostOnly,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session: cookie.session,
      expirationDate: cookie.session ? null : cookie.expirationDate,
      storeId: cookie.storeId,
      values,
      active: values.indexOf(cookie.value),
      absent: false
    };
  }

  // Строка списка значений, для которого cookie на сайте сейчас нет: клик по значению её создаст
  function absentRow(list) {
    return {
      name: list.name, value: null, domain: list.domain, hostOnly: !list.domain.startsWith('.'),
      path: '/', values: list.values, active: -1, absent: true
    };
  }

  // Сначала cookie со списком значений, внутри каждой группы — по алфавиту
  function compareRows(a, b) {
    return (b.values.length > 0) - (a.values.length > 0) ||
      a.name.localeCompare(b.name) || a.path.localeCompare(b.path) || a.domain.localeCompare(b.domain);
  }

  async function table(tab) {
    const site = await siteOf(tab);
    if (site.status !== 'ok') return site;
    const { host, settings } = site;
    const lists = listsOf(settings);
    const cookies = await visibleCookies(host);

    const rows = cookies.map((cookie) => row(cookie, lists.find((item) => sameKey(item, cookie))));
    for (const item of lists) {
      const shown = { domain: item.domain, hostOnly: !item.domain.startsWith('.') };
      if (visibleOn(shown, host) && !cookies.some((cookie) => sameKey(item, cookie))) rows.push(absentRow(item));
    }
    rows.sort(compareRows);

    return {
      status: 'ok',
      host,
      domains: [host, ...parentDomains(host).map((domain) => '.' + domain)],
      cookies: rows
    };
  }

  // Та же cookie среди видимых сайту: имя, домен, путь и хранилище
  function findCookie(cookies, target) {
    return cookies.find((cookie) => sameKey(cookie, target) && cookie.path === (target.path || '/') &&
      (!target.storeId || cookie.storeId === target.storeId)) || null;
  }

  async function setCookie(details, name) {
    let saved = null;
    let reason = 'Chrome отказал';
    try {
      saved = await chrome.cookies.set(details);
    } catch (e) {
      reason = e.message;
    }
    if (!saved) throw new Error('cookie ' + name + ' не сохранена: ' + reason);
  }

  async function setValue(tab, target, value) {
    const site = await requireSite(tab);
    const existing = findCookie(await visibleCookies(site.host), target);
    const text = String(value ?? '');

    if (existing) {
      // Только значение: домен, путь, срок и флаги — как были
      const details = {
        url: cookieUrl(existing),
        name: existing.name,
        value: text,
        path: existing.path,
        secure: existing.secure,
        httpOnly: existing.httpOnly,
        sameSite: existing.sameSite,
        storeId: existing.storeId
      };
      // host-only cookie — без domain, иначе Chrome сделает её доменной
      if (!existing.hostOnly) details.domain = existing.domain;
      if (!existing.session) details.expirationDate = existing.expirationDate;
      if (existing.partitionKey) details.partitionKey = existing.partitionKey;
      await setCookie(details, existing.name);
    } else {
      // Cookie нет — создаём, только если для неё есть список значений: сессионная, путь /, без флагов
      const lists = listsOf(site.settings);
      if (!lists.some((item) => sameKey(item, target))) throw new Error('cookie ' + target.name + ' уже нет — обновите таблицу');
      await addCookie(tab, { name: target.name, value: text, domain: target.domain }, site);
    }
    return { ok: true };
  }

  // Новая cookie: сессионная, путь /, без флагов. Домен — хост вкладки (host-only) или его родитель (".example.com")
  async function addCookie(tab, input, knownSite) {
    const site = knownSite || (await requireSite(tab));
    const host = site.host;
    const name = String(input.name || '').trim();
    if (!name) throw new Error('укажите имя cookie');
    if (/[\s;=,]/.test(name)) throw new Error('в имени cookie не может быть пробелов, «;», «=» и «,»');

    const raw = String(input.domain || '').trim().toLowerCase();
    const hostOnly = !raw || raw === host;
    const domain = hostOnly ? host : bareDomain(raw);
    if (!hostOnly && !(host === domain || host.endsWith('.' + domain))) {
      throw new Error('домен ' + domain + ' не подходит к сайту ' + host);
    }
    const key = { name, domain: hostOnly ? host : '.' + domain, path: '/' };
    if (!knownSite && findCookie(await visibleCookies(host), key)) {
      throw new Error('cookie ' + name + ' уже есть — измените её значение в таблице');
    }

    const details = { url: site.url.protocol + '//' + domain + '/', name, value: String(input.value ?? ''), path: '/' };
    if (!hostOnly) details.domain = domain;
    await setCookie(details, name);
    return { ok: true };
  }

  async function removeCookie(tab, target) {
    const site = await requireSite(tab);
    const existing = findCookie(await visibleCookies(site.host), target);
    if (existing) {
      await chrome.cookies.remove({ url: cookieUrl(existing), name: existing.name, storeId: existing.storeId });
    }
    return { ok: true };
  }

  // Все cookie, которые видит сайт, — и доменные (".example.com"): их видят и другие поддомены.
  // Списки значений не трогаем
  async function clearCookies(tab) {
    const site = await requireSite(tab);
    const cookies = await visibleCookies(site.host);
    await Promise.all(cookies.map((cookie) =>
      chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name, storeId: cookie.storeId })));
    return { ok: true, removed: cookies.length };
  }

  // Кэш браузера только для источника вкладки (схема + хост + порт): HTTP-кэш и Cache Storage сервис-воркеров
  async function clearCache(tab) {
    const site = await requireSite(tab);
    await chrome.browsingData.remove({ origins: [site.url.origin] }, { cache: true, cacheStorage: true });
    return { ok: true };
  }

  // ---------- списки значений ----------

  async function saveLists(lists) {
    const size = new TextEncoder().encode(feature.id + '.values' + JSON.stringify(lists)).length;
    if (size > ITEM_QUOTA) {
      throw new Error('списки значений больше лимита chrome.storage.sync (8 КБ) — удалите лишние');
    }
    await DevHelper.storage.setFeature(feature.id, { values: lists });
  }

  async function addValue(tab, target, value) {
    const site = await requireSite(tab);
    const text = String(value ?? '');
    const key = { name: String(target.name || ''), domain: String(target.domain || '') };
    if (!key.name || !key.domain) throw new Error('неизвестная cookie');
    const lists = listsOf(site.settings).map((item) => ({ ...item, values: item.values.slice() }));
    let item = lists.find((entry) => sameKey(entry, key));
    if (!item) {
      item = { ...key, values: [] };
      lists.push(item);
    }
    if (!item.values.includes(text)) item.values.push(text);
    await saveLists(lists);
    return { ok: true };
  }

  async function removeValue(tab, target, value) {
    const site = await requireSite(tab);
    const lists = listsOf(site.settings)
      .map((item) => (sameKey(item, target) ? { ...item, values: item.values.filter((v) => v !== value) } : item))
      .filter((item) => item.values.length);
    await saveLists(lists);
    return { ok: true };
  }

  // ---------- сообщения ----------

  // Страница расширения (окно по иконке), а не content script: у content script sender.url — адрес сайта
  function fromExtensionPage(sender) {
    return sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL(''));
  }

  async function handle(message) {
    const tab = await chrome.tabs.get(message.tabId);
    const cookie = message.cookie || {};
    switch (message.type) {
      case 'cookies.list': return table(tab);
      case 'cookies.setValue': return setValue(tab, cookie, message.value);
      case 'cookies.add': return addCookie(tab, cookie);
      case 'cookies.remove': return removeCookie(tab, cookie);
      case 'cookies.clear': return clearCookies(tab);
      case 'cookies.clearCache': return clearCache(tab);
      case 'cookies.addValue': return addValue(tab, cookie, message.value);
      case 'cookies.removeValue': return removeValue(tab, cookie, message.value);
      default: throw new Error('неизвестное сообщение ' + message.type);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('cookies.')) return false;
    if (!fromExtensionPage(sender)) return false;
    handle(message).then(sendResponse, (e) => {
      DevHelper.log('cookie:', e && e.message);
      sendResponse({ error: (e && e.message) || String(e) });
    });
    return true;
  });

  DevHelper.cookiesBackground = { table, setValue, addCookie, removeCookie, clearCookies, clearCache, addValue, removeValue };
})();
