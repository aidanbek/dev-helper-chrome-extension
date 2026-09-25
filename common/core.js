// Общее пространство имён расширения и реестр фич.
// Подключается первым во всех контекстах: content scripts, страница настроек, service worker.
(() => {
  'use strict';

  const DevHelper = (globalThis.DevHelper = globalThis.DevHelper || {});
  if (DevHelper.registerFeature) return;

  const LOG_PREFIX = '[Dev Helper]';

  DevHelper.features = [];

  DevHelper.log = (...args) => console.info(LOG_PREFIX, ...args);

  DevHelper.getFeature = (id) => DevHelper.features.find((feature) => feature.id === id) || null;

  // Фича описывается частями: feature.js — метаданные и дефолты,
  // options.js — секция настроек. Повторная регистрация дополняет описание.
  //   id          — ключ фичи, префикс её настроек в storage
  //   slug        — якорь раздела на странице настроек
  //   title       — название в меню настроек
  //   description — пояснение под заголовком раздела
  //   defaults    — настройки по умолчанию (включая enabled)
  //   legacyKeys  — ключи storage до разделения на фичи, переносятся под префикс
  //   options     — { init(root), load(root, values), collect(root) } для страницы настроек
  DevHelper.registerFeature = (definition) => {
    const existing = DevHelper.getFeature(definition.id);
    if (existing) return Object.assign(existing, definition);
    const feature = { ...definition };
    DevHelper.features.push(feature);
    return feature;
  };
})();
