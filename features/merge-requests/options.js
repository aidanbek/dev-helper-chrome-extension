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
      },

      load(root, values) {
        for (const [name, { field }] of Object.entries(RULE_LISTS)) {
          const rules = values[field] || [];
          listOf(root, name).innerHTML = '';
          rules.forEach((rule) => addRuleRow(root, name, rule));
          if (!rules.length) addRuleRow(root, name);
        }
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
