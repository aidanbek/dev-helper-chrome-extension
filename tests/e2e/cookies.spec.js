// Фича «Cookie»: таблица cookie сайта в окне расширения, списки значений.
// Окно из теста не открыть кликом по иконке — открываем popup/popup.html страницей с ?tab=<id> нужной вкладки.
const { test, expect } = require('./support/fixtures');

const HOST = 'stage.example.com';
const PAGE = 'https://' + HOST + '/catalog';
const DAYS = 24 * 3600;

test.beforeEach(async ({ context }) => {
  await context.route('https://' + HOST + '/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>page</title><h1>catalog</h1>' }));
});

async function cookie(context, name, url = 'https://' + HOST + '/') {
  return (await context.cookies(url)).find((c) => c.name === name) || null;
}

function tabId(ext, url) {
  return ext.worker.evaluate(async (pageUrl) => (await chrome.tabs.query({ url: pageUrl }))[0].id, url);
}

async function openPopup(context, page, ext, extensionId) {
  await page.goto(PAGE);
  const id = await tabId(ext, PAGE);
  const popup = await context.newPage();
  await popup.goto('chrome-extension://' + extensionId + '/popup/popup.html?tab=' + id);
  return popup;
}

// Строка таблицы по имени cookie; scope — страница окна или локатор панели.
// Локатор в has ищется внутри строки, поэтому строится от страницы, а не от scope
function row(scope, name) {
  const page = typeof scope.page === 'function' ? scope.page() : scope;
  return scope.locator('.ct-row').filter({ has: page.locator('.ct-name', { hasText: new RegExp('^' + name + '$') }) });
}

test.describe('окно расширения', () => {
  let expires;

  test.beforeEach(async ({ context, ext }) => {
    await ext.setStorage({ 'cookies.hosts': [HOST] });
    expires = Math.floor(Date.now() / 1000) + 5 * DAYS;
    await context.addCookies([
      { name: 'session_id', value: 'abc', domain: HOST, path: '/', httpOnly: true, secure: true, sameSite: 'Strict', expires },
      { name: 'region', value: 'astana', domain: '.example.com', path: '/' },
      { name: 'cart', value: '1', domain: HOST, path: '/checkout' },
      // Чужой поддомен — сайт вкладки её не видит
      { name: 'foreign', value: 'x', domain: 'prod.example.com', path: '/' }
    ]);
  });

  test('таблица: HttpOnly, доменные и cookie других путей; чужой хост не виден; фильтр', async ({ page, context, ext, extensionId }) => {
    const popup = await openPopup(context, page, ext, extensionId);
    await expect(popup.locator('#host')).toHaveText(HOST);
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['cart', 'region', 'session_id']);
    // В окне расширения значение HttpOnly видно
    await expect(row(popup, 'session_id').locator('.ct-value')).toHaveText('abc');
    // Клик по значению правку не открывает — только ✎
    await row(popup, 'session_id').locator('.ct-value').click();
    await expect(popup.getByLabel('Значение session_id', { exact: true })).toHaveCount(0);
    // Домен, путь, флаги и срок — в подсказке к имени
    await expect(row(popup, 'session_id').locator('.ct-name'))
      .toHaveAttribute('title', /^session_id\nstage\.example\.com · HttpOnly · Secure · SameSite=Strict · до \d\d\.\d\d\.\d{4}/);
    await expect(row(popup, 'region').locator('.ct-name')).toHaveAttribute('title', 'region\n.example.com · сессия');
    await expect(row(popup, 'cart').locator('.ct-name')).toHaveAttribute('title', 'cart\nstage.example.com · /checkout · сессия');
    // Без списка значений — одна линия, без чипов
    await expect(row(popup, 'cart').locator('.ct-chips')).toHaveCount(0);

    await popup.getByLabel('Фильтр cookie').fill('ast');
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['region']);
  });

  test('cookie со списком значений — вверху, в каждой группе по алфавиту', async ({ page, context, ext, extensionId }) => {
    await ext.setStorage({
      'cookies.values': [
        { name: 'session_id', domain: HOST, values: ['abc'] },
        // Cookie на сайте нет, но список есть — тоже вверху
        { name: 'lang', domain: '.example.com', values: ['ru'] }
      ]
    });
    const popup = await openPopup(context, page, ext, extensionId);
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['lang', 'session_id', 'cart', 'region']);

    // Появился список — строка поднимается, убрали последнее значение — возвращается к остальным
    await row(popup, 'region').getByRole('button', { name: 'Добавить значение для region' }).click();
    await popup.getByLabel('Новое значение для region').press('Enter');
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['lang', 'region', 'session_id', 'cart']);
    await row(popup, 'region').getByRole('button', { name: 'Убрать astana из списка' }).click();
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['lang', 'session_id', 'cart', 'region']);
  });

  test('правка значения в строке: домен, путь, срок и флаги не меняются', async ({ page, context, ext, extensionId }) => {
    const before = await cookie(context, 'session_id');
    const popup = await openPopup(context, page, ext, extensionId);
    await row(popup, 'session_id').getByRole('button', { name: 'Изменить значение session_id' }).click();
    const input = popup.getByLabel('Значение session_id', { exact: true });
    await expect(input).toHaveValue('abc');
    await input.fill('new-session');
    await input.press('Enter');
    await expect(row(popup, 'session_id').locator('.ct-value')).toHaveText('new-session');
    expect(await cookie(context, 'session_id')).toEqual({ ...before, value: 'new-session' });
  });

  test('Esc отменяет правку', async ({ page, context, ext, extensionId }) => {
    const popup = await openPopup(context, page, ext, extensionId);
    await row(popup, 'region').getByRole('button', { name: 'Изменить значение region' }).click();
    await popup.getByLabel('Значение region', { exact: true }).fill('changed');
    await popup.getByLabel('Значение region', { exact: true }).press('Escape');
    await expect(row(popup, 'region').locator('.ct-value')).toHaveText('astana');
    expect((await cookie(context, 'region')).value).toBe('astana');
  });

  test('список значений: «запомнить текущее», добавить, переключить, убрать из списка', async ({ page, context, ext, extensionId }) => {
    const before = await cookie(context, 'session_id');
    const popup = await openPopup(context, page, ext, extensionId);
    const r = row(popup, 'session_id');

    // Поле нового значения предлагает текущее — Enter запоминает его
    await r.getByRole('button', { name: 'Добавить значение для session_id' }).click();
    await expect(popup.getByLabel('Новое значение для session_id')).toHaveValue('abc');
    await popup.getByLabel('Новое значение для session_id').press('Enter');
    await r.getByRole('button', { name: 'Добавить значение для session_id' }).click();
    await popup.getByLabel('Новое значение для session_id').fill('admin-token');
    await popup.getByLabel('Новое значение для session_id').press('Enter');

    const chips = r.locator('.ct-chip-set');
    await expect(chips).toHaveText(['abc', 'admin-token']);
    await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
    expect(await ext.getStorage(['cookies.values'])).toEqual({
      'cookies.values': [{ name: 'session_id', domain: HOST, values: ['abc', 'admin-token'] }]
    });

    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(await cookie(context, 'session_id')).toEqual({ ...before, value: 'admin-token' });

    // × убирает значение из списка, cookie не трогает
    await r.getByRole('button', { name: 'Убрать abc из списка' }).click();
    await expect(chips).toHaveText(['admin-token']);
    expect((await cookie(context, 'session_id')).value).toBe('admin-token');
  });

  test('смена значения не сбрасывает прокрутку таблицы', async ({ page, context, ext, extensionId }) => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: 'c' + String(i).padStart(2, '0'), value: 'v', domain: HOST, path: '/' }));
    await context.addCookies([...many, { name: 'zz_last', value: 'a', domain: HOST, path: '/' }]);
    // Cookie со списком идут первыми — списки у всех, чтобы zz_last оставалась внизу
    await ext.setStorage({
      'cookies.values': [
        ...many.map(({ name }) => ({ name, domain: HOST, values: ['v'] })),
        { name: 'zz_last', domain: HOST, values: ['a', 'b'] }
      ]
    });
    const popup = await openPopup(context, page, ext, extensionId);
    const rows = popup.locator('.ct-rows');
    const last = row(popup, 'zz_last');
    await last.scrollIntoViewIfNeeded();
    const before = await rows.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);

    await last.getByRole('button', { name: 'b', exact: true }).click();
    await expect(last.locator('.ct-chip-set').nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(await rows.evaluate((el) => el.scrollTop)).toBe(before);

    // Правка значения в строке — тоже
    await last.getByRole('button', { name: 'Изменить значение zz_last' }).click();
    await popup.getByLabel('Значение zz_last', { exact: true }).fill('c');
    await popup.getByLabel('Значение zz_last', { exact: true }).press('Enter');
    await expect(last.locator('.ct-value')).toHaveText('c');
    expect(await rows.evaluate((el) => el.scrollTop)).toBe(before);
  });

  test('cookie нет, а список есть — строка остаётся, клик по значению создаёт cookie', async ({ page, context, ext, extensionId }) => {
    await ext.setStorage({ 'cookies.values': [{ name: 'lang', domain: '.example.com', values: ['ru', 'kk'] }] });
    const popup = await openPopup(context, page, ext, extensionId);
    const r = row(popup, 'lang');
    await expect(r.locator('.ct-value')).toHaveText('нет на сайте — выберите значение');
    await expect(r.getByRole('button', { name: 'Изменить значение lang' })).toHaveCount(0);
    await r.getByRole('button', { name: 'kk', exact: true }).click();
    await expect(r.locator('.ct-chip-set').nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(await cookie(context, 'lang')).toMatchObject({ value: 'kk', domain: '.example.com', path: '/', expires: -1, httpOnly: false });
  });

  test('добавление: host-only и доменная; повтор — ошибка, введённое не пропадает', async ({ page, context, ext, extensionId }) => {
    const popup = await openPopup(context, page, ext, extensionId);
    await popup.getByLabel('Имя новой cookie').fill('debug');
    await popup.getByLabel('Значение новой cookie').fill('1');
    await popup.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(row(popup, 'debug')).toBeVisible();
    expect(await cookie(context, 'debug')).toMatchObject({ value: '1', domain: HOST, path: '/', expires: -1 });
    await expect(popup.getByLabel('Имя новой cookie')).toHaveValue('');

    await popup.getByLabel('Имя новой cookie').fill('debug');
    await popup.getByLabel('Значение новой cookie').fill('2');
    await popup.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(popup.locator('.ct-error')).toContainText('cookie debug уже есть');
    await expect(popup.getByLabel('Значение новой cookie')).toHaveValue('2');

    await popup.getByLabel('Домен новой cookie').selectOption('.example.com');
    await popup.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(popup.locator('.ct-row .ct-name', { hasText: /^debug$/ })).toHaveCount(2);
    expect((await context.cookies('https://' + HOST)).filter((c) => c.name === 'debug').map((c) => c.domain).sort())
      .toEqual(['.example.com', HOST]);
  });

  test('удаление — по второму клику', async ({ page, context, ext, extensionId }) => {
    const popup = await openPopup(context, page, ext, extensionId);
    const remove = row(popup, 'cart').getByRole('button', { name: 'Удалить cart' });
    await remove.click();
    await expect(remove).toHaveText('Удалить?');
    expect(await cookie(context, 'cart', 'https://' + HOST + '/checkout')).not.toBeNull();
    await remove.click();
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['region', 'session_id']);
    expect(await cookie(context, 'cart', 'https://' + HOST + '/checkout')).toBeNull();
  });

  test('«Удалить все cookie» — по второму клику, только видимые сайту; списки значений остаются', async ({ page, context, ext, extensionId }) => {
    await ext.setStorage({ 'cookies.values': [{ name: 'lang', domain: '.example.com', values: ['ru'] }] });
    const popup = await openPopup(context, page, ext, extensionId);
    const clear = popup.getByRole('button', { name: 'Удалить все' });
    await clear.click();
    await expect(clear).toHaveText('Удалить все?');
    expect(await cookie(context, 'region')).not.toBeNull();
    await clear.click();
    await expect(popup.locator('.ct-notice')).toHaveText('Удалено cookie: 3');
    // Остаётся строка списка значений — cookie на сайте нет
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['lang']);
    expect(await cookie(context, 'session_id')).toBeNull();
    expect(await cookie(context, 'region')).toBeNull();
    expect(await cookie(context, 'cart', 'https://' + HOST + '/checkout')).toBeNull();
    // Cookie чужого поддомена сайт не видит — она остаётся
    expect(await cookie(context, 'foreign', 'https://prod.example.com/')).not.toBeNull();
    expect((await ext.getStorage('cookies.values'))['cookies.values']).toHaveLength(1);
    // Удалять больше нечего
    await expect(clear).toBeDisabled();
  });

  test('«Очистить кэш» — кэш источника вкладки, cookie на месте', async ({ page, context, ext, extensionId }) => {
    const popup = await openPopup(context, page, ext, extensionId);
    await popup.getByRole('button', { name: 'Очистить кэш' }).click();
    await expect(popup.locator('.ct-notice')).toHaveText('Кэш ' + HOST + ' очищен');
    await expect(popup.locator('.ct-error')).toBeHidden();
    await expect(popup.locator('.ct-row .ct-name')).toHaveText(['cart', 'region', 'session_id']);
  });

  test('сайт не добавлен — подсказка и кнопка в настройки', async ({ page, context, ext, extensionId }) => {
    await ext.setStorage({ 'cookies.hosts': [] });
    const popup = await openPopup(context, page, ext, extensionId);
    await expect(popup.locator('.message')).toHaveAttribute('data-status', 'no-site');
    await expect(popup.getByRole('button', { name: 'Добавить сайт' })).toBeVisible();
    await expect(popup.locator('.ct-row')).toHaveCount(0);
  });
});

test('на странице сайта ничего не появляется, а блок «Сайты» в настройках остаётся', async ({ page, optionsPage, ext }) => {
  await ext.setStorage({ 'cookies.hosts': [HOST] });
  await page.goto(PAGE);
  await expect(page.locator('h1')).toHaveText('catalog');
  await expect(page.locator('#dev-helper-cookies')).toHaveCount(0);
  expect((await ext.registeredScripts()).map((script) => script.id)).not.toContain('feature-cookies');

  await optionsPage.goto(optionsPage.url().split('#')[0] + '#cookies');
  await optionsPage.reload();
  await expect(optionsPage.locator('section.panel#cookies .sites-list')).toContainText(HOST);
});

test('настройки: списки значений — убрать значение и список', async ({ optionsPage, ext }) => {
  await ext.setStorage({
    'cookies.values': [
      { name: 'region', domain: '.example.com', values: ['almaty', 'astana'] },
      { name: 'ab', domain: HOST, values: ['A', 'B'] }
    ]
  });
  await optionsPage.goto(optionsPage.url().split('#')[0] + '#cookies');
  await optionsPage.reload();
  const section = optionsPage.locator('section.panel#cookies');
  const lists = section.locator('.value-list');
  await expect(lists.locator('.value-list-name')).toHaveText(['region', 'ab']);

  await lists.nth(0).locator('.tag', { hasText: 'astana' }).getByRole('button').click();
  await lists.nth(1).locator('button.remove').click();
  await optionsPage.locator('#save').click();
  await expect(optionsPage.locator('#status')).toHaveText('Сохранено');
  expect(await ext.getStorage(['cookies.values'])).toEqual({
    'cookies.values': [{ name: 'region', domain: '.example.com', values: ['almaty'] }]
  });
});
