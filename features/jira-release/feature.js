// Фича «Релизы Jira»: метаданные и настройки по умолчанию.
(() => {
  'use strict';

  globalThis.DevHelper.registerFeature({
    id: 'jiraRelease',
    slug: 'jira-release',
    title: 'Релизы Jira',
    description:
      'Фильтр по меткам над списком задач на странице релиза (Releases → версия): чипы меток задач релиза ' +
      'с числом задач, «без меток» и «без обязательных меток»; метки задач в строках списка.',
    // Релиз — /projects/KEY/versions/ID или /jira/software/(c/)projects/KEY/versions/ID; в Jira-SPA на него
    // переходят без перезагрузки, поэтому скрипт загружается на всех страницах Jira и сам проверяет адрес
    content: {
      sitesLabel: 'Адреса Jira',
      sitesPlaceholder: 'example.atlassian.net',
      paths: ['/browse/*', '/jira/*', '/issues*', '/projects/*'],
      js: [
        'common/core.js',
        'common/storage.js',
        'features/jira-release/feature.js',
        'features/jira-release/content.js'
      ],
      css: ['features/jira-release/content.css']
    },
    defaults: {
      enabled: true,
      hosts: [],
      requiredLabels: '',
      rowLabels: true
    }
  });
})();
