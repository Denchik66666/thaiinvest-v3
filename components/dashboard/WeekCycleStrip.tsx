"use client";

import { cn } from "@/lib/utils";

const SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function WeekCycleStrip({ payoutLabel }: { payoutLabel: string }) {
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
    <div className="w-full">
      <div className="mb-2 flex justify-between gap-0.5 md:mb-2.5">
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 transition-colors",
              d.isToday && "text-primary"
            )}
          >
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider md:text-[11px]",
                d.isToday ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {d.label}
            </span>
            <span
              className={cn(
                "tabular-nums text-[11px] md:text-xs",
                d.isToday ? "font-bold text-foreground" : "text-muted-foreground"
              )}
            >
              {String(d.dayNum).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>

      <div className="relative px-0.5">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted/50 dark:bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500/70 via-primary to-cyan-500/60 transition-[width] duration-500 ease-out dark:from-violet-400/50 dark:via-primary dark:to-cyan-400/45"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {todayIndex >= 0 ? (
          <div
            className="pointer-events-none absolute -top-1 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.65)] ring-1 ring-primary/30"
            style={{ left: `${markerLeft}%` }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Недельный цикл (пн–вс)</span>
        <span className="font-medium text-foreground/85">Следующая выплата · {payoutLabel}</span>
      </div>
    </div>
  );
}
