// Фича «Переходы»: список правил и проверка ссылки в настройках.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  const feature = DevHelper.getFeature('redirects');

  const CHECK_HINT = 'Вставьте адрес — здесь появятся ссылки по текущим правилам (без сохранения).';

  function listOf(root) {
    return root.querySelector('[data-rules="redirects"]');
  }

  function rulesOf(root) {
    return Array.from(listOf(root).querySelectorAll('.row'))
      .map((row) => ({
        title: row.querySelector('.title').value.trim(),
        page: row.querySelector('.project').value.trim(),
        target: row.querySelector('.url').value.trim()
      }))
      .filter((rule) => rule.page && rule.target);
  }

  function renderCheck(root) {
    const value = root.querySelector('#redirects-check').value.trim();
    const result = root.querySelector('[data-check-result]');
    result.textContent = '';
    result.classList.remove('error');
    if (!value) {
      result.textContent = CHECK_HINT;
      return;
    }

    const found = DevHelper.redirects.resolveAll(rulesOf(root), value);
    if (!found.length) {
      result.textContent = 'Ни одно правило не подошло.';
      result.classList.add('error');
      return;
    }
    for (const { title, url } of found) {
      const line = document.createElement('div');
      line.textContent = title + ' → ' + url;
      result.append(line);
    }
  }

  // Кривой шаблон или ссылку подсвечиваем сразу — иначе правило молча не сработает
  function validateRow(row) {
    const page = row.querySelector('.project');
    const target = row.querySelector('.url');
    const compiled = DevHelper.redirects.compilePage(page.value);
    page.classList.toggle('invalid', !!page.value.trim() && !compiled);
    target.classList.toggle('invalid', !!target.value.trim() &&
      !DevHelper.redirects.isValidTarget(target.value, compiled ? compiled.names : null));
  }

  function input(className, placeholder, title, value) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = className;
    el.spellcheck = false;
    el.placeholder = placeholder;
    el.title = title;
    el.value = value || '';
    return el;
  }

  function addRuleRow(root, rule = {}) {
    const row = document.createElement('div');
    row.className = 'row';

    const title = input('title', 'Открыть в админке', 'Текст пункта в контекстном меню', rule.title);
    const page = input('project', '{env}.example.com/product/*-{id:num}',
      'Хост и путь страницы: {имя} — сегмент, {имя:num} — число, * — любые символы внутри сегмента', rule.page);
    const target = input('url', 'https://{env}-admin.example.com/products/{id}',
      'Ссылка с переменными из шаблона страницы', rule.target);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.title = 'Удалить правило';
    remove.addEventListener('click', () => {
      row.remove();
      renderCheck(root);
    });

    row.addEventListener('input', () => {
      validateRow(row);
      renderCheck(root);
    });

    row.append(title, page, target, remove);
    listOf(root).appendChild(row);
    validateRow(row);
  }

  DevHelper.registerFeature({
    id: feature.id,
    options: {
      init(root) {
        root.querySelector('[data-add-rule]').addEventListener('click', () => addRuleRow(root));
        root.querySelector('#redirects-check').addEventListener('input', () => renderCheck(root));
      },

      load(root, values) {
        const rules = values.rules || [];
        listOf(root).innerHTML = '';
        rules.forEach((rule) => addRuleRow(root, rule));
        if (!rules.length) addRuleRow(root);
        renderCheck(root);
      },

      collect(root) {
        return { rules: rulesOf(root) };
      }
    }
  });
})();
