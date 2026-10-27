// Ссылки на MR GitLab в задачах Jira: поиск в тексте поля или JSON из API, подписи для кнопок.
// Подключается несколькими фичами на одной странице — повторная загрузка ничего не делает
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  if (DevHelper.mrLinks) return;

  // Ссылка на MR в тексте, URL или JSON (документ Atlassian): хвост /diffs, ?tab=, #note_… отрезаем
  const MR_RE = /https?:\/\/[^\s"'<>\\]+?\/-\/merge_requests\/\d+/g;

  // https://gitlab.example.com/group/project/-/merge_requests/12/diffs -> …/merge_requests/12, без повторов
  function find(text) {
    return Array.from(new Set((text || '').match(MR_RE) || []));
  }

  // «group/sub/project!12» — какой MR откроется
  function ref(url) {
    const m = url.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/);
    return m ? m[1] + '!' + m[2] : url;
  }

  // Номер MR в проекте: …/merge_requests/12 -> 12
  function iid(url) {
    const m = url.match(/\/merge_requests\/(\d+)/);
    return m ? m[1] : '';
  }

  DevHelper.mrLinks = { find, ref, iid };
})();
