"use client";

import { cn } from "@/lib/utils";

const SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export type WeekCycleStripProps = {
  payoutLabel: string;
  className?: string;
  /** Подсказка при наведении (например, про цикл и заявки). */
  cycleHint?: string;
};

/**
 * Недельная шкала «премиум»: числа дней, капсула «сегодня», прогресс недели, подпись выплаты.
 */
export function WeekCycleStrip({ payoutLabel, className, cycleHint }: WeekCycleStripProps) {
  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return { label: SHORT[i], dayNum: d.getDate(), isToday };
  });

  const todayIndex = days.findIndex((d) => d.isToday);
  const progress = todayIndex >= 0 ? (todayIndex + 1) / 7 : 3.5 / 7;
  const markerLeft = todayIndex >= 0 ? ((todayIndex + 0.5) / 7) * 100 : 50;

  return (
    <div className={cn("w-full", className)} title={cycleHint}>
      <div className="flex gap-1 sm:gap-1.5">
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center rounded-xl border px-0.5 py-1.5 transition-all duration-300 sm:py-2",
              d.isToday
                ? "border-primary/50 bg-gradient-to-b from-primary/[0.22] via-primary/[0.08] to-transparent shadow-[0_0_22px_-6px_hsl(var(--primary)/0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "border-border/25 bg-gradient-to-b from-muted/30 to-transparent hover:border-border/50 hover:from-muted/45"
            )}
          >
            <span
              className={cn(
                "text-[9px] font-bold uppercase tracking-[0.14em] sm:text-[10px]",
                d.isToday ? "text-primary" : "text-muted-foreground"
              )}
            >
              {d.label}
            </span>
            <span
              className={cn(
                "mt-0.5 tabular-nums text-[13px] font-bold leading-none sm:text-[15px]",
                d.isToday ? "text-foreground" : "text-muted-foreground/85"
              )}
            >
              {String(d.dayNum).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>

      <div className="relative mt-2.5 px-0.5">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-gradient-to-r from-muted/40 via-muted/25 to-muted/40 dark:from-white/[0.06] dark:via-white/[0.12] dark:to-white/[0.06]">
          <div
            className="thai-week-progress-fill relative h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {todayIndex >= 0 ? (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2"
            style={{
              left: `${markerLeft}%`,
              width: "10px",
              height: "10px",
              borderRadius: "9999px",
              background: "linear-gradient(145deg, #c4b5fd 0%, #7c3aed 55%, #5b21b6 100%)",
              boxShadow:
                "0 0 0 2px color-mix(in srgb, hsl(var(--background)) 65%, transparent), 0 0 16px 2px rgba(167, 139, 250, 0.55)",
              animation: "thai-pulse-dot 2.4s ease-in-out infinite",
            }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Недельный цикл · пн–вс
        </span>
        <span
          className="text-[11px] font-semibold leading-tight sm:text-right"
          style={{
            color: "#a78bfa",
            textShadow: "0 0 18px color-mix(in srgb, #a78bfa 35%, transparent)",
          }}
        >
          Следующая выплата · {payoutLabel}
        </span>
      </div>
    </div>
  );
}
