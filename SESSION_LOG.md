# Session log

Краткие записи о зафиксированных договорённостях и заметных изменениях контекста (для агента и людей).

## 2026-05-09

- В **`.cursor/rules/project-context.md`** зафиксировано правило **OWNERSHIP** (§2.1): при создании инвестора в общей сети `ownerId` = первый активный OWNER; в личной сети SUPER_ADMIN — `ownerId` = SUPER_ADMIN; реализация в `app/api/investors/route.ts` (`resolveOwnerIdForNewInvestor`); менять без явного разрешения нельзя.

- **Manage / этап 3:** в **`components/manage/BusinessRateControlCenter.tsx`** доведён VIP-компакт (одна строка KPI, плотнее журнал и «Календарь · план»), акцентные цвета на **`var(--thai-color-*)`**; эталон в **`docs/UI_ETALONS_REGISTRY.md`** (п. 3 плана Manage) обновлён.
