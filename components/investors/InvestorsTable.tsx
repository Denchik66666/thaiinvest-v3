"use client";

import { Card } from "@/components/ui/Card";
import { formatCurrency, cn } from "@/lib/utils";

interface Investor {
  id: number;
  name: string;
  body: number;
  rate: number;
  accrued: number;
  paid: number;
  due: number;
  status: string;
  isPrivate: boolean;
  owner: {
    username: string;
    role: string;
  };
}

/* ---------------------------------------------------------
   БЕЙДЖ СТАТУСА
--------------------------------------------------------- */
export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-900",
    awaiting_activation: "bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:border-yellow-900",
    paused: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900",
    closed: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-900",
  };

  const labels: Record<string, string> = {
    active: "Активен",
    awaiting_activation: "Ожидает",
    paused: "Пауза",
    closed: "Закрыт",
  };

  return (
    <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", styles[status] || "bg-gray-100 text-gray-600")}>
      {labels[status] || status}
    </span>
  );
}

/* ---------------------------------------------------------
   ТАБЛИЦА ИНВЕСТОРОВ
--------------------------------------------------------- */
export function InvestorsTable({
  investors,
  onOpenInvestor,
  onResetCredentials,
  onDeleteInvestor,
  showNetwork = true,
}: {
  investors: Investor[];
  onOpenInvestor?: (investorId: number) => void;
  onResetCredentials?: (investorId: number) => void;
  onDeleteInvestor?: (investorId: number) => void;
  showNetwork?: boolean;
}) {
  const rowClickable = typeof onOpenInvestor === "function";

  if (investors.length === 0) {
    return (
      <Card className="flex items-center justify-center py-12 text-muted-foreground border-dashed">
        Пока нет инвесторов.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="hidden md:block overflow-hidden p-0 border-none shadow-md">
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Имя</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Тело</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Ставка</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Начислено</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right text-green-600">Выплачено</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right text-orange-600">К выплате</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Статус</th>
                {showNetwork && (
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Сеть</th>
                )}
                {(onDeleteInvestor || onResetCredentials) && (
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Действия</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {investors.map((inv) => (
                <tr
                  key={inv.id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors group",
                    rowClickable ? "cursor-pointer" : ""
                  )}
                  onClick={() => onOpenInvestor?.(inv.id)}
                >
                  <td className="px-4 py-4">
                    <div className="font-semibold text-foreground break-words whitespace-normal min-w-0">{inv.name}</div>
                    <div className="text-xs text-muted-foreground break-words whitespace-normal min-w-0">{inv.owner.username}</div>
                  </td>
                  <td className="px-4 py-4 text-right font-medium min-w-0">{formatCurrency(inv.body)}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-medium">{inv.rate}%</span>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-blue-600 min-w-0">{formatCurrency(inv.accrued)}</td>
                  <td className="px-4 py-4 text-right font-medium text-green-600 min-w-0">{formatCurrency(inv.paid)}</td>
                  <td className="px-4 py-4 text-right font-medium text-orange-600 min-w-0">{formatCurrency(inv.due)}</td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge status={inv.status} />
                  </td>
                  {showNetwork && (
                    <td className="px-4 py-4 text-center">
                      <NetworkBadge isPrivate={inv.isPrivate} />
                    </td>
                  )}
                  {(onDeleteInvestor || onResetCredentials) && (
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {onResetCredentials ? (
                          <button
                            type="button"
                            className="rounded-lg border border-border/60 px-2.5 py-1 text-xs text-foreground hover:bg-muted/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResetCredentials(inv.id);
                            }}
                          >
                            Сбросить доступ
                          </button>
                        ) : null}
                        {onDeleteInvestor ? (
                          <button
                            type="button"
                            className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteInvestor(inv.id);
                            }}
                          >
                            Удалить
                          </button>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="md:hidden space-y-2">
        {investors.map((inv) => (
          <Card
            key={inv.id}
            className={cn("p-4 rounded-2xl border-border/70 shadow-sm", rowClickable ? "cursor-pointer" : "")}
            onClick={() => onOpenInvestor?.(inv.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold leading-tight">{inv.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{inv.owner.username}</div>
              </div>
              <StatusBadge status={inv.status} />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              <InfoCell label="Тело" value={formatCurrency(inv.body)} />
              <InfoCell label="Ставка" value={`${inv.rate}%`} />
              <InfoCell label="Начислено" value={formatCurrency(inv.accrued)} valueClass="text-blue-600" />
              <InfoCell label="К выплате" value={formatCurrency(inv.due)} valueClass="text-orange-600" />
            </div>

            <div className="mt-3 flex items-center justify-between">
              {showNetwork ? <NetworkBadge isPrivate={inv.isPrivate} /> : <span />}
              <div className="flex items-center gap-2">
                {onResetCredentials ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border/60 px-2.5 py-1 text-xs text-foreground hover:bg-muted/50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResetCredentials(inv.id);
                    }}
                  >
                    Сбросить доступ
                  </button>
                ) : null}
                {onDeleteInvestor ? (
                  <button
                    type="button"
                    className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteInvestor(inv.id);
                    }}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function InfoCell({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold mt-0.5", valueClass)}>{value}</div>
    </div>
  );
}

function NetworkBadge({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
      Личная
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
      Общая
    </span>
  );
}
