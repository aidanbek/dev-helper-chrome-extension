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
      'Кнопка «Открыть задачу в Jira» — по ключу задачи из ветки или названия MR. ' +
      'Апрувнутый MR (апрувы и все треды решены) гасит «Отправить на ревью» ' +
      'и открывает кнопку «Создать MR на stage». ' +
      'Кнопки префиксов из настроек (например, blocking или nit) в форме комментария ставят префикс в начало комментария.',
    // Content script регистрирует background на хостах из настройки hosts, к которым выдан доступ
    content: {
      sitesLabel: 'Адреса GitLab',
      sitesPlaceholder: 'gitlab.com',
      paths: ['/*/-/merge_requests*', '/dashboard/merge_requests*'],
      js: [
        'common/core.js',
        'common/storage.js',
        'common/clipboard.js',
        'common/telegram.js',
        'common/rules.js',
        'features/merge-requests/feature.js',
        'features/merge-requests/content.js'
      ],
      css: ['features/merge-requests/content.css']
    },
    defaults: {
      enabled: true,
      hosts: [],
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
      jiraRules: [],
      stageButton: true,
      defaultStageBranch: 'stage',
      stageRules: [],
      minApprovals: 2,
      commentPrefixButtons: true,
      // color — цвет кнопки (#rrggbb), пусто — обычная серая кнопка GitLab
      commentPrefixes: [],
      commentPrefixBold: true
    },
    // Префиксы комментариев из настройки: [{ name, color }] без пустых, повторов и двоеточий.
    // Строка 'blocking, nit' — формат ранних сборок, цвета у неё нет
    commentPrefixList(value) {
      const items = typeof value === 'string'
        ? value.split(/[\s,]+/).map((name) => ({ name, color: '' }))
        : Array.isArray(value) ? value : [];
      const prefixes = [];
      for (const item of items) {
        const name = String((item && item.name) || '').trim().replace(/:+$/, '');
        if (!name || prefixes.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
        const color = /^#[0-9a-f]{6}$/i.test((item && item.color) || '') ? item.color.toLowerCase() : '';
        prefixes.push({ name, color });
      }
      return prefixes;
    },
    // Свой username у каждого — в экспорт «для команды» не попадает
    personal: ['myUsername'],
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
