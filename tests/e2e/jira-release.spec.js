// Фича «Релизы Jira» на фейковой Jira: чек-лист задач в строках списка релиза.
const { test, expect } = require('./support/fixtures');
const { HOST, ISSUES, fakeJira } = require('./support/jira');

const BAR = '.dhr-labels';
const CHECK = '.dhr-row-check';
const STATUS = BAR + ' .dhl-status';

function row(page, key) {
  return page.locator('.row', { has: page.locator('a[href="/browse/' + key + '"]') });
}

async function openRelease(context, page, ext, settings = {}) {
  await ext.enableOn('jiraRelease', HOST, settings);
  const url = await fakeJira(context);
  await page.goto(url);
  await expect(page.locator(BAR)).toBeVisible();
  return url;
}

test.describe('чек-лист задач', () => {
  test('чекбокс — первым в каждой строке списка', async ({ context, page, ext }) => {
    await openRelease(context, page, ext);

    await expect(page.locator(CHECK)).toHaveCount(ISSUES.length);
    for (const issue of ISSUES) {
      const first = row(page, issue.key).locator(':scope > :first-child');
      await expect(first).toHaveClass('dhr-row-check');
      await expect(first).not.toBeChecked();
    }
  });

  test('клик отмечает задачу и считается в панели, задачу не открывает', async ({ context, page, ext }) => {
    await openRelease(context, page, ext);

    const box = row(page, 'PRJ-2').locator(CHECK);
    await box.click();

    await expect(box).toBeChecked();
    await expect(row(page, 'PRJ-2')).toHaveAttribute('data-dhr-ticked', '');
    await expect(row(page, 'PRJ-1')).not.toHaveAttribute('data-dhr-ticked');
    await expect(page.locator(STATUS)).toContainText('отмечено 1 из 3');
    expect(await page.evaluate(() => document.body.dataset.opened)).toBeUndefined();

    await box.click();
    await expect(box).not.toBeChecked();
    await expect(row(page, 'PRJ-2')).not.toHaveAttribute('data-dhr-ticked');
    await expect(page.locator(STATUS)).not.toContainText('отмечено');
  });

  test('перезагрузка страницы сбрасывает отметки', async ({ context, page, ext }) => {
    await openRelease(context, page, ext);
    await row(page, 'PRJ-1').locator(CHECK).click();
    await row(page, 'PRJ-3').locator(CHECK).click();
    await expect(page.locator(STATUS)).toContainText('отмечено 2 из 3');

    await page.reload();
    await expect(page.locator(CHECK)).toHaveCount(ISSUES.length);
    for (const box of await page.locator(CHECK).all()) await expect(box).not.toBeChecked();
    await expect(page.locator('[data-dhr-ticked]')).toHaveCount(0);
    await expect(page.locator(STATUS)).not.toContainText('отмечено');
  });

  test('отметка скрытой фильтром задачи сохраняется', async ({ context, page, ext }) => {
    await openRelease(context, page, ext);
    await row(page, 'PRJ-2').locator(CHECK).click();

    const chip = page.locator(BAR + ' .dhl-chips [data-label="back"]');
    await chip.click();
    await expect(row(page, 'PRJ-2')).toBeHidden();
    await expect(page.locator(STATUS)).toContainText('отмечено 1 из 3');

    await chip.click();
    await expect(row(page, 'PRJ-2').locator(CHECK)).toBeChecked();
  });

  test('выключение в настройках убирает чекбоксы без перезагрузки', async ({ context, page, ext }) => {
    await openRelease(context, page, ext);
    await row(page, 'PRJ-1').locator(CHECK).click();

    await ext.setStorage({ 'jiraRelease.rowChecklist': false });
    await expect(page.locator(CHECK)).toHaveCount(0);
    await expect(page.locator('[data-dhr-ticked]')).toHaveCount(0);
    await expect(page.locator(STATUS)).not.toContainText('отмечено');

    await ext.setStorage({ 'jiraRelease.rowChecklist': true });
    await expect(page.locator(CHECK)).toHaveCount(ISSUES.length);
  });

  test('выключено в настройках — чекбоксов нет', async ({ context, page, ext }) => {
    await openRelease(context, page, ext, { rowChecklist: false });
    await expect(page.locator('.dhr-row-labels').first()).toBeVisible();
    await expect(page.locator(CHECK)).toHaveCount(0);
  });
});
