# Session log

Краткие записи о зафиксированных договорённостях и заметных изменениях контекста (для агента и людей).

## 2026-05-12 — История операций — источники данных

Лента **`GET /api/investors/operations-history`** и экран **`/dashboard/finance`** строятся **не** из таблицы **`Accrual`** (она в этой цепочке не читается). Источники по типам строк:

| Тип в API (`FinanceOperationItem`) | Источник в БД / расчёт |
|-----------------------------------|-------------------------|
| **`week_accrual`** (блок «Начисление», недельный интервал) | Расчёт **`buildWeeklyLedgerRows`** по полям позиции **`Investor`** (`activationDate`, **`body`**, `rate`, `isPrivate`) + массив **`Payment`** этой позиции (только завершённые выплаты внутри недели) + глобальная **`RateHistory`** (`getRateHistoryRowsForLedger` в сводке; в истории — прямой запрос к `RateHistory` в обработчике). Затем **`mergeLedgerWeeks`** при нескольких позициях в одном ответе. Таблица **`Accrual`** сюда **не входит**. |
| **`payment`** | Строки **`Payment`** по `investorId` из того же запроса, что и для леджера. **`sortAt`** в ленте: **`createdAt`** заявки (`paymentSortAt`). |
| **`topup`** (заявка на пополнение тела) | **`BodyTopUpRequest`** по `investorId`. **`sortAt`**: **`requestDate ?? createdAt`** (календарь заявки / создание записи; не путать с `decidedAt` для порядка в ленте). Подпись в UI для даты: те же поля + статус. |
| **`topup`** с **`initialFromCreation`** (синтетика «начальное тело при открытии») | Не строка в **`BodyTopUpRequest`**. Сумма: **`resolveInitialBodyAtCreation`**: сначала JSON **`AuditLog`** `action='CREATE_INVESTOR'`, `entityId` = id позиции (`newValue.body`); если аудита нет — **`Investor.body` − сумма принятых заявок** (`accepted_by_investor` и др. по **`bodyTopUpRequestCountedAsInflow`**). Даты в строке: **`activationDate`**, **`entryDate`**, **`createdAt`** позиции. |
| **Кэш ответа** | В **`operations-history`** — in-memory по ключу пользователь/роль/`investorId`/сеть (~60 с). После правок схемы/данных может отдавать старый JSON до истечения TTL. |

**Диагностика по позиции id=2 (локальная БД, 2026-05-12):** скрипт `npx tsx scripts/debug/diagnose-investor-2-operations.ts` — снимок **`Investor`**, все **`BodyTopUpRequest`**, **`Payment`**, **`Accrual`**, **`AuditLog` CREATE_INVESTOR**. На снимке: **`Accrual` пусто**, **`AuditLog` CREATE_INVESTOR пусто**, одна заявка пополнения **100 000** принята при **`Investor.body` = 200 000** — несогласованность «принято пополнение» vs поле **`body`** (начисления леджера идут от **`body`**, заявки в расчёт недель **не подмешиваются**).

## 2026-05-11

- В **`.cursor/rules/project-context.md`** добавлено **Правило №0** — обязательный ритуал перед работой: чтение всех правил из `.cursor/rules/`, `SESSION_LOG.md`, при наличии — `Для анализа/ГЛОССАРИЙ.txt`; зафиксированы локальная БД (Docker для БД не обязателен), Supabase как прод-контур, валюта **฿**, цепочка **`.env` → `.env.local` (override)** для скриптов и Prisma. §0.1 обновлён: ссылка на Правило №0 вместо дублирования списка файлов.

- **`BodyTopUpRequest.requestDate`:** миграция `20260509190000_body_topup_request_date` в репозитории уже есть; на локальной БД (`npm run db:migrate:deploy`) — **pending нет**, колонка присутствует. Цепочка: `POST /api/body-topup-requests` → `createBodyTopUpRequestWithDateCompat`; лента/очередь/подписи — `requestDate ?? createdAt`; контекст модалки — `requestAtIso = requestDate ?? createdAt` и перезапись первого шага таймлайна. Отладочный просмотр: `npx tsx scripts/debug/peek-body-topup-dates.ts` (после загрузки `.env` + `.env.local` в скрипте через dotenv).

## 2026-05-09

- В **`.cursor/rules/project-context.md`** зафиксировано правило **OWNERSHIP** (§2.1): при создании инвестора в общей сети `ownerId` = первый активный OWNER; в личной сети SUPER_ADMIN — `ownerId` = SUPER_ADMIN; реализация в `app/api/investors/route.ts` (`resolveOwnerIdForNewInvestor`); менять без явного разрешения нельзя.

- **Manage / этап 3:** в **`components/manage/BusinessRateControlCenter.tsx`** доведён VIP-компакт (одна строка KPI, плотнее журнал и «Календарь · план»), акцентные цвета на **`var(--thai-color-*)`**; эталон в **`docs/UI_ETALONS_REGISTRY.md`** (п. 3 плана Manage) обновлён.
