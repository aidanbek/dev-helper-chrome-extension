// Раздел «Импорт и экспорт» страницы настроек: файл JSON и буфер обмена. Логика формата — common/backup.js.
// Раздел не фича: без переключателя «Включено» и без кнопки «Сохранить» — импорт пишет сразу, после превью.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

  const TEMPLATE =
    '<fieldset>' +
    '<legend>Экспорт</legend>' +
    '<div class="checkbox"><input type="radio" name="backup-kind" id="backup-kind-full" value="full" checked>' +
    '<label for="backup-kind-full">Полная копия</label></div>' +
    '<p class="hint">Все настройки всех фич, включая сайты и личные — для резервной копии или другого браузера.</p>' +
    '<div class="checkbox"><input type="radio" name="backup-kind" id="backup-kind-team" value="team">' +
    '<label for="backup-kind-team">Для команды</label></div>' +
    '<p class="hint">Без личных настроек (ваш username в GitLab) — чтобы поделиться с коллегами.</p>' +
    '<div class="backup-actions">' +
    '<button type="button" data-action="download">Скачать файл</button>' +
    '<button type="button" class="secondary" data-action="copy">Скопировать в буфер</button>' +
    '</div>' +
    '</fieldset>' +
    '<fieldset>' +
    '<legend>Импорт</legend>' +
    '<p class="hint hint-top">Файл или текст экспорта Dev Helper. Сначала покажем, что изменится, — запись только ' +
    'по кнопке «Применить». Настройки, которых нет в файле, не меняются.</p>' +
    '<div class="backup-actions">' +
    '<button type="button" class="secondary" data-action="pick">Выбрать файл…</button>' +
    '<input type="file" accept=".json,application/json" hidden>' +
    '</div>' +
    '<label for="backup-text">или вставьте текст</label>' +
    '<textarea id="backup-text" rows="5" spellcheck="false" placeholder="{ &quot;app&quot;: &quot;dev-helper&quot;, … }"></textarea>' +
    '<div class="backup-actions">' +
    '<button type="button" class="secondary" data-action="parse">Показать изменения</button>' +
    '</div>' +
    '<div class="checkbox"><input type="checkbox" id="backup-merge">' +
    '<label for="backup-merge">Дополнять списки (правила, сайты), а не заменять</label></div>' +
    '<div class="backup-preview" hidden></div>' +
    '</fieldset>';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fileName(kind) {
    const date = new Date().toISOString().slice(0, 10);
    return 'dev-helper-' + (kind === 'team' ? 'team-' : '') + 'settings-' + date + '.json';
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = el('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // ctx: { setStatus(message, isError), reload() — перечитать разделы фич после импорта }
  function build(body, ctx) {
    body.innerHTML = TEMPLATE;
    const fileInput = body.querySelector('input[type="file"]');
    const textArea = body.querySelector('#backup-text');
    const mergeInput = body.querySelector('#backup-merge');
    const preview = body.querySelector('.backup-preview');

    // Последний разобранный файл: при смене «дополнять списки» превью пересчитывается
    let data = null;
    // Номер отрисовки превью: если пересчёт запустили снова (сменили галочку), старый результат не рисуем
    let previewRun = 0;

    const kind = () => body.querySelector('input[name="backup-kind"]:checked').value;

    async function exportTo(target) {
      try {
        const text = DevHelper.backup.stringify(await DevHelper.backup.build(kind()));
        if (target === 'file') {
          download(text, fileName(kind()));
          ctx.setStatus('Файл настроек сохранён');
        } else {
          await navigator.clipboard.writeText(text);
          ctx.setStatus('Настройки скопированы');
        }
      } catch (e) {
        ctx.setStatus('Не удалось экспортировать: ' + e.message, true);
      }
    }

    async function showPreview() {
      const run = ++previewRun;
      preview.hidden = false;
      preview.textContent = '';
      let planned;
      try {
        planned = await DevHelper.backup.plan(data, { mergeLists: mergeInput.checked });
        if (run !== previewRun) return;
      } catch (e) {
        preview.append(el('p', 'backup-error', 'Не удалось разобрать настройки: ' + e.message));
        return;
      }

      const meta = [];
      if (planned.kind === 'team') meta.push('файл «для команды» — без личных настроек');
      if (planned.extensionVersion) meta.push('экспорт из версии ' + planned.extensionVersion);
      if (meta.length) preview.append(el('p', 'hint hint-top', meta.join('; ')));

      const list = el('div', 'backup-features');
      planned.features.forEach((item) => {
        const row = el('div', 'backup-feature');
        const head = el('div', 'checkbox');
        const input = el('input');
        input.type = 'checkbox';
        input.id = 'backup-feature-' + item.feature.id;
        input.value = item.feature.id;
        input.checked = item.changed.length > 0;
        input.disabled = !item.changed.length;
        const label = el('label', null, item.feature.title);
        label.htmlFor = input.id;
        head.append(input, label);
        row.append(head);

        const details = el('div', 'backup-details');
        if (item.changed.length) {
          details.append(el('div', null, 'Изменится: '));
          details.lastChild.append(...item.changed.flatMap((name, i) => [i ? ', ' : '', el('code', null, name)]));
        } else {
          details.append(el('div', null, 'Без изменений'));
        }
        item.skipped.forEach(({ name, reason }) => {
          const skipped = el('div', 'backup-skipped', 'Пропущено: ');
          skipped.append(el('code', null, name), ' — ' + reason);
          details.append(skipped);
        });
        item.notes.forEach((note) => details.append(el('div', 'backup-skipped', note)));
        row.append(details);
        list.append(row);
      });
      preview.append(list);

      if (planned.unknown.length) {
        preview.append(el('p', 'hint', 'Неизвестные фичи (из другой версии расширения) пропущены: ' + planned.unknown.join(', ')));
      }

      const applyButton = el('button', null, 'Применить');
      applyButton.type = 'button';
      const note = el('p', 'hint', 'Несохранённые правки на странице настроек будут заменены импортом.');
      const checkedIds = () =>
        Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
      const updateApply = () => {
        applyButton.disabled = !checkedIds().length;
      };
      list.addEventListener('change', updateApply);
      updateApply();

      // Доступ к сайтам Chrome даёт только из обработчика клика — список готовим заранее, запрос — до любых await
      let missing = await DevHelper.backup.missingHosts(planned, checkedIds());
      if (run !== previewRun) return;
      list.addEventListener('change', async () => {
        missing = await DevHelper.backup.missingHosts(planned, checkedIds());
      });

      applyButton.addEventListener('click', () => {
        const ids = checkedIds();
        const origins = missing.map((host) => DevHelper.sites.originPattern(host));
        const access = origins.length ? chrome.permissions.request({ origins }) : Promise.resolve(true);
        access
          .catch(() => false)
          .then(async (granted) => {
            await DevHelper.backup.apply(planned, ids);
            await ctx.reload();
            data = null;
            preview.hidden = true;
            textArea.value = '';
            ctx.setStatus(
              granted ? 'Настройки импортированы' : 'Настройки импортированы, но доступ к сайтам не выдан — «Разрешить» в разделах фич',
              !granted
            );
          })
          .catch((e) => ctx.setStatus('Не удалось импортировать: ' + e.message, true));
      });

      preview.append(note, applyButton);
    }

    function load(text) {
      try {
        data = DevHelper.backup.parse(text);
      } catch (e) {
        data = null;
        preview.hidden = false;
        preview.textContent = '';
        preview.append(el('p', 'backup-error', e.message));
        return;
      }
      showPreview();
    }

    body.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'download') exportTo('file');
      else if (action.dataset.action === 'copy') exportTo('clipboard');
      else if (action.dataset.action === 'pick') fileInput.click();
      else if (action.dataset.action === 'parse') load(textArea.value);
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) load(await file.text());
    });

    mergeInput.addEventListener('change', () => {
      if (data) showPreview();
    });
  }

  DevHelper.backupPage = {
    slug: 'backup',
    title: 'Импорт и экспорт',
    description:
      'Настройки всех фич одним JSON — файлом или через буфер обмена: резервная копия, перенос в другой браузер, ' +
      'общие правила для команды.',
    build
  };
})();
