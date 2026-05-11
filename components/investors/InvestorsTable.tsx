"use client";

import { investorDisplayHandle } from "@/lib/investor-display-handle";
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
  owner: { id: number; username: string; role: string };
  investorUser?: { id: number; username: string } | null;
  linkedUser?: { id: number; username: string } | null;
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
    awaiting_activation:
      "bg-[#fbbf24]/12 text-[#b45309] border-[#fbbf24]/30 dark:text-[#fbbf24] dark:border-[#fbbf24]/35",
    paused: "bg-sky-500/12 text-sky-800 border-sky-500/25 dark:text-sky-300 dark:border-sky-500/35",
    closed: "bg-red-500/10 text-red-700 border-red-500/25 dark:text-red-300 dark:border-red-500/35",
  };

  const labels: Record<string, string> = {
    active: "Активен",
    awaiting_activation: "Ожидает",
    paused: "Пауза",
    closed: "Закрыт",
  };

  if (status === "active") {
    return <span className="thai-status-active">{labels.active}</span>;
  }

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
      className: "bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.55)]",
    });
  }
  if (inv.status === "awaiting_activation") {
    dots.push({
      key: "act",
      title: "Ожидает активации",
      className: "bg-[#60a5fa]",
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
      className: "bg-[#fbbf24]",
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
      <div className="thai-glass desktop-table overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/50 bg-muted/25">
                <th
                  className={cn(th, "w-[22%]")}
                  title="Крупный текст: публичный ник (логин аккаунта инвестора или привязанного пользователя; см. investorDisplayHandle). Ниже: владелец; если имя и Отчество другое — оно второй строкой. «без кабинета» — нет ни логина, ни сохранённого handle."
                >
                  Позиция
                </th>
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
                const nick = investorDisplayHandle(inv);
                const primary = nick ?? inv.name;
                const showLegal = nick != null && inv.name.trim() !== nick.trim();
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
                      {/*
                        Элемент «Позиция» (десктоп):
                        — строка 1 (жирная): primary = логин из кабинета/привязки, иначе имя и Отчество (inv.name).
                        — строка 2 (мелкая): владелец; при другом юридическом имени — «· Имя»; без аккаунта — «без кабинета».
                      */}
                      <div
                        className="min-w-0"
                        title={[
                          `Строка 1 (крупно): «${primary}»`,
                          nick ? `← публичный ник (аккаунт)` : `← имя и Отчество (нет логина/handle)`,
                          `Владелец: ${inv.owner.username}`,
                          `Имя и Отчество (БД): ${inv.name}`,
                        ].join("\n")}
                      >
                        <div className="truncate text-sm font-semibold text-foreground">{primary}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="truncate">{inv.owner.username}</span>
                          {showLegal ? <span className="truncate">· {inv.name}</span> : null}
                          {!nick ? <span style={{ color: "#fbbf24" }}>без кабинета</span> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle text-[11px] tabular-nums text-muted-foreground">
                      {shortDate(inv.entryDate)}
                    </td>
                    <td
                      className="px-2 py-2 align-middle text-right text-xs font-medium tabular-nums"
                      style={{ color: "#ffffff" }}
                    >
                      {formatCurrency(inv.body)}
                    </td>
                    <td className="px-2 py-2 align-middle text-center text-xs font-semibold tabular-nums text-foreground">
                      {inv.rate}%
                    </td>
                    <td
                      className="px-2 py-2 align-middle text-right text-xs font-medium tabular-nums"
                      style={{ color: "#60a5fa" }}
                    >
                      {formatCurrency(inv.accrued)}
                    </td>
                    <td
                      className="px-2 py-2 align-middle text-right text-xs font-medium tabular-nums"
                      style={{ color: "#4ade80" }}
                    >
                      {formatCurrency(inv.paid)}
                    </td>
                    <td className="px-2 py-2 align-middle text-right text-xs font-semibold tabular-nums" style={{ color: "#fbbf24" }}>
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
                    <td
                      className={cn(
                        "px-2 py-2 align-middle",
                        !(onDeleteInvestor || onResetCredentials) && "pr-3"
                      )}
                    >
                      <RowDots inv={inv} />
                    </td>
                    {(onDeleteInvestor || onResetCredentials) && (
                      <td className="px-2 py-2 pr-3 align-middle text-center">
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

      <div className="mobile-cards space-y-3">
        {investors.map((inv) => {
          const nick = investorDisplayHandle(inv);
          const primary = nick ?? inv.name;
          const showLegal = nick != null && inv.name.trim() !== nick.trim();
          const hot = inv.due > 0.005 || rowNeedsAttention(inv);

          return (
            <div
              key={inv.id}
              className={cn(
                "thai-glass w-full overflow-hidden rounded-2xl border border-border/40 ring-1 ring-black/[0.03] dark:ring-white/[0.06]",
                hot && "border-primary/25 ring-primary/10"
              )}
            >
              <button
                type="button"
                disabled={!rowClickable}
                onClick={() => onOpenInvestor?.(inv.id)}
                className={cn(
                  "thai-row-interactive w-full p-4 text-left transition",
                  !rowClickable && "cursor-default",
                  rowClickable && "hover:bg-primary/[0.03]"
                )}
                title={[
                  `Крупно: «${primary}» (${nick ? "публичный ник" : "имя и Отчество"})`,
                  `Владелец: ${inv.owner.username}`,
                  `Имя и Отчество: ${inv.name}`,
                ].join("\n")}
              >
              <div className="flex items-start justify-between gap-2">
                {/*
                  Моб. карточка: та же логика, что колонка «Позиция» в таблице (см. thead title).
                */}
                <div className="min-w-0 flex-1 truncate text-[15px] font-medium leading-snug text-foreground">
                  {primary}
                </div>
                <div className="shrink-0">
                  <StatusBadge status={inv.status} />
                </div>
              </div>

              <div className="mt-1.5 text-xs text-muted-foreground">
                {inv.owner.username}
                {showLegal ? <span className="text-muted-foreground/80"> · {inv.name}</span> : null}
                <span> · вход {shortDate(inv.entryDate)}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="thai-glass thai-stat-tile border border-border/35 px-2.5 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Тело</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "#ffffff" }}>
                    {formatCurrency(inv.body)}
                  </div>
                </div>
                <div className="thai-glass thai-stat-tile border border-border/35 px-2.5 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Начислено</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "#60a5fa" }}>
                    {formatCurrency(inv.accrued)}
                  </div>
                </div>
                <div className="thai-glass thai-stat-tile border border-border/35 px-2.5 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Выплачено</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "#4ade80" }}>
                    {formatCurrency(inv.paid)}
                  </div>
                </div>
                <div className="thai-glass thai-stat-tile border border-border/35 px-2.5 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">К выплате</div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "#fbbf24" }}>
                    {formatCurrency(inv.due)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {showNetwork ? (
                    inv.isPrivate ? (
                      <span className="inline-flex rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                        ЛИЧ
                      </span>
                    ) : (
                      <span className="inline-flex rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        ОБЩ
                      </span>
                    )
                  ) : null}
                  <span className="inline-flex items-center gap-1" title={rowNeedsAttention(inv) ? "Сигналы" : undefined}>
                    <RowDots inv={inv} />
                  </span>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{inv.rate}%</span>
              </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
