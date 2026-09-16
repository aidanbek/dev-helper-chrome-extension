// Фича «Merge requests»: метаданные и настройки по умолчанию.
(() => {
  'use strict';

  globalThis.DevHelper.registerFeature({
    id: 'mergeRequests',
    slug: 'merge-requests',
    title: 'Merge requests',
    description:
      'Кнопка «Отправить на ревью» на странице merge request и в списках MR: копирует название и ссылку, ' +
      'по желанию открывает топик в Telegram. Shift+клик инвертирует открытие Telegram. ' +
      'Кнопка «Открыть задачу в Jira» — по ключу задачи из ветки или названия MR.',
    defaults: {
      enabled: true,
      myUsername: '',
      template: '{title}\n\n{url}',
      boldTitle: true,
      hotkey: true,
      listButtons: true,
      openTelegram: true,
      telegramApp: true,
      defaultTopicUrl: '',
      rules: [],
      jiraButton: true,
      defaultJiraUrl: '',
      jiraRules: []
    },
    legacyKeys: [
      'template',
      'boldTitle',
      'hotkey',
      'listButtons',
      'openTelegram',
      'telegramApp',
      'defaultTopicUrl',
      'rules'
    ]
  });
})();
