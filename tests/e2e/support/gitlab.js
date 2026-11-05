// Фейковый GitLab на gitlab.example.com: минимальная разметка страницы MR с теми селекторами,
// на которые опирается features/merge-requests/content.js. Запросы к сайту перехватывает Playwright.
const HOST = 'gitlab.example.com';
const ORIGIN = 'https://' + HOST;
const PROJECT = 'group/project';

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function mrUrl(iid = 12) {
  return ORIGIN + '/' + PROJECT + '/-/merge_requests/' + iid;
}

// approvals — сколько аватарок в блоке апрувов, unresolved — нерешённых тредов
function mrPage({ iid = 12, title, author = 'jdoe', source, target = 'develop', approvals = 0, unresolved = 0 }) {
  const avatars = Array.from({ length: approvals }, (_, i) =>
    '<a href="/approver' + i + '"><img class="avatar" alt=""></a>').join('');
  return `<!doctype html>
<html>
<head><meta charset="utf-8">
<!-- Из стилей GitLab — только размер иконок: без него SVG кнопок и модалок растягиваются -->
<style>.s16 { width: 16px; height: 16px; }</style>
<title>${escapeHtml(title)} (!${iid}) · Merge requests · Group / Project · GitLab</title></head>
<body>
  <div class="merge-request-details">
    <h1 data-testid="title-content">${escapeHtml(title)}</h1>
    <div class="merge-request-author-container">
      <a class="author-link" data-testid="author-link" data-username="${escapeHtml(author)}" href="/${escapeHtml(author)}">
        <span class="author">${escapeHtml(author)}</span>
      </a>
      requested to merge
      <span class="ref-container" data-testid="source-branch">${escapeHtml(source)}</span>
      into
      <span class="ref-container" data-testid="target-branch">${escapeHtml(target)}</span>
    </div>
    <div class="merge-request-tabs-container"><a href="#">Overview</a> <a href="#">Changes</a></div>
    <div data-testid="approvals-summary-content">${avatars}</div>
    <div data-testid="discussions-counter-text">${unresolved}</div>
    <div class="mr-widget">
      <button type="button" class="btn" data-testid="merge-button" onclick="document.body.dataset.merged = 'yes'">Merge</button>
    </div>
  </div>
</body>
</html>`;
}

// Подменяет GitLab в контексте. mr — параметры страницы MR (см. mrPage), conflicts — ответ widget.json
async function fakeGitlab(context, { conflicts = false, ...mr }) {
  const pagePath = new URL(mrUrl(mr.iid)).pathname;
  await context.route(ORIGIN + '/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === pagePath + '/widget.json') {
      return route.fulfill({ json: { has_conflicts: conflicts } });
    }
    if (pathname === pagePath) {
      return route.fulfill({ contentType: 'text/html', body: mrPage(mr) });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  return mrUrl(mr.iid);
}

module.exports = { HOST, ORIGIN, PROJECT, mrUrl, mrPage, fakeGitlab };
