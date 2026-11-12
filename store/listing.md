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
• Пока MR в статусе Draft или с конфликтами, кнопка неактивна; когда MR апрувнут и все треды решены — показывает «MR апрувнут».
• Предупреждение «Есть конфликты», если MR конфликтует с целевой веткой.
• Иконка копирования в списках MR — без открытия самого MR.
• Настраиваемый шаблон текста: {title}, {url}, {iid}, {project}, {branch}, {author}.
• Горячая клавиша Alt+Shift+C.
• Фильтр «только мои MR».
• Кнопка «Открыть задачу в Jira» по ключу задачи из ветки или названия MR.
• Кнопка «Создать MR на stage», когда MR готов: не Draft, без конфликтов, с апрувами и без нерешённых тредов.
• Размер MR в шапке: метка S / M / L / XL, сколько файлов изменено, добавлено и удалено, сколько строк +/−.
• Кнопки префиксов комментариев (blocking:, nit: — свои, со своими цветами): префикс в начало комментария в один клик.
• Защита от случайного мержа в main, master, production и другие ветки из списка: кнопки Merge красные,
  мерж — только после подтверждения с 10-секундным отсчётом.

Задачи Jira (Jira Cloud):
• Кнопка «Залить на stage» в задаче в статусе «Тестирование»: открывает MR из поля задачи,
  проверяет его и сразу открывает форму MR на stage — или пишет, что мешает.
• Кнопка «Pipeline ветки» в задаче с заданными метками: открывает последний pipeline исходной ветки MR,
  чтобы запустить preview-окружение.
• Метки задач под названием в таблицах на странице задачи (Child work items эпика): все, обязательные — первыми;
  над таблицей — фильтр по меткам, как в релизе.
• Предупреждение, если у задачи нет ни одной из обязательных меток.
• Статус, метки и название поля с MR настраиваются.

Релизы Jira (Jira Cloud):
• Фильтр по меткам над списком задач на странице релиза: чипы меток с числом задач,
  «без меток» и «без обязательных меток» — обязательные метки задаются в настройках чипами.
• Shift+клик по метке скрывает задачи с ней; несколько меток — «любая» или «все».
• Метки задач прямо в строках списка релиза — все, по алфавиту; клик по метке фильтрует список.
• Кнопка «Посмотреть MR» из поля задачи прямо в строках списка релиза, справа от статуса.
• Копирование отфильтрованных задач («KEY — название») и ссылка на тот же отбор в поиске Jira.
• Чек-лист: чекбокс в строке, чтобы отметить задачу для себя при проверке релиза; сбрасывается перезагрузкой страницы.

Переходы:
• Переход с текущей страницы на связанную по вашим правилам: id, slug или окружение из адреса
  подставляются в ссылку — например, с товара на сайте в админку или со stage на prod.
• Пункты в контекстном меню страницы и ссылок на неё, горячая клавиша Alt+Shift+O.
• Доступ к сайту не нужен — адрес страницы передаёт сам Chrome по вашему действию.

Импорт и экспорт настроек — файлом, через буфер обмена или по ссылке: резервная копия или общие правила для команды.

Работает только на сайтах, которые вы сами добавили в настройках: доступ запрашивается к каждому сайту отдельно.
Никаких данных не собирается: настройки хранятся в вашем браузере, страницы обрабатываются локально.

### Description — EN

Dev Helper is a set of small helpers that take routine out of a developer's day.
Each helper can be enabled and configured separately.

Merge requests (GitLab, including self-hosted):
• "Send for review" button on the MR page: copies the MR title (bold) and link
  and opens the right Telegram topic — one per project.
• Disabled while the MR is a Draft or has merge conflicts; shows "MR approved" once it is approved and all threads are resolved.
• "Has conflicts" warning when the MR conflicts with its target branch.
• Copy icon in MR lists, no need to open the MR.
• Customizable text template: {title}, {url}, {iid}, {project}, {branch}, {author}.
• Alt+Shift+C hotkey.
• "Only my MRs" filter.
• "Open Jira issue" button using the issue key from the branch or MR title.
• "Create MR to stage" button once the MR is ready: not a Draft, no conflicts, approved, no unresolved threads.
• MR size in the header: S / M / L / XL label, files changed, added and deleted, lines +/−.
• Comment prefix buttons (blocking:, nit: — your own, in your own colors): put a prefix at the start of a comment in one click.
• Protection against accidental merges into main, master, production and other branches from your list: Merge buttons
  turn red, and merging needs a confirmation with a 10-second countdown.

Jira issues (Jira Cloud):
• "Deploy to stage" button on issues in testing: opens the MR from the issue field, checks it
  and goes straight to the MR-to-stage form — or tells you what's blocking it.
• "Branch pipeline" button on issues with chosen labels: opens the latest pipeline of the MR source branch
  to start a preview environment.
• Issue labels under the summary in tables on an issue page (an epic's Child work items): all of them,
  required ones first; above the table — a labels filter, as on a release page.
• A warning when an issue has none of the required labels.
• Status, labels and the MR field name are configurable.

Jira releases (Jira Cloud):
• Labels filter above the work items list on a release page: label chips with issue counts,
  "no labels" and "no required labels" — required labels are set as chips in the settings.
• Shift+click a label to hide issues with it; several labels match "any" or "all".
• Issue labels right in the release list rows — all of them, alphabetically; click a label to filter.
• "View MR" button for the MR from the issue field right in the release list rows, next to the status.
• Copy the filtered issues ("KEY — summary") and open the same selection in Jira search.
• Checklist: a checkbox in each row to tick off issues for yourself while checking a release; reloading the page clears it.

Redirects:
• Jump from the current page to a related one by your rules: the id, slug or environment from the URL
  goes into the link — e.g. from a product on the site to its admin page, or from stage to prod.
• Items in the context menu of the page and of links to it, plus the Alt+Shift+O hotkey.
• No site access needed — Chrome passes the page URL itself on your action.

Settings import and export — as a file, via the clipboard or from a URL: a backup or shared rules for your team.

Works only on sites you add in the settings: access is requested for each site separately.
No data is collected: settings stay in your browser, pages are processed locally.

### Что нового в 1.9.0 / What's new in 1.9.0

RU:
• Размер MR в шапке, под строкой «requested to merge … into …»: метка S / M / L / XL по изменённым строкам,
  сколько файлов изменено, добавлено, удалено и переименовано, строки +/−. У L и XL — вопрос, можно ли разбить MR.
• «Не учитывать в размере»: шаблоны путей сгенерированных файлов (lock-файлы, минифицированный код), которые не входят в размер.
• «Метки массовой правки»: MR с такой меткой GitLab считается оправданно большим — вместо вопроса «массовая правка».

EN:
• MR size in the header, under the "requested to merge … into …" line: an S / M / L / XL label by changed lines,
  files changed, added, deleted and renamed, lines +/−. L and XL ask whether the MR could be split.
• "Exclude from size": path patterns for generated files (lock files, minified code) that don't count towards the size.
• "Bulk change labels": an MR with such a GitLab label counts as justifiably large — "bulk change" instead of the question.

### Что нового в 1.8.0 / What's new in 1.8.0

RU:
• Релизы Jira: чек-лист — чекбокс в начале каждой строки списка задач, чтобы отметить задачу для себя при проверке релиза.
  Отмеченные строки приглушаются, в панели — «отмечено N из M». Отметки никуда не сохраняются и сбрасываются перезагрузкой страницы.
• Задачи Jira: предупреждение, если у задачи нет ни одной из обязательных меток; в списке меток задачи обязательные выделены.
• В фильтре меток в таблицах задач чип «без обязательных меток» идёт первым.

EN:
• Jira releases: a checklist — a checkbox at the start of each work item row to tick off issues for yourself while checking a release.
  Ticked rows are dimmed, the panel shows "N of M ticked". Ticks are not saved anywhere and are cleared when the page reloads.
• Jira issues: a warning when an issue has none of the required labels; required labels are highlighted in the issue's labels list.
• In the labels filter of issue tables, the "no required labels" chip comes first.

### Что нового в 1.7.1 / What's new in 1.7.1

RU:
• После установки настройки открываются сразу на разделе «Импорт и экспорт» — так быстрее подключить общий файл команды.
• В блоке импорта первой идёт загрузка по ссылке, за ней — выбор файла и вставка текста.

EN:
• After installation, the settings open right on the "Import and export" section, the quickest way to connect your team's shared file.
• In the import block, loading from a URL now comes first, followed by picking a file and pasting text.

### Что нового в 1.7.0 / What's new in 1.7.0

RU:
• Cookie: таблица cookie сайта в окне расширения — значения, домен, путь и флаги, в том числе HttpOnly. Значение можно изменить,
  cookie — добавить и удалить. Для cookie можно сохранить список значений и переключать их одним кликом; такие cookie идут вверху таблицы.
• Клик по иконке расширения теперь открывает окно с таблицей cookie; настройки — кнопкой в этом окне.

EN:
• Cookie: a table of the site's cookies in the extension popup — values, domain, path and flags, including HttpOnly. Change a value,
  add or delete cookies. Save a list of values for a cookie and switch between them in one click; such cookies are shown at the top of the table.
• Clicking the extension icon now opens the popup with the cookie table; settings are one button away in that popup.

### Что нового в 1.6.0 / What's new in 1.6.0

RU:
• Задачи Jira: на странице задачи (например, в Child work items эпика) под названием каждой задачи — все её метки,
  обязательные первыми; над таблицей — фильтр по меткам, как в релизе: чипы с числом задач, «без меток»,
  «без обязательных меток», Shift+клик — исключить, «ИЛИ / И».

EN:
• Jira issues: on an issue page (e.g. an epic's Child work items) every issue shows all its labels under the summary,
  required ones first; above the table — a labels filter, as on a release page: chips with issue counts, "no labels",
  "no required labels", Shift+click to exclude, "any / all".

### Что нового в 1.5.1 / What's new in 1.5.1

RU:
• Релизы Jira: обязательные метки в панели фильтра показываются первыми.

EN:
• Jira releases: required labels are shown first in the filter panel.

### Что нового в 1.5.0 / What's new in 1.5.0

RU:
• Merge requests: подтверждение мержа в защищённые ветки (по умолчанию main, master, production, prod, release/*;
  список шаблонов — в настройках). Кнопки Merge / Set to auto-merge / Merge immediately и бейдж целевой ветки красные;
  клик открывает окно с проектом, ветками и действием, кнопка мержа в нём активна через 10 секунд.

EN:
• Merge requests: merge confirmation for protected branches (main, master, production, prod, release/* by default;
  the pattern list is in the settings). Merge / Set to auto-merge / Merge immediately buttons and the target branch badge
  turn red; a click opens a dialog with the project, branches and action, and its merge button is enabled after 10 seconds.

### Что нового в 1.4.0 / What's new in 1.4.0

RU:
• Merge requests: кнопки префиксов комментариев — ряд над кнопками формы комментария ставит префикс
  (blocking:, nit: и т. п.; список и цвета — в настройках) в начало комментария, повторный клик убирает.
• Импорт настроек по ссылке — например, общего файла команды в репозитории GitLab; с тем же превью перед записью.

EN:
• Merge requests: comment prefix buttons — a row above the comment form buttons puts a prefix
  (blocking:, nit: etc.; the list and colors are set in the settings) at the start of the comment; click again to remove it.
• Settings import from a URL — e.g. a team's shared file in a GitLab repository, with the same preview before writing.

### Что нового в 1.3.1 / What's new in 1.3.1

RU:
• Merge requests: пока в MR есть конфликты с целевой веткой, кнопка «Отправить на ревью» неактивна.
• Релизы Jira: числа на чипах и копирование задач учитывают все задачи релиза, а не только догруженные в список.
• Обязательные метки в настройках редактируются чипами.

EN:
• Merge requests: the "Send for review" button is disabled while the MR has merge conflicts with the target branch.
• Jira releases: chip counts and copying cover all release issues, not only the rows loaded in the list.
• Required labels are edited as chips in the settings.

### Что нового в 1.3.0 / What's new in 1.3.0

Для описания версии и объявления. В Web Store нет поля changelog — при желании добавить в конец Description.

RU:
• Релизы Jira — новая фича на странице релиза: фильтр по меткам (чипы с числом задач, «без меток»,
  «без обязательных меток», Shift+клик — скрыть, режим «любая / все»), метки задач в строках списка,
  кнопка «Посмотреть MR» рядом со статусом, копирование отфильтрованных задач и ссылка на тот же отбор
  в поиске Jira.
• Переходы — новая фича: переход с текущей страницы на связанную по вашим правилам —
  из контекстного меню или по Alt+Shift+O.
• Импорт и экспорт настроек: файлом или через буфер обмена, полная копия или «для команды»,
  с превью изменений перед импортом.

EN:
• Jira releases — a new feature on the release page: labels filter (chips with issue counts, "no labels",
  "no required labels", Shift+click to hide, "any / all" mode), issue labels in the list rows,
  a "View MR" button next to the status, copying the filtered issues and opening the same selection
  in Jira search.
• Redirects — a new feature: jump from the current page to a related one by your rules —
  from the context menu or with Alt+Shift+O.
• Settings import and export: as a file or via the clipboard, full copy or "for the team",
  with a preview of the changes before import.

### Графика

| Что | Размер | Статус |
| --- | --- | --- |
| Иконка | 128×128 PNG (берётся из пакета) | есть; по гайдлайнам — рисунок 96×96 с прозрачными полями 16 px |
| Скриншоты | 1280×800 или 640×400, 1–5 шт., PNG без прозрачности или JPEG | в `store/screenshots/`: настройки «Задачи Jira» — есть; нужно снять: кнопка в шапке MR, иконки в списке MR, блок кнопок в задаче Jira, фильтр меток, метки и кнопка «Посмотреть MR» в списке релиза, пункт «Переходов» в контекстном меню, раздел «Импорт и экспорт» |
| Small promo tile | 440×280 | необязательно |

## Privacy practices

### Single purpose

RU: Ускорить рутинные действия разработчика на страницах рабочих инструментов — сейчас это отправка
merge request в GitLab на ревью (с переходом в Telegram и Jira) и переходы из задачи Jira к её MR:
заливка на stage и pipeline ветки, фильтр задач релиза Jira по меткам, а также переход с текущей страницы
на связанную (например, в админку) и просмотр и переключение значений cookie сайта (флаги, debug, вариант A/B-теста).

EN: Speed up routine developer actions on work tool pages — currently sending GitLab merge requests
for review (with quick links to Telegram and Jira) and jumping from a Jira issue to its merge request:
deploying to stage and opening the branch pipeline, filtering a Jira release's issues by labels, plus jumping
from the current page to a related one (e.g. its admin page) and viewing and switching a site's cookie values
(feature flags, debug mode, an A/B variant).

### Permission justification

**storage** — EN: Stores the user's settings (text template, project → Telegram topic / Jira URL / stage branch rules,
username filter, Jira status, labels and field names, required release labels and the MR field name,
"page → link" redirect rules, comment prefixes and their colors, protected branch patterns) and syncs them across the user's devices.
The user can export these settings to a file or the clipboard and import them back from a file, pasted text
or a URL the user enters; nothing is sent anywhere.

**scripting** — EN: Registers each feature's content script (`chrome.scripting.registerContentScripts`) only on sites
the user has added in the settings and granted access to. No code is injected anywhere else.

**contextMenus** — EN: Adds an item per user-defined "page → link" rule to the context menu, shown only on pages
and links that match the rule's URL pattern. Clicking it opens the resulting link in a new tab.

**activeTab** — EN: When the user presses the "Redirects" hotkey, the extension reads the URL of the active tab
to build the link from the user's rules. The page content is not read and nothing is injected.

**cookies** — EN: The "Cookie" feature is a developer tool for inspecting and changing a site's cookies while testing.
It shows a table of the current tab's site cookies in the extension popup (name, value, domain, path, flags, expiry) and,
only when the user clicks, changes a cookie's value, adds or deletes a cookie, or switches between values the user saved.
The chrome.cookies API is required because page scripts cannot read or change HttpOnly cookies and cannot see any cookie's
domain, path or flags. It works only on sites the user added in the settings and granted access to. Cookie data is handled
locally: it is never put into the page and never sent to the developer or any third-party server. Value lists the user
explicitly saves are stored in chrome.storage.sync with the other settings, so Chrome may sync them across the user's devices.

**browsingData** — EN: The "Cookie" feature has a "Clear cache" button in the extension popup. Only when the user clicks it,
the extension clears the HTTP cache and Cache Storage of the current tab's origin (scheme, host and port) with
chrome.browsingData.remove and an origins filter, so a developer can reload a test site without stale files. It works only on
sites the user added in the settings and granted access to. No other browsing data is read or removed: no history, downloads,
passwords, cookies of other sites or data of other origins. Nothing is sent anywhere.

**Host permissions** (`optional_host_permissions: *://*/*`, nothing is granted at install) —
EN: GitLab is often self-hosted on an arbitrary domain, and Jira Cloud lives on a per-company subdomain,
so the list of sites can't be fixed in the manifest. The user adds their GitLab and Jira addresses
(e.g. gitlab.com, example.atlassian.net) on the options page, and the extension requests access to that single
site at that moment. On granted GitLab sites the content script runs only on merge request pages: it reads
the MR title, URL, branches, author and approvals from the page and requests the MR's own `widget.json`
from the same origin to detect merge conflicts. On granted Jira sites it runs only on issue and release pages: it reads
the issue status, labels and the merge request link field to show its buttons; on an issue page requests the labels
of the issues listed in its tables (e.g. an epic's child issues) from the same Jira site to show them and filter
the table; and on a release page requests
the labels, status and the MR link field of the release's issues (plus the field list to find that field) from the same
Jira site to filter the work items list and show MR links in it. Removing a site revokes its access.
When the user imports settings from a URL, the extension requests access to that URL's site at that moment
and downloads the settings file from it (with the site's cookies, so a private file can be read); nothing is sent to it.
For the "Cookie" feature the user adds a site on the options page and the extension requests access to that single site
at that moment: chrome.cookies only returns cookies for sites the extension has host access to. No content script runs
on these sites and the page content is not read.

**Remote code** — No, all code is included in the package.

### Data usage

- Collected data: ничего не отмечать — данные не покидают браузер.
- Сертификация: отметить все три пункта (не продаются, не используются вне основной функции, не для кредитоспособности).
- Privacy policy URL: ссылка на опубликованный `PRIVACY.md` (например, raw/blob в публичном репозитории или GitHub Pages).

## Перед отправкой

1. Поднять `version` в `manifest.json` (Web Store не принимает повторно ту же версию).
2. `./scripts/build.sh` → загрузить `dist/dev-helper-<version>.zip`.

### Для 1.8.0 в Developer Dashboard

- Разрешения и обработка данных не менялись — Single purpose, Permission justification и Privacy policy оставить как есть.
- Description — дописать строки про предупреждение об обязательных метках и чек-лист релиза (тексты выше),
  при желании — блок «Что нового в 1.8.0».

### Для 1.7.1 в Developer Dashboard

- Разрешения и обработка данных не менялись — Single purpose, Permission justification и Privacy policy оставить как есть.
- Description — при желании дописать блок «Что нового в 1.7.1» (тексты выше).

### Для 1.6.0 в Developer Dashboard

- Новых разрешений нет. Permission justification — обновить **Host permissions** из этого файла
  (запрос меток задач из таблиц на странице задачи).
- Privacy policy — опубликованный `PRIVACY.md` должен быть версии от 2026-10-27.
- Description — дописать строку про метки и фильтр в таблицах задач (тексты выше),
  при желании — блок «Что нового в 1.6.0».

### Для 1.5.1 в Developer Dashboard

- Разрешения и обработка данных не менялись — Single purpose, Permission justification и Privacy policy оставить как есть.
- Description — при желании дописать блок «Что нового в 1.5.1» (тексты выше).

### Для 1.5.0 в Developer Dashboard

- Новых разрешений нет, данные никуда не отправляются — Single purpose и Privacy policy оставить как есть.
- Permission justification — обновить **storage** из этого файла (шаблоны защищённых веток).
- Description — дописать строку про защиту от мержа в защищённые ветки (тексты выше),
  при желании — блок «Что нового в 1.5.0».

### Для 1.4.0 в Developer Dashboard

- Новых разрешений нет. Permission justification — обновить **storage** и **Host permissions** из этого файла
  (префиксы комментариев, импорт по ссылке).
- Privacy policy — опубликованный `PRIVACY.md` должен быть версии от 2026-10-19.
- Description — дописать строку про префиксы комментариев и «по ссылке» в строке импорта (тексты выше),
  при желании — блок «Что нового в 1.4.0».

### Для 1.3.1 в Developer Dashboard

- Разрешения и обработка данных не менялись — Single purpose, Permission justification и Privacy policy оставить как есть.
- Description — при желании дописать блок «Что нового в 1.3.1» (тексты выше).

### Для 1.3.0 в Developer Dashboard

- Description — добавить блоки «Релизы Jira», «Переходы» и строку про импорт и экспорт (тексты выше).
- Single purpose и Permission justification — обновить из этого файла: новые **contextMenus** и **activeTab**,
  расширенные **storage** и **Host permissions** (запрос меток, статуса и поля MR на странице релиза).
- Privacy policy — опубликованный `PRIVACY.md` должен быть версии от 2026-10-15.
- Скриншоты — по возможности добавить релиз Jira с фильтром меток (список «нужно снять» выше).
