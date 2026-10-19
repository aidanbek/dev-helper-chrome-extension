// Экспорт и импорт настроек всех фич одним JSON. Фичи берутся из реестра — новая фича попадает в экспорт сама.
//
// Формат (обратная совместимость — главное):
//   {
//     "app": "dev-helper",              — чужой JSON не примем
//     "format": 1,                      — версия конверта; растёт только при смене его структуры
//     "kind": "full" | "team",          — team без личных настроек (feature.personal)
//     "extensionVersion": "1.3.0",      — справочно, при импорте не проверяется
//     "exportedAt": "2026-10-15T…Z",    — справочно
//     "features": {
//       "<id фичи>": { "version": 1, "settings": { "<настройка>": значение, … } }
//     }
//   }
// Имена фич и настроек — те же, что ключи chrome.storage.sync (`<id>.<настройка>`): они и так не меняются
// между версиями, иначе потерялись бы сохранённые настройки. Переименование или смена смысла настройки —
// новая feature.settingsVersion и feature.migrate(settings, fromVersion), который поднимает старые файлы.
// Импорт терпим к разнице версий: неизвестные фичи и настройки, значения не того типа пропускаются с отчётом,
// отсутствующие в файле настройки не трогаются. Отказ — только если format новее, чем умеет расширение.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

  const APP = 'dev-helper';
  const FORMAT = 1;
  // Лимит chrome.storage.sync на один ключ (ключ + JSON значения)
  const ITEM_QUOTA = 8192;
  // Загрузка по ссылке: сколько ждём ответа и какой файл ещё считаем настройками
  const FETCH_TIMEOUT = 15000;
  const MAX_FILE_SIZE = 256 * 1024;
  // Ссылка последнего импорта по URL — не настройка фичи, в экспорт не попадает
  const SOURCE_KEY = 'backup.source';

  function typeOf(value) {
    if (value === null) return 'null';
    return Array.isArray(value) ? 'array' : typeof value;
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function settingsVersion(feature) {
    return feature.settingsVersion || 1;
  }

  // Какие настройки фичи попадают в файл: всё из defaults, кроме exportExclude, а для team — кроме personal
  function exportable(feature, kind) {
    const excluded = feature.exportExclude || [];
    const personal = kind === 'team' ? feature.personal || [] : [];
    return Object.keys(feature.defaults).filter((name) => !excluded.includes(name) && !personal.includes(name));
  }

  // Значения пишем все, а не только отличные от defaults: если defaults сменятся, файл сохранит выбор пользователя
  async function build(kind) {
    const features = {};
    for (const feature of DevHelper.features) {
      const values = await DevHelper.storage.getFeature(feature.id, feature.defaults);
      const settings = {};
      exportable(feature, kind).forEach((name) => {
        settings[name] = values[name];
      });
      features[feature.id] = { version: settingsVersion(feature), settings };
    }
    return {
      app: APP,
      format: FORMAT,
      kind,
      extensionVersion: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      features
    };
  }

  function stringify(data) {
    return JSON.stringify(data, null, 2) + '\n';
  }

  // Разбор текста файла; ошибка — с понятным сообщением для страницы настроек
  function parse(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Это не JSON: ' + e.message);
    }
    if (!data || typeof data !== 'object' || data.app !== APP) {
      throw new Error('Это не настройки Dev Helper');
    }
    if (!Number.isInteger(data.format) || data.format < 1) {
      throw new Error('В файле нет версии формата');
    }
    if (data.format > FORMAT) {
      throw new Error('Файл из более новой версии расширения (формат ' + data.format + ') — обновите расширение');
    }
    if (!data.features || typeof data.features !== 'object' || Array.isArray(data.features)) {
      throw new Error('В файле нет настроек фич');
    }
    return data;
  }

  // Ссылка на файл настроек (например, raw-файл в репозитории команды): http или https, без схемы — https.
  // Ссылку на просмотр файла в GitLab (/-/blob/) переводим в raw (/-/raw/) — иначе придёт HTML-страница
  function normalizeUrl(input) {
    let value = String(input || '').trim();
    if (!value) throw new Error('Укажите ссылку на файл настроек');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;
    let url;
    try {
      url = new URL(value);
    } catch (e) {
      throw new Error('Не похоже на ссылку: ' + value);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Поддерживаются только ссылки http и https');
    }
    url.pathname = url.pathname.replace('/-/blob/', '/-/raw/');
    return url.href;
  }

  // Текст файла по ссылке. Доступ к сайту должен быть уже выдан — иначе запрос упрётся в CORS.
  // Куки сайта уходят с запросом: приватный файл GitLab загрузится, если в браузере выполнен вход
  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      let response;
      try {
        response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Сайт не ответил за ' + FETCH_TIMEOUT / 1000 + ' секунд');
        throw new Error('Не удалось загрузить файл: сайт недоступен или нет доступа к нему');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('Нет доступа к файлу (HTTP ' + response.status + ') — войдите на сайт в этом браузере');
      }
      if (response.status === 404) {
        throw new Error('Файл не найден (HTTP 404). GitLab отвечает так и на приватный файл, если вход не выполнен');
      }
      if (!response.ok) throw new Error('Сайт ответил HTTP ' + response.status);
      // Редирект на страницу входа или ссылка на страницу просмотра файла вместо самого файла
      if (/text\/html/i.test(response.headers.get('content-type') || '')) {
        throw new Error('Вместо файла пришла HTML-страница — нужен вход на сайт или ссылка не на сам файл (raw)');
      }
      if (Number(response.headers.get('content-length')) > MAX_FILE_SIZE) {
        throw new Error('Файл больше ' + MAX_FILE_SIZE / 1024 + ' КБ — это не настройки Dev Helper');
      }
      const text = await response.text();
      if (text.length > MAX_FILE_SIZE) {
        throw new Error('Файл больше ' + MAX_FILE_SIZE / 1024 + ' КБ — это не настройки Dev Helper');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  // { url, appliedAt } последнего импорта по ссылке или null
  async function getSource() {
    const items = await chrome.storage.sync.get(SOURCE_KEY);
    return items[SOURCE_KEY] || null;
  }

  function setSource(url) {
    return chrome.storage.sync.set({ [SOURCE_KEY]: { url, appliedAt: new Date().toISOString() } });
  }

  // Списки при «дополнить»: сначала текущие, потом новые из файла, без повторов
  function mergeList(current, incoming) {
    const seen = new Set(current.map((item) => JSON.stringify(item)));
    const result = current.slice();
    incoming.forEach((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(item);
    });
    return result;
  }

  function itemSize(featureId, name, value) {
    return new TextEncoder().encode(featureId + '.' + name + JSON.stringify(value)).length;
  }

  // Что изменит импорт: по каждой фиче из файла — новые значения, пропущенные настройки с причиной, заметки.
  // Ничего не пишет. mergeLists — списки (правила, сайты) дополнять, а не заменять
  async function plan(data, { mergeLists = false } = {}) {
    const result = { kind: data.kind, extensionVersion: data.extensionVersion, features: [], unknown: [] };

    for (const [id, entry] of Object.entries(data.features)) {
      const feature = DevHelper.getFeature(id);
      if (!feature) {
        result.unknown.push(id);
        continue;
      }
      const item = { feature, values: {}, changed: [], skipped: [], notes: [] };
      result.features.push(item);
      if (!entry || typeof entry.settings !== 'object' || entry.settings === null || Array.isArray(entry.settings)) {
        item.notes.push('нет настроек — фича пропущена');
        continue;
      }

      let settings = { ...entry.settings };
      const from = Number.isInteger(entry.version) && entry.version > 0 ? entry.version : 1;
      const to = settingsVersion(feature);
      if (from < to && feature.migrate) settings = feature.migrate(settings, from) || settings;
      if (from > to) item.notes.push('настройки из более новой версии фичи — применены только известные');

      const current = await DevHelper.storage.getFeature(feature.id, feature.defaults);
      const allowed = exportable(feature, 'full');
      for (const [name, value] of Object.entries(settings)) {
        if (!allowed.includes(name)) {
          item.skipped.push({ name, reason: 'неизвестная настройка' });
          continue;
        }
        if (typeOf(value) !== typeOf(feature.defaults[name])) {
          item.skipped.push({ name, reason: 'ожидается ' + typeOf(feature.defaults[name]) + ', в файле ' + typeOf(value) });
          continue;
        }

        let next = value;
        // Сайты — как при ручном добавлении: только хост, без мусора и повторов
        if (name === 'hosts') {
          next = Array.from(new Set(value.map((host) => DevHelper.sites.normalizeHost(host)).filter(Boolean)));
        }
        if (mergeLists && Array.isArray(next)) next = mergeList(current[name] || [], next);
        if (same(next, current[name])) continue;
        if (itemSize(feature.id, name, next) > ITEM_QUOTA) {
          item.skipped.push({ name, reason: 'больше лимита chrome.storage.sync (8 КБ на настройку)' });
          continue;
        }
        item.values[name] = next;
        item.changed.push(name);
      }
    }
    return result;
  }

  // Сайты, к которым после импорта понадобится доступ: новые в выбранных фичах и ещё не разрешённые
  async function missingHosts(planned, ids) {
    const hosts = new Set();
    planned.features
      .filter((item) => ids.includes(item.feature.id) && item.values.hosts)
      .forEach((item) => item.values.hosts.forEach((host) => hosts.add(host)));
    const missing = [];
    for (const host of hosts) {
      if (!(await DevHelper.sites.hasAccess(host))) missing.push(host);
    }
    return missing;
  }

  // Запись выбранных фич одним вызовом: либо всё, либо ничего
  function apply(planned, ids) {
    const values = {};
    planned.features
      .filter((item) => ids.includes(item.feature.id) && item.changed.length)
      .forEach((item) => {
        values[item.feature.id] = item.values;
      });
    return DevHelper.storage.setFeatures(values);
  }

  DevHelper.backup = {
    FORMAT,
    build,
    stringify,
    parse,
    plan,
    missingHosts,
    apply,
    normalizeUrl,
    fetchText,
    getSource,
    setSource
  };
})();
