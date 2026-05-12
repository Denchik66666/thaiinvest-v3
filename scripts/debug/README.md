# Локальные отладочные скрипты

**Не используются в CI и не входят в production bundle.** Запуск только вручную с машины разработчика, при необходимости — с поднятым `npm run dev` и настроенным `.env` / `.env.local`.

## Запуск

Из корня репозитория:

```bash
npx tsx scripts/debug/debug-list-users.ts
npx tsx scripts/debug/debug-investor-by-name.ts ФрагментИмени
```

Для `.mjs` (если скрипт не требует Prisma из TS):

```bash
node scripts/debug/debug-db-reset.mjs
```

## Состав

| Файл | Назначение (кратко) |
|------|---------------------|
| `debug-list-users.ts` | Список пользователей в БД |
| `debug-users.ts` / `debug-users.mjs` | Обёртка: mjs перенаправляет на `.ts` |
| `debug-investor-by-name.ts` | Поиск инвестора по имени, срезы полей |
| `debug-verify-passwords.ts` | Проверка паролей к ожидаемым (локально) |
| `debug-superadmin-password.ts` / `.mjs` | Подбор/проверка хэшей супер-админа |
| `debug-db-reset.mjs` / `debug-db-reset-superadmin.ts` | Сценарии сброса через API (осторожно) |
| `debug-login-probe.mjs` | Перебор логина к dev-серверу |
| `recalculate-den-investor-2.ts` | Пересчёт **`accrued`** / **`paid`** и дат канона для инвестора id=2 (Den); опирается на **`lib/investor-accrued-ledger.ts`** |
| `den-investor-2-full-audit.ts` | Полный JSON-срез по Den + леджер с учётом пополнений |
| `diagnose-investor-2-operations.ts` | Сырые строки БД по позиции id=2 для сверки с «Финансы» |

Удалены как дублирующие устаревшую математику: `scripts/explain-sega-accrued.ts`, `scripts/debug/inspect-den-body-topup-100k.ts` — единый расчёт см. **`lib/investor-accrued-ledger.ts`** / **`buildWeeklyLedgerRows`**.

Перед изменением схемы Prisma или API — перепроверьте, что скрипт ещё соответствует коду.
