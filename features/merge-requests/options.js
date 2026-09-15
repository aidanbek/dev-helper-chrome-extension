// Фича «Merge requests»: поведение секции настроек сверх полей data-field — правила топиков.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('mergeRequests');

  function addRuleRow(root, rule = { project: '', url: '' }) {
    const row = document.createElement('div');
    row.className = 'row';

    const project = document.createElement('input');
    project.type = 'text';
    project.className = 'project';
    project.placeholder = 'group/subgroup/project';
    project.value = rule.project || '';

    const url = document.createElement('input');
    url.type = 'url';
    url.className = 'url';
    url.placeholder = 'https://t.me/c/2001234567/45';
    url.value = rule.url || '';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.title = 'Удалить правило';
    remove.addEventListener('click', () => row.remove());

    row.append(project, url, remove);
    root.querySelector('[data-rules]').appendChild(row);
  }

  DevHelper.registerFeature({
    id: feature.id,
    options: {
      init(root) {
        root.querySelector('[data-action="reset-template"]').addEventListener('click', () => {
          root.querySelector('[data-field="template"]').value = feature.defaults.template;
        });
        root.querySelector('[data-action="add-rule"]').addEventListener('click', () => addRuleRow(root));
      },

      load(root, values) {
        root.querySelector('[data-rules]').innerHTML = '';
        (values.rules || []).forEach((rule) => addRuleRow(root, rule));
        if (!(values.rules || []).length) addRuleRow(root);
      },

      collect(root) {
        const rules = Array.from(root.querySelectorAll('[data-rules] .row'))
          .map((row) => ({
            project: row.querySelector('.project').value.trim(),
            url: row.querySelector('.url').value.trim()
          }))
          .filter((rule) => rule.project && rule.url);
        return { rules };
      }
    }
  });
})();
