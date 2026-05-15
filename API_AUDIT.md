# API_AUDIT — HTTP-роуты ThaiInvest

**Дата:** 2026-05-09 (сверка с деревом `app/api/**/route.ts`)  
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

Путь к файлу: `app/api/.../route.ts`.

### Auth

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **POST** | `/api/auth/login` | Вход, JWT в cookie | Публично | `app/api/auth/login/route.ts` |
| **POST** | `/api/auth/logout` | Сброс cookie | Публично | `app/api/auth/logout/route.ts` |
| **GET** | `/api/auth/me` | Текущий пользователь | Любая роль при валидном JWT | `app/api/auth/me/route.ts` |
| **PATCH** | `/api/auth/account` | Смена username / пароля | Своя учётка | `app/api/auth/account/route.ts` |
| **POST** | `/api/auth/avatar` | Загрузка аватара (JPEG/PNG, до 2 МБ) → **Vercel Blob**, обновление **`User.avatarUrl`**; нужен **`BLOB_READ_WRITE_TOKEN`** (**503** без токена) | Любая роль при валидном JWT | `app/api/auth/avatar/route.ts` |

### Dashboard

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/dashboard/investors` | Свод для главной дашборда | **OWNER** — свои общие; **INVESTOR** — своя позиция; **SUPER_ADMIN** — полный список | `app/api/dashboard/investors/route.ts` |

### Investors

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/investors` | Список (`?network=`, `?lean=1`) | **OWNER** / **SUPER_ADMIN** / **INVESTOR** (см. `where` в коде) | `app/api/investors/route.ts` |
| **POST** | `/api/investors` | Создание инвестора | **INVESTOR** — **403**; **OWNER**, **SUPER_ADMIN** | `app/api/investors/route.ts` |
| **GET** | `/api/investors/[id]` | Карточка инвестора | **OWNER** / **INVESTOR** (привязка) / **SUPER_ADMIN** | `app/api/investors/[id]/route.ts` |
| **DELETE** | `/api/investors/[id]` | Удаление позиции | Только **SUPER_ADMIN** | то же |
| **PATCH** | `/api/investors/[id]` | Выдача / сброс пароля инвестора | **OWNER** или **SUPER_ADMIN** | то же |
| **PUT** | `/api/investors/[id]` | Редактирование полей позиции | **OWNER** или **SUPER_ADMIN** | то же |
| **GET** | `/api/investors/[id]/weekly-ledger` | Недельная бухгалтерия | **OWNER** / **INVESTOR** / **SUPER_ADMIN** (с проверками владения) | `app/api/investors/[id]/weekly-ledger/route.ts` |
| **GET** | `/api/investors/operations-history` | Лента операций (главная / встраиваемая история) | **INVESTOR**, **OWNER**, **SUPER_ADMIN** (ветвления по сети и `investorId`; иначе **403**) | `app/api/investors/operations-history/route.ts` |
| **GET** | `/api/investors/operations-summary` | Свод по операциям за период | Как у **operations-history** (те же три роли, **403** для прочих) | `app/api/investors/operations-summary/route.ts` |
| **GET** | `/api/investors/private-create-context` | Лимиты создания в личной сети | Только **SUPER_ADMIN** | `app/api/investors/private-create-context/route.ts` |
| **POST** | `/api/investors/become-semen-investor` | Спец-сценарий «семя» | Только **SUPER_ADMIN** | `app/api/investors/become-semen-investor/route.ts` |

### Payments

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **POST** | `/api/payments` | Действия по заявкам (`action` в теле) | Матрица по `action` и роли (см. код) | `app/api/payments/route.ts` |
| **GET** | `/api/payments/context` | Контекст заявки, таймлайн, лимиты одобрения | **OWNER** (свои), **INVESTOR** (своя позиция), **SUPER_ADMIN** | `app/api/payments/context/route.ts` |
| **DELETE** | `/api/payments/[paymentId]` | Удаление записи заявки (операционно) | Только **SUPER_ADMIN** | `app/api/payments/[paymentId]/route.ts` |

### Body top-up

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/body-topup-requests` | Список запросов | **OWNER** / **SUPER_ADMIN** / связанные **INVESTOR** | `app/api/body-topup-requests/route.ts` |
| **POST** | `/api/body-topup-requests` | Создание запроса | **OWNER** (и позиция в его сети) | то же |
| **PATCH** | `/api/body-topup-requests` | accept / reject / owner_cancel | По веткам `action` | то же |
| **GET** | `/api/body-topup-requests/context` | Контекст и таймлайн по `requestId` | **OWNER** / **INVESTOR** / **SUPER_ADMIN** (проверки владения в коде) | `app/api/body-topup-requests/context/route.ts` |
| **PATCH** | `/api/body-topup-requests/[requestId]` | Обновление заявки | По правилам файла | `app/api/body-topup-requests/[requestId]/route.ts` |
| **DELETE** | `/api/body-topup-requests/[requestId]` | Удаление (если разрешено) | По правилам файла | то же |

### Payment correction proposals

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/payment-correction-proposals` | Входящие/исходящие заявки на правку | Любой JWT; **outgoing** заполняется только для **SUPER_ADMIN** | `app/api/payment-correction-proposals/route.ts` |
| **POST** | `/api/payment-correction-proposals` | Создать запрос правки | Только **SUPER_ADMIN** | то же |
| **PATCH** | `/api/payment-correction-proposals/[id]` | Решение по заявке | Логика в файле (assignee / роли) | `app/api/payment-correction-proposals/[id]/route.ts` |

### Chat

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/chat/directory` | Список для выбора собеседника | Валидный JWT | `app/api/chat/directory/route.ts` |
| **GET** | `/api/chat/context` | Непрочитанные, партнёры | Валидный JWT | `app/api/chat/context/route.ts` |
| **GET** | `/api/chat/messages` | История с `peerId` | JWT + **`canChatWithPeer`** | `app/api/chat/messages/route.ts` |
| **POST** | `/api/chat/messages` | Отправка | JWT + **`canChatWithPeer`** | то же |
| **PATCH** | `/api/chat/read` | Прочитано | JWT + **`canChatWithPeer`** | `app/api/chat/read/route.ts` |
| **POST** | `/api/chat/admin-test-send` | Тестовая отправка | Только **SUPER_ADMIN** | `app/api/chat/admin-test-send/route.ts` |

### Reports

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/reports/feed` | Лента отчётов | Зависит от роли (см. код) | `app/api/reports/feed/route.ts` |

### System

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/system/readiness` | Чеклист готовности учёта | Только **SUPER_ADMIN** | `app/api/system/readiness/route.ts` |
| **GET** | `/api/system/business-rate` | Текущая бизнес-ставка | Любой JWT | `app/api/system/business-rate/route.ts` |
| **POST** | `/api/system/business-rate` | Запись в историю ставки | **OWNER** или **SUPER_ADMIN** | то же |
| **GET** | `/api/system/business-rate/history` | Список `RateHistory` | **OWNER** или **SUPER_ADMIN** | `app/api/system/business-rate/history/route.ts` |
| **PATCH** | `/api/system/business-rate/history/[id]` | Правка будущей записи | **OWNER** или **SUPER_ADMIN** | `app/api/system/business-rate/history/[id]/route.ts` |
| **DELETE** | `/api/system/business-rate/history/[id]` | Удаление будущей записи | **OWNER** или **SUPER_ADMIN** | то же |

### Admin (database reset)

| HTTP | Маршрут | Назначение | Роли / доступ | Файл |
|------|---------|------------|---------------|------|
| **GET** | `/api/admin/database-reset/status` | Статус пароля сброса | **SUPER_ADMIN** | `app/api/admin/database-reset/status/route.ts` |
| **POST** | `/api/admin/database-reset/password` | Сохранить пароль | **SUPER_ADMIN** | `app/api/admin/database-reset/password/route.ts` |
| **POST** | `/api/admin/database-reset/execute` | Выполнить сброс БД | **SUPER_ADMIN** | `app/api/admin/database-reset/execute/route.ts` |

---

## Число файлов и экспортов

- **Уникальных файлов** `app/api/**/route.ts`: **33** (подсчёт по дереву на диске).
- **Экспортов** `GET` / `POST` / `PUT` / `PATCH` / `DELETE` суммарно: **45** (по одному на каждый объявленный handler в этих файлах).

Список путей (без дубликатов):

`admin/database-reset/execute`, `admin/database-reset/password`, `admin/database-reset/status`,  
`auth/account`, `auth/avatar`, `auth/login`, `auth/logout`, `auth/me`,  
`body-topup-requests`, `body-topup-requests/context`, `body-topup-requests/[requestId]`,  
`chat/admin-test-send`, `chat/context`, `chat/directory`, `chat/messages`, `chat/read`,  
`dashboard/investors`,  
`investors`, `investors/[id]`, `investors/[id]/weekly-ledger`, `investors/become-semen-investor`, `investors/operations-history`, `investors/operations-summary`, `investors/private-create-context`,  
`payment-correction-proposals`, `payment-correction-proposals/[id]`,  
`payments`, `payments/context`, `payments/[paymentId]`,  
`reports/feed`,  
`system/business-rate`, `system/business-rate/history`, `system/business-rate/history/[id]`, `system/readiness`.

---

## Сетевой периметр

**`proxy.ts`** (корень): для **`/dashboard/:path*`** проверяется cookie **`token`**; без валидного JWT — редирект на **`/login`**. Файла **`middleware.ts`** в проекте нет (конфликт с **`proxy.ts`** в Next 16).

Защита **API** — в **`verifyToken`** и проверках внутри каждого `route.ts`. Подробнее — **`PROJECT_AUDIT.md`**.

---

*Конец файла API_AUDIT.md*
