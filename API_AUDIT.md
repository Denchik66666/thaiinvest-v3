# API_AUDIT — все HTTP-роуты ThaiInvest

**Дата:** 2026-05-04 (актуализация: `proxy.ts` / дашборд, `PATCH /api/chat/read`, `POST /api/auth/avatar`)  
**Базовый URL (локально):** `http://localhost:3000`  
**Префикс API:** `/api/`

## Общие правила авторизации

| Механизм | Описание |
|----------|----------|
| **Cookie `token`** | JWT; большинство роутов читают через `cookies()` из `next/headers`. |
| **`verifyToken`** | `lib/auth.ts` — проверка подписи и полей `userId`, `username`, `role` (`SUPER_ADMIN` \| `OWNER` \| `INVESTOR`). |
| **401** | Нет cookie / невалидный токен. |
| **403** | Токен валиден, но роль или владение сущностью не допускают операцию. |

Роуты **без** проверки JWT: **`POST /api/auth/login`**, **`POST /api/auth/logout`** (logout не требует валидного токена — только сброс cookie).

---

## Сводная таблица по файлам

Путь к файлу относительно корня репозитория: `app/api/.../route.ts`.

### Auth

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **POST** | `/api/auth/login` | Вход: проверка логина/пароля, выдача JWT в cookie | Публично (до входа) | Учётные данные в `app/api/auth/login/route.ts` (`bcrypt`, `prisma.user`); роли в токене кладутся из записи пользователя. |
| **POST** | `/api/auth/logout` | Удаление cookie `token` | Публично | Нет `verifyToken`; `app/api/auth/logout/route.ts`. |
| **GET** | `/api/auth/me` | Текущий пользователь (id, username, role, isSystemOwner) | Любая роль при валидном JWT | `verifyToken` + загрузка `User` по `decoded.userId`; явного запрета по роли нет — `app/api/auth/me/route.ts`. |
| **PATCH** | `/api/auth/account` | Смена своего username / пароля | Любая роль при валидном JWT | `verifyToken`; обновление только `decoded.userId` — `app/api/auth/account/route.ts`. |
| **POST** | `/api/auth/avatar` | Загрузка аватара (функция пока отключена) | Любая роль при валидном JWT; после проверки — **503** | Сначала **`verifyToken`** + cookie (как **`/api/auth/me`**): нет/невалидный токен → **401**; при валидном токене — ответ **503** (заглушка) — `app/api/auth/avatar/route.ts`. |

---

### Dashboard

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/dashboard/investors` | Свод по инвесторам + платежи для главной дашборда | **OWNER** — только свои общие (`ownerId`, `isPrivate: false`); **INVESTOR** — позиция с `investorUserId`; **SUPER_ADMIN** — все | `verifyToken`; `whereClause` по `decoded.role` — `app/api/dashboard/investors/route.ts`. |

---

### Investors (список и создание)

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/investors` | Список инвесторов (`?network=`, `?lean=1`) | **OWNER** — свои общие; **SUPER_ADMIN** — фильтр `network` common/private/all; **INVESTOR** — `investorUserId` | `verifyToken` + построение `whereClause` — `app/api/investors/route.ts`. |
| **POST** | `/api/investors` | Создание инвестора (+ пользователь INVESTOR) | **INVESTOR** — **403**; **OWNER** и **SUPER_ADMIN** — разрешено; для **SUPER_ADMIN** + приватная сеть — лимиты через `getPrivateInvestorCreateContext` | `verifyToken`; `decoded.role === 'INVESTOR'`; логика личной сети — `app/api/investors/route.ts`. |

---

### Investor по id

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/investors/[id]` | Карточка инвестора, top-up, аудит | **OWNER** — только свой неприватный; **INVESTOR** — только если `investorUserId` или `linkedUserId`; **SUPER_ADMIN** — без доп. 403 в этом блоке | `verifyToken`; строки с `decoded.role` и полями инвестора — `app/api/investors/[id]/route.ts`. |
| **DELETE** | `/api/investors/[id]` | Удаление инвестора и архивация учётки инвестора | Только **SUPER_ADMIN** | `verifyToken`; `decoded.role !== "SUPER_ADMIN"` — `app/api/investors/[id]/route.ts`. |
| **PATCH** | `/api/investors/[id]` | Выдача / сброс учётных данных инвестора (пароль) | **OWNER** или **SUPER_ADMIN**; **OWNER** — только если `investor.ownerId === decoded.userId` | `verifyToken`; роль; затем `ownerId` для OWNER — `app/api/investors/[id]/route.ts`. |
| **PUT** | `/api/investors/[id]` | Редактирование полей инвестора (имя, тело, ставка, даты и т.д.) | **OWNER** или **SUPER_ADMIN**; **OWNER** — только свой инвестор | `verifyToken`; роль; `investor.ownerId` — `app/api/investors/[id]/route.ts`. |

---

### Investor — вспомогательные

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/investors/[id]/weekly-ledger` | Недельная «бухгалтерия» по инвестору | **OWNER** — свой неприватный; **INVESTOR** — привязка к позиции; **SUPER_ADMIN** — без доп. ограничения в этом фрагменте | `verifyToken`; блоки `OWNER` / `INVESTOR` — `app/api/investors/[id]/weekly-ledger/route.ts`. |
| **GET** | `/api/investors/private-create-context` | Контекст лимитов для создания приватного инвестора | Только **SUPER_ADMIN** | `verifyToken`; `decoded.role !== "SUPER_ADMIN"` — `app/api/investors/private-create-context/route.ts`. |
| **POST** | `/api/investors/become-semen-investor` | Спец-сценарий создания позиции (семя) | Только **SUPER_ADMIN** | `verifyToken`; `decoded.role !== "SUPER_ADMIN"` — `app/api/investors/become-semen-investor/route.ts`. |

---

### Payments

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **POST** | `/api/payments` | Единый endpoint: `action` в теле (request, owner_approve, owner_reject, investor_accept, investor_dispute, force_approve, force_reject) | Зависит от `action`: **request** — только «сторона инвестора» (матрица SUPER_ADMIN + привязка / INVESTOR + `investorUserId`); **owner_*** — **OWNER** (свой инвестор) или **SUPER_ADMIN**; **investor_*** — проверка привязки к инвестору; **force_*** — только **SUPER_ADMIN** | `verifyToken`; ветвление по `parsed.action` и ролям — `app/api/payments/route.ts`. |

---

### Body top-up

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/body-topup-requests` | Список запросов пополнения | **OWNER** — по своим общим; **SUPER_ADMIN** — все; иначе — по инвесторам с `linkedUserId` / `investorUserId` | `verifyToken`; тернарный `where` по роли — `app/api/body-topup-requests/route.ts`. |
| **POST** | `/api/body-topup-requests` | Создание запроса пополнения | Только **OWNER** (и инвестор в сети OWNER) | `verifyToken`; `decoded.role !== "OWNER"`; проверка `investor.ownerId` — `app/api/body-topup-requests/route.ts`. |
| **PATCH** | `/api/body-topup-requests` | accept / reject / owner_cancel | **owner_cancel** — **OWNER** и владелец инвестора; accept/reject — «инвестор» по полям инвестора или **OWNER** отмена | `verifyToken`; ветки по `action` и `existing.investor` — `app/api/body-topup-requests/route.ts`. |

---

### Chat

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/chat/directory` | Список пользователей для выбора собеседника | Любой валидный JWT; выборка **разная по роли** (из `prisma.user` по `decoded.userId`) | `verifyToken`; затем `me.role` **SUPER_ADMIN** / **OWNER** / **INVESTOR** — `app/api/chat/directory/route.ts`. |
| **GET** | `/api/chat/context` | Непрочитанные, партнёры, defaultPeer | Любой валидный JWT; логика defaultPeer от **роли пользователя из БД** | `verifyToken`; `user.role` из БД — `app/api/chat/context/route.ts`. |
| **GET** | `/api/chat/messages` | История сообщений с `peerId` | Любой валидный JWT **и** разрешённая пара с `peerId` | `verifyToken`; **`canChatWithPeer`** (`lib/chat-peer-permission.ts`) — `app/api/chat/messages/route.ts`. |
| **POST** | `/api/chat/messages` | Отправка сообщения | То же: **`canChatWithPeer`** после проверки существования получателя | `verifyToken`; `lib/chat-peer-permission.ts` — `app/api/chat/messages/route.ts`. |
| **PATCH** | `/api/chat/read` | Пометить входящие от `peerId` прочитанными | Любой валидный JWT **и** разрешённая пара с `peerId` | `verifyToken`; **`canChatWithPeer`** (`lib/chat-peer-permission.ts`); иначе **403** — как в **`/api/chat/messages`** — `app/api/chat/read/route.ts`. |
| **POST** | `/api/chat/admin-test-send` | Тестовая отправка от имени другого пользователя | Только **SUPER_ADMIN** | `verifyToken`; `decoded.role !== "SUPER_ADMIN"` — `app/api/chat/admin-test-send/route.ts`. |

---

### Reports

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/reports/feed` | Лента: история ставок, аудит, body top-ups | **rateHistory** — **OWNER** и **SUPER_ADMIN**; **auditLog** — полный для **SUPER_ADMIN**, по своим инвесторам для **OWNER**; **bodyTopUps** — три ветки по роли; **INVESTOR** — урезанный набор (без глобального аудита/ставок как у админа) | `verifyToken`; `role ===` ветвления — `app/api/reports/feed/route.ts`. |

---

### System

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/system/readiness` | Проверка готовности системы (OWNER, SUPER_ADMIN, базовый инвестор) | Только **SUPER_ADMIN** | `verifyToken`; `decoded.role !== "SUPER_ADMIN"` — `app/api/system/readiness/route.ts`. |
| **GET** | `/api/system/business-rate` | Текущая бизнес-ставка | Любая роль при валидном JWT | `verifyToken` без ролевого 403 — `app/api/system/business-rate/route.ts`. |
| **POST** | `/api/system/business-rate` | Создание записи в истории ставки (upsert логики домена) | **OWNER** или **SUPER_ADMIN** | `verifyToken`; `decoded.role` — `app/api/system/business-rate/route.ts`. |
| **GET** | `/api/system/business-rate/history` | Список записей `RateHistory` | **OWNER** или **SUPER_ADMIN** | `verifyToken`; `decoded.role` — `app/api/system/business-rate/history/route.ts`. |
| **PATCH** | `/api/system/business-rate/history/[id]` | Правка **будущей** записи истории ставки | **OWNER** или **SUPER_ADMIN** | `requireOwnerOrSuperAdmin()` в том же файле — `app/api/system/business-rate/history/[id]/route.ts`. |
| **DELETE** | `/api/system/business-rate/history/[id]` | Удаление **будущей** записи истории ставки | **OWNER** или **SUPER_ADMIN** | `requireOwnerOrSuperAdmin()` — `app/api/system/business-rate/history/[id]/route.ts`. |

---

### Admin (database reset)

| HTTP | Маршрут | Назначение | Роли / доступ | Где проверяются права |
|------|---------|------------|---------------|------------------------|
| **GET** | `/api/admin/database-reset/status` | Флаг настроенного пароля сброса, блокировка попыток | Только **SUPER_ADMIN** | `verifyToken`; `decoded.role !== "SUPER_ADMIN"` — `app/api/admin/database-reset/status/route.ts`. |
| **POST** | `/api/admin/database-reset/password` | Сохранить пароль для процедуры сброса БД | Только **SUPER_ADMIN** | То же — `app/api/admin/database-reset/password/route.ts`. |
| **POST** | `/api/admin/database-reset/execute` | Выполнить полный сброс БД (с фразой подтверждения и паролем) | Только **SUPER_ADMIN** | То же — `app/api/admin/database-reset/execute/route.ts`. |

---

## Число уникальных route-файлов

В каталоге `app/api` — **26 файлов** `route.ts` (один файл может экспортировать несколько методов GET/POST/PATCH/DELETE):

`auth/login`, `auth/logout`, `auth/me`, `auth/account`, `auth/avatar`,  
`dashboard/investors`,  
`investors/route`, `investors/[id]/route`, `investors/[id]/weekly-ledger`, `investors/become-semen-investor`, `investors/private-create-context`,  
`payments`, `body-topup-requests`,  
`chat/directory`, `chat/context`, `chat/messages`, `chat/read`, `chat/admin-test-send`,  
`reports/feed`,  
`system/readiness`, `system/business-rate`, `system/business-rate/history`, `system/business-rate/history/[id]`,  
`admin/database-reset/status`, `admin/database-reset/password`, `admin/database-reset/execute`.

**Итого HTTP-обработчиков:** **35** экспортов `GET` / `POST` / `PATCH` / `DELETE` по всем `route.ts` (см. строки в таблицах выше).

---

## Примечание по сетевому периметру

**`proxy.ts`** (корень проекта, рядом с `app/`): в Next.js **16+** это актуальная конвенция вместо устаревшего `middleware.ts` (оба файла одновременно **запрещены**). Для **`/dashboard/:path*`** проверяется cookie **`token`** через **`verifyToken`** (`lib/auth.ts`); без валидного токена — **редирект на `/login`**. `matcher` ограничен только дашбордом.

Защита **API** по-прежнему в **`verifyToken`** (и прочих проверках) внутри **`app/api/**/route.ts`**. Подробнее — `PROJECT_AUDIT.md`.

---

*Конец файла API_AUDIT.md*
