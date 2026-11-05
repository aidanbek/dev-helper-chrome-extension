// REST API Jira того же сайта — для content scripts на страницах Jira: куки сессии уходят сами (same-origin).
// Подключается несколькими фичами на одной странице — повторная загрузка ничего не делает
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;
  if (DevHelper.jiraApi) return;

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  // Страница поиска задач; новый поиск Jira Cloud (/search/jql) листается по nextPageToken.
  // Ответ — { issues, nextPageToken, isLast }
  function search(jql, fields, maxResults, nextPageToken) {
    const params = new URLSearchParams({ jql, fields, maxResults: String(maxResults) });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    return getJson('/rest/api/3/search/jql?' + params);
  }

  // id поля по названию, как в задаче («Merge Request» → customfield_10050); null — такого поля нет
  async function fieldId(name) {
    const fields = await getJson('/rest/api/3/field');
    const field = (fields || []).find((f) => DevHelper.normalize(f.name) === DevHelper.normalize(name));
    return field ? field.id : null;
  }

  DevHelper.jiraApi = { getJson, search, fieldId };
})();
