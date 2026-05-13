# Промпт для нового чата (редизайн `/dashboard/manage`)

Скопируйте блок ниже целиком в первое сообщение нового агента Cursor.

---

## Задача

Продолжить **редизайн экрана `/dashboard/manage`** по зафиксированному плану. **Начинать с этапа 1.** Правки в коде — только в рамках плана. **Эталон инвесторского дашборда и связанные защищённые файлы не трогать** без явного разрешения пользователя.

## Контекст проекта

- **Стек:** Next.js 16 (App Router), React 19, Tailwind v4, Prisma + PostgreSQL, JWT в cookie, TanStack Query.
- **Роли:** `SUPER_ADMIN`, `OWNER`, `INVESTOR` (см. `PROJECT_AUDIT.md` §5).
- **`/dashboard/manage`:** ставка сети, журнал истории ставки, календарь плана, создание инвесторов (OWNER/SUPER_ADMIN), readiness для SUPER_ADMIN — логика API описана в `PROJECT_AUDIT.md` и `API_AUDIT.md`.

## Уже сделано в коде (не откатывать)

- Одна сетка месяца: **`FinanceMonthCalendar`** (`components/ui/FinanceMonthCalendar.tsx`).
- Общая оболочка попапа календаря/периода: **`FinanceCalendarPopoverPanel`** (`components/ui/FinanceCalendarPopoverPanel.tsx`); **`HistoryPeriodPopover`** и **`DatePicker`** её используют.
- **Финансы (эталон):** позиция попапа периода — только **`computeFinanceCalendarPopoverPosition`** в `components/ui/finance-calendar-popover-skin.ts` — **поведение не менять**.
- **`DatePicker`:** позиция попапа — **`computeDatePickerCalendarPopoverPosition`** (тот же файл skin), чтобы не ломать Финансы.
- Календарь плана в **`BusinessRateControlCenter`**: режим **`range`** + **`highlightedYmds`**; компонент **`BusinessRateMonthCalendar`** удалён.

## Реестр эталонов и правила

- **`docs/UI_ETALONS_REGISTRY.md`** — раздел «Управление» и подраздел **«`/dashboard/manage` — редизайн»**: текущее состояние и **8 этапов** плана.
- **Тема и нижний бар:** `.cursor/rules/dashboard-theme-nav.mdc`.
- **Скриншоты e2e:** `.cursor/rules/e2e-screenshots-viewports.mdc`.
- **Защищённые файлы (инвестор / лента / период):** `.cursor/rules/investor-dashboard-protected.md` — **не редактировать** перечисленные там пути без явного запроса пользователя; **не менять** UX/математику **`HistoryPeriodPopover`** на экране Финансов и **`computeFinanceCalendarPopoverPosition`**.

## План переработки Manage (8 этапов)

1. **Списки и выбор** — тот же визуальный язык, что в Финансах (`FinanceInvestorAccordionCards`, чипы в одной строке с периодом), без отдельных «своих» выпадающих списков там, где нужен общий премиум-контур.
2. **`app/dashboard/manage/page.tsx`** — порядок блоков, полосы OWNER/SUPER_ADMIN, убрать лишний шум, компактные ghost-ссылки вместо двух полноразмерных кнопок, где хватает одной строки (`dashboard-theme-nav.mdc`).
3. **`BusinessRateControlCenter`** — VIP-компакт: метки 10–11px uppercase, суммы tabular-nums, одна строка ключевых цифр где уместно; журнал и «Календарь · план» вторичны.
4. **`HistoryPeriodPopover` в журнале ставки** — как в финансовой ленте (`triggerVariant="toolbar"`); **не менять** `computeFinanceCalendarPopoverPosition` и эталон Финансов.
5. **Календарный контур** — только `FinanceMonthCalendar` + `FinanceCalendarPopoverPanel`; не дублировать сетку дней.
6. **Тема и навигация** — не добавлять `ThemeToggle` в шапки Manage; нижний бар OWNER/SUPER_ADMIN по `dashboard-theme-nav.mdc`.
7. **Защита** — соблюдать `investor-dashboard-protected.md`; эталон инвесторского дашборда не трогать.
8. **Завершение итерации** — `npx tsc --noEmit`, линтер; обновить `docs/UI_ETALONS_REGISTRY.md` и `PROJECT_AUDIT.md`; при заметных UI-изменениях — e2e/скриншоты по `e2e-screenshots-viewports.mdc`.

## Инструкция агенту

1. Прочитай **`docs/UI_ETALONS_REGISTRY.md`** (§ Управление → редизайн Manage) и **`.cursor/rules/investor-dashboard-protected.md`**.
2. Выполни **этап 1** плана; не расширяй объём на не обсуждавшиеся фичи.
3. Не изменяй файлы из `investor-dashboard-protected.md` и не меняй **`computeFinanceCalendarPopoverPosition`** / поведение периода в Финансах.
4. После изменений — **`npx tsc --noEmit`**; при необходимости обнови документацию в том же духе, что в реестре.

---

*Файл создан при подготовке редизайна Manage (2026-05-09).*
