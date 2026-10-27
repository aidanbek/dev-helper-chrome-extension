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
      'чтобы запустить preview-окружение. ' +
      'На странице задачи — метки под названием в строках таблиц (Child work items эпика): все, обязательные — первыми, ' +
      'и фильтр по меткам над таблицей (Shift+клик — исключить метку, режим «ИЛИ / И»).',
    // Content script регистрирует background на хостах из настройки hosts, к которым выдан доступ.
    // Задача открывается и отдельной страницей (/browse/KEY), и модальным окном на досках, в бэклоге и поиске
    content: {
      sitesLabel: 'Адреса Jira',
      sitesPlaceholder: 'example.atlassian.net',
      paths: ['/browse/*', '/jira/*', '/issues*'],
      js: [
        'common/core.js',
        'common/storage.js',
        'common/label-filter.js',
        'features/jira-issue/feature.js',
        'features/jira-issue/content.js',
        'features/jira-issue/labels.js'
      ],
      css: ['common/label-filter.css', 'features/jira-issue/content.css']
    },
    defaults: {
      enabled: true,
      hosts: [],
      stageButton: true,
      stageStatus: 'Тестирование',
      mrField: 'Merge Request',
      pipelineButton: true,
      pipelineLabels: '',
      labelsField: 'Labels',
      rowLabels: true,
      labelsFilter: true
    }
  });
})();
