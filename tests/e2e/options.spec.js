// Страница настроек: сохранение, сайты фич, правила «Переходов».
const { test, expect } = require('./support/fixtures');

function panel(page, slug) {
  return page.locator('section.panel#' + slug);
}

async function openSection(page, slug) {
  await page.goto(page.url().split('#')[0] + '#' + slug);
  await expect(panel(page, slug)).toBeVisible();
  return panel(page, slug);
}

test.describe('сохранение', () => {
  test('переключатель «Включено» и поля пишутся в storage и читаются после перезагрузки', async ({ optionsPage, ext }) => {
    const section = await openSection(optionsPage, 'redirects');
    await section.locator('.switch').click();
    await section.getByLabel('Пункты в контекстном меню').uncheck();
    await optionsPage.locator('#save').click();
    await expect(optionsPage.locator('#status')).toHaveText('Сохранено');

    expect(await ext.getStorage(['redirects.enabled', 'redirects.contextMenu', 'redirects.hotkey'])).toEqual({
      'redirects.enabled': false,
      'redirects.contextMenu': false,
      'redirects.hotkey': true
    });

    await optionsPage.reload();
    const reloaded = panel(optionsPage, 'redirects');
    await expect(reloaded).toHaveClass(/is-disabled/);
    await expect(reloaded.locator('.switch input')).not.toBeChecked();
    await expect(reloaded.getByLabel('Пункты в контекстном меню')).not.toBeChecked();
  });

  test('показывает сохранённые ранее настройки', async ({ optionsPage, ext }) => {
    await ext.setStorage({ 'mergeRequests.protectedBranches': 'main, hotfix/*', 'mergeRequests.minApprovals': 3 });
    await optionsPage.reload();
    const section = panel(optionsPage, 'merge-requests');
    await expect(section.locator('[data-field="protectedBranches"]')).toHaveValue('main, hotfix/*');
    await expect(section.locator('[data-field="minApprovals"]')).toHaveValue('3');
  });
});

test('настройки размера MR сохраняются в storage', async ({ optionsPage, ext }) => {
  const section = await openSection(optionsPage, 'merge-requests');
  await section.getByLabel('Размер MR под строкой «requested to merge … into …»').uncheck();
  await section.getByLabel('Пороги меток S / M / L / XL').fill('50, 200, 800');
  await section.getByLabel('Не учитывать в размере').fill('composer.lock\n*.min.js');
  await section.getByLabel('Метки массовой правки').fill('bulk-change');
  await optionsPage.locator('#save').click();
  await expect(optionsPage.locator('#status')).toHaveText('Сохранено');

  expect(await ext.getStorage([
    'mergeRequests.sizeBlock',
    'mergeRequests.sizeThresholds',
    'mergeRequests.sizeIgnore',
    'mergeRequests.sizeBulkLabels'
  ])).toEqual({
    'mergeRequests.sizeBlock': false,
    'mergeRequests.sizeThresholds': '50, 200, 800',
    'mergeRequests.sizeIgnore': 'composer.lock\n*.min.js',
    'mergeRequests.sizeBulkLabels': 'bulk-change'
  });
});

test.describe('сайты фичи', () => {
  test('адрес приводится к хосту, сохраняется сразу и регистрирует content script', async ({ optionsPage, ext }) => {
    const section = await openSection(optionsPage, 'merge-requests');
    const sites = section.locator('fieldset.sites');
    await sites.getByLabel('Адреса GitLab').fill('https://GitLab.example.com:8443/group/project');
    await sites.getByRole('button', { name: 'Добавить' }).click();

    await expect(optionsPage.locator('#status')).toHaveText('Сайт добавлен');
    await expect(sites.locator('.site-host')).toHaveText(['gitlab.example.com']);
    await expect(sites.locator('.site-warning')).toHaveCount(0);
    expect(await ext.getStorage(['mergeRequests.hosts'])).toEqual({ 'mergeRequests.hosts': ['gitlab.example.com'] });

    await expect.poll(async () => (await ext.registeredScripts()).map((s) => s.id)).toContain('feature-mergeRequests');
  });

  test('мусор вместо адреса не добавляется', async ({ optionsPage, ext }) => {
    const section = await openSection(optionsPage, 'jira-issue');
    const sites = section.locator('fieldset.sites');
    await sites.getByLabel('Адреса Jira').fill('не сайт');
    await sites.getByLabel('Адреса Jira').press('Enter');

    await expect(optionsPage.locator('#status')).toHaveText('Не похоже на адрес сайта: не сайт');
    await expect(optionsPage.locator('#status')).toHaveClass(/error/);
    await expect(sites.locator('.site')).toHaveCount(0);
    expect(await ext.getStorage(['jiraIssue.hosts'])).toEqual({});
  });

  test('удаление сайта снимает content script', async ({ optionsPage, ext }) => {
    await ext.enableOn('jiraIssue', 'jira.example.com');
    await optionsPage.reload();
    const section = await openSection(optionsPage, 'jira-issue');
    const sites = section.locator('fieldset.sites');
    await expect(sites.locator('.site-host')).toHaveText(['jira.example.com']);

    await sites.getByTitle('Убрать сайт и отозвать доступ').click();
    await expect(optionsPage.locator('#status')).toHaveText('Сайт убран');
    await expect(sites.locator('.sites-empty')).toBeVisible();
    await expect.poll(async () => (await ext.registeredScripts()).map((s) => s.id)).not.toContain('feature-jiraIssue');
  });
});

test.describe('правила «Переходов»', () => {
  const RULE = {
    title: 'Открыть в админке',
    page: '{env}.example.com/product/*-{id:num}',
    target: 'https://{env}-admin.example.com/products/{id}'
  };

  async function fillRule(row, rule) {
    await row.locator('.title').fill(rule.title);
    await row.locator('.project').fill(rule.page);
    await row.locator('.url').fill(rule.target);
  }

  test('проверка адреса показывает ссылку по правилу, правило сохраняется', async ({ optionsPage, ext }) => {
    const section = await openSection(optionsPage, 'redirects');
    await fillRule(section.locator('[data-rules="redirects"] .row').first(), RULE);

    const check = section.getByLabel('Адрес страницы');
    const result = section.locator('[data-check-result]');
    await check.fill('https://stage.example.com/product/brake-pad-c7011lr-512644?utm=x');
    await expect(result).toHaveText('Открыть в админке → https://stage-admin.example.com/products/512644');

    await check.fill('https://stage.example.com/catalog');
    await expect(result).toHaveText('Ни одно правило не подошло.');
    await expect(result).toHaveClass(/error/);

    await optionsPage.locator('#save').click();
    await expect(optionsPage.locator('#status')).toHaveText('Сохранено');
    expect(await ext.getStorage(['redirects.rules'])).toEqual({ 'redirects.rules': [RULE] });
  });

  test('кривой шаблон и ссылка с неизвестной переменной подсвечиваются', async ({ optionsPage }) => {
    const section = await openSection(optionsPage, 'redirects');
    const row = section.locator('[data-rules="redirects"] .row').first();

    await row.locator('.project').fill('example.com/product/{id');
    await expect(row.locator('.project')).toHaveClass(/invalid/);

    await row.locator('.project').fill('example.com/product/{id:num}');
    await row.locator('.url').fill('https://admin.example.com/products/{slug}');
    await expect(row.locator('.project')).not.toHaveClass(/invalid/);
    await expect(row.locator('.url')).toHaveClass(/invalid/);
  });

  test('правила добавляются и удаляются, пустые не сохраняются', async ({ optionsPage, ext }) => {
    const section = await openSection(optionsPage, 'redirects');
    const rows = section.locator('[data-rules="redirects"] .row');
    await fillRule(rows.first(), RULE);
    await section.getByRole('button', { name: '+ Добавить правило' }).click();
    await section.getByRole('button', { name: '+ Добавить правило' }).click();
    await expect(rows).toHaveCount(3);
    await fillRule(rows.nth(1), { title: 'Второе', page: 'example.com/a/{x}', target: 'https://example.com/b/{x}' });
    await rows.nth(1).getByTitle('Удалить правило').click();
    await expect(rows).toHaveCount(2);

    await optionsPage.locator('#save').click();
    await expect(optionsPage.locator('#status')).toHaveText('Сохранено');
    expect(await ext.getStorage(['redirects.rules'])).toEqual({ 'redirects.rules': [RULE] });
  });
});
