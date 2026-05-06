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
