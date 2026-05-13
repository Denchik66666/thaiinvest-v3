# Session log

Краткие записи о зафиксированных договорённостях и заметных изменениях контекста (для агента и людей).

## 2026-05-09 — После restore: сверка accrued/paid

- **Скрипт (только `.env` → прод):** `npm run db:reconcile-investors:prod` (dry-run), `npm run db:reconcile-investors:prod:apply` (запись). Исходник: `scripts/reconcile-all-investors-prod.ts` (импорт `scripts/load-prod-env-only.ts` — **без** `.env.local`).
- **Канон пересчёта:** `reconcileAllInvestorsAccruedAndPaidFromLedger` в `lib/business-rate-accrual-recalc.ts` — все позиции, включая `closed` (в отличие от фонового `recalculateInvestorAccruedFromRateHistory`, который закрытые пропускает).
- **Чек-лист после переноса дампа на Supabase:** (1) `prisma migrate deploy`; (2) dry-run reconcile и просмотр расхождений; (3) `--apply`; (4) сравнение с локалью в том же скрипте; (5) не править вручную только `paid` без последующего пересчёта — иначе снова рассинхрон с `Payment`.

## 2026-05-09 — Релиз v3.1.0 (финальный статус перед деплоем)

- Зафиксированы **git-тег `v3.1.0`**, версия в **`package.json` — `3.1.0`**, коммит: *«v3.1.0 — финальная подготовка к деплою: единый расчёт accrued/paid, правила, чистка»*. Полный список тем — **`CHANGELOG.md`** § **[3.1.0] — 2026-05-09**.
- **Единый учёт:** **`Investor.accrued`** / **`Investor.paid`** и массовый пересчёт сходятся с **`lib/investor-accrued-ledger.ts`** + **`buildWeeklyLedgerRows`**; пополнения тела в леджере — с **`getNextMonday(startOfDay(effectiveAt))`**.
- **Лента операций:** серверный кэш вынесен в **`lib/operations-history-server-cache.ts`**, сброс после успешных мутаций (платежи, коррекции, удаление заявки SUPER_ADMIN); ответ не отдаётся браузеру как «свежий» на минуту через **`max-age=60`**. Подпись недели в UI при своём периоде обрезается по **`toYmd`** (**`weekAccrualPeriodRowUi`**).
- **Отложено на потом:** пропорциональные суммы в сводке по обрезанному периоду; нулевой **`npm run lint`** по всему дереву.

## 2026-05-09 — Документация

- Снимок ключевых md и правил: **`backups/doc-snapshot-2026-05-09/`** (восстановление вручную из копии).
- В **`Для анализа/`** добавлен **`ГЛОССАРИЙ.txt`**; устаревшие заметки перенесены в **`Для анализа/archive/`**.
- **`API_AUDIT.md`** пересобран по дереву **`app/api/**/route.ts`** (33 файла, 45 HTTP-экспортов).

## 2026-05-12 — История операций — источники данных

Лента **`GET /api/investors/operations-history`** и экран **`/dashboard/finance`** строятся **не** из таблицы **`Accrual`** (она в этой цепочке не читается). Источники по типам строк:

| Тип в API (`FinanceOperationItem`) | Источник в БД / расчёт |
|-----------------------------------|-------------------------|
| **`week_accrual`** (блок «Начисление», недельный интервал) | Расчёт **`buildWeeklyLedgerRows`** (поле **`Investor.accrued`** — **`lib/investor-accrued-ledger.ts`**) по **`Investor`** + **`Payment`** (завершённые) + **`RateHistory`** + **`acceptedBodyTopUps`** из **`BodyTopUpRequest`** (`accepted_by_investor`; дата вступления: `requestDate ?? decidedAt ?? createdAt`; **бамп тела** — **`getNextMonday(startOfDay(…))`**). Без пополнений — текущее **`body`** на все недели. **`mergeLedgerWeeks`**. В ленте **`sortAt` = `weekEnd`**, чтобы события внутри недели не оказывались выше строки начисления за эту неделю. Таблица **`Accrual`** не используется. |
| **`payment`** | Строки **`Payment`**. **`sortAt`** в ленте: **`createdAt`** (подача заявки), не **`acceptedAt`** — поэтому строка может визуально стоять «среди» более ранних недель, хотя завершение было позже (см. подпись в UI с фактическими датами). |
| **`topup`** (заявка на пополнение тела) | **`BodyTopUpRequest`** по `investorId`. **`sortAt`**: **`requestDate ?? createdAt`** (календарь заявки / создание записи; не путать с `decidedAt` для порядка в ленте). Подпись в UI для даты: те же поля + статус. |
| **`topup`** с **`initialFromCreation`** (синтетика «начальное тело при открытии») | Не строка в **`BodyTopUpRequest`**. Сумма: **`resolveInitialBodyAtCreation`** (аудит `CREATE_INVESTOR` иначе **`Investor.body` − принятые заявки** по **`bodyTopUpRequestCountedAsInflow`**). **`sortAt`** в ленте: **`getWeekStartMonday(startOfDay(min(entryDate, activationDate))) − 1 ms`**, чтобы строка шла **перед** первой неделей начислений. |
| **Кэш ответа** | В **`operations-history`** — in-memory по ключу пользователь/роль/`investorId`/сеть (~60 с). После правок схемы/данных может отдавать старый JSON до истечения TTL. |

**Диагностика по позиции id=2 (Den):** `npx tsx scripts/debug/diagnose-investor-2-operations.ts` — сырые строки БД. **Пересчёт по канону (слой 1):** `npx tsx scripts/debug/recalculate-den-investor-2.ts` — даты канона + **`Investor.accrued`** (последний **`accruedEnd`** из **`buildWeeklyLedgerRows`**) и **`Investor.paid`** (**`computeInvestorPaidCompletedTotal`**). Пополнение в леджере — с **`getNextMonday(startOfDay(effectiveAt))`**. Пример (`now` ≈ mid-May 2026): **accrued 40 000 ฿**, **paid** = сумма **всех** завершённых **`Payment`** (на снимке **2 500 ฿**).

- **Единый путь в коде:** **`Investor.accrued`** и **`Investor.paid`** при массовом пересчёте и при **`PATCH /api/investors/[id]`** (если пересчитывается `accrued`) берутся только из **`lib/investor-accrued-ledger.ts`** + **`buildWeeklyLedgerRows`**; **`recalculateInvestorAccruedFromRateHistory`** не содержит дублирующего цикла по неделям. Удалены **`scripts/explain-sega-accrued.ts`**, **`scripts/debug/inspect-den-body-topup-100k.ts`**. Правила зафиксированы в **`.cursor/rules/project-context.md`** §7.

## 2026-05-11

- В **`.cursor/rules/project-context.md`** добавлено **Правило №0** — обязательный ритуал перед работой: чтение всех правил из `.cursor/rules/`, `SESSION_LOG.md`, при наличии — `Для анализа/ГЛОССАРИЙ.txt`; зафиксированы локальная БД (Docker для БД не обязателен), Supabase как прод-контур, валюта **฿**, цепочка **`.env` → `.env.local` (override)** для скриптов и Prisma. §0.1 обновлён: ссылка на Правило №0 вместо дублирования списка файлов.

- **`BodyTopUpRequest.requestDate`:** миграция `20260509190000_body_topup_request_date` в репозитории уже есть; на локальной БД (`npm run db:migrate:deploy`) — **pending нет**, колонка присутствует. Цепочка: `POST /api/body-topup-requests` → `createBodyTopUpRequestWithDateCompat`; лента/очередь/подписи — `requestDate ?? createdAt`; контекст модалки — `requestAtIso = requestDate ?? createdAt` и перезапись первого шага таймлайна. Отладочный просмотр: `npx tsx scripts/debug/peek-body-topup-dates.ts` (после загрузки `.env` + `.env.local` в скрипте через dotenv).

## 2026-05-09

- В **`.cursor/rules/project-context.md`** зафиксировано правило **OWNERSHIP** (§2.1): при создании инвестора в общей сети `ownerId` = первый активный OWNER; в личной сети SUPER_ADMIN — `ownerId` = SUPER_ADMIN; реализация в `app/api/investors/route.ts` (`resolveOwnerIdForNewInvestor`); менять без явного разрешения нельзя.

- **Manage / этап 3:** в **`components/manage/BusinessRateControlCenter.tsx`** доведён VIP-компакт (одна строка KPI, плотнее журнал и «Календарь · план»), акцентные цвета на **`var(--thai-color-*)`**; эталон в **`docs/UI_ETALONS_REGISTRY.md`** (п. 3 плана Manage) обновлён.
