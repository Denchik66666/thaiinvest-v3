"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn, formatCurrency } from "@/lib/utils";
import { openWeekDayProgress } from "@/lib/open-week-forecast";
import { getPreviousOrCurrentMonday } from "@/lib/weekly";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";
import { Text } from "@/components/ui/Text";
import { UserAvatar } from "@/components/user/UserAvatar";
import { InvestorDashboardMetricTiles } from "@/components/dashboard/InvestorOperationsHistory";

function buildWeekRangeLabel(daySpan: number): string {
  const monday = getPreviousOrCurrentMonday(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const dow = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dow[monday.getDay()]} ${fmt(monday)} — ${dow[sunday.getDay()]} ${fmt(sunday)} · ${daySpan}/7`;
}

export type InvestorPremiumDashboardProps = {
  username: string;
  avatarUrl?: string | null;
  /** Обновить сессию после загрузки фото */
  onAuthRefresh: () => Promise<void>;
  glassCard: CSSProperties;
  hasPositions: boolean;
  payoutDue: number;
  canWithdraw: boolean;
  onWithdraw: () => void;
  statsBody: number;
  statsAccrued: number;
  statsPaid: number;
  /** Одна строка или null */
  forecastLine: string | null;
  loadingPositions: boolean;
  positions: { id: number; name: string }[];
  paymentStatusSlot: React.ReactNode;
  historySlot: React.ReactNode;
};

export function InvestorPremiumDashboard({
  username,
  avatarUrl,
  onAuthRefresh,
  glassCard,
  hasPositions,
  payoutDue,
  canWithdraw,
  onWithdraw,
  statsBody,
  statsAccrued,
  statsPaid,
  forecastLine,
  loadingPositions,
  positions,
  paymentStatusSlot,
  historySlot,
}: InvestorPremiumDashboardProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const wp = openWeekDayProgress();
  const weekDates = buildWeekDayNumbers(wp.weekStart);
  const [barPct, setBarPct] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setBarPct(wp.frac * 100), 80);
    return () => window.clearTimeout(t);
  }, [wp.frac]);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Нужен JPG или PNG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Не больше 2 МБ");
      return;
    }
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      await apiClient.postForm<{ success?: boolean; avatarUrl?: string }>("/api/auth/avatar", fd);
      await onAuthRefresh();
      toast.success("Фото обновлено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setUploadBusy(false);
    }
  }

  const weekLabelRight = buildWeekRangeLabel(wp.daySpan);

  return (
    <div className="thai-investor-root flex flex-col gap-5">
      <div className="thai-investor-block flex flex-col items-center px-1 pt-1">
        <Text className="text-center text-lg font-semibold tracking-tight text-foreground">{username}</Text>
        <div className="h-5 shrink-0" aria-hidden />
        <div
          className={cn(
            "thai-investor-avatar-ring relative rounded-full p-[3px]",
            "transition-[box-shadow] duration-500"
          )}
          data-has-positions={hasPositions ? "true" : "false"}
        >
          <UserAvatar name={username} src={avatarUrl} size={72} className="!ring-0 bg-transparent [&_img]:object-cover" />
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={onPickAvatar} />
        <button
          type="button"
          disabled={uploadBusy}
          onClick={() => fileRef.current?.click()}
          className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
        >
          {uploadBusy ? "Загрузка…" : "Загрузить фото"}
        </button>
        <Text className="mt-1 text-center text-[10px] text-muted-foreground">JPG или PNG, до 2 МБ</Text>
      </div>

      <div className="thai-investor-block px-0.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {weekDates.map((d, i) => (
                <span key={i} className={cn("min-w-0 flex-1 text-center", i === wp.daySpan - 1 && "text-foreground")}>
                  {d}
                </span>
              ))}
            </div>
            <div className="thai-investor-week-track mt-1.5">
              <div className="thai-investor-week-fill" style={{ width: `${barPct}%` }} />
            </div>
          </div>
          <Text className="shrink-0 max-w-[46%] text-right text-[10px] leading-snug tabular-nums text-muted-foreground">
            {weekLabelRight}
          </Text>
        </div>
      </div>

      <div className="thai-investor-block thai-investor-payout-hero px-4 py-4">
        <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Доступно к выводу</Text>
        <div
          className="mt-1 tabular-nums tracking-tight text-[var(--thai-color-due)]"
          style={{ fontSize: 36, fontWeight: 300, lineHeight: 1.15 }}
        >
          {formatCurrency(payoutDue)}
        </div>
        <button type="button" className="thai-investor-glass-btn" disabled={!canWithdraw} onClick={onWithdraw}>
          Вывести
        </button>
      </div>

      <section className="thai-investor-block thai-glass space-y-3 rounded-2xl p-4" style={glassCard}>
        <InvestorDashboardMetricTiles body={statsBody} accrued={statsAccrued} paid={statsPaid} />
        {forecastLine ? (
          <Text className="text-[12px] leading-snug text-muted-foreground">{forecastLine}</Text>
        ) : null}
      </section>

      {paymentStatusSlot ? <div className="thai-investor-block">{paymentStatusSlot}</div> : null}

      <section className="thai-investor-block thai-glass rounded-2xl p-4" style={glassCard}>
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Мои позиции</Text>
        {loadingPositions ? (
          <div className="mt-3 space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <Text className="mt-3 block text-center text-sm text-muted-foreground">Нет позиций</Text>
        ) : (
          <div className="mt-3 divide-y divide-border/25">
            {positions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/dashboard/investors/${p.id}`)}
                className="thai-row-interactive flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0"
              >
                <span className="min-w-0 truncate font-medium tracking-tight text-foreground">{p.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="thai-investor-block">{historySlot}</div>
    </div>
  );
}

function buildWeekDayNumbers(monday: Date): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d.getDate());
  }
  return out;
}
