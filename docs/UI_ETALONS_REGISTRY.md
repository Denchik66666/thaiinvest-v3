# Реестр эталонов UI / архитектуры (привязка к файлам)

Краткий указатель «где искать эталон», чтобы не дублировать компоненты и не ломать премиум‑контур.

## Дашборды по ролям

| Эталон | Файл(ы) |
|--------|---------|
| Главная INVESTOR (премиум‑герой, неделя, история) | `app/dashboard/page.tsx`, `components/dashboard/InvestorPremiumDashboard.tsx`, встроенная история через `components/dashboard/DashboardOperationsHistory.tsx` |
| Недельная шкала (полоска прогресса + маркер) | `components/dashboard/WeekCycleStrip.tsx` |
| Главная OWNER (премиум‑герой, сеть, очереди) | `app/dashboard/page.tsx`, `components/dashboard/OwnerPremiumDashboard.tsx`, `components/dashboard/OwnerNetworkInvestorsCompact.tsx`, `components/dashboard/OwnerRequestsAndConfirmations.tsx`, `components/dashboard/OwnerPendingPaymentsQueue.tsx`, `components/dashboard/OwnerBodyTopupAwaitingQueue.tsx` |
| Главная SUPER_ADMIN (glass overview; карточка сети без `compact`) | `app/dashboard/page.tsx`, `components/dashboard/SuperAdminNetworkOverviewCard.tsx` |
| Общая шапка дашборда | `components/dashboard/DashboardTopbar.tsx` |

## Финансы

| Эталон | Файл(ы) |
|--------|---------|
| Страница финансов | `app/dashboard/finance/page.tsx`, `components/dashboard/finance/FinanceHubInner.tsx` |
| Аккордеон позиций / под‑лента | `components/dashboard/finance/FinanceInvestorAccordionCards.tsx`, `components/dashboard/finance/FinanceOperationsSubFeed.tsx` |
| Общая история операций (период, фильтры, скролл) | `components/dashboard/DashboardOperationsHistory.tsx`, `components/dashboard/HistoryPeriodPopover.tsx` |
| Модалка операции / правки / удаление (SUPER_ADMIN) | `components/dashboard/finance/FinanceOperationDetailModal.tsx` |
| Очередь правок заявок | `components/dashboard/finance/PaymentCorrectionQueue.tsx` |
| Единый календарь (сетка месяца) | `components/ui/FinanceMonthCalendar.tsx`, `components/ui/finance-calendar-popover-skin.ts` |
| Попап календаря / периода (общая оболочка) | `components/ui/FinanceCalendarPopoverPanel.tsx` |
| Период в ленте (эталон позиции попапа) | `components/dashboard/HistoryPeriodPopover.tsx` — позиция только через **`computeFinanceCalendarPopoverPosition`** |
| Выбор одной даты (не ломая Финансы) | `components/ui/DatePicker.tsx` — позиция попапа через **`computeDatePickerCalendarPopoverPosition`** |

## Управление

| Эталон | Файл(ы) |
|--------|---------|
| Страница «Управление» | `app/dashboard/manage/page.tsx` |
| Ставка бизнеса + журнал + календарь плана | `components/manage/BusinessRateControlCenter.tsx` (сетка месяца — **`FinanceMonthCalendar`**, без отдельного дубля компонента календаря) |
| Модалка создания инвестора | `components/investors/CreateInvestorModal.tsx` |
| Одноразовый показ логина/пароля после создания | `components/investors/InvestorCredentialsReveal.tsx` |

### `/dashboard/manage` — редизайн (зафиксировано 2026-05-09)

**Текущее состояние (уже в коде):**

- Календарь: одна сетка **`FinanceMonthCalendar`**; попап даты и периода — общая оболочка **`FinanceCalendarPopoverPanel`**; период в Финансах и журнале ставки по-прежнему на **`HistoryPeriodPopover`**.
- **Не ломать Финансы:** для попапа периода в ленте используется только **`computeFinanceCalendarPopoverPosition`** (не менять поведение).
- **`DatePicker`** (понедельник, даты в правках плана): позиция попапа — отдельно **`computeDatePickerCalendarPopoverPosition`** (узкий вьюпорт — шире и по центру якоря).
- Встроенный календарь плана в карточке ставки: режим **`range`** как у выбора одного дня в **`DatePicker`**, точки «·» по дням смены ставки через **`highlightedYmds`**; отдельный **`BusinessRateMonthCalendar`** удалён.

**План переработки Manage (8 этапов):**

1. **Списки и выбор** — тот же визуальный язык, что в Финансах (аккордеон **`FinanceInvestorAccordionCards`**, чипы в одной строке с периодом), без отдельных «своих» выпадающих списков там, где нужен общий премиум-контур (обсуждение: списки как у инвесторов и всей сети в Финансах).
2. **`app/dashboard/manage/page.tsx`** — порядок блоков, полосы OWNER/SUPER_ADMIN, убрать лишний шум, компактные ghost-ссылки вместо двух полноразмерных кнопок, где хватает одной строки (**`.cursor/rules/dashboard-theme-nav.mdc`**).
3. **`BusinessRateControlCenter`** — дожать VIP-компакт: метки 10–11px uppercase, суммы tabular-nums, одна строка ключевых цифр где уместно; журнал и «Календарь · план» остаются вторичными поверхностями.
4. **`HistoryPeriodPopover` в журнале ставки** — оставить как в финансовой ленте (в т.ч. `triggerVariant="toolbar"`); **не менять** эталонную **`computeFinanceCalendarPopoverPosition`** и UX периода на экране Финансов.
5. **Календарный контур** — не откатывать и не дублировать: только **`FinanceMonthCalendar`** + **`FinanceCalendarPopoverPanel`**; без второй реализации сетки дней.
6. **Тема и навигация** — по **`dashboard-theme-nav.mdc`**: не добавлять **`ThemeToggle`** в шапки Manage; нижний бар для OWNER/SUPER_ADMIN не расширять лишними вкладками.
7. **Защищённые файлы** — **`.cursor/rules/investor-dashboard-protected.md`**: без явного запроса пользователя не редактировать перечисленные там файлы; эталон инвесторского дашборда и связанная лента/период не трогать.
8. **Завершение итерации** — `npx tsc --noEmit`, линтер; обновить этот реестр и **`PROJECT_AUDIT.md`**; при заметных UI-изменениях — Playwright / скриншоты по **`.cursor/rules/e2e-screenshots-viewports.mdc`**.

**Промпт для нового чата с агентом:** см. **`docs/MANAGE_REDESIGN_AGENT_PROMPT.md`** (один готовый блок для вставки в новый чат).

## Профиль и безопасность

| Эталон | Файл(ы) |
|--------|---------|
| Профиль (аккаунт, тема, сброс БД) | `app/dashboard/profile/page.tsx` |
| Загрузка аватара | `app/api/auth/avatar/route.ts`, использование в профиле |
| Смена логина/пароля | `app/api/auth/account/route.ts` |

## Навигация и тема

| Эталон | Файл(ы) |
|--------|---------|
| Нижняя навигация по ролям | `components/navigation/MobileBottomNav.tsx` |
| Правила темы и нижнего бара (агент) | `.cursor/rules/dashboard-theme-nav.mdc` |
| Тема (presets, dark/light) | `lib/app-theme.ts`, `components/theme/AppThemeSync.tsx`, `components/ThemeToggle.tsx` |
| Токены стекла / `--thai-color-*` | `styles/thai-design-system.css`, `app/globals.css` |

## Защита маршрутов и API

| Эталон | Файл(ы) |
|--------|---------|
| Редирект неавторизованных с `/dashboard/*` | `proxy.ts` (Next 16; не `middleware.ts`) |
| Обзор ролей и API | `PROJECT_AUDIT.md`, `API_AUDIT.md` |

## Визуальные эталоны и тесты

| Эталон | Файл(ы) |
|--------|---------|
| Сравнение скриншотов | папки `screenshots/compare/` |
| Три экрана инвестора (правило агента) | `tests/e2e/investor-role-three-screens.spec.ts`, `.cursor/rules/e2e-screenshots-viewports.mdc` |
| Прочие e2e / скриншоты | `tests/e2e/*.spec.ts` (напр. `compare-owner-vs-investor-dashboard.spec.ts`, `finance-hub-screenshots.spec.ts`, `dashboard-three-roles-dark.spec.ts`) |

---

*Обновлять этот файл при добавлении новых «эталонных» экранов или при выделении общих компонентов.*
