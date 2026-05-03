# PROJECT_AUDIT — ThaiInvest v3.x

**Дата ревизии:** 2026-05-03  
**Корень проекта:** `THAIINVEST v3.0`  
**Версия приложения (package.json):** 3.1.0  

**Исключено из детального обхода:** `node_modules/`, `.next/`, артефакты сборки.

---

## 1. Технологический стек

| Область | Технология | Где задаётся |
|--------|------------|--------------|
| Фреймворк | **Next.js 16.2.1** (App Router) | `package.json`, `app/` |
| UI | **React 19.2.4** | — |
| Стили | **Tailwind CSS v4** + `globals.css` + дизайн-система | `app/globals.css`, `styles/thai-design-system.css`, `styles/animations.css` |
| Шрифты | **next/font** — Geist Sans / Geist Mono | `app/layout.tsx` |
| БД | **Prisma 7.7** + **PostgreSQL** (`@prisma/adapter-pg`, `pg`) | `prisma/schema.prisma`, `lib/prisma.ts`, `prisma.config.ts` |
| Валидация | **Zod 4** | `lib/schemas.ts`, часть API |
| Auth | **jsonwebtoken**, **bcryptjs**, HTTP-only cookie `token` | `lib/auth.ts`, `app/api/auth/*` |
| Клиентские данные | **TanStack React Query 5** | `app/providers.tsx`, страницы дашборда |
| UI-утилиты | **clsx**, **tailwind-merge**, **CVA** | `lib/utils.ts`, `components/ui/*` |
| Уведомления UI | **sonner** | `lib/notify.ts`, провайдеры |
| Иконки | **lucide-react** | страницы и компоненты |
| E2E | **Playwright** | `tests/e2e/`, `playwright.config.ts` |
| CI | GitHub Actions | `.github/workflows/` |

**Зависимости:** в `package.json` нет `@supabase/supabase-js`, `zustand`, `@prisma/extension-accelerate`. Пакет **jose** объявлен в зависимостях, но основной JWT-поток в `lib/auth.ts` — через **jsonwebtoken** (импорт `jose` в коде приложения не используется — кандидат на удаление при желании сузить зависимости).

---

## 2. Структура проекта (каталоги и назначение)

| Каталог / файл | Назначение |
|----------------|------------|
| **`app/`** | App Router: макеты, страницы, глобальные стили, API-роуты. |
| **`app/layout.tsx`** | Корневой layout: шрифты, `<html className="theme-linear dark">`, `Providers`, `<main>`. |
| **`app/providers.tsx`** | React Query, диалоги, **`AppThemeSync`** (синхрон темы с `localStorage`). |
| **`app/globals.css`** | Tailwind v4 `@import`, `@source` для сканирования классов, импорт дизайн-системы. |
| **`app/page.tsx`** | Редирект на `/login`. |
| **`app/login/`** | Страница входа (клиентский компонент). |
| **`app/dashboard/`** | Все экраны кабинета после авторизации (без вложенного `layout.tsx` — общая оболочка внутри страниц). |
| **`app/api/`** | REST API: auth, investors, payments, chat, system, reports, body-topup, dashboard, admin. |
| **`components/`** | Переиспользуемые UI: `ui/`, навигация, инвесторы, профиль, уведомления, тема. |
| **`components/theme/AppThemeSync.tsx`** | Клиент: подписка на `lib/app-theme`, применение классов к `<html>`. |
| **`hooks/`** | `useAuth` и прочие хуки. |
| **`lib/`** | Prisma, auth, аудит, бизнес-ставка, недели, чат, сброс БД, retry к БД, тема, схемы. |
| **`styles/`** | `thai-design-system.css` (токены `.thai-*`, фон логина/дашборда), `animations.css`. |
| **`prisma/`** | `schema.prisma`, `migrations/`, `seed.ts`. |
| **`scripts/`** | Утилиты: проверка БД, e2e-сценарии, отладка логина/сброса, чат. |
| **`tests/e2e/`** | Playwright-спеки. |
| **`types/`** | Общие TS-типы (например инвестор). |
| **`public/`** | Статика, PWA manifest, иконки. |
| **`docs/`** | Документация релиза и т.п. |
| **`.cursor/rules/`** | Правила Cursor для агента. |
| **`Для анализа/`** | Вспомогательные текстовые заметки (не часть приложения). |
| **`proxy.ts`** | Логика «middleware-стиля» (проверка JWT cookie + редирект на `/login`). **В репозитории нет `middleware.ts`**, этот файл **нигде не импортируется** — см. раздел 7. |
| **`next.config.ts`** | `allowedDevOrigins` и др. |
| **`eslint.config.mjs`**, **`tsconfig.json`**, **`tailwind.config.ts`**, **`postcss.config.mjs`** | Конфигурация инструментов. |

---

## 3. Страницы: маршруты и состояние

Все страницы дашборда — **client components** с **`useAuth()`**; при отсутствии пользователя выполняется редирект на **`/login`** (паттерн `useEffect` / проверка после `loading`).

| Маршрут | Файл | Назначение | Состояние |
|---------|------|------------|-----------|
| **`/`** | `app/page.tsx` | Редирект → `/login` | Работает |
| **`/login`** | `app/login/page.tsx` | Вход, опционально toast при `?db_cleared=1`, переключатель темы | Работает; тема через общий `ThemeToggle` + `AppThemeSync` |
| **`/dashboard`** | `app/dashboard/page.tsx` | Главная: список инвесторов, платежи, уведомления (зависит от роли) | Работает (данные с API) |
| **`/dashboard/finance`** | `app/dashboard/finance/page.tsx` | Финансы; для не-инвестора редирект на manage | Работает |
| **`/dashboard/reports`** | `app/dashboard/reports/page.tsx` | Лента отчётов (`/api/reports/feed`) | Работает |
| **`/dashboard/investors`** | `app/dashboard/investors/page.tsx` | Список инвесторов; редирект инвестора на finance | Работает |
| **`/dashboard/investors/[id]`** | `app/dashboard/investors/[id]/page.tsx` | Карточка инвестора | Работает |
| **`/dashboard/manage`** | `app/dashboard/manage/page.tsx` | Управление, ставка, создание инвесторов | Работает |
| **`/dashboard/chat`** | `app/dashboard/chat/page.tsx` | Чат | Работает |
| **`/dashboard/profile`** | `app/dashboard/profile/page.tsx` | Профиль, аккаунт, тема, блок сброса БД для SUPER_ADMIN | Работает; аватар API — заглушка 503 |

**Устаревший маршрут в старом аудите:** `manage/investors/[id]` — в текущем дереве **нет**; детальная карточка — **`/dashboard/investors/[id]`**.

---

## 4. API (обзор)

Каждый защищённый эндпоинт проверяет cookie **`token`**, **`verifyToken`** и при необходимости **роль / владение сущностью** (см. §5). Исключения: **`POST /api/auth/login`**, **`POST /api/auth/logout`** (по смыслу), **`POST /api/auth/avatar`** (заглушка без полноценной логики).

| Префикс / файл | Назначение |
|----------------|------------|
| `app/api/auth/login`, `logout`, `me`, `account`, `avatar` | Аутентификация и профиль |
| `app/api/investors/*` | CRUD и операции по инвесторам, недельный ledger, контекст приватной сети, become-semen |
| `app/api/payments/route.ts` | Заявки и решения по выплатам |
| `app/api/chat/*` | Каталог, контекст, сообщения, read, admin-test-send |
| `app/api/system/*` | Бизнес-ставка, история, readiness |
| `app/api/dashboard/investors` | Агрегированные данные для главной дашборда |
| `app/api/reports/feed` | Лента для отчётов |
| `app/api/body-topup-requests` | Запросы пополнения тела |
| `app/api/admin/database-reset/*` | Статус / пароль / выполнение сброса БД (SUPER_ADMIN) |

---

## 5. Ролевая модель

### 5.1 Роли в БД и JWT

В **`prisma/schema.prisma`** enum **`Role`**: **`SUPER_ADMIN`**, **`OWNER`**, **`INVESTOR`**.  
В **`lib/auth.ts`** токен содержит **`userId`**, **`username`**, **`role`**; **`verifyToken`** отклоняет неизвестные роли.

### 5.2 Где проверяется только «авторизован»

- **`GET /api/auth/me`** — валидный токен + пользователь в БД; роль возвращается клиенту, ограничений по роли нет.  
- Часть **GET** (например текущая бизнес-ставка) — любая валидная роль из токена.  
- **`PATCH /api/auth/account`** — смена своего логина/пароля по `decoded.userId` (без явного enum-чека роли).

### 5.3 Явные ограничения по роли (по коду `app/api`)

| Зона | Требование |
|------|------------|
| **`/api/system/readiness`**, **`/api/investors/private-create-context`**, **`/api/investors/become-semen-investor`**, **`/api/chat/admin-test-send`**, **`/api/admin/database-reset/*`** | **SUPER_ADMIN** |
| **`POST /api/system/business-rate`**, история ставок (часть методов) | **OWNER** или **SUPER_ADMIN** |
| **`POST /api/body-topup-requests`** | **OWNER** |
| **`GET /api/body-topup-requests`** | Фильтр по роли: OWNER — свои общие позиции; SUPER_ADMIN — все; иначе — связанные с пользователем инвесторы |
| **`/api/investors/[id]`** PATCH/DELETE чувствительные операции | **OWNER** или **SUPER_ADMIN** с проверками владения / приватной сети |
| **`/api/investors/route` GET/POST** | Разветвление **`where`** и действий по **OWNER** / **SUPER_ADMIN** / **INVESTOR** |
| **`/api/payments` POST** | Матрица прав: запрос от «стороны инвестора», approve/reject от OWNER/SUPER_ADMIN, force_* только **SUPER_ADMIN** |
| **`/api/reports/feed`** | Объём данных зависит от **role** |
| **`/api/dashboard/investors`** | Фильтр списка: OWNER — свои общие; INVESTOR — свой `investorUserId`; SUPER_ADMIN — полный список (как `network=all` в списке инвесторов) |
| **`/api/investors/[id]/weekly-ledger`** | OWNER — только свои неприватные; INVESTOR — только своя привязка (`investorUserId` / `linkedUserId`); SUPER_ADMIN — без доп. 403 по роли |
| **Чат** | **`lib/chat-peer-permission.ts`**: **`GET` и `POST /api/chat/messages`** проверяют допустимость пары пользователей; **`/api/chat/directory`** и **`/api/chat/context`** используют роль из БД для выборки списков |

### 5.4 Клиент

- **`useAuth`**, **`MobileBottomNav`**, страницы дашборда — навигация и часть UX по **`user.role`**; это **не замена** серверных проверок.

### 5.5 Сетевой периметр

- Файл **`proxy.ts`** не подключён как **`middleware.ts`**. Защита URL **`/dashboard/*`** на практике — **клиентский редирект** + **401 на API**. Имеет смысл либо подключить middleware, либо удалить/документировать `proxy.ts` как черновик.

---

## 6. Дизайн-система и тема

### 6.1 Файлы стилей

| Файл | Роль |
|------|------|
| **`app/globals.css`** | `@import "tailwindcss"`, `@source` для сканирования `app/`, `components/`, `hooks/`, `lib/`; базовые токены `:root`, классы тем **`.theme-linear`**, **`.theme-vercel`**, **`.theme-shadcn`**, **`.dark`**. |
| **`styles/thai-design-system.css`** | Токены «стекла» и градиентов (`.thai-glass`, `.thai-dashboard-root`, `.thai-login-shell`, метрики и т.д.). |
| **`styles/animations.css`** | Анимации (подключается при необходимости из глобальных стилей / страниц). |

### 6.2 Как работает тема

1. **`lib/app-theme.ts`** — единая логика: ключи **`localStorage`**, пресеты зафиксированы в коде; активный пресет **`theme-linear`** (`SINGLE_THEME_PRESET`); переключается в основном **светлый/тёмный** режим (класс **`dark`** на `<html>`).  
2. **`components/theme/AppThemeSync.tsx`** (в **`providers`**) — **`useSyncExternalStore`** + **`applyAppThemeToDocument`** при изменении снимка.  
3. **`components/ThemeToggle.tsx`** — переключение dark/light через **`persistAppTheme`**; вариант **`compact`** для компактной кнопки на логине.  
4. **`app/layout.tsx`** — начальные классы на `<html>` для SSR/первого кадра; клиент перезаписывает при гидратации.

Пресеты **Vercel / Shadcn** остаются в **CSS** для возможного расширения; рантайм-переключение палитр в UI отключено в пользу одного пресета + dark.

---

## 7. База данных

### 7.1 Таблицы (модели Prisma)

| Модель | Назначение |
|--------|------------|
| **User** | Пользователи, роль, пароль, архивация |
| **Investor** | Инвесторные позиции, владелец, привязки `linkedUserId` / `investorUserId`, приватность |
| **Payment** | Выплаты / заявки |
| **Accrual** | Начисления по циклам |
| **BodyTopUpRequest** | Запросы пополнения тела |
| **RateHistory** | История бизнес-ставки |
| **AuditLog** | Аудит действий |
| **ChatMessage** | Сообщения чата |
| **DatabaseResetConfig** | Хэш пароля полного сброса БД (singleton) |
| **DatabaseResetLockout** | Блокировка ввода пароля сброса после неудачных попыток |

### 7.2 Миграции

| Папка / миграция | Содержание (по имени и назначению) |
|------------------|-------------------------------------|
| **`20260417120000_postgresql_init`** | Первичная схема PostgreSQL |
| **`20260426180000_database_reset_tables`** | Таблицы и поля для контролируемого сброса БД |

Файл **`prisma/migrations/migration_lock.toml`** — провайдер **`postgresql`**.

---

## 8. Уже сделано (после прошлых аудитов)

- **Безопасность API:** уточнены фильтры **`GET /api/dashboard/investors`**; проверка доступа **INVESTOR** для **`/api/investors/[id]/weekly-ledger`**; **`GET /api/body-topup-requests`** для **SUPER_ADMIN**; общая проверка **`canChatWithPeer`** для **`GET/POST /api/chat/messages`**.  
- **Единая тема:** удалён отдельный переключатель логина; **`ThemeToggle`** + **`AppThemeSync`** + **`lib/app-theme`**; логин на Tailwind для полей/кнопки; часть специфичных CSS логина убрана из `thai-design-system.css`.  
- **Зависимости:** в манифесте нет неиспользуемых пакетов из старого списка (supabase / zustand / accelerate-extension).  
- **TypeScript:** исправлены ошибки **`tsc --noEmit`** (body-topup, business-rate POST, reset credentials).  
- **Git:** репозиторий ведётся; зафиксированы коммиты по аудиту и документации (в т.ч. сообщения на русском по запросу команды).

---

## 9. Что ещё требует внимания

| Тема | Детали |
|------|--------|
| **`proxy.ts` без `middleware.ts`** | Нет серверного редиректа неавторизованных с `/dashboard` до загрузки JS; для жёсткой политики — добавить **`middleware.ts`** или удалить мёртвый код. |
| **`POST /api/auth/avatar`** | Явный **503** — загрузка аватара не реализована. |
| **Зависимость `jose`** | В `package.json` есть, в основном коде auth не видна — проверить необходимость или удалить. |
| **`console.error` в API** | Широко используется в `catch` — норм для отладки; при проде стоит согласовать структурированный логгер. |
| **ESLint** | Полный `npm run lint` может по-прежнему ругаться на отдельные файлы (например `SuperAdminDatabaseResetSection`, `Select.tsx`, др.) — прогонять перед релизом и чинить точечно. |
| **Папка `Для анализа/`** | Не код; при публикации репозитория решить, оставлять ли в git. |
| **`create-test-investors.js`** и debug-скрипты | Убедиться, что не попадают в прод-сборку и не содержат секретов. |
| **Связка INVESTOR + `linkedUserId`** | В **`GET /api/investors`** для инвестора фильтр **`investorUserId`**; если нужны сценарии только по **`linkedUserId`**, сверить с продуктом. |

---

## 10. Краткий итог

Проект — **монолит Next.js (App Router)** с **Prisma + PostgreSQL**, **JWT в cookie**, кабинетом **`/dashboard/*`** и набором **REST API**. Структура каталогов **согласована** с ролями и доменом (инвесторы, платежи, чат, отчёты, сброс БД). Документ отражает **фактическое** состояние на дату ревизии; для следующего аудита имеет смысл снова прогнать **`npm run lint`**, **`npx tsc --noEmit`**, **`npm run build`** и при необходимости **`npm run test:e2e`**.

---

*Конец файла PROJECT_AUDIT.md*
