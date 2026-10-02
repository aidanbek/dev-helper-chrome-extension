// Фича «Задачи Jira»: метаданные и настройки по умолчанию.
(() => {
  'use strict';

  globalThis.DevHelper.registerFeature({
    id: 'jiraIssue',
    slug: 'jira-issue',
    title: 'Задачи Jira',
    description:
      'Кнопка «Залить на stage» в задаче Jira, пока задача в статусе «Тестирование»: открывает MR из поля задачи ' +
      'в GitLab, а там фича «Merge requests» проверяет его и открывает форму MR на stage. ' +
      'Кнопка «Pipeline ветки» в задаче с одной из заданных меток: открывает последний pipeline исходной ветки MR, ' +
      'чтобы запустить preview-окружение.',
    // Content script регистрирует background на хостах из настройки hosts, к которым выдан доступ.
    // Задача открывается и отдельной страницей (/browse/KEY), и модальным окном на досках, в бэклоге и поиске
    content: {
      sitesLabel: 'Адреса Jira',
      sitesPlaceholder: 'example.atlassian.net',
      paths: ['/browse/*', '/jira/*', '/issues*'],
      js: [
        'common/core.js',
        'common/storage.js',
        'features/jira-issue/feature.js',
        'features/jira-issue/content.js'
      ],
      css: ['features/jira-issue/content.css']
    },
    defaults: {
      enabled: true,
      hosts: [],
      stageButton: true,
      stageStatus: 'Тестирование',
      mrField: 'Merge Request',
      pipelineButton: true,
      pipelineLabels: '',
      labelsField: 'Labels'
    }
  });
})();
