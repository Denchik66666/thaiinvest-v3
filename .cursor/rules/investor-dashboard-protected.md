ПРАВИЛО: Никогда не изменять дашборд инвестора без явного запроса пользователя.

Запрещено трогать файлы:
- app/dashboard/page.tsx (InvestorPremiumDashboard)
- components/dashboard/InvestorPremiumDashboard.tsx
- components/dashboard/HistoryPeriodPopover.tsx
- components/dashboard/DashboardOperationsHistory.tsx
- components/user/UserAvatar.tsx
- styles/thai-design-system.css (классы `.thai-investor-*` для экрана инвестора; общие токены `.thai-dashboard-*` для истории и шапки)
- lib/open-week-forecast.ts

При любой задаче, затрагивающей эти файлы — СПРОСИТЬ у пользователя разрешение.

