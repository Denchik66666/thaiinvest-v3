/**
 * Верхняя полоска на экранах дашборда: без заливки и рамки — фон страницы.
 * Дубли с нижней навигацией см. `MobileBottomNav` (инвестор: Главная + Финансы;
 * OWNER/SUPER_ADMIN: Главная + Финансы + Управление; реестр без отдельной вкладки — активирует «Управление»; профиль — из шапки).
 */
export const DASHBOARD_STICKY_BAR_CLASS =
  [
    // sticky/glass
    "thai-dashboard-sticky-bar sticky top-0 z-30 mb-1 flex min-h-[3.5rem] items-center justify-between gap-2 border-0 px-2 py-2",
    // mobile: edge-to-edge (без «вырезанного окна» по бокам)
    "mx-0 rounded-none sm:-mx-1 sm:rounded-xl",
    // фон панели: лёгкое стекло вместо прозрачности
    "bg-gradient-to-b from-background/40 via-background/25 to-background/[0.08]",
  ].join(" ");
