// Открытие ссылок Telegram.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

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

  function open(url, inApp) {
    const tgUri = inApp ? toTgUri(url) : null;
    if (!tgUri) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    // Внешний протокол не уводит со страницы — браузер лишь предлагает открыть приложение
    const a = document.createElement('a');
    a.href = tgUri;
    a.click();
  }

  DevHelper.telegram = { toTgUri, open };
})();
