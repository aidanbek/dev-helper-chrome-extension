// Фейковая Jira на jira.example.com: страница релиза (Releases → версия) со списком задач и REST API,
// из которого features/jira-release/content.js берёт метки, статус и поле MR. Запросы перехватывает Playwright.
const HOST = 'jira.example.com';
const ORIGIN = 'https://' + HOST;
const VERSION = '10001';
const MR_FIELD = 'customfield_10050';

const ISSUES = [
  { key: 'PRJ-1', summary: 'Fix login form', status: 'Done', labels: ['back'] },
  { key: 'PRJ-2', summary: 'Add cart badge', status: 'In Progress', labels: ['front'] },
  { key: 'PRJ-3', summary: 'Update price import', status: 'Done', labels: [] }
];

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function releaseUrl() {
  return ORIGIN + '/projects/PRJ/versions/' + VERSION + '/tab/release-report-all-issues';
}

// Строка, как у Jira, целиком кликабельна: клик записывает открытую задачу в body[data-opened]
function releasePage(issues) {
  const rows = issues.map((issue) => `
      <div class="row" style="display: flex; align-items: center; gap: 8px; height: 40px"
           onclick="document.body.dataset.opened = '${issue.key}'">
        <a href="/browse/${issue.key}">${issue.key}</a>
        <span>${escapeHtml(issue.summary)}</span>
        <span><span>${escapeHtml(issue.status)}</span></span>
      </div>`).join('');
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Release 1.0 - Jira</title></head>
<body>
  <main>
    <h1>Release 1.0</h1>
    <h2>Work items</h2>
    <div class="list">${rows}
    </div>
  </main>
</body>
</html>`;
}

// Подменяет Jira в контексте; возвращает адрес страницы релиза
async function fakeJira(context, issues = ISSUES) {
  const pagePath = new URL(releaseUrl()).pathname;
  await context.route(ORIGIN + '/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/rest/api/3/field') {
      return route.fulfill({ json: [{ id: MR_FIELD, name: 'Merge Request' }] });
    }
    if (pathname === '/rest/api/3/search/jql') {
      return route.fulfill({
        json: {
          isLast: true,
          issues: issues.map((issue) => ({
            key: issue.key,
            fields: { summary: issue.summary, labels: issue.labels, status: { name: issue.status }, [MR_FIELD]: null }
          }))
        }
      });
    }
    if (pathname === pagePath) {
      return route.fulfill({ contentType: 'text/html', body: releasePage(issues) });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  return releaseUrl();
}

module.exports = { HOST, ORIGIN, VERSION, ISSUES, releaseUrl, releasePage, fakeJira };
