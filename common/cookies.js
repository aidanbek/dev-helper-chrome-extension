// Cookie сайта: какие cookie видит хост, адрес для chrome.cookies, родительские домены.
// Общий для background (chrome.cookies) и окна расширения с таблицей.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  if (DevHelper.cookies) return;

  // ".Example.com" → "example.com"
  function bareDomain(domain) {
    return String(domain || '').trim().toLowerCase().replace(/^\./, '');
  }

  // Cookie видна на хосте: host-only — только на своём хосте, доменная — на домене и поддоменах
  function visibleOn(cookie, host) {
    const domain = bareDomain(cookie.domain);
    if (cookie.hostOnly) return host === domain;
    return host === domain || host.endsWith('.' + domain);
  }

  // Адрес для chrome.cookies.set / remove: схема, домен и путь самой cookie
  function cookieUrl(cookie) {
    return (cookie.secure ? 'https://' : 'http://') + bareDomain(cookie.domain) + (cookie.path || '/');
  }

  // "a.stage.example.com" → ["stage.example.com", "example.com"]: куда можно поставить доменную cookie.
  // Список публичных суффиксов не знаем — на "co.uk" Chrome откажет сам
  function parentDomains(host) {
    const parts = host.split('.');
    const result = [];
    for (let i = 1; i < parts.length - 1; i++) result.push(parts.slice(i).join('.'));
    return result;
  }

  // Ключ списка значений и строки таблицы: имя + домен в формате chrome.cookies
  // (host-only — "stage.example.com", доменная — ".example.com")
  function sameKey(a, b) {
    return a.name === b.name && a.domain === b.domain;
  }

  DevHelper.cookies = { bareDomain, visibleOn, cookieUrl, parentDomains, sameKey };
})();
