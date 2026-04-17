# PROJECT_AUDIT — ThaiInvest v3.x

**Дата аудита:** 2026-04-17  
**Корень проекта:** `THAIINVEST v3.0`  
**Исключено из обхода:** `node_modules/`, `.git/`, `.next/`, `dist/`, `build/` (и аналоги артефактов сборки).

**Ограничения (по запросу заказчика):**
- Не предполагать развёртывание на сервере; план только для локальной/репозиторной доводки.
- **Не удалять файлы и код без явного подтверждения** заказчика.
- После выполнения **каждого шага** плана ниже — спросить у заказчика: **«Продолжить?»**

---

## 1. Карта технологий

| Область | Технология | Примечание |
|--------|------------|------------|
| Фреймворк | **Next.js 16.2.1** (App Router) | `app/`, Turbopack в dev |
| UI | **React 19.2.4** | Client/Server components |
| Стили | **Tailwind CSS v4** + **globals.css** | `@import "tailwindcss"`, темы `theme-linear` / `theme-vercel` / `theme-shadcn`, `dark` |
| Шрифты | **next/font** — Geist Sans / Geist Mono | `app/layout.tsx` |
| Данные | **Prisma 7.7** + **PostgreSQL** | `prisma/schema.prisma`, `lib/prisma.ts` |
| Валидация / API | **Zod 4** | `lib/schemas.ts`, роуты |
| Auth | **jose**, **bcryptjs**, **jsonwebtoken**, cookie | `lib/auth.ts`, `app/api/auth/*` |
| Запросы на клиенте | **TanStack React Query 5** | `app/providers.tsx`, страницы dashboard |
| Утилиты UI | **clsx**, **tailwind-merge**, **CVA** | `lib/utils.ts`, `components/ui/*` |
| Иконки | **lucide-react** | Страницы и UI |
| Конфиг БД | **prisma.config.ts** | `DATABASE_URL` (в т.ч. Accelerate URL в комментарии) |

**Зависимости в `package.json`, по коду приложения не используемые (импортов в `app/`, `components/`, `lib/`, `hooks/` не найдено):**
- `@supabase/supabase-js`
- `zustand`
- `@prisma/extension-accelerate` — в коде нет `withAccelerate` / импорта расширения; в `lib/prisma.ts` используется опция `accelerateUrl` у `PrismaClient` (см. документацию Prisma для вашей версии).

---

## 2. Карта каталогов (что где лежит)

```
app/
  layout.tsx, providers.tsx, page.tsx (редирект → /login), globals.css
  login/page.tsx          — вход, тема, флаг
  dashboard/
    page.tsx              — главная дашборда (инвестор / владелец)
    profile/page.tsx      — профиль, настройки, LanguageSwitcher, ThemeToggle
    manage/page.tsx       — админ/управление
    manage/investors/[id]/page.tsx
    chat/page.tsx
    reports/page.tsx
  api/                    — REST: auth, investors, payments, chat, system, body-topup-requests, dashboard/investors
components/
  ui/                     — Card, Button, Input, …
  navigation/MobileBottomNav.tsx
  investors/              — модалка, таблица
  user/UserAvatar.tsx
  ThemeToggle.tsx
  LoginThailandThemeToggle.tsx
  LanguageSwitcher.tsx
  icons/ThailandFlagIcon.tsx, RussiaFlagIcon.tsx
hooks/useAuth.ts
lib/                      — prisma, auth, api-client, schemas, audit, business-rate, weekly, utils
prisma/                   — schema, migrations, seed.ts
proxy.ts                  — проверка cookie для защищённых путей (Next middleware-стиль)
next.config.ts
db_backup_20260415_*.json — снимок данных БД (не код)
.cursor/rules/            — правила Cursor (в т.ч. playwright-login-visual-qa.mdc)
```

**Git:** в корне проекта **репозиторий `.git` не обнаружен** (аудит среды без истории коммитов).

---

## 3. «Мусор» и технический долг (только перечень, без удаления)

### 3.1 ESLint (фактический прогон `npm run lint`)

| Файл | Уровень | Суть |
|------|---------|------|
| `app/dashboard/profile/page.tsx` | **error** | `react-hooks/set-state-in-effect`: `setUsername` в `useEffect` при `[user]` |
| `app/login/page.tsx` | **error** | то же: `setThemeName` / `setDarkMode` в `useEffect` при инициализации из `localStorage` |
| `app/dashboard/chat/page.tsx` | **warning** | `react-hooks/exhaustive-deps`: `partners` и `useMemo` |

Исправление этих пунктов — **шаг 1 плана** (см. раздел 6).

### 3.2 `console.*` в исходниках приложения (не в `node_modules`)

Во многих **`app/api/**/route.ts`** и **`lib/audit.ts`** используется **`console.error(...)`** при ошибках catch. Это не «мусор для удаления вслепую»: это логирование на сервере. Решение по политике: оставить / заменить на структурированный логгер / убрать в production — **только после согласования**.

**Список файлов с `console.error` (app + lib):**  
`app/api/auth/login`, `account`, `me` · `app/api/investors/route`, `investors/[id]`, `become-semen-investor`, `weekly-ledger` · `app/api/chat/*` · `app/api/payments` · `app/api/system/readiness`, `business-rate`, `business-rate/history` · `app/api/body-topup-requests` · `app/api/dashboard/investors` · `app/dashboard/manage/page.tsx` (create investor) · `lib/audit.ts`.

Отдельного массового `console.log` для отладки в `app/components/lib/hooks` **не выявлено**.

### 3.3 Закомментированный / мёртвый код

По выборочному просмотру: явных больших блоков «закомментированного мусора» в ключевых файлах не фиксировалось; **полный AST-поиск закомментов не выполнялся**. Рекомендация: отдельный проход `grep` по `^\\s*//` или инструмент dead-code (Knip) — **после согласования**.

### 3.4 Дубликаты логики

- **Тема:** на логине — своя логика + `LoginThailandThemeToggle`; в профиле — `ThemeToggle.tsx` (палитра Linear/Vercel/Shadcn + dark). Поведение схоже, реализации разные — возможный кандидат на **унификацию** (не удалять без обсуждения).
- **Флаг Таиланда:** `ThailandFlagIcon` (SVG) используется в `LanguageSwitcher`; на логине сейчас **эмодзи** в `LoginThailandThemeToggle` — дублирование смысла «флаг TH», разные медиа.

### 3.5 Битые импорты

Статический прогон **TypeScript не выполнялся** отдельно от ESLint. ESLint **не сообщил** о unresolved imports. Для уверенности: `npx tsc --noEmit` — **отдельный шаг по согласованию**.

### 3.6 «Мёртвые» стили

- **`app/login/page.tsx`:** большой объём **inline-стилей** и инжект `<style>` для `:hover`/placeholder — поддерживаемо, но дублирует по смыслу Tailwind на остальных страницах. Рефакторинг в CSS-module или общие токены — **опционально, низкий приоритет**.
- **`globals.css`:** маркетинговые комментарии («Mercedes / Lexus») — не ошибка; при желании упростить тон документации в CSS.

### 3.7 Прочее

- **`app/api/auth/avatar/route.ts`:** явный **503** «загрузка аватара временно отключена» — согласовано с текстом в профиле; не мусор, но **функция не готова**.
- **`db_backup_20260415_233331.json`:** бэкап данных; не включать в репозиторий публично при наличии секретов (пароли хэшированы, но политика хранения — на стороне команды).

---

## 4. Стадия готовности по модулям / страницам

Условные статусы: **Готово** | **Частично** | **Не готово** | **Сломано** (блокирует сценарий или CI).

| Модуль / страница | Статус | Комментарий |
|-------------------|--------|-------------|
| Корень `/` → `/login` | Готово | Редирект |
| `/login` | Частично | Работает вход и тема; на части ПК эмодзи флага → «TH»; ESLint error |
| `/dashboard` | Частично | Зависит от роли и данных БД |
| `/dashboard/profile` | Частично | Данные/безопасность; LanguageSwitcher только `lang` + localStorage; аватар отключён; ESLint error |
| `/dashboard/manage` | Частично | Сложная страница, много API |
| `/dashboard/manage/investors/[id]` | Частично | Детальная карточка |
| `/dashboard/chat` | Частично | ESLint warning |
| `/dashboard/reports` | Частично | Зависит от API |
| API Auth (login, logout, me, account) | Частично | Аватар 503; `console.error` в catch |
| API Investors / Payments / Chat / System / Top-up | Частично | Типичный CRUD + бизнес-логика; много `console.error` |
| Prisma + миграции | Готово / Частично | Схема и миграции есть; окружение БД не проверялось в этом аудите |
| `proxy.ts` | Готово | Защита маршрутов по cookie |
| MobileBottomNav | Готово | Навигация |
| UI kit (`components/ui`) | Готово | Базовый набор |
| Зависимости zustand / supabase | Не готово / мёртвый вес | Не используются в исходниках — кандидаты на удаление из `package.json` **после подтверждения** |

---

## 5. Пошаговый план доведения до идеала (без деплоя)

**Правило:** после каждого шага спросить у заказчика: **«Продолжить?»** Переходить к следующему шагу только после ответа.

### Шаг A — Починить сломанное / блокирующее CI
1. Устранить **ESLint errors** в `app/login/page.tsx` и `app/dashboard/profile/page.tsx` (инициализация состояния без запрещённого паттерна `setState` в `useEffect` — например lazy `useState`, или разделение гидрации).
2. Устранить **warning** в `app/dashboard/chat/page.tsx` (`useMemo` / `partners`).
3. Прогнать **`npm run lint`** и при возможности **`npx tsc --noEmit`** и **`npm run build`**.

**После шага A → спросить: Продолжить?**

### Шаг B — Убрать / согласовать «мусор» (без удаления без подтверждения)
1. Решение по **`@supabase/supabase-js`**, **`zustand`**, **`@prisma/extension-accelerate`**: удалить из зависимостей или начать использовать — **только после вашего «да»**.
2. Политика **`console.error`** в API: оставить / заменить на логгер / обернуть `if (process.env.NODE_ENV === 'development')` — **после вашего «да»**.
3. Опционально: поиск закомментированного кода (отдельный отчёт).

**После шага B → спросить: Продолжить?**

### Шаг C — Оптимизация и качество
1. Унификация переключения темы (`ThemeToggle` vs логин).
2. Рефакторинг `login/page.tsx`: меньше inline, больше переиспользования с дашбордом.
3. Включить **git** в проекте + минимальный CI (lint/build) — без деплоя.
4. Документация `README`: переменные окружения, миграции, `npm run dev`.

**После шага C → спросить: Продолжить?**

---

## 6. Итог аудита (кратко)

- Проект — **монолит Next.js** с **Prisma**, **JWT/cookie auth**, **dashboard** и **набором API**. Структура **понятная и модульная**.
- Критичные замечания автоматической проверки: **2 ESLint error + 1 warning**; остальное — **долг и гигиена**.
- **Неиспользуемые npm-пакеты** (supabase, zustand, возможно accelerate-extension) — кандидаты на чистку **после подтверждения**.
- Развёртывание на сервере в этот документ **не входит**.

---

*Конец файла PROJECT_AUDIT.md*
