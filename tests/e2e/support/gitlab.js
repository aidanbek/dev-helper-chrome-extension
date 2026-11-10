// Фейковый GitLab на gitlab.example.com: минимальная разметка страницы MR с теми селекторами,
// на которые опирается features/merge-requests/content.js. Запросы к сайту перехватывает Playwright.
const HOST = 'gitlab.example.com';
const ORIGIN = 'https://' + HOST;
const PROJECT = 'group/project';

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function labelLink(label) {
  return '<a class="gl-label-link" href="/' + PROJECT + '/-/merge_requests?label_name[]=' + encodeURIComponent(label) + '">' +
    escapeHtml(label) + '</a>';
}

function mrUrl(iid = 12) {
  return ORIGIN + '/' + PROJECT + '/-/merge_requests/' + iid;
}

// approvals — сколько аватарок в блоке апрувов, unresolved — нерешённых тредов
// labels — метки в сайдбаре (ссылки на список MR с фильтром, как у GitLab), descriptionLabels — такие же ссылки в описании
function mrPage({
  iid = 12, title, author = 'jdoe', source, target = 'develop', approvals = 0, unresolved = 0, labels = [], descriptionLabels = []
}) {
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
    <div class="description">${descriptionLabels.map(labelLink).join('')}</div>
    <aside>${labels.map(labelLink).join('')}</aside>
    <div class="mr-widget">
      <button type="button" class="btn" data-testid="merge-button" onclick="document.body.dataset.merged = 'yes'">Merge</button>
    </div>
  </div>
</body>
</html>`;
}

// Файлы MR для diffs_metadata.json: изменённый, новый, удалённый и переименованный
const DIFF_FILES = [
  { old_path: 'app/a.php', new_path: 'app/a.php', new_file: false, deleted_file: false, added_lines: 10, removed_lines: 4 },
  { old_path: 'app/b.php', new_path: 'app/b.php', new_file: true, deleted_file: false, added_lines: 30, removed_lines: 0 },
  { old_path: 'app/c.php', new_path: 'app/c.php', new_file: false, deleted_file: true, added_lines: 0, removed_lines: 12 },
  { old_path: 'app/d.php', new_path: 'app/e.php', new_file: false, deleted_file: false, renamed_file: true, added_lines: 1, removed_lines: 1 }
];

// realSize — как в урезанном большом MR: «1000+»
function diffsMetadata(files, realSize = String(files.length)) {
  return {
    real_size: realSize,
    added_lines: files.reduce((sum, f) => sum + f.added_lines, 0),
    removed_lines: files.reduce((sum, f) => sum + f.removed_lines, 0),
    diff_files: files
  };
}

// Подменяет GitLab в контексте. mr — параметры страницы MR (см. mrPage), conflicts — ответ widget.json,
// diffFiles и realSize — diffs_metadata.json (diffsStatus — код ошибки вместо него), apiLabels — метки MR в ответе API
async function fakeGitlab(context, { conflicts = false, diffFiles = DIFF_FILES, realSize, diffsStatus = 200, apiLabels = [], ...mr }) {
  const pagePath = new URL(mrUrl(mr.iid)).pathname;
  const apiPath = '/api/v4/projects/' + encodeURIComponent(PROJECT) + '/merge_requests/' + (mr.iid || 12);
  await context.route(ORIGIN + '/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === pagePath + '/widget.json') {
      return route.fulfill({ json: { has_conflicts: conflicts } });
    }
    if (pathname === apiPath) {
      return route.fulfill({ json: { iid: mr.iid || 12, labels: apiLabels } });
    }
    if (pathname === pagePath + '/diffs_metadata.json') {
      if (diffsStatus !== 200) return route.fulfill({ status: diffsStatus, body: 'error' });
      return route.fulfill({ json: diffsMetadata(diffFiles, realSize) });
    }
    if (pathname === pagePath) {
      return route.fulfill({ contentType: 'text/html', body: mrPage(mr) });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
  return mrUrl(mr.iid);
}

module.exports = { HOST, ORIGIN, PROJECT, mrUrl, mrPage, fakeGitlab };
