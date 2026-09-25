// Сайты, на которых работают фичи: доступ к хостам запрашивается у пользователя (optional_host_permissions),
// content scripts регистрируются в background только для разрешённых хостов.
(() => {
  'use strict';

  const DevHelper = globalThis.DevHelper;

  const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

  // "https://GitLab.example.com:8443/group/project" -> "gitlab.example.com"; мусор -> null.
  // Порт отбрасываем: в match pattern его не указать, шаблон хоста покрывает любой порт.
  function normalizeHost(input) {
    let value = String(input || '').trim().toLowerCase();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = 'https://' + value;
    try {
      const host = new URL(value).hostname;
      return HOST_RE.test(host) ? host : null;
    } catch (e) {
      return null;
    }
  }

  function originPattern(host) {
    return '*://' + host + '/*';
  }

  // Шаблоны страниц фичи на конкретном хосте: content.paths = ['/*/-/merge_requests*', …]
  function matchesFor(feature, hosts) {
    const paths = (feature.content && feature.content.paths) || [];
    return hosts.flatMap((host) => paths.map((path) => '*://' + host + path));
  }

  function hasAccess(host) {
    return chrome.permissions.contains({ origins: [originPattern(host)] });
  }

  DevHelper.sites = { normalizeHost, originPattern, matchesFor, hasAccess };
})();
