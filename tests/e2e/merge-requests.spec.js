// Фича «Merge requests» на фейковом GitLab.
const { test, expect } = require('./support/fixtures');
const { HOST, ORIGIN, fakeGitlab } = require('./support/gitlab');

const COPY_BTN = '#glmrh-copy-btn';
const JIRA_BTN = '#glmrh-jira-btn';
const MERGE_MODAL = '#glmrh-merge-confirm';

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

test('выключение фичи в настройках убирает кнопки без перезагрузки', async ({ context, page, ext }) => {
  await ext.enableOn('mergeRequests', HOST);
  await openMr(context, page);
  await expect(page.locator(COPY_BTN)).toBeVisible();

  await ext.setStorage({ 'mergeRequests.enabled': false });
  await expect(page.locator(COPY_BTN)).toHaveCount(0);
  await expect(page.locator(JIRA_BTN)).toHaveCount(0);

  await ext.setStorage({ 'mergeRequests.enabled': true });
  await expect(page.locator(COPY_BTN)).toBeVisible();
});

test('без сайта в настройках скрипт на GitLab не работает', async ({ context, page }) => {
  await openMr(context, page);
  await expect(page.locator('[data-testid="title-content"]')).toBeVisible();
  // Повторные попытки sync идут до 2,5 с — ждём дольше, чтобы отсутствие кнопки что-то значило
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
