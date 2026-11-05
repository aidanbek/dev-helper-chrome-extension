// Фича «Переходы»: background открывает ссылку по правилу.
// Горячую клавишу и пункт контекстного меню Chrome из теста не нажать — вызываем те же обработчики background,
// которые на них подписаны (openRedirectFromHotkey, openByRule), с настоящей вкладкой.
// Результат проверяем по вкладкам Chrome: вкладку, созданную расширением, Playwright подхватывает уже после
// начала загрузки, и его перехват запросов на неё не действует — важен адрес и место вкладки, а не её содержимое.
const { test, expect } = require('./support/fixtures');

const RULES = [
  { title: 'В админку', page: '{env}.example.com/product/*-{id:num}', target: 'https://{env}-admin.example.com/products/{id}' },
  { title: 'В поиск', page: '{env}.example.com/product/{slug}', target: 'https://{env}.example.com/search?q={slug}' }
];

const CATALOG = 'https://stage.example.com/catalog';
const PRODUCT = 'https://stage.example.com/product/brake-pad-c7011lr-512644';

// Страница, с которой переходим, — пустой HTML
test.beforeEach(async ({ context }) => {
  await context.route('https://stage.example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>page</title>' }));
});

function tabs(ext) {
  return ext.worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => ({
    id: tab.id,
    index: tab.index,
    opener: tab.openerTabId,
    url: tab.pendingUrl || tab.url
  })));
}

function hotkey(ext, pageUrl) {
  return ext.worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    // eslint-disable-next-line no-undef -- функция background.js
    await openRedirectFromHotkey(tab);
  }, pageUrl);
}

// Новая вкладка открыта рядом с исходной и знает, откуда открыта.
// Опрашиваем: пока вкладка грузится, между pendingUrl и url бывает момент, когда у неё нет ни того, ни другого
async function expectOpenedNextTo(ext, sourceUrl, url) {
  await expect.poll(async () => {
    const all = await tabs(ext);
    const source = all.find((tab) => tab.url === sourceUrl);
    const opened = all.find((tab) => tab.url === url);
    if (!source || !opened) return all.map((tab) => tab.url);
    return { nextToSource: opened.index === source.index + 1, opener: opened.opener === source.id };
  }, { message: 'вкладка ' + url + ' рядом с ' + sourceUrl }).toEqual({ nextToSource: true, opener: true });
}

test('горячая клавиша открывает первое подходящее правило рядом с текущей вкладкой', async ({ page, ext }) => {
  await ext.setStorage({ 'redirects.rules': RULES });
  await page.goto(PRODUCT);
  const count = (await tabs(ext)).length;

  await hotkey(ext, PRODUCT);
  // Подходят оба правила — открывается только первое: ровно одна новая вкладка.
  // Число вкладок, в отличие от адреса, известно сразу — обработчик дожидается chrome.tabs.create
  expect(await tabs(ext)).toHaveLength(count + 1);
  await expectOpenedNextTo(ext, PRODUCT, 'https://stage-admin.example.com/products/512644');
});

test('без подходящего правила и с выключенной горячей клавишей ничего не открывает', async ({ page, ext }) => {
  await ext.setStorage({ 'redirects.rules': RULES });
  await page.goto(CATALOG);
  const count = (await tabs(ext)).length;
  // Обработчик дожидается chrome.tabs.create — после него новая вкладка уже была бы в списке
  await hotkey(ext, CATALOG);
  expect(await tabs(ext)).toHaveLength(count);

  await ext.setStorage({ 'redirects.hotkey': false });
  await page.goto(PRODUCT);
  await hotkey(ext, PRODUCT);
  expect(await tabs(ext)).toHaveLength(count);
});

test('пункт меню на ссылке открывает переход по своему правилу и адресу ссылки', async ({ page, ext }) => {
  await ext.setStorage({ 'redirects.rules': RULES });
  await page.goto(CATALOG);

  // Клик по пункту «В поиск» на ссылке на товар в каталоге
  await ext.worker.evaluate(async ({ pageUrl, linkUrl }) => {
    const [tab] = await chrome.tabs.query({ url: pageUrl });
    // eslint-disable-next-line no-undef -- функция background.js
    await openByRule(1, linkUrl, tab);
  }, { pageUrl: CATALOG, linkUrl: 'https://stage.example.com/product/oil-filter' });

  await expectOpenedNextTo(ext, CATALOG, 'https://stage.example.com/search?q=oil-filter');
});
