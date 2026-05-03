"use client";

import { formatCurrency, cn } from "@/lib/utils";

/** Строка списка — совпадает с данными GET /api/investors */
export type InvestorTableRow = {
  id: number;
  name: string;
  handle: string | null;
  phone: string | null;
  body: number;
  rate: number;
  accrued: number;
  paid: number;
  due: number;
  status: string;
  isPrivate: boolean;
  owner: { username: string; role: string };
  investorUser?: { id: number; username: string } | null;
  payments: Array<{ status: string }>;
  entryDate: string;
  activationDate: string;
};

function shortDate(iso: string) {
  const raw = iso.split("T")[0] ?? iso;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${String(y).slice(-2)}`;
}

function hasPendingPayment(inv: InvestorTableRow) {
  return inv.payments?.some((p) => p.status === "pending") ?? false;
}

function rowNeedsAttention(inv: InvestorTableRow) {
  if (inv.status === "awaiting_activation") return true;
  if (inv.status === "paused" && inv.accrued > 0.005) return true;
  if (hasPendingPayment(inv)) return true;
  return false;
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:
      "bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:border-emerald-500/35",
    awaiting_activation:
      "bg-amber-500/12 text-amber-800 border-amber-500/25 dark:text-amber-300 dark:border-amber-500/35",
    paused: "bg-sky-500/12 text-sky-800 border-sky-500/25 dark:text-sky-300 dark:border-sky-500/35",
    closed: "bg-red-500/10 text-red-700 border-red-500/25 dark:text-red-300 dark:border-red-500/35",
  };

  const labels: Record<string, string> = {
    active: "Активен",
    awaiting_activation: "Ожидает",
    paused: "Пауза",
    closed: "Закрыт",
  };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-tight",
        styles[status] ?? "border-border/60 bg-muted/50 text-muted-foreground"
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

function NetworkBadge({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <span className="inline-flex rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
      Личн.
    </span>
  ) : (
    <span className="inline-flex rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      Общ.
    </span>
  );
}

function RowDots({ inv }: { inv: InvestorTableRow }) {
  const dots: { key: string; title: string; className: string }[] = [];
  if (hasPendingPayment(inv)) {
    dots.push({
      key: "pay",
      title: "Есть заявка на выплату",
      className: "bg-amber-400 shadow-[0_0_8px_hsl(38_92%_50%/0.55)]",
    });
  }
  if (inv.status === "awaiting_activation") {
    dots.push({
      key: "act",
      title: "Ожидает активации",
      className: "bg-sky-400",
    });
  }
  if (inv.status === "paused" && inv.accrued > 0.005) {
    dots.push({
      key: "pause",
      title: "Пауза с начислением",
      className: "bg-violet-400",
    });
  }
  if (inv.due > 0.005 && inv.status === "active") {
    dots.push({
      key: "due",
      title: "Есть сумма к выводу",
      className: "bg-emerald-400/90",
    });
  }
  if (!dots.length) return <span className="inline-block w-4" aria-hidden />;

  return (
    <div className="flex items-center justify-end gap-1" title={dots.map((d) => d.title).join(" · ")}>
      {dots.map((d) => (
        <span key={d.key} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", d.className)} aria-hidden />
      ))}
    </div>
  );
}

export function InvestorsTable({
  investors,
  onOpenInvestor,
  onResetCredentials,
  onDeleteInvestor,
  showNetwork = true,
}: {
  investors: InvestorTableRow[];
  onOpenInvestor?: (investorId: number) => void;
  onResetCredentials?: (investorId: number) => void;
  onDeleteInvestor?: (investorId: number) => void;
  showNetwork?: boolean;
}) {
  const rowClickable = typeof onOpenInvestor === "function";

  if (investors.length === 0) {
    return (
      <div className="thai-glass flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-border/60 px-4 text-center text-sm text-muted-foreground">
        По фильтрам никого нет. Измените поиск или снимите ограничения.
      </div>
    );
  }

  const th =
    "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pl-3 last:pr-3";

  return (
    <div className="space-y-2 md:space-y-3">
      <div className="thai-glass hidden overflow-hidden rounded-2xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/50 bg-muted/25">
                <th className={cn(th, "w-[22%]")}>Позиция</th>
                <th className={cn(th, "w-[7%]")}>Вход</th>
                <th className={cn(th, "w-[9%] text-right tabular-nums")}>Тело</th>
                <th className={cn(th, "w-[6%] text-center")}>%</th>
                <th className={cn(th, "w-[9%] text-right tabular-nums")}>Начисл.</th>
                <th className={cn(th, "w-[9%] text-right tabular-nums")}>Выпл.</th>
                <th className={cn(th, "w-[9%] text-right tabular-nums")}>К выпл.</th>
                <th className={cn(th, "w-[10%] text-center")}>Статус</th>
                {showNetwork ? <th className={cn(th, "w-[7%] text-center")}>Сеть</th> : null}
                <th className={cn(th, "w-[5%] text-right")} title="Сигналы">
                  ●
                </th>
                {(onDeleteInvestor || onResetCredentials) && (
                  <th className={cn(th, "w-[12%] text-center")}>…</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {investors.map((inv) => {
                const hot = inv.due > 0.005 || rowNeedsAttention(inv);
                return (
                  <tr
                    key={inv.id}
                    className={cn(
                      "group transition-colors duration-150",
                      rowClickable && "cursor-pointer hover:bg-primary/[0.04]",
                      hot && "bg-gradient-to-r from-primary/[0.06] via-transparent to-transparent"
                    )}
                    onClick={() => onOpenInvestor?.(inv.id)}
                  >
                    <td className="px-2 py-2 align-middle first:pl-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{inv.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="truncate">{inv.owner.username}</span>
                          {inv.investorUser?.username ? (
                            <span className="rounded border border-border/50 bg-background/60 px-1 font-mono text-[10px] text-foreground/90">
                              {inv.investorUser.username}
                            </span>
                          ) : (
                            <span className="text-amber-700/90 dark:text-amber-400/90">без кабинета</span>
                          )}
                          {inv.handle ? (
                            <span className="truncate text-muted-foreground/80">@{inv.handle}</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle text-[11px] tabular-nums text-muted-foreground">
                      {shortDate(inv.entryDate)}
                    </td>
                    <td className="px-2 py-2 align-middle text-right text-xs font-medium tabular-nums text-foreground">
                      {formatCurrency(inv.body)}
                    </td>
                    <td className="px-2 py-2 align-middle text-center text-xs font-semibold tabular-nums thai-text-metric-info">
                      {inv.rate}%
                    </td>
                    <td className="px-2 py-2 align-middle text-right text-xs font-medium tabular-nums thai-text-metric-info">
                      {formatCurrency(inv.accrued)}
                    </td>
                    <td className="px-2 py-2 align-middle text-right text-xs font-medium tabular-nums thai-text-metric-ok">
                      {formatCurrency(inv.paid)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 align-middle text-right text-xs font-semibold tabular-nums",
                        inv.due > 0.005 ? "thai-text-metric-warn" : "text-muted-foreground"
                      )}
                    >
                      {formatCurrency(inv.due)}
                    </td>
                    <td className="px-2 py-2 align-middle text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    {showNetwork ? (
                      <td className="px-2 py-2 align-middle text-center">
                        <NetworkBadge isPrivate={inv.isPrivate} />
                      </td>
                    ) : null}
                    <td className="px-2 py-2 align-middle last:pr-3">
                      <RowDots inv={inv} />
                    </td>
                    {(onDeleteInvestor || onResetCredentials) && (
                      <td className="px-2 py-2 align-middle text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {onResetCredentials ? (
                            <button
                              type="button"
                              className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground transition hover:bg-muted/60"
                              onClick={(e) => {
                                e.stopPropagation();
                                onResetCredentials(inv.id);
                              }}
                            >
                              Доступ
                            </button>
                          ) : null}
                          {onDeleteInvestor ? (
                            <button
                              type="button"
                              className="rounded-md border border-red-500/35 px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteInvestor(inv.id);
                              }}
                            >
                              Удал.
                            </button>
                          ) : null}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {investors.map((inv) => {
          const hot = inv.due > 0.005 || rowNeedsAttention(inv);
          return (
            <button
              key={inv.id}
              type="button"
              disabled={!rowClickable}
              onClick={() => onOpenInvestor?.(inv.id)}
              className={cn(
                "thai-glass thai-row-interactive w-full rounded-2xl border border-border/40 p-3 text-left ring-1 ring-black/[0.03] transition dark:ring-white/[0.06]",
                !rowClickable && "cursor-default",
                hot && "border-primary/25 ring-primary/10"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold leading-tight">{inv.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{inv.owner.username}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {inv.investorUser?.username ? (
                      <span className="rounded border border-border/50 px-1 font-mono text-[10px]">
                        {inv.investorUser.username}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400">нет кабинета</span>
                    )}
                    {showNetwork ? <NetworkBadge isPrivate={inv.isPrivate} /> : null}
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <RowDots inv={inv} />
              </div>

              <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-lg bg-muted/25 px-1 py-1.5">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Тело</div>
                  <div className="text-[11px] font-semibold tabular-nums">{formatCurrency(inv.body)}</div>
                </div>
                <div className="rounded-lg bg-muted/25 px-1 py-1.5">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">%</div>
                  <div className="text-[11px] font-semibold tabular-nums thai-text-metric-info">{inv.rate}</div>
                </div>
                <div className="rounded-lg bg-muted/25 px-1 py-1.5">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Нач.</div>
                  <div className="text-[11px] font-semibold tabular-nums thai-text-metric-info">
                    {formatCurrency(inv.accrued)}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/25 px-1 py-1.5">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">К выпл.</div>
                  <div
                    className={cn(
                      "text-[11px] font-semibold tabular-nums",
                      inv.due > 0.005 ? "thai-text-metric-warn" : "text-muted-foreground"
                    )}
                  >
                    {formatCurrency(inv.due)}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">Вход {shortDate(inv.entryDate)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
