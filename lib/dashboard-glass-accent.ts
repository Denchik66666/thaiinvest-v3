/**
 * Единая «стеклянная» поверхность вместо сплошного primary на дашборде владельца / управлении / профиле.
 * Радиус задаётся на месте (rounded-lg / rounded-full / rounded-xl).
 */
export const glassAccentSurface =
  "border border-primary/30 bg-white/[0.07] text-foreground backdrop-blur-md transition-all duration-200 " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] hover:bg-primary/[0.07] hover:border-primary/40 hover:brightness-100 " +
  "dark:border-primary/22 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:bg-primary/[0.1]";

/** Модалки рабочего стола (`InvestDeskModalShell`): без «клиники» #fff — глубокий сапфир на светлом, шампань-лил на тёмном */
export const investDeskModalTitleClass =
  "bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-950 bg-clip-text text-transparent font-semibold " +
  "dark:from-violet-200/85 dark:via-stone-200/58 dark:to-fuchsia-200/72";

/** Ставки, суммы, даты в тексте модалки */
export const investDeskModalFigureClass =
  "bg-gradient-to-r from-amber-900 via-violet-900 to-purple-900 bg-clip-text text-transparent font-semibold tabular-nums " +
  "dark:from-amber-200/74 dark:via-violet-200/70 dark:to-fuchsia-300/66";

/** Короткие акценты в сноске / summary */
export const investDeskModalEmphasisClass =
  "bg-gradient-to-r from-violet-900 to-fuchsia-900 bg-clip-text text-transparent font-semibold " +
  "dark:from-violet-200/80 dark:to-fuchsia-200/70";

/** Подписи кнопок внизу модалки */
export const investDeskModalCtaLabelClass =
  "bg-gradient-to-r from-violet-950 via-purple-950 to-fuchsia-950 bg-clip-text text-transparent font-semibold " +
  "dark:from-violet-100/70 dark:via-amber-100/55 dark:to-fuchsia-100/65";
