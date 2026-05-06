/**
 * Единая «стеклянная» поверхность вместо сплошного primary на дашборде владельца / управлении / профиле.
 * Радиус задаётся на месте (rounded-lg / rounded-full / rounded-xl).
 */
export const glassAccentSurface =
  "border border-primary/30 bg-white/[0.07] text-foreground backdrop-blur-md transition-all duration-200 " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] hover:bg-primary/[0.07] hover:border-primary/40 hover:brightness-100 " +
  "dark:border-primary/22 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:bg-primary/[0.1]";
