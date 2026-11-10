// Фича «Merge requests» на фейковом GitLab.
const { test, expect } = require('./support/fixtures');
const { HOST, ORIGIN, fakeGitlab } = require('./support/gitlab');

const COPY_BTN = '#glmrh-copy-btn';
const JIRA_BTN = '#glmrh-jira-btn';
const MERGE_MODAL = '#glmrh-merge-confirm';
const SIZE_BLOCK = '#glmrh-mr-size';
const SIZE_BADGE = SIZE_BLOCK + ' .glmrh-mr-size-badge';
const SIZE_ASK = SIZE_BLOCK + ' .glmrh-mr-size-ask';
const SIZE_NOTE = SIZE_BLOCK + ' .glmrh-mr-size-note';

// Файл для diffs_metadata.json: kind — modified / added / deleted / renamed (oldPath — прежний путь)
function diffFile(path, additions, deletions = 0, { kind = 'modified', oldPath = path } = {}) {
  return {
    old_path: oldPath,
    new_path: path,
    new_file: kind === 'added',
    deleted_file: kind === 'deleted',
    renamed_file: kind === 'renamed',
    added_lines: additions,
    removed_lines: deletions
  };
}

const MR = { title: 'PRJ-42 Fix login form', author: 'jdoe', source: 'feature/PRJ-42-login', target: 'develop' };

async function openMr(context, page, mr = MR, options = {}) {
  const url = await fakeGitlab(context, { ...mr, ...options });
  await page.goto(url);
  return url;
}

test.describe('кнопка «Отправить на ревью»', () => {
  test('появляется в шапке MR и копирует название со ссылкой', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { openTelegram: false });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    const url = await openMr(context, page);

    const button = page.locator('#glmrh-actions ' + COPY_BTN);
    await expect(button).toBeEnabled();
    await button.click();

    await expect(button).toContainText('Скопировано');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(MR.title + '\n\n' + url);
  });

  test('без топика Telegram сообщает, что топик не настроен', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await openMr(context, page);

    await page.locator(COPY_BTN).click();
    await expect(page.locator(COPY_BTN)).toContainText('топик не настроен');
  });

  test('неактивна у черновика', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, { ...MR, title: 'Draft: ' + MR.title });
    await expect(page.locator(COPY_BTN)).toBeDisabled();
  });

  test('неактивна, если в MR конфликты', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, MR, { conflicts: true });
    await expect(page.locator(COPY_BTN)).toBeDisabled();
  });

  test('неактивна у апрувнутого MR', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, { ...MR, approvals: 2, unresolved: 0 });
    await expect(page.locator(COPY_BTN)).toBeDisabled();
  });

  test('не показывается на чужом MR при «Только мои MR»', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { myUsername: 'someone-else' });
    await openMr(context, page);
    // Кнопка Jira не зависит от автора — по ней видно, что скрипт отработал
    await expect(page.locator(JIRA_BTN)).toBeVisible();
    await expect(page.locator(COPY_BTN)).toHaveCount(0);
  });
});

test.describe('размер MR', () => {
  test('под строкой «requested to merge» — файлы по видам и строки', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page);

    const size = page.locator(SIZE_BLOCK);
    await expect(size).toHaveText('S 4 файла: изменено 1, добавлено 1, удалено 1, переименовано 1 · строки +41 −17');
    // Отдельный блок над рядом кнопок
    await expect(page.locator(SIZE_BLOCK + ' + #glmrh-actions')).toHaveCount(1);
  });

  test('без добавленных и удалённых файлов показывает только изменённые', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, MR, {
      diffFiles: [{ old_path: 'a', new_path: 'a', new_file: false, deleted_file: false, added_lines: 5, removed_lines: 2 }]
    });
    await expect(page.locator(SIZE_BLOCK)).toHaveText('S 1 файл: изменено 1 · строки +5 −2');
  });

  test('метка размера — по порогам из настроек', async ({ context, page, ext }) => {
    // +41 −17 = 58 строк: при порогах 10, 50, 100 — L
    await ext.enableOn('mergeRequests', HOST, { sizeThresholds: '10, 50, 100' });
    await openMr(context, page);
    const badge = page.locator(SIZE_BLOCK + ' .glmrh-mr-size-badge');
    await expect(badge).toHaveText('L');

    await ext.setStorage({ 'mergeRequests.sizeThresholds': '10, 20, 30' });
    await expect(badge).toHaveText('XL');
  });

  test('у большого MR — вопрос, можно ли разбить', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeThresholds: '10, 20, 30' });
    await openMr(context, page);
    await expect(page.locator(SIZE_BLOCK + ' .glmrh-mr-size-ask')).toHaveText('Очень большой MR — точно одним куском?');
  });

  test('файлы из «Не учитывать в размере» не входят в счётчики', async ({ context, page, ext }) => {
    // b.php — новый, +30; c.php по пути app/c.php — удалённый, −12
    await ext.enableOn('mergeRequests', HOST, { sizeIgnore: 'b.php\napp/c.*' });
    await openMr(context, page);
    await expect(page.locator(SIZE_BLOCK)).toHaveText(
      'S 2 файла: изменено 1, переименовано 1 · строки +11 −5 · без учёта: 2 файла, +30 −12'
    );
  });

  test('метка массовой правки из сайдбара гасит вопрос', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeThresholds: '10, 20, 30', sizeBulkLabels: 'Bulk-Change' });
    await openMr(context, page, { ...MR, labels: ['backend', 'bulk-change'] });
    const size = page.locator(SIZE_BLOCK);
    await expect(size.locator('.glmrh-mr-size-badge')).toHaveClass(/glmrh-mr-size-bulk/);
    await expect(size.locator('.glmrh-mr-size-note')).toHaveText('массовая правка');
    await expect(size.locator('.glmrh-mr-size-ask')).toHaveCount(0);
  });

  test('метка массовой правки берётся и из API', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeThresholds: '10, 20, 30', sizeBulkLabels: 'bulk-change' });
    await openMr(context, page, MR, { apiLabels: ['bulk-change'] });
    await expect(page.locator(SIZE_BLOCK + ' .glmrh-mr-size-note')).toHaveText('массовая правка');
  });

  for (const [count, text] of [[1, '1 файл'], [3, '3 файла'], [5, '5 файлов'], [11, '11 файлов'], [21, '21 файл']]) {
    test('склоняет «' + text + '»', async ({ context, page, ext }) => {
      await ext.enableOn('mergeRequests', HOST);
      await openMr(context, page, MR, { diffFiles: Array.from({ length: count }, (_, i) => diffFile('f' + i, 1)) });
      await expect(page.locator(SIZE_BLOCK + ' .glmrh-mr-size-files')).toHaveText(text + ':');
    });
  }

  test('урезанный GitLab список файлов — число с «+» и подсказка', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, MR, { realSize: '1000+' });
    const files = page.locator(SIZE_BLOCK + ' .glmrh-mr-size-files');
    await expect(files).toHaveText('1000+ файлов:');
    await expect(files).toHaveAttribute('title', /не все файлы/);
  });

  test('переименование узнаёт и без флага renamed_file — по разным путям', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    const moved = { ...diffFile('new/a.php', 0), old_path: 'old/a.php' };
    await openMr(context, page, MR, { diffFiles: [moved, diffFile('b.php', 2)] });
    await expect(page.locator(SIZE_BLOCK)).toHaveText('S 2 файла: изменено 1, переименовано 1 · строки +2 −0');
  });

  // Фейковый MR по умолчанию — +41 −17, то есть 58 строк
  for (const [thresholds, label, ask] of [
    ['100, 200, 300', 'S', null],
    ['50, 100, 200', 'M', null],
    ['10, 50, 100', 'L', 'Большой MR — можно разбить?'],
    ['10, 20, 58', 'XL', 'Очень большой MR — точно одним куском?']
  ]) {
    test('метка ' + label + ' — свой цвет' + (ask ? ' и вопрос' : ', без вопроса'), async ({ context, page, ext }) => {
      await ext.enableOn('mergeRequests', HOST, { sizeThresholds: thresholds });
      await openMr(context, page);
      await expect(page.locator(SIZE_BADGE)).toHaveText(label);
      await expect(page.locator(SIZE_BADGE)).toHaveClass(new RegExp('glmrh-mr-size-' + label.toLowerCase() + '(\\s|$)'));
      // Пустой список — вопроса нет
      await expect(page.locator(SIZE_ASK)).toHaveText(ask ? [ask] : []);
    });
  }

  test('в подсказке метки — число строк и диапазоны', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page);
    await expect(page.locator(SIZE_BADGE)).toHaveAttribute(
      'title',
      'Изменено строк: 58. S — до 100, M — 100–399, L — 400–999, XL — от 1000'
    );
  });

  for (const thresholds of ['1, 2', '30, 20, 10', 'abc', '0, 10, 20']) {
    test('кривые пороги «' + thresholds + '» — пороги по умолчанию', async ({ context, page, ext }) => {
      await ext.enableOn('mergeRequests', HOST, { sizeThresholds: thresholds });
      await openMr(context, page);
      await expect(page.locator(SIZE_BADGE)).toHaveAttribute('title', /S — до 100, M — 100–399/);
    });
  }

  test('шаблоны исключений: «*» не переходит через «/», «**» — переходит, без «/» — по имени файла', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeIgnore: 'src/*.php, build/**\n*.lock\nold/**' });
    await openMr(context, page, MR, {
      diffFiles: [
        diffFile('src/a.php', 1), // src/*.php
        diffFile('src/deep/b.php', 2), // не src/*.php — учитывается
        diffFile('docs/x.md', 4), // учитывается
        diffFile('build/gen/y.js', 8), // build/**
        diffFile('pkg/composer.lock', 16), // *.lock по имени файла
        diffFile('new/z.php', 32, 0, { kind: 'renamed', oldPath: 'old/z.php' }) // old/** по прежнему пути
      ]
    });
    await expect(page.locator(SIZE_BLOCK)).toHaveText(
      'S 2 файла: изменено 2 · строки +6 −0 · без учёта: 4 файла, +57 −0'
    );
    await expect(page.locator(SIZE_BLOCK + ' .glmrh-mr-size-ignored')).toHaveAttribute(
      'title',
      'Файлы из настройки «Не учитывать в размере»: src/*.php, build/**, *.lock, old/**'
    );
  });

  test('без шаблонов исключений строки «без учёта» нет', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeIgnore: '' });
    await openMr(context, page);
    await expect(page.locator(SIZE_BLOCK)).toBeVisible();
    await expect(page.locator(SIZE_BLOCK + ' .glmrh-mr-size-ignored')).toHaveCount(0);
  });

  test('метка из описания MR, а не из сайдбара, массовой правкой не считается', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeThresholds: '10, 20, 30', sizeBulkLabels: 'bulk-change' });
    await openMr(context, page, { ...MR, descriptionLabels: ['bulk-change'] });
    await expect(page.locator(SIZE_ASK)).toBeVisible();
    await expect(page.locator(SIZE_NOTE)).toHaveCount(0);
  });

  test('метка массовой правки в подсказке объясняет, почему размер не повод', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeBulkLabels: 'refactor, bulk-change' });
    await openMr(context, page, { ...MR, labels: ['bulk-change'] });
    await expect(page.locator(SIZE_NOTE)).toHaveAttribute('title', /Метка «bulk-change»/);
  });

  test('без меток массовой правки в настройках API GitLab не запрашивается', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    const apiRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v4/')) apiRequests.push(request.url());
    });
    await openMr(context, page);
    await expect(page.locator(SIZE_BLOCK)).toBeVisible();
    expect(apiRequests).toEqual([]);
  });

  test('с метками массовой правки запрашивает метки MR из API', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { sizeBulkLabels: 'bulk-change' });
    const apiRequest = page.waitForRequest((request) => request.url().includes('/api/v4/'));
    await openMr(context, page);
    expect((await apiRequest).url()).toBe(ORIGIN + '/api/v4/projects/group%2Fproject/merge_requests/12');
  });

  test('ошибка diffs_metadata.json — блока нет, кнопки на месте', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    const diffs = page.waitForResponse((response) => response.url().endsWith('/diffs_metadata.json'));
    await openMr(context, page, MR, { diffsStatus: 500 });
    expect((await diffs).status()).toBe(500);
    await expect(page.locator(JIRA_BTN)).toBeVisible();
    await expect(page.locator(SIZE_BLOCK)).toHaveCount(0);
  });

  test('показывается и на чужом MR при «Только мои MR»', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { myUsername: 'someone-else' });
    await openMr(context, page);
    await expect(page.locator(SIZE_BLOCK)).toBeVisible();
    await expect(page.locator(COPY_BTN)).toHaveCount(0);
  });

  test('выключается галочкой в настройках', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page);
    await expect(page.locator(SIZE_BLOCK)).toBeVisible();

    await ext.setStorage({ 'mergeRequests.sizeBlock': false });
    await expect(page.locator(SIZE_BLOCK)).toHaveCount(0);
  });
});

test('выключение фичи в настройках убирает кнопки без перезагрузки', async ({ context, page, ext }) => {
  await ext.enableOn('mergeRequests', HOST);
  await openMr(context, page);
  await expect(page.locator(COPY_BTN)).toBeVisible();

  await expect(page.locator(SIZE_BLOCK)).toBeVisible();

  await ext.setStorage({ 'mergeRequests.enabled': false });
  await expect(page.locator(COPY_BTN)).toHaveCount(0);
  await expect(page.locator(JIRA_BTN)).toHaveCount(0);
  await expect(page.locator(SIZE_BLOCK)).toHaveCount(0);

  await ext.setStorage({ 'mergeRequests.enabled': true });
  await expect(page.locator(COPY_BTN)).toBeVisible();
});

test('без сайта в настройках скрипт на GitLab не работает', async ({ context, page }) => {
  await openMr(context, page);
  await expect(page.locator('[data-testid="title-content"]')).toBeVisible();
  // Повторные попытки sync идут до 2,5 с — ждём дольше, чтобы отсутствие кнопки что-то значило.
  // Дождаться нечего: скрипта на странице нет, проверяем именно отсутствие
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(3000);
  await expect(page.locator(COPY_BTN)).toHaveCount(0);
});

test.describe('мерж в защищённую ветку', () => {
  test('спрашивает подтверждение, «Отмена» не мержит', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, { ...MR, target: 'main' });

    const merge = page.locator('[data-testid="merge-button"]');
    await expect(merge).toHaveClass(/glmrh-protected-merge/);
    await expect(page.locator('[data-testid="target-branch"]')).toHaveClass(/glmrh-protected-branch/);

    await merge.click();
    const modal = page.locator(MERGE_MODAL);
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('main');
    await expect(modal.locator('.btn-danger')).toBeDisabled();

    await modal.getByRole('button', { name: 'Отмена' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-merged', 'yes');
  });

  test('после отсчёта кнопка подтверждения мержит', async ({ context, page, ext }) => {
    test.slow();
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, { ...MR, target: 'main' });

    await page.locator('[data-testid="merge-button"]').click();
    const confirm = page.locator(MERGE_MODAL + ' .btn-danger');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click();
    await expect(page.locator('body')).toHaveAttribute('data-merged', 'yes');
  });

  test('в низком окне кнопки модалки достижимы прокруткой', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await page.setViewportSize({ width: 800, height: 200 });
    await openMr(context, page, { ...MR, target: 'main' });

    await page.locator('[data-testid="merge-button"]').click();
    const modal = page.locator(MERGE_MODAL);
    await expect(modal).toBeVisible();
    expect(await modal.evaluate((el) => el.scrollHeight > el.clientHeight), 'модалка выше окна').toBe(true);

    // Playwright кликнул бы и по краешку кнопки — требуем, чтобы после прокрутки она была видна целиком
    for (const button of [modal.getByRole('button', { name: 'Отмена' }), modal.locator('.btn-danger')]) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
    }
    await modal.getByRole('button', { name: 'Отмена' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('в обычную ветку мержит без подтверждения', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST);
    await openMr(context, page, { ...MR, target: 'develop' });
    await expect(page.locator(COPY_BTN)).toBeVisible();

    await page.locator('[data-testid="merge-button"]').click();
    await expect(page.locator(MERGE_MODAL)).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-merged', 'yes');
  });

  test('с выключенной настройкой не перехватывает', async ({ context, page, ext }) => {
    await ext.enableOn('mergeRequests', HOST, { mergeConfirm: false });
    await openMr(context, page, { ...MR, target: 'main' });
    await expect(page.locator(COPY_BTN)).toBeVisible();

    await page.locator('[data-testid="merge-button"]').click();
    await expect(page.locator(MERGE_MODAL)).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-merged', 'yes');
  });
});
