# Chrome Web Store: карточка и ответы для дашборда

Тексты для полей Developer Dashboard. В пакет расширения не входит.

## Store listing

**Category:** Developer Tools
**Language:** Russian (плюс English, если добавим `_locales`)

### Summary (≤ 132 символа, берётся из `description` в манифесте)

Набор небольших помощников для повседневной работы разработчика

### Description — RU

Dev Helper — набор небольших помощников, которые убирают рутину из работы разработчика.
Каждый помощник включается и настраивается отдельно.

Merge requests (GitLab, включая self-hosted):
• Кнопка «Отправить на ревью» на странице MR: копирует название (жирным) и ссылку на MR
  и открывает нужный топик в Telegram — отдельный для каждого проекта.
• Иконка копирования в списках MR — без открытия самого MR.
• Настраиваемый шаблон текста: {title}, {url}, {iid}, {project}, {branch}, {author}.
• Горячая клавиша Alt+Shift+C.
• Кнопка «Открыть задачу в Jira» по ключу задачи из ветки или названия MR.
• Кнопка неактивна, пока MR в статусе Draft; предупреждение о конфликтах слияния.
• Фильтр «только мои MR».

Никаких данных не собирается: настройки хранятся в вашем браузере, страницы обрабатываются локально.

### Description — EN

Dev Helper is a set of small helpers that take routine out of a developer's day.
Each helper can be enabled and configured separately.

Merge requests (GitLab, including self-hosted):
• "Send for review" button on the MR page: copies the MR title (bold) and link
  and opens the right Telegram topic — one per project.
• Copy icon in MR lists, no need to open the MR.
• Customizable text template: {title}, {url}, {iid}, {project}, {branch}, {author}.
• Alt+Shift+C hotkey.
• "Open Jira issue" button using the issue key from the branch or MR title.
• Button is disabled while the MR is a Draft; merge conflict warning.
• "Only my MRs" filter.

No data is collected: settings stay in your browser, pages are processed locally.

### Графика

| Что | Размер | Статус |
| --- | --- | --- |
| Иконка | 128×128 PNG (берётся из пакета) | есть; по гайдлайнам — рисунок 96×96 с прозрачными полями 16 px |
| Скриншоты | 1280×800 или 640×400, 1–5 шт. | нужно снять: кнопка в шапке MR, иконки в списке MR, страница настроек |
| Small promo tile | 440×280 | необязательно |

## Privacy practices

### Single purpose

RU: Ускорить рутинные действия разработчика на страницах рабочих инструментов — сейчас это копирование
и отправка на ревью merge request в GitLab с переходом в Telegram и Jira.

EN: Speed up routine developer actions on work tool pages — currently copying and sending GitLab merge
requests for review, with quick links to Telegram and Jira.

### Permission justification

**storage** — EN: Stores the user's settings (text template, project → Telegram topic / Jira URL rules, username filter)
and syncs them across the user's devices.

**scripting** — EN: Registers the feature's content script (`chrome.scripting.registerContentScripts`) only on sites
the user has added in the settings and granted access to. No code is injected anywhere else.

**Host permissions** (`optional_host_permissions: *://*/*`, nothing is granted at install) —
EN: GitLab is often self-hosted on an arbitrary domain, so the list of sites can't be fixed in the manifest.
The user adds their GitLab address (e.g. gitlab.com or a company GitLab) on the options page, and the extension
requests access to that single site at that moment. The content script runs only on merge request pages
of granted sites, reads the MR title, URL, branch and author from the page, and requests the MR's own
`widget.json` from the same origin to detect merge conflicts. Removing a site revokes its access.

**Remote code** — No, all code is included in the package.

### Data usage

- Collected data: ничего не отмечать — данные не покидают браузер.
- Сертификация: отметить все три пункта (не продаются, не используются вне основной функции, не для кредитоспособности).
- Privacy policy URL: ссылка на опубликованный `PRIVACY.md` (например, raw/blob в публичном репозитории или GitHub Pages).

## Перед отправкой

1. Поднять `version` в `manifest.json` (Web Store не принимает повторно ту же версию).
2. `./scripts/build.sh` → загрузить `dist/dev-helper-<version>.zip`.
