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
• Пока MR в статусе Draft, кнопка неактивна; когда MR апрувнут и все треды решены — показывает «MR апрувнут».
• Предупреждение «Есть конфликты», если MR конфликтует с целевой веткой.
• Иконка копирования в списках MR — без открытия самого MR.
• Настраиваемый шаблон текста: {title}, {url}, {iid}, {project}, {branch}, {author}.
• Горячая клавиша Alt+Shift+C.
• Фильтр «только мои MR».
• Кнопка «Открыть задачу в Jira» по ключу задачи из ветки или названия MR.
• Кнопка «Создать MR на stage», когда MR готов: не Draft, без конфликтов, с апрувами и без нерешённых тредов.

Задачи Jira (Jira Cloud):
• Кнопка «Залить на stage» в задаче в статусе «Тестирование»: открывает MR из поля задачи,
  проверяет его и сразу открывает форму MR на stage — или пишет, что мешает.
• Кнопка «Pipeline ветки» в задаче с заданными метками: открывает последний pipeline исходной ветки MR,
  чтобы запустить preview-окружение.
• Статус, метки и название поля с MR настраиваются.

Работает только на сайтах, которые вы сами добавили в настройках: доступ запрашивается к каждому сайту отдельно.
Никаких данных не собирается: настройки хранятся в вашем браузере, страницы обрабатываются локально.

### Description — EN

Dev Helper is a set of small helpers that take routine out of a developer's day.
Each helper can be enabled and configured separately.

Merge requests (GitLab, including self-hosted):
• "Send for review" button on the MR page: copies the MR title (bold) and link
  and opens the right Telegram topic — one per project.
• Disabled while the MR is a Draft; shows "MR approved" once it is approved and all threads are resolved.
• "Has conflicts" warning when the MR conflicts with its target branch.
• Copy icon in MR lists, no need to open the MR.
• Customizable text template: {title}, {url}, {iid}, {project}, {branch}, {author}.
• Alt+Shift+C hotkey.
• "Only my MRs" filter.
• "Open Jira issue" button using the issue key from the branch or MR title.
• "Create MR to stage" button once the MR is ready: not a Draft, no conflicts, approved, no unresolved threads.

Jira issues (Jira Cloud):
• "Deploy to stage" button on issues in testing: opens the MR from the issue field, checks it
  and goes straight to the MR-to-stage form — or tells you what's blocking it.
• "Branch pipeline" button on issues with chosen labels: opens the latest pipeline of the MR source branch
  to start a preview environment.
• Status, labels and the MR field name are configurable.

Works only on sites you add in the settings: access is requested for each site separately.
No data is collected: settings stay in your browser, pages are processed locally.

### Графика

| Что | Размер | Статус |
| --- | --- | --- |
| Иконка | 128×128 PNG (берётся из пакета) | есть; по гайдлайнам — рисунок 96×96 с прозрачными полями 16 px |
| Скриншоты | 1280×800 или 640×400, 1–5 шт., PNG без прозрачности или JPEG | в `store/screenshots/`: настройки «Задачи Jira» — есть; нужно снять: кнопка в шапке MR, иконки в списке MR, блок кнопок в задаче Jira |
| Small promo tile | 440×280 | необязательно |

## Privacy practices

### Single purpose

RU: Ускорить рутинные действия разработчика на страницах рабочих инструментов — сейчас это отправка
merge request в GitLab на ревью (с переходом в Telegram и Jira) и переходы из задачи Jira к её MR:
заливка на stage и pipeline ветки.

EN: Speed up routine developer actions on work tool pages — currently sending GitLab merge requests
for review (with quick links to Telegram and Jira) and jumping from a Jira issue to its merge request:
deploying to stage and opening the branch pipeline.

### Permission justification

**storage** — EN: Stores the user's settings (text template, project → Telegram topic / Jira URL / stage branch rules,
username filter, Jira status, labels and field names) and syncs them across the user's devices.

**scripting** — EN: Registers each feature's content script (`chrome.scripting.registerContentScripts`) only on sites
the user has added in the settings and granted access to. No code is injected anywhere else.

**Host permissions** (`optional_host_permissions: *://*/*`, nothing is granted at install) —
EN: GitLab is often self-hosted on an arbitrary domain, and Jira Cloud lives on a per-company subdomain,
so the list of sites can't be fixed in the manifest. The user adds their GitLab and Jira addresses
(e.g. gitlab.com, example.atlassian.net) on the options page, and the extension requests access to that single
site at that moment. On granted GitLab sites the content script runs only on merge request pages: it reads
the MR title, URL, branches, author and approvals from the page and requests the MR's own `widget.json`
from the same origin to detect merge conflicts. On granted Jira sites it runs only on issue pages: it reads
the issue status, labels and the merge request link field to show its buttons. Removing a site revokes its access.

**Remote code** — No, all code is included in the package.

### Data usage

- Collected data: ничего не отмечать — данные не покидают браузер.
- Сертификация: отметить все три пункта (не продаются, не используются вне основной функции, не для кредитоспособности).
- Privacy policy URL: ссылка на опубликованный `PRIVACY.md` (например, raw/blob в публичном репозитории или GitHub Pages).

## Перед отправкой

1. Поднять `version` в `manifest.json` (Web Store не принимает повторно ту же версию).
2. `./scripts/build.sh` → загрузить `dist/dev-helper-<version>.zip`.
