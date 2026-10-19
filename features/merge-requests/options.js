// Фича «Merge requests»: поведение секции настроек сверх полей data-field — списки правил по проектам.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('mergeRequests');

  // Списки «путь проекта → значение»: data-rules="<имя>" в options.html, field — настройка в storage,
  // valueType — тип поля справа (ссылка или имя ветки)
  const RULE_LISTS = {
    topics: { field: 'rules', urlPlaceholder: 'https://t.me/c/2001234567/45', valueType: 'url' },
    jira: { field: 'jiraRules', urlPlaceholder: 'https://jira.example.com', valueType: 'url' },
    stage: { field: 'stageRules', urlPlaceholder: 'stage', valueType: 'text' }
  };

  function listOf(root, name) {
    return root.querySelector('[data-rules="' + name + '"]');
  }

  // ---------- префиксы комментариев: имя, цвет, превью кнопки ----------

  const DEFAULT_PREFIX_COLOR = '#1f75cb';

  function prefixListOf(root) {
    return root.querySelector('[data-prefixes]');
  }

  function renderPrefixPreview(row) {
    const name = row.querySelector('.prefix-name').value.trim().replace(/:+$/, '');
    const colored = row.querySelector('.prefix-colored').checked;
    const color = row.querySelector('.prefix-color');
    color.disabled = !colored;
    const preview = row.querySelector('.prefix-preview');
    preview.textContent = name || 'префикс';
    preview.classList.toggle('empty', !name);
    preview.style.setProperty('--prefix-color', colored ? color.value : '');
    preview.classList.toggle('colored', colored);
  }

  let prefixRowId = 0;

  function addPrefixRow(root, prefix = { name: '', color: '' }) {
    const row = document.createElement('div');
    row.className = 'row prefix-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'prefix-name';
    name.placeholder = 'nit';
    name.spellcheck = false;
    name.value = prefix.name || '';

    const toggle = document.createElement('div');
    toggle.className = 'checkbox';
    const colored = document.createElement('input');
    colored.type = 'checkbox';
    colored.className = 'prefix-colored';
    colored.id = 'mr-prefix-colored-' + ++prefixRowId;
    colored.checked = !!prefix.color;
    const label = document.createElement('label');
    label.htmlFor = colored.id;
    label.textContent = 'цвет';
    toggle.append(colored, label);

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'prefix-color';
    color.value = prefix.color || DEFAULT_PREFIX_COLOR;

    const preview = document.createElement('span');
    preview.className = 'prefix-preview';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.title = 'Удалить префикс';
    remove.addEventListener('click', () => row.remove());

    row.append(name, toggle, color, preview, remove);
    row.addEventListener('input', () => renderPrefixPreview(row));
    row.addEventListener('change', () => renderPrefixPreview(row));
    prefixListOf(root).appendChild(row);
    renderPrefixPreview(row);
  }

  function addRuleRow(root, name, rule = { project: '', url: '' }) {
    const row = document.createElement('div');
    row.className = 'row';

    const project = document.createElement('input');
    project.type = 'text';
    project.className = 'project';
    project.placeholder = 'group/subgroup/project';
    project.value = rule.project || '';

    const url = document.createElement('input');
    url.type = RULE_LISTS[name].valueType;
    url.className = 'url';
    url.spellcheck = false;
    url.placeholder = RULE_LISTS[name].urlPlaceholder;
    url.value = rule.url || '';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.title = 'Удалить правило';
    remove.addEventListener('click', () => row.remove());

    row.append(project, url, remove);
    listOf(root, name).appendChild(row);
  }

  DevHelper.registerFeature({
    id: feature.id,
    options: {
      init(root) {
        root.querySelector('[data-action="reset-template"]').addEventListener('click', () => {
          root.querySelector('[data-field="template"]').value = feature.defaults.template;
        });
        root.querySelectorAll('[data-add-rule]').forEach((button) => {
          button.addEventListener('click', () => addRuleRow(root, button.dataset.addRule));
        });
        root.querySelector('[data-add-prefix]').addEventListener('click', () => addPrefixRow(root));
      },

      load(root, values) {
        for (const [name, { field }] of Object.entries(RULE_LISTS)) {
          const rules = values[field] || [];
          listOf(root, name).innerHTML = '';
          rules.forEach((rule) => addRuleRow(root, name, rule));
          if (!rules.length) addRuleRow(root, name);
        }

        const prefixes = feature.commentPrefixList(values.commentPrefixes);
        prefixListOf(root).innerHTML = '';
        prefixes.forEach((prefix) => addPrefixRow(root, prefix));
        if (!prefixes.length) addPrefixRow(root);
      },

      collect(root) {
        const values = {};
        for (const [name, { field }] of Object.entries(RULE_LISTS)) {
          values[field] = Array.from(listOf(root, name).querySelectorAll('.row'))
            .map((row) => ({
              project: row.querySelector('.project').value.trim(),
              url: row.querySelector('.url').value.trim()
            }))
            .filter((rule) => rule.project && rule.url);
        }

        values.commentPrefixes = feature.commentPrefixList(
          Array.from(prefixListOf(root).querySelectorAll('.prefix-row')).map((row) => ({
            name: row.querySelector('.prefix-name').value,
            color: row.querySelector('.prefix-colored').checked ? row.querySelector('.prefix-color').value : ''
          }))
        );

        // Числовое поле приходит строкой; пустое или кривое — порог по умолчанию
        const approvals = parseInt(root.querySelector('[data-field="minApprovals"]').value, 10);
        values.minApprovals = Number.isFinite(approvals) && approvals >= 0
          ? approvals
          : feature.defaults.minApprovals;
        return values;
      }
    }
  });
})();
