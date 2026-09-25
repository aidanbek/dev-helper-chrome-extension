# Политика конфиденциальности / Privacy Policy — Dev Helper

_Последнее обновление / Last updated: 2026-09-25_

## Русский

Dev Helper не собирает, не хранит на внешних серверах и не передаёт третьим лицам никакие данные пользователя.

- **Настройки** (шаблоны, правила, ссылки, username) хранятся в `chrome.storage.sync`. Если в браузере
  включена синхронизация, Chrome синхронизирует их между вашими устройствами через ваш аккаунт Google.
  У разработчика расширения доступа к ним нет.
- **Доступ к сайтам.** Расширение работает только на сайтах, которые вы сами добавили в настройках
  и к которым выдали доступ; доступ к остальным сайтам у него нет.
- **Содержимое страниц.** На страницах merge request расширение читает название MR, ссылку, ветки, автора,
  апрувы и треды, чтобы скопировать текст в буфер обмена и показать кнопки; в задачах Jira — статус задачи
  и ссылку на MR из поля задачи. Эти данные обрабатываются только локально в браузере и никуда не отправляются.
- **Сетевые запросы.** Расширение запрашивает `widget.json` текущего merge request у того же сервера,
  с которого открыта страница, чтобы узнать о конфликтах слияния. Других запросов нет, аналитики и трекинга нет.
- **Внешние ссылки.** По вашему действию расширение открывает указанные вами в настройках ссылки
  (Telegram, Jira). Что происходит на этих сайтах, определяют их собственные политики.

Удалить все данные можно, удалив расширение.

## English

Dev Helper does not collect user data, does not store it on external servers, and does not share it with third parties.

- **Settings** (templates, rules, links, username) are stored in `chrome.storage.sync`. If browser sync is on,
  Chrome syncs them across your devices through your Google account. The developer has no access to them.
- **Site access.** The extension only runs on sites you added in the settings and granted access to;
  it has no access to any other site.
- **Page content.** On merge request pages the extension reads the MR title, URL, branches, author, approvals
  and threads to copy text to the clipboard and show its buttons; in Jira issues it reads the issue status
  and the MR link from an issue field. This data is processed locally in the browser only and is never sent anywhere.
- **Network requests.** The extension requests the current merge request's `widget.json` from the same server
  the page was loaded from, to detect merge conflicts. No other requests are made; there is no analytics or tracking.
- **External links.** On your action the extension opens links you configured in the settings (Telegram, Jira).
  Those sites are governed by their own policies.

Removing the extension deletes all of its data.
