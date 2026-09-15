// Настройки фич в chrome.storage.sync.
// Каждая настройка — отдельный ключ с префиксом фичи (`mergeRequests.rules`):
// у sync лимит ~8 КБ на ключ, поэтому общий объект на фичу не храним.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

  function key(featureId, name) {
    return featureId + '.' + name;
  }

  function clone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }

  function getFeature(featureId, defaults) {
    const query = {};
    for (const [name, value] of Object.entries(defaults)) query[key(featureId, name)] = value;

    const fallback = () => {
      const values = {};
      for (const [name, value] of Object.entries(defaults)) values[name] = clone(value);
      return values;
    };

    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(query, (items) => {
          if (chrome.runtime.lastError || !items) {
            resolve(fallback());
            return;
          }
          const values = {};
          for (const name of Object.keys(defaults)) values[name] = items[key(featureId, name)];
          resolve(values);
        });
      } catch (e) {
        resolve(fallback());
      }
    });
  }

  function setFeature(featureId, values) {
    const items = {};
    for (const [name, value] of Object.entries(values)) items[key(featureId, name)] = value;

    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(items, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  // callback получает { имя: новоеЗначение } только для настроек этой фичи
  function onFeatureChanged(featureId, callback) {
    const prefix = featureId + '.';
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const values = {};
      let changed = false;
      for (const [name, change] of Object.entries(changes)) {
        if (!name.startsWith(prefix)) continue;
        values[name.slice(prefix.length)] = change.newValue;
        changed = true;
      }
      if (changed) callback(values);
    });
  }

  // Настройки до разделения на фичи лежали без префикса — переносим один раз
  async function migrateLegacy(features) {
    for (const feature of features) {
      const legacyKeys = feature.legacyKeys || [];
      if (!legacyKeys.length) continue;

      const items = await chrome.storage.sync.get(legacyKeys);
      const found = Object.keys(items);
      if (!found.length) continue;

      await setFeature(feature.id, items);
      await chrome.storage.sync.remove(found);
      DevHelper.log('настройки перенесены в фичу', feature.id + ':', found.join(', '));
    }
  }

  DevHelper.storage = { getFeature, setFeature, onFeatureChanged, migrateLegacy };
})();
