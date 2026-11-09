// Фича «Cookie»: метаданные и настройки по умолчанию.
(() => {
  'use strict';

  globalThis.DevHelper.registerFeature({
    id: 'cookies',
    slug: 'cookies',
    title: 'Cookie',
    description:
      'Таблица cookie сайта — в окне по клику на иконку расширения: значения, домен, путь и флаги, ' +
      'в том числе HttpOnly. У cookie можно сохранить список значений и переключать их одним кликом — меняется только значение, ' +
      'остальные параметры остаются. Там же — правка значения, добавление и удаление cookie.',
    // Только блок «Сайты» в настройках: скрипта на странице нет, таблица — в окне расширения
    content: {
      sitesLabel: 'Адрес сайта',
      sitesPlaceholder: 'stage.example.com'
    },
    defaults: {
      enabled: true,
      hosts: [],
      // Списки значений: [{ name, domain, values: [строка] }]; domain — как у chrome.cookies:
      // "stage.example.com" — host-only, ".example.com" — домен и поддомены
      values: []
    }
  });
})();
