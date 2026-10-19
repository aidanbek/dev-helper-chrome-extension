# Политика конфиденциальности / Privacy Policy — Dev Helper

_Последнее обновление / Last updated: 2026-10-19_

## Русский

Dev Helper не собирает, не хранит на внешних серверах и не передаёт третьим лицам никакие данные пользователя.

- **Настройки** (шаблоны, правила, ссылки, username) хранятся в `chrome.storage.sync`. Если в браузере
  включена синхронизация, Chrome синхронизирует их между вашими устройствами через ваш аккаунт Google.
  У разработчика расширения доступа к ним нет.
- **Экспорт настроек.** По вашему действию расширение сохраняет настройки в файл на вашем компьютере
  или копирует в буфер обмена; импорт читает выбранный вами файл, вставленный текст или файл по указанной вами
  ссылке (см. «Сетевые запросы»). Никуда не отправляется.
- **Доступ к сайтам.** Расширение работает только на сайтах, которые вы сами добавили в настройках
  и к которым выдали доступ; доступ к остальным сайтам у него нет.
- **Содержимое страниц.** На страницах merge request расширение читает название MR, ссылку, ветки, автора,
  апрувы и треды, чтобы скопировать текст в буфер обмена и показать кнопки; в задачах Jira — статус задачи
  и ссылку на MR из поля задачи. По пункту контекстного меню «Переходов» или их горячей клавише
  расширение берёт адрес текущей страницы или ссылки, чтобы построить ссылку по вашим правилам.
  Эти данные обрабатываются только локально в браузере и никуда не отправляются.
- **Сетевые запросы.** Расширение запрашивает `widget.json` текущего merge request у того же сервера,
  с которого открыта страница, чтобы узнать о конфликтах слияния. На странице релиза Jira расширение запрашивает
  у того же сайта Jira метки и статус задач релиза и ссылки на MR из поля задачи (и список полей, чтобы найти это поле),
  чтобы показать фильтр по меткам и ссылки на MR в списке. При импорте по ссылке расширение по вашему действию
  загружает файл настроек с указанного вами адреса (с куками этого сайта, чтобы открылся приватный файл);
  на этот адрес ничего не отправляется. Других запросов нет, аналитики и трекинга нет.
- **Внешние ссылки.** По вашему действию расширение открывает указанные вами в настройках ссылки
  (Telegram, Jira, ссылки «Переходов»). Что происходит на этих сайтах, определяют их собственные политики.

Удалить все данные можно, удалив расширение.

## English

Dev Helper does not collect user data, does not store it on external servers, and does not share it with third parties.

- **Settings** (templates, rules, links, username) are stored in `chrome.storage.sync`. If browser sync is on,
  Chrome syncs them across your devices through your Google account. The developer has no access to them.
- **Settings export.** On your action the extension saves the settings to a file on your computer or copies them
  to the clipboard; import reads the file or text you provide, or a file from a URL you enter (see "Network requests").
  Nothing is sent anywhere.
- **Site access.** The extension only runs on sites you added in the settings and granted access to;
  it has no access to any other site.
- **Page content.** On merge request pages the extension reads the MR title, URL, branches, author, approvals
  and threads to copy text to the clipboard and show its buttons; in Jira issues it reads the issue status
  and the MR link from an issue field. When you use a "Redirects" context menu item or its hotkey, it takes
  the URL of the current page or link to build a link by your rules.
  This data is processed locally in the browser only and is never sent anywhere.
- **Network requests.** The extension requests the current merge request's `widget.json` from the same server
  the page was loaded from, to detect merge conflicts. On a Jira release page it requests the labels, status and the MR link field
  of the release's issues (and the field list, to find that field) from the same Jira site to show the labels filter
  and MR links in the list. When importing from a URL, on your action the extension downloads the settings file
  from the address you entered (with that site's cookies, so a private file can be opened); nothing is sent to it.
  No other requests are made; there is no analytics or tracking.
- **External links.** On your action the extension opens links you configured in the settings (Telegram, Jira, "Redirects" links).
  Those sites are governed by their own policies.

Removing the extension deletes all of its data.
