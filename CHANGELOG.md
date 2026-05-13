# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).  
Версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Планируется

- Довести `npm run lint` до нуля ошибок (React Compiler / react-hooks).
- Продовый прогон `recalculateInvestorAccruedFromRateHistory` после деплоя миграций.
- Пропорциональные суммы по обрезанному календарному периоду (при необходимости).

---

## [3.1.0] — 2026-05-09

Финальная подготовка к деплою: единый расчёт **accrued** / **paid**, правила, чистка документации и UX финансов.

### Added

- **`lib/investor-accrued-ledger.ts`** — **`computeInvestorAccruedEndFromLedger`** и **`computeInvestorPaidCompletedTotal`** для БД и скриптов.
- **`lib/operations-history-server-cache.ts`** — серверный кэш ответа **`GET /api/investors/operations-history`** с явным сбросом после мутаций (коррекции платежей, заявки **`/api/payments`**, **`DELETE …/payments/[paymentId]`**).
- **`lib/history-period.ts`** — общая логика периода (Bangkok); **`weekAccrualPeriodRowUi`**: подпись интервала «Начисление» с обрезкой правой даты по выбранному диапазону и приглушение незакрытой недели.
- Вспомогательные модули: **`lib/body-topup-effective-monday.ts`**, **`lib/body-topup-inflow.ts`**, **`lib/desk-amount-input.ts`**, **`lib/finance-operations-feed.ts`**, **`lib/investor-create-audit-body.ts`**; очередь **`FinancePendingActionsQueue`**; API **`body-topup-requests/[requestId]`**; e2e и скриншоты сравнения (календарь, жизненный цикл пополнения тела); **`backups/doc-snapshot-2026-05-09/`**; правило **`.cursor/rules/calendar-unified-width.mdc`**; отладочные скрипты в **`scripts/debug/`** (в т.ч. **`recalculate-den-investor-2.ts`**).
- Прогноз «Ожидается» на дашборде: целые баты, отдельная логика для INVESTOR и сумма по сети для OWNER.
- Спека e2e и скриншоты для accrued/прогноза (`tests/e2e/accrued-forecast-roles-verify.spec.ts`).
- `.cursorignore`, исключения watcher/search в `.vscode/settings.json`, правило остановки dev без UI.

### Changed

- **`buildWeeklyLedgerRows`:** при переданных принятых пополнениях тела — начальное тело и ступени; вступление в базу — **`getNextMonday(startOfDay(effectiveAt))`**. **`operations-history`**, **`operations-summary`**, **`weekly-ledger`** передают **`acceptedBodyTopUps`**.
- **`recalculateInvestorAccruedFromRateHistory`:** использует леджер из **`investor-accrued-ledger`**; при массовом пересчёте обновляется **`Investor.paid`** (все завершённые **`Payment`**).
- **`POST /api/investors`**, **`PATCH /api/investors/[id]`**, **`POST …/become-semen-investor`:** ретро-**`accrued`** только через леджер.
- **`accrued`:** только закрытые недели, округление до целого бата; выплаты текущей недели уменьшают остаток; прогноз недели — **`Math.round`** на позицию (`lib/open-week-forecast.ts`).
- Документация: **`API_AUDIT.md`**, **`PROJECT_AUDIT.md`**, **`docs/UI_*`**, **`README.md`**, **`Для анализа/`** (архив, глоссарий); **`project-context.md`** §7.
- Все скрипты `debug-*` в **`scripts/debug/`**; **`scripts/debug/README.md`**.
- **`GET /api/investors/operations-history`:** для успешного ответа — **`Cache-Control: private, max-age=0, must-revalidate`**.

### Fixed

- **`operations-summary`:** передача пополнений в **`buildWeeklyLedgerRows`**.
- **`GET /api/investors/operations-history`:** синтетика «начальное тело»; **`week_accrual`**: **`sortAt` = `weekEnd`**; фильтр периода на клиенте — **`operationPeriodAnchorIso` → `weekStart`**; устранена долгая «залипшая» лента после мутаций (кэш + заголовки).
- **`buildWeeklyLedgerRows`:** бамп тела с **`getNextMonday(effectiveAt)`**, а не с понедельника недели заявки.
- Owner dashboard: строка «Ожидается» и стили (`.thai-owner-forecast-strip__amount`).

### Removed

- **`scripts/explain-sega-accrued.ts`**, **`scripts/debug/inspect-den-body-topup-100k.ts`** и дублирующие пояснения в **`Для анализа/`** (перенос в **`archive/`**).
- Неиспользуемые зависимости: `jose`, `cookie`, `@types/bcryptjs`, `ts-node`.
- Мёртвые артефакты: `CreateInvestorModal`, `WeekCycleStrip`, `FormGroup`, `GlobalLiveNotifier`, `animations.css`, `lib/investor-payment-access.ts`, `create-test-investors.js`, gross-сумматоры открытой недели в прогнозе.

---

## [3.0.0] — 2026-04 … 2026-05 (база v3)

Первая стабильная линия **ThaiInvest v3**: Next.js App Router, Prisma/PostgreSQL, роли OWNER / INVESTOR / SUPER_ADMIN.

### Added

- Кабинеты: `/dashboard`, `/dashboard/finance`, `/dashboard/manage`, `/dashboard/investors`, `/dashboard/profile`, чат.
- Раздел «Финансы»: аккордеон позиций, фильтры, модалка операций, очереди OWNER, коррекции платежей.
- Премиум-герой OWNER на главной, выравнивание с инвесторским UX.
- Ставка бизнеса: API, история, пересчёт `accrued` в очереди после изменений.
- Правила Cursor: защита эталона дашборда инвестора, тема/нижняя навигация.

### Changed

- Тема: переключение только с `/login` и профиля; нижний бар без дубля «Профиль» для инвестора.
- SUPER_ADMIN: главная и лента истории в контексте привязанных общих позиций.

### Security

- JWT в httpOnly cookie, секреты вне репозитория; `.vercelignore` для локальных env.

---

## Как читать историю в git

Детальный список коммитов:

```bash
git log --oneline --decorate -50
```

Привязка **файл → версия** в этом CHANGELOG — по крупным темам; точечные правки смотрите в `git log` и diff по тегам/коммитам (после появления git-тегов на релизах).
