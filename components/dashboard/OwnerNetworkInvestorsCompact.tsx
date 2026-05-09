"use client";

import { useState, type CSSProperties } from "react";
import { Bell } from "lucide-react";

import type { OwnerPendingPaymentRow } from "@/components/dashboard/OwnerPendingPaymentsQueue";
import {
  formatOwnerPendingPaymentShortWhen,
  ownerPendingPaymentTypeRu,
  useOwnerPendingPaymentMutation,
} from "@/components/dashboard/OwnerPendingPaymentsQueue";
import { OwnerWithdrawApproveModal } from "@/components/dashboard/OwnerWithdrawApproveModal";
import { Text } from "@/components/ui/Text";
import { UserAvatar } from "@/components/user/UserAvatar";
import { cn, formatCurrency } from "@/lib/utils";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { glassAccentSurface } from "@/lib/dashboard-glass-accent";

export type OwnerNetworkInvestorPaymentHint = {
  id: number;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
};

export type OwnerNetworkInvestorRow = {
  id: number;
  name: string;
  handle?: string | null;
  investorUser?: { username: string } | null;
  avatarUrl?: string | null;
  body: number;
  accrued: number;
  due: number;
  status: string;
  payments?: OwnerNetworkInvestorPaymentHint[];
};

const PAYMENT_ALERT_PRIORITY = [
  "disputed",
  "requested",
  "expired",
  "approved_waiting_accept",
  "pending",
] as const;

function paymentAlertCopy(status: string): string | null {
  if (status === "requested") return "Заявка на вывод — требуется решение";
  if (status === "approved_waiting_accept") return "Выплата одобрена — ждём инвестора";
  if (status === "disputed") return "Спор по выплате";
  if (status === "expired") return "Срок заявки истёк";
  if (status === "pending") return "Заявка в очереди";
  return null;
}

function pickPaymentAlert(payments: OwnerNetworkInvestorPaymentHint[] | undefined) {
  if (!payments?.length) return null;
  const rank = (s: string) => {
    const i = (PAYMENT_ALERT_PRIORITY as readonly string[]).indexOf(s);
    return i === -1 ? 99 : i;
  };
  const meaningful = payments.filter((p) => paymentAlertCopy(p.status));
  if (!meaningful.length) return null;
  const sorted = [...meaningful].sort((a, b) => rank(a.status) - rank(b.status));
  const top = sorted[0];
  const text = paymentAlertCopy(top.status)!;
  const extra = sorted.length > 1 ? ` +${sorted.length - 1}` : "";
  return { text: `${text}${extra}` };
}

function metricValueStyle(color: string): CSSProperties {
  return { color, WebkitTextFillColor: color };
}

function OwnerInvestorWithdrawRowsCompact({ rows }: { rows: OwnerPendingPaymentRow[] }) {
  const mutation = useOwnerPendingPaymentMutation();
  const disabled = mutation.isPending;
  const [approveFor, setApproveFor] = useState<OwnerPendingPaymentRow | null>(null);
  const [rejectFor, setRejectFor] = useState<OwnerPendingPaymentRow | null>(null);

  return (
    <>
      <div className="thai-owner-lux-withdraw-stack mt-1">
        {rows.map((p) => (
          <div key={p.id} className="thai-owner-lux-withdraw-rail">
            <div className="thai-owner-lux-withdraw-rail__accent" aria-hidden />
            <div className="thai-owner-lux-withdraw-rail__body">
              <div className="thai-owner-lux-withdraw-rail__meta">
                <span className="thai-owner-lux-withdraw-rail__eyebrow">Вывод</span>
                <span className="thai-owner-lux-withdraw-rail__line">
                  <span className="thai-owner-lux-withdraw-rail__kind">{ownerPendingPaymentTypeRu(p.type)}</span>
                  <span className="thai-owner-lux-withdraw-rail__sep" aria-hidden />
                  <span className="thai-owner-lux-withdraw-rail__amount tabular-nums">{formatCurrency(p.amount)}</span>
                  <span className="thai-owner-lux-withdraw-rail__sep thai-owner-lux-withdraw-rail__sep--dim" aria-hidden />
                  <time className="thai-owner-lux-withdraw-rail__when tabular-nums" dateTime={p.createdAt}>
                    {formatOwnerPendingPaymentShortWhen(p.createdAt)}
                  </time>
                </span>
              </div>
              <div className="thai-owner-lux-withdraw-rail__actions">
                <button
                  type="button"
                  className={cn(
                    "thai-owner-lux-withdraw-approve",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                  disabled={disabled}
                  onClick={() => {
                    setRejectFor(null);
                    setApproveFor(p);
                  }}
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  className={cn(
                    "thai-owner-lux-withdraw-decline",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                  disabled={disabled}
                  onClick={() => {
                    setApproveFor(null);
                    setRejectFor(p);
                  }}
                >
                  Отклонить
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <OwnerWithdrawApproveModal
        open={approveFor !== null}
        payment={approveFor}
        isPending={mutation.isPending}
        onClose={() => setApproveFor(null)}
        onConfirm={({ comment }) => {
          if (!approveFor) return;
          mutation.mutate(
            { paymentId: approveFor.id, action: "owner_approve", comment },
            { onSuccess: () => setApproveFor(null) }
          );
        }}
      />
      <OwnerWithdrawApproveModal
        variant="reject"
        open={rejectFor !== null}
        payment={rejectFor}
        isPending={mutation.isPending}
        onClose={() => setRejectFor(null)}
        onConfirm={({ comment }) => {
          if (!rejectFor || !comment?.trim()) return;
          mutation.mutate(
            { paymentId: rejectFor.id, action: "owner_reject", comment: comment.trim() },
            { onSuccess: () => setRejectFor(null) }
          );
        }}
      />
    </>
  );
}

function CompactMetricButton({
  label,
  value,
  valueColorVar,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: string;
  valueColorVar: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  const color = `var(${valueColorVar})`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "thai-stat-tile thai-owner-lux-metric group flex min-h-0 flex-1 flex-col rounded-lg border-0 bg-background/22 px-1.5 py-1 text-left transition-colors",
        "hover:bg-background/34 dark:bg-background/14 dark:hover:bg-background/22",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      )}
    >
      <span className="text-[9px] font-medium uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
      <span
        className="mt-0.5 block text-xs font-semibold tabular-nums leading-tight group-hover:brightness-[1.06]"
        style={metricValueStyle(color)}
      >
        {value}
      </span>
    </button>
  );
}

/** Тот же паттерн, что и в `DashboardTopbar`: кольцо `thai-dashboard-avatar-ring`, ник `thai-dashboard-nick-matte-gold`, стрелка › */
function TopbarStyleInvestorIdentity({
  name,
  avatarInitialsSource,
  avatarUrl,
  positionsActive,
  onOpenProfile,
}: {
  name: string;
  avatarInitialsSource?: string | null;
  avatarUrl?: string | null;
  positionsActive: boolean;
  onOpenProfile: () => void;
}) {
  const avatarSize = 34;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onOpenProfile}
        className="relative shrink-0 rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Карточка инвестора — ${name}`}
      >
        <UserAvatar
          name={name}
          src={avatarUrl}
          size={avatarSize}
          variant="plain"
          hasPositions={positionsActive}
          className="thai-dashboard-avatar-ring transition-[box-shadow] duration-300 ease-out !ring-0 bg-transparent shadow-none [&_img]:object-cover"
        />
      </button>
      <button
        type="button"
        onClick={onOpenProfile}
        className={cn(
          "group inline-flex min-w-0 max-w-[min(58vw,11rem)] items-center gap-1 bg-transparent px-0 py-0 outline-none transition sm:max-w-[14rem]",
          "hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
        aria-label={`Открыть позицию ${name}`}
      >
        <span className="thai-dashboard-nick-matte-gold truncate text-xs font-semibold tracking-tight sm:text-[13px]">{name}</span>
        <span className="shrink-0 text-muted-foreground sm:text-sm" aria-hidden>
          ›
        </span>
      </button>
    </div>
  );
}

export function OwnerNetworkInvestorsCompact({
  investors,
  pendingPayments,
  pulseInvestorId,
  loading,
  hasData,
  onOpenInvestor,
  onOpenReports,
  onOpenInvestorReports,
}: {
  investors: OwnerNetworkInvestorRow[];
  pendingPayments: OwnerPendingPaymentRow[];
  pulseInvestorId: number | null;
  loading: boolean;
  hasData: boolean;
  onOpenInvestor: (id: number) => void;
  onOpenReports: () => void;
  /** Очереди выплат / аудит по конкретной позиции */
  onOpenInvestorReports: (investorId: number) => void;
}) {
  return (
    <section
      className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden pt-1 md:mt-4"
      aria-labelledby="owner-network-investors-heading"
    >
      <div className="relative z-0 mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5">
        <Text
          id="owner-network-investors-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Инвесторы в сети
        </Text>
        <button
          type="button"
          onClick={onOpenReports}
          className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", glassAccentSurface)}
        >
          Финансы
        </button>
      </div>

      {loading && !hasData ? (
        <div className="relative z-[2] space-y-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border/25 bg-muted/10 p-2 dark:bg-white/[0.04]">
              <div className="flex gap-2">
                <div className="h-9 w-9 shrink-0 rounded-full bg-muted/35 dark:bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <div className="h-3.5 w-28 rounded bg-muted/35 dark:bg-white/10" />
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-11 rounded-lg bg-muted/25 dark:bg-white/[0.06]" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : investors.length === 0 ? (
        <Text className="relative z-[2] block py-6 text-center text-sm text-muted-foreground">
          В общей сети пока нет инвесторов. Добавьте первого в разделе «Управление».
        </Text>
      ) : (
        <div className="relative z-[2] flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto [-webkit-overflow-scrolling:touch] pb-1">
          {investors.map((inv) => {
            const withdrawRows = pendingPayments
              .filter((p) => p.investorId === inv.id)
              .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
            const alert = withdrawRows.length > 0 ? null : pickPaymentAlert(inv.payments);
            const positionsActive = inv.status === "active";

            return (
              <div
                key={inv.id}
                data-owner-network-investor={inv.id}
                className={cn(
                  "thai-row-interactive thai-owner-network-investor-card thai-dashboard-list-row w-full shrink-0 rounded-xl px-2 py-1.5 sm:py-2",
                  pulseInvestorId === inv.id && "thai-owner-investor-attention"
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <TopbarStyleInvestorIdentity
                    name={inv.name}
                    avatarInitialsSource={investorDisplayHandle(inv)}
                    avatarUrl={inv.avatarUrl}
                    positionsActive={positionsActive}
                    onOpenProfile={() => onOpenInvestor(inv.id)}
                  />
                </div>

                {withdrawRows.length > 0 ? <OwnerInvestorWithdrawRowsCompact rows={withdrawRows} /> : null}

                {alert ? (
                  <button
                    type="button"
                    onClick={() => onOpenInvestorReports(inv.id)}
                className={cn(
                  "thai-owner-lux-alert-strip mt-1 flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                  >
                    <Bell className="thai-owner-lux-alert-strip__icon h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                    <span className="thai-owner-lux-alert-strip__text min-w-0 flex-1 text-[10px] font-medium leading-snug">{alert.text}</span>
                    <span className="thai-owner-lux-alert-strip__link shrink-0 text-[10px] font-semibold">Финансы ›</span>
                  </button>
                ) : null}

                <div className="mt-1.5 grid grid-cols-3 gap-1 sm:gap-1.5">
                  <CompactMetricButton
                    label="Тело"
                    value={formatCurrency(inv.body)}
                    valueColorVar="--thai-color-text-primary"
                    onClick={() => onOpenInvestor(inv.id)}
                    ariaLabel={`${inv.name}: тело ${formatCurrency(inv.body)}, открыть карточку`}
                  />
                  <CompactMetricButton
                    label="Начислено"
                    value={formatCurrency(inv.accrued)}
                    valueColorVar="--thai-color-accrued"
                    onClick={() => onOpenInvestor(inv.id)}
                    ariaLabel={`${inv.name}: начислено ${formatCurrency(inv.accrued)}, открыть карточку`}
                  />
                  <CompactMetricButton
                    label="К выплате"
                    value={formatCurrency(inv.due)}
                    valueColorVar="--thai-color-due"
                    onClick={() => onOpenInvestorReports(inv.id)}
                    ariaLabel={`${inv.name}: к выплате ${formatCurrency(inv.due)}, очередь в отчётах`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
