// Раздел «Импорт и экспорт»: файл экспорта и импорт текста с превью.
const fs = require('node:fs');
const { test, expect } = require('./support/fixtures');

async function openBackup(page) {
  await page.goto(page.url().split('#')[0] + '#backup');
  const section = page.locator('section.panel#backup');
  await expect(section).toBeVisible();
  return section;
}

async function exportFile(page, section, kind) {
  await section.getByLabel(kind).check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    section.getByRole('button', { name: 'Скачать файл' }).click()
  ]);
  return { name: download.suggestedFilename(), data: JSON.parse(fs.readFileSync(await download.path(), 'utf8')) };
}

test.describe('экспорт', () => {
  test('полная копия — все фичи с текущими значениями', async ({ optionsPage, ext }) => {
    await ext.setStorage({ 'mergeRequests.myUsername': 'jdoe', 'mergeRequests.hosts': ['gitlab.example.com'] });
    const section = await openBackup(optionsPage);
    const { name, data } = await exportFile(optionsPage, section, 'Полная копия');

    expect(name).toMatch(/^dev-helper-settings-\d{4}-\d{2}-\d{2}\.json$/);
    expect(data).toMatchObject({ app: 'dev-helper', format: 1, kind: 'full' });
    expect(Object.keys(data.features)).toEqual(['mergeRequests', 'jiraIssue', 'jiraRelease', 'redirects']);
    expect(data.features.mergeRequests.settings).toMatchObject({
      myUsername: 'jdoe',
      hosts: ['gitlab.example.com'],
      protectedBranches: 'main, master, production, prod, release/*'
    });
  });

  test('«для команды» — без личных настроек', async ({ optionsPage, ext }) => {
    await ext.setStorage({ 'mergeRequests.myUsername': 'jdoe' });
    const section = await openBackup(optionsPage);
    const { name, data } = await exportFile(optionsPage, section, 'Для команды');

    expect(name).toMatch(/^dev-helper-team-settings-/);
    expect(data.kind).toBe('team');
    expect(data.features.mergeRequests.settings).not.toHaveProperty('myUsername');
  });
});

test.describe('импорт', () => {
  function backupText(features) {
    return JSON.stringify({ app: 'dev-helper', format: 1, kind: 'team', features });
  }

  test('показывает изменения и пишет только после «Применить»', async ({ optionsPage, ext }) => {
    const section = await openBackup(optionsPage);
    await section.getByLabel('или вставьте текст').fill(backupText({
      redirects: { version: 1, settings: { hotkey: false } },
      mergeRequests: { version: 1, settings: { minApprovals: 'много' } },
      unknownFeature: { version: 1, settings: { x: 1 } }
    }));
    await section.getByRole('button', { name: 'Показать изменения' }).click();

    const preview = section.locator('.backup-preview');
    await expect(preview.locator('.backup-feature', { hasText: 'Переходы' })).toContainText('Изменится: hotkey');
    await expect(preview.locator('.backup-feature', { hasText: 'Merge requests' })).toContainText('Пропущено: minApprovals');
    await expect(preview).toContainText('Неизвестные фичи (из другой версии расширения) пропущены: unknownFeature');
    expect(await ext.getStorage(['redirects.hotkey'])).toEqual({});

    await preview.getByRole('button', { name: 'Применить' }).click();
    await expect(optionsPage.locator('#status')).toHaveText('Настройки импортированы');
    await expect(preview).toBeHidden();
    expect(await ext.getStorage(['redirects.hotkey', 'mergeRequests.minApprovals'])).toEqual({ 'redirects.hotkey': false });

    // Разделы фич перечитаны — импорт виден без перезагрузки
    await optionsPage.goto(optionsPage.url().split('#')[0] + '#redirects');
    await expect(optionsPage.locator('#redirects').getByLabel(/Переход по/)).not.toBeChecked();
  });

  test('отказывается от чужого JSON и не-JSON', async ({ optionsPage }) => {
    const section = await openBackup(optionsPage);
    const text = section.getByLabel('или вставьте текст');
    const parse = section.getByRole('button', { name: 'Показать изменения' });
    const error = section.locator('.backup-preview .backup-error');

    await text.fill('{ не json');
    await parse.click();
    await expect(error).toContainText('Это не JSON');

    await text.fill('{"app":"other"}');
    await parse.click();
    await expect(error).toHaveText('Это не настройки Dev Helper');

    await text.fill(JSON.stringify({ app: 'dev-helper', format: 99, features: {} }));
    await parse.click();
    await expect(error).toContainText('обновите расширение');
  });
});
