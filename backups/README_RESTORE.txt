Восстановление из git bundle (*.bundle в .gitignore — храните копию отдельно от push).

================================================================================
Актуальный снимок (зафиксировано 2026-05-06, вечер)
================================================================================
Файл (сгенерировать локально, см. ниже):
  backups/thaiinvest-restore-2026-05-06-super-admin-dashboard.bundle
Тег:   snapshot/super-admin-dashboard-2026-05-06  → главная SUPER_ADMIN + стекло owner/manage + профиль

Что вошло в этот уровень (ветка инвестора на главной не менялась — эталон):
  • SUPER_ADMIN /dashboard: единый стеклянный блок «Панель супер-админа», неделя WeekCycleStrip, метрики,
    быстрые кнопки Управление / Реестр / Финансы, лимит личной сети, очередь заявок, список инвесторов
    с фильтром в стиле профиля (glassAccentSurface вместо thai-segmented).
  • Общий модуль lib/dashboard-glass-accent.ts — кнопки без сплошного primary на управлении, ставке,
    модалке создания инвестора, блоках владельца (Запросы и подтверждения, сеть).
  • Профиль: те же классы стекла через импорт glassAccentSurface.

Создать bundle после коммита с этими изменения:
  git bundle create backups/thaiinvest-restore-2026-05-06-super-admin-dashboard.bundle HEAD

Проверка целостности:
  git bundle verify backups/thaiinvest-restore-2026-05-06-super-admin-dashboard.bundle

Клон из bundle:
  git clone backups/thaiinvest-restore-2026-05-06-super-admin-dashboard.bundle restored-thaiinvest
  cd restored-thaiinvest && npm ci && npx prisma generate

Перейти на тег:
  git checkout snapshot/super-admin-dashboard-2026-05-06

Поставить тег на текущий HEAD (один раз, после коммита):
  git tag -a snapshot/super-admin-dashboard-2026-05-06 -m "SUPER_ADMIN главная + glass owner/manage"

================================================================================
Предыдущий снимок — тема и навигация (2026-05-06)
================================================================================
Файл:  backups/thaiinvest-restore-2026-05-06-dashboard-nav-theme.bundle
Тег:   snapshot/dashboard-theme-nav-2026-05-06

Что улучшено и зафиксировано в этом снимке:
  • Финансы: шапка без декоративной полосы thai-hero-accent над стрелкой; более выраженное
    «стекло» (blur, прозрачность, блик по верху).
  • Тема приложения: переключатель только на /login и в Профиль → Настройки; убран из
    верхней панели главного экрана и из шапок Управление / Инвесторы / карточка инвестора / Чат.
  • Инвестор — нижний бар: только «Главная» и «Финансы»; вкладка «Профиль» убрана (профиль
    из аватара и ника в шапке).
  • Правило для агента: .cursor/rules/dashboard-theme-nav.mdc (alwaysApply).
  • E2E: tests/e2e/mobile-bottom-nav-roles.spec.ts под новый состав вкладок инвестора.

Проверка целостности:
  git bundle verify backups/thaiinvest-restore-2026-05-06-dashboard-nav-theme.bundle

Клон из bundle в новую папку (после клона будет на том же коммите, что HEAD в bundle):
  git clone backups/thaiinvest-restore-2026-05-06-dashboard-nav-theme.bundle restored-thaiinvest
  cd restored-thaiinvest && npm ci && npx prisma generate

Перейти на помеченный тег после клона (опционально):
  git checkout snapshot/dashboard-theme-nav-2026-05-06

================================================================================
Ранее (если у вас лежит старый файл bundle)
================================================================================
Имя могло быть: thaiinvest-restore-2026-05-06.bundle — те же команды verify / clone,
подставив имя файла.

Подтянуть bundle в существующий репозиторий или bare remote — см. git bundle --help.

================================================================================
Напоминалка после работы с производительностью / БД (2026-05-08)
================================================================================
Что сделано в коде (не забыть при восстановлении из bundle):
  • Один pg.Pool в lib/prisma.ts (singleton), не передавать строку напрямую в PrismaPg.
  • Индексы для дашборда: npm run db:apply-dashboard-indexes
    (два SQL в prisma/migrations/… ; если prisma migrate deploy даёт P1017 — только этот скрипт).
  • Кэш строк RateHistory для ленты/сводок: lib/rate-history-rows-cache.ts;
    сброс invalidateRateHistoryRowsCache() при создании/правке/удалении записи ставки
    (lib/business-rate.ts, app/api/system/business-rate/history/[id]/route.ts).
  • После правок prisma.ts перезапустить npm run dev.
  • Лимит соединений Supabase: один dev-сервер, без лишних клиентов к той же БД;
    при EMAXCONN — пауза/рестарт проекта в Supabase; опционально DATABASE_POOL_MAX в .env.
  • Цель «~1 с» на ленту: без предрасчёта в БД на «всю сеть + все платежи + недели в JS» не гарантируется.
    Реально быстро: GET …/operations-history?investorId=… (владелец с одной позицией — авто в FinanceHubInner),
    индексы, кэш RateHistory, не дергать лишние клиенты к БД. Дальше — пагинация / материализованная лента / фоновый пересчёт.
  • Шаги по скорости (фиксировать по мере внедрения):
    1) Финансы: отложенный GET ленты при свёрнутом «Журнале» + карточки всегда видны (DashboardOperationsHistory + FinanceHubInner embeddedCollapsible).
    2) Индексы + npm run db:apply-dashboard-indexes при недоступном migrate deploy (в т.ч. BodyTopUpRequest investorId+createdAt).
    3) GET operations-history: узкий select по Payment / BodyTopUpRequest (меньше полей из БД).
    4) Далее по необходимости: cursor/limit на API ленты, таблица событий, фоновый пересчёт недель.

Бэкап кода после важного этапа (как выше по файлу):
  git bundle create backups/thaiinvest-restore-YYYY-MM-DD-…bundle HEAD
  git tag -a snapshot/… -m "…"

================================================================================
Полный бэкап 2026-05-08 (код + запись для памяти)
================================================================================
Сгенерировано командой: npm run backup:full
(или BACKUP_SLUG=ярлык npm run backup:full — см. scripts/full-backup.mjs)

Файлы (локально, папка backups/; *.bundle в .gitignore — копируйте на диск / облако):
  • thaiinvest-restore-2026-05-08-full-perf-api.bundle — git bundle --all (все ветки/теги на момент снимка)
  • MEMORY_BACKUP_2026-05-08-full-perf-api.txt — краткая «памятка», что вошло и как восстановить

Проверка целостности:
  git bundle verify backups/thaiinvest-restore-2026-05-08-full-perf-api.bundle

Клон из bundle:
  git clone backups/thaiinvest-restore-2026-05-08-full-perf-api.bundle restored-thaiinvest
  cd restored-thaiinvest && npm ci && npx prisma generate

Дамп PostgreSQL на этой машине не создан (нет pg_dump в PATH). Чтобы добавить дамп:
  — установить PostgreSQL client (pg_dump), снова npm run backup:full
  — либо задать PG_DUMP_PATH=…\pg_dump.exe
  Файл дампа будет: backups/db-<slug>.dump (формат -Fc, восстановление через pg_restore)

Дополнительно к напоминалке выше (производительность):
  • Контракт API ленты/сводки: types/operations-finance-api.ts (meta при SUPER_ADMIN + network=all).
  • E2e контракт: tests/e2e/api-operations-history-roles.spec.ts

