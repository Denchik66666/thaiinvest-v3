# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).  
Версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Планируется

- Довести `npm run lint` до нуля ошибок (React Compiler / react-hooks).
- Продовый прогон `recalculateInvestorAccruedFromRateHistory` после деплоя миграций.

---

## [3.1.1] — 2026-05

**Текущая версия в `package.json`.** Порядок в репозитории без изменения продуктовой поверхности.

### Changed

- Все скрипты `debug-*` перенесены в **`scripts/debug/`**; обновлены относительные импорты к `lib/prisma`; добавлен **`scripts/debug/README.md`** с инструкцией запуска.

---

## [3.1.0] — 2026-05

Фокус: финансы, управление, деплой-гигиена, прогнозы и `accrued`.

### Added

- Прогноз «Ожидается» на дашборде: целые баты, отдельная логика для INVESTOR и сумма по сети для OWNER.
- Спека e2e и скриншоты сравнения для accrued/прогноза (`tests/e2e/accrued-forecast-roles-verify.spec.ts`).
- `.cursorignore`, исключения watcher/search в `.vscode/settings.json`, правило остановки dev без UI.

### Changed

- **`accrued`:** только закрытые недели, округление до целого бата; выплаты текущей недели уменьшают остаток.
- Недельный леджер: последняя строка `accruedEnd` согласована с округлением БД.
- Прогноз недели: сумма по позициям с `Math.round` на позицию (`lib/open-week-forecast.ts`).

### Removed

- Неиспользуемые зависимости: `jose`, `cookie`, `@types/bcryptjs`, `ts-node`.
- Мёртвые артефакты: `CreateInvestorModal`, `WeekCycleStrip`, `FormGroup`, `GlobalLiveNotifier`, `animations.css` (не подключался), `lib/investor-payment-access.ts`, `create-test-investors.js`, gross-сумматоры открытой недели в прогнозе.

### Fixed

- Owner dashboard: строка «Ожидается» и стили суммы (`.thai-owner-forecast-strip__amount`).

---

## [3.0.0] — 2026-04 … 2026-05 (база v3)

Первая стабильная линия **ThaiInvest v3**: Next.js App Router, Prisma/PostgreSQL, роли OWNER / INVESTOR / SUPER_ADMIN.

### Added

- Кабинеты: `/dashboard`, `/dashboard/finance`, `/dashboard/manage`, `/dashboard/investors`, `/dashboard/profile`, чат.
- Раздел «Финансы»: аккордеон позиций, фильтры, модалка операций, очереди OWNER, коррекции платежей.
- Премиум-герой OWNER на главной, выравнивание с инвесторским UX.
- Ставка бизнеса: API, история, пересчёт `accrued` в очереди после изменений.
- Правила Cursor: защита эталона дашборда инвестора, тема/нижняя навигация.

### Changed

- Тема: переключение только с `/login` и профиля; нижний бар без дубля «Профиль» для инвестора.
- SUPER_ADMIN: главная и лента истории в контексте привязанных общих позиций.

### Security

- JWT в httpOnly cookie, секреты вне репозитория; `.vercelignore` для локальных env.

---

## Как читать историю в git

Детальный список коммитов:

```bash
git log --oneline --decorate -50
```

Привязка **файл → версия** в этом CHANGELOG — по крупным темам; точечные правки смотрите в `git log` и diff по тегам/коммитам (после появления git-тегов на релизах).
