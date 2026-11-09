// Фича «Cookie»: списки значений в настройках — посмотреть, убрать значение или список целиком.
// Добавляются списки в таблице cookie (окно расширения) — сразу в storage, поэтому здесь
// показываем их актуальными и при изменении снаружи перечитываем.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('cookies');

  let lists = [];

  function render(root) {
    const box = root.querySelector('[data-value-lists]');
    box.textContent = '';
    root.querySelector('[data-value-lists-empty]').hidden = lists.length > 0;

    lists.forEach((list, i) => {
      const row = document.createElement('div');
      row.className = 'value-list';
      const name = document.createElement('span');
      name.className = 'value-list-name';
      name.textContent = list.name;
      const domain = document.createElement('span');
      domain.className = 'value-list-domain';
      domain.textContent = list.domain;
      const chips = document.createElement('span');
      chips.className = 'value-list-values';
      list.values.forEach((value) => {
        const chip = document.createElement('span');
        chip.className = 'tag';
        chip.textContent = value === '' ? '(пусто)' : value;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '✕';
        remove.title = 'Убрать значение';
        remove.addEventListener('click', () => {
          lists[i] = { ...list, values: list.values.filter((v) => v !== value) };
          lists = lists.filter((item) => item.values.length);
          render(root);
        });
        chip.append(remove);
        chips.append(chip);
      });
      const removeList = document.createElement('button');
      removeList.type = 'button';
      removeList.className = 'remove';
      removeList.textContent = '✕';
      removeList.title = 'Убрать список';
      removeList.addEventListener('click', () => {
        lists.splice(i, 1);
        render(root);
      });
      row.append(name, domain, chips, removeList);
      box.append(row);
    });
  }

  DevHelper.registerFeature({
    id: feature.id,
    options: {
      init(root) {
        // Значение добавили в таблице, пока открыты настройки, — показываем актуальные списки
        DevHelper.storage.onFeatureChanged(feature.id, (values) => {
          if (!('values' in values)) return;
          lists = Array.isArray(values.values) ? values.values : [];
          render(root);
        });
      },

      load(root, values) {
        lists = Array.isArray(values.values) ? values.values : [];
        render(root);
      },

      collect() {
        return { values: lists };
      }
    }
  });
})();
