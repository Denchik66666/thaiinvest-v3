"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FinanceOperationItem } from "@/types/finance-operations";
import { Modal } from "@/components/ui/Modal";
import { Text } from "@/components/ui/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moneyRound2 } from "@/lib/money-round";
import { cn, formatCurrency } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";
import { paymentCorrectionProposalsQueryKey } from "@/lib/payment-correction-query";
import { useAuth } from "@/hooks/useAuth";
import { useAppDialogsSafe } from "@/components/feedback/AppDialogsProvider";
import { DatePicker } from "@/components/ui/DatePicker";
import { Check, ShieldX, Trash2, X } from "lucide-react";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function paymentTypeRu(type: string) {
  if (type === "interest") return "Проценты";
  if (type === "body") return "Вывод тела";
  if (type === "close") return "Закрытие позиции";
  return type;
}

function paymentStatusRu(status: string) {
  const map: Record<string, string> = {
    completed: "Завершено",
    requested: "На рассмотрении у владельца",
    pending: "В очереди",
    approved_waiting_accept: "Одобрено, ждёт вашего решения",
    rejected: "Отклонено",
    expired: "Истекло",
    disputed: "Спор",
    completed_at_creation: "При создании позиции",
  };
  return map[status] ?? status;
}

function topUpStatusRu(status: string) {
  const map: Record<string, string> = {
    pending_investor: "Ожидает решения инвестора",
    accepted_by_investor: "Принято",
    rejected_by_investor: "Отклонено инвестором",
    cancelled_by_owner: "Отменено владельцем",
  };
  return map[status] ?? status;
}

type PaymentTimelineStep = {
  at: string;
  kind: string;
  title: string;
  actorUsername: string;
  source: "audit" | "reconstructed";
  stepAmount: number | null;
};

type PaymentAmountStory = {
  finalRecorded: number;
  originalRequested: number | null;
  ownerApprovedAmount: number | null;
  investorConfirmedAmount: number | null;
  ownerApproverUsername: string | null;
  reconstructed: boolean;
};

type PaymentContextPayload = {
  payment: { id: number; investorId: number; type: string; status: string; requestedAmount: number };
  position: { body: number; accrued: number; status: string };
  limits: { availableNow: number; maxApprove: number; pendingInterest: number; pendingBody: number; hasPendingClose: boolean };
  timeline: PaymentTimelineStep[];
  amountStory: PaymentAmountStory;
};

function clientTimelineFallback(item: Extract<FinanceOperationItem, { kind: "payment" }>): PaymentTimelineStep[] {
  const steps: PaymentTimelineStep[] = [
    {
      at: item.createdAt,
      kind: "request",
      title: "Заявка",
      actorUsername: "—",
      source: "reconstructed",
      stepAmount: null,
    },
  ];
  if (item.approvedAt) {
    steps.push({
      at: item.approvedAt,
      kind: "owner_decision",
      title: "Одобрение",
      actorUsername: "—",
      source: "reconstructed",
      stepAmount: null,
    });
  }
  if (item.acceptedAt) {
    steps.push({
      at: item.acceptedAt,
      kind: "completed",
      title: "Подтверждение",
      actorUsername: "—",
      source: "reconstructed",
      stepAmount: null,
    });
  }
  return steps;
}

type PaymentDateField = "createdAt" | "approvedAt" | "acceptedAt";

function isoToYmdUtc(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mergeYmdIntoUtcIsoPreservingTime(ymd: string, referenceIso: string): string {
  const ref = new Date(referenceIso);
  if (!Number.isFinite(ref.getTime())) return referenceIso;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return referenceIso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  return new Date(
    Date.UTC(y, mo - 1, da, ref.getUTCHours(), ref.getUTCMinutes(), ref.getUTCSeconds(), ref.getUTCMilliseconds())
  ).toISOString();
}

function timelineKindToPaymentDateField(kind: string): PaymentDateField | null {
  if (kind === "request") return "createdAt";
  if (
    kind === "owner_decision" ||
    kind === "rejected" ||
    kind === "force_rejected" ||
    kind === "disputed"
  )
    return "approvedAt";
  if (kind === "completed" || kind === "force_completed") return "acceptedAt";
  return null;
}

function baselinePaymentIso(item: Extract<FinanceOperationItem, { kind: "payment" }>, field: PaymentDateField): string | null {
  if (field === "createdAt") return item.createdAt;
  if (field === "approvedAt") return item.approvedAt;
  return item.acceptedAt;
}

function normIsoKey(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString() : iso.trim();
}

type SaEditSheet = null | { kind: "date"; field: PaymentDateField; referenceIso: string; label: string } | { kind: "amount" };

/** Полоска слева: спокойные границы, смысл по этапу (нейтрал → решение → итог). */
function paymentStepAccentBorder(kind: string): string {
  const map: Record<string, string> = {
    request: "border-zinc-400/55 dark:border-zinc-500/45",
    owner_decision: "border-blue-500/50 dark:border-blue-400/40",
    completed: "border-emerald-500/55 dark:border-emerald-400/45",
    rejected: "border-rose-500/50 dark:border-rose-400/45",
    disputed: "border-amber-500/50 dark:border-amber-400/40",
    force_completed: "border-violet-500/45 dark:border-violet-400/35",
    force_rejected: "border-rose-600/55 dark:border-rose-500/45",
    other: "border-border/60",
  };
  return cn("border-l-2 pl-2.5", map[kind] ?? map.other);
}

function paymentStepTitleClass(kind: string): string {
  const map: Record<string, string> = {
    request: "text-foreground",
    owner_decision: "text-blue-700 dark:text-blue-300",
    completed: "text-emerald-700 dark:text-emerald-400",
    rejected: "text-rose-700 dark:text-rose-400",
    disputed: "text-amber-800 dark:text-amber-400",
    force_completed: "text-violet-800 dark:text-violet-300",
    force_rejected: "text-rose-700 dark:text-rose-400",
    other: "text-foreground",
  };
  return map[kind] ?? map.other;
}

function paymentStepAmountClass(kind: string): string {
  const map: Record<string, string> = {
    request: "text-foreground",
    owner_decision: "text-blue-800 dark:text-blue-200",
    completed: "text-emerald-700 dark:text-emerald-400",
    rejected: "text-rose-700 dark:text-rose-400",
    disputed: "text-amber-800 dark:text-amber-400",
    force_completed: "text-violet-900 dark:text-violet-200",
    force_rejected: "text-rose-700 dark:text-rose-400",
    other: "text-foreground font-semibold",
  };
  return cn("font-semibold tabular-nums", map[kind] ?? map.other);
}

function paymentStatusCaptionClass(status: string, needsAttention: boolean): string {
  if (needsAttention) {
    return "font-semibold text-amber-700 dark:text-amber-400";
  }
  switch (status) {
    case "completed":
    case "completed_at_creation":
      return "font-semibold text-emerald-700 dark:text-emerald-400";
    case "rejected":
    case "expired":
      return "font-semibold text-rose-700 dark:text-rose-400";
    case "disputed":
      return "font-semibold text-amber-800 dark:text-amber-400";
    case "approved_waiting_accept":
      return "font-semibold text-blue-800 dark:text-blue-300";
    case "requested":
      return "font-semibold text-zinc-700 dark:text-zinc-300";
    case "pending":
      return "font-semibold text-zinc-600 dark:text-zinc-400";
    default:
      return "font-semibold text-foreground";
  }
}

function premiumChromeStyle() {
  return {
    background:
      "radial-gradient(120% 90% at 50% -8%, color-mix(in srgb, hsl(var(--primary)) 20%, transparent), transparent 62%)," +
      "linear-gradient(180deg, color-mix(in srgb, hsl(var(--card)) 82%, transparent), color-mix(in srgb, hsl(var(--card)) 62%, transparent))",
    borderColor: "color-mix(in srgb, hsl(var(--border)) 70%, transparent)",
    backdropFilter: "blur(22px) saturate(165%)",
    WebkitBackdropFilter: "blur(22px) saturate(165%)",
  } as const;
}

/** Label · value: на узкой ширине колонкой, длинный текст переносится */
function Kv({ label, children, valueClassName }: { label: string; children: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:py-0.5">
      <span className="min-w-0 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 max-w-full whitespace-normal break-words text-left text-[11px] leading-snug text-foreground sm:max-w-[min(100%,15rem)] sm:text-right",
          valueClassName
        )}
      >
        {children}
      </span>
    </div>
  );
}

function MetricMini({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border px-1.5 py-1 text-center", className)}>
      <div className="break-words text-[8px] font-semibold uppercase tracking-wide opacity-85">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold tabular-nums leading-snug">{value}</div>
    </div>
  );
}

export function FinanceOperationDetailModal({
  item,
  open,
  onClose,
}: {
  item: FinanceOperationItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const dialogs = useAppDialogsSafe();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [busyAction, setBusyAction] = useState<null | string>(null);
  const [approveAmount, setApproveAmount] = useState<number | null>(null);
  const [approveAmountInput, setApproveAmountInput] = useState<string>("");
  const approveAmountEditedRef = useRef(false);
  const [draftDates, setDraftDates] = useState<Partial<Record<PaymentDateField, string>>>({});
  const [amtDraftStr, setAmtDraftStr] = useState<string | null>(null);
  const [saSheet, setSaSheet] = useState<SaEditSheet>(null);
  const isOpen = Boolean(open && item);

  const paymentActions = useMemo(() => {
    if (!item || item.kind !== "payment") return [];
    const role = user?.role ?? "";
    const canManage = role === "OWNER" || role === "SUPER_ADMIN";
    const canActAsInvestor = role === "INVESTOR" || role === "SUPER_ADMIN";

    const actions: { id: string; label: string; tone?: "danger"; apiAction: string }[] = [];

    if (item.status === "requested" && canManage) {
      actions.push({ id: "owner_approve", label: "Одобрить", apiAction: "owner_approve" });
      actions.push({ id: "owner_reject", label: "Отклонить", tone: "danger", apiAction: "owner_reject" });
    }

    if (item.status === "approved_waiting_accept" && canActAsInvestor) {
      actions.push({ id: "investor_accept", label: "Принять", apiAction: "investor_accept" });
      actions.push({ id: "investor_dispute", label: "Оспорить", tone: "danger", apiAction: "investor_dispute" });
    }

    return actions;
  }, [item, user?.role]);

  const paymentContextQuery = useQuery({
    queryKey:
      item && item.kind === "payment"
        ? (["payments", "context", item.paymentId] as const)
        : (["payments", "context", "none"] as const),
    queryFn: () => {
      const pid = item && item.kind === "payment" ? item.paymentId : 0;
      return apiClient.get<PaymentContextPayload>(
        `/api/payments/context?paymentId=${encodeURIComponent(String(pid))}`
      );
    },
    enabled: Boolean(isOpen && item && item.kind === "payment"),
    staleTime: 15_000,
    refetchInterval: false,
  });
  const paymentContext = paymentContextQuery.data ?? null;

  const paymentTimeline = useMemo((): PaymentTimelineStep[] => {
    if (!item || item.kind !== "payment") return [];
    if (paymentContext?.timeline?.length) return paymentContext.timeline;
    if (paymentContextQuery.isError) return clientTimelineFallback(item);
    // Пока контекст грузится, не держим бессмысленный скелетон — в строке ленты уже есть даты этапов.
    if (paymentContextQuery.isPending) return clientTimelineFallback(item);
    return [];
  }, [item, paymentContext?.timeline, paymentContextQuery.isError, paymentContextQuery.isPending]);

  const amountStoryView = useMemo((): PaymentAmountStory | null => {
    if (!item || item.kind !== "payment") return null;
    if (paymentContext?.amountStory) return paymentContext.amountStory;
    if (paymentContext && !paymentContext.amountStory) {
      const r = moneyRound2(item.amount);
      return {
        finalRecorded: r,
        originalRequested: r,
        ownerApprovedAmount: item.approvedAt ? r : null,
        investorConfirmedAmount: item.acceptedAt ? r : null,
        ownerApproverUsername: null,
        reconstructed: true,
      };
    }
    if (paymentContextQuery.isError || paymentContextQuery.isPending) {
      const r = moneyRound2(item.amount);
      return {
        finalRecorded: r,
        originalRequested: r,
        ownerApprovedAmount: item.approvedAt ? r : null,
        investorConfirmedAmount: item.acceptedAt ? r : null,
        ownerApproverUsername: null,
        reconstructed: true,
      };
    }
    return null;
  }, [item, paymentContext, paymentContext?.amountStory, paymentContextQuery.isError, paymentContextQuery.isPending]);

  const paymentTimelineSkeleton =
    item?.kind === "payment" &&
    paymentContextQuery.isPending &&
    !paymentTimeline.length &&
    !paymentContextQuery.isError;

  const { data: correctionProposals } = useQuery({
    queryKey: paymentCorrectionProposalsQueryKey,
    queryFn: () =>
      apiClient.get<{ outgoing: Array<{ paymentId: number }> }>("/api/payment-correction-proposals"),
    enabled: Boolean(isOpen && item?.kind === "payment" && user?.role === "SUPER_ADMIN"),
    staleTime: 15_000,
  });

  const paymentRowForCorrection = item?.kind === "payment" ? item : null;
  const pendingCorrectionForPayment =
    user?.role === "SUPER_ADMIN" &&
    paymentRowForCorrection != null &&
    (correctionProposals?.outgoing?.some((p) => p.paymentId === paymentRowForCorrection.paymentId) ?? false);

  const createCorrectionMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      new Promise<unknown>((resolve, reject) => {
        const ms = 45_000;
        const t = window.setTimeout(() => reject(new Error(`Нет ответа сервера за ${ms / 1000} с`)), ms);
        void apiClient
          .post("/api/payment-correction-proposals", body)
          .then((v) => {
            window.clearTimeout(t);
            resolve(v);
          })
          .catch((e) => {
            window.clearTimeout(t);
            reject(e instanceof Error ? e : new Error("Не удалось отправить"));
          });
      }),
    meta: { skipErrorToast: true },
    onSuccess: () => {
      toast.success("Запрос отправлен адресату");
      void queryClient.invalidateQueries({ queryKey: paymentCorrectionProposalsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] });
      void queryClient.invalidateQueries({ queryKey: ["investors", "operations-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["investors"] });
      void queryClient.invalidateQueries({ queryKey: ["payments", "context"] });
      setDraftDates({});
      setAmtDraftStr(null);
      setSaSheet(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить");
    },
  });

  const deletePaymentMut = useMutation({
    mutationFn: (paymentId: number) =>
      new Promise<unknown>((resolve, reject) => {
        const ms = 45_000;
        const t = window.setTimeout(() => reject(new Error(`Нет ответа сервера за ${ms / 1000} с`)), ms);
        void apiClient
          .delete(`/api/payments/${paymentId}`)
          .then((v) => {
            window.clearTimeout(t);
            resolve(v);
          })
          .catch((e) => {
            window.clearTimeout(t);
            reject(e instanceof Error ? e : new Error("Не удалось удалить"));
          });
      }),
    meta: { skipErrorToast: true },
    onSuccess: () => {
      toast.success("Операция удалена");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentCorrectionProposalsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] }),
        queryClient.invalidateQueries({ queryKey: ["investors", "operations-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["investors"] }),
        queryClient.invalidateQueries({ queryKey: ["payments", "context"] }),
      ]);
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить");
    },
  });

  const datesDirty =
    item?.kind === "payment"
      ? (["createdAt", "approvedAt", "acceptedAt"] as const).some((f) => {
          const draft = draftDates[f];
          if (draft === undefined) return false;
          return normIsoKey(draft) !== normIsoKey(baselinePaymentIso(item, f));
        })
      : false;

  const amtDraftNum =
    amtDraftStr != null ? moneyRound2(Number(amtDraftStr || 0)) : null;
  const amtDirty =
    item?.kind === "payment" &&
    amtDraftStr != null &&
    amtDraftNum !== moneyRound2(item.amount);

  const saCorrectionEditable =
    user?.role === "SUPER_ADMIN" &&
    item?.kind === "payment" &&
    !pendingCorrectionForPayment &&
    !createCorrectionMut.isPending;

  const saCorrectionDirty = Boolean(item?.kind === "payment" && (datesDirty || amtDirty));

  useEffect(() => {
    approveAmountEditedRef.current = false;
    setComment("");
    setBusyAction(null);
    setApproveAmount(null);
    setApproveAmountInput("");
    setDraftDates({});
    setAmtDraftStr(null);
    setSaSheet(null);
  }, [item?.id]);

  useEffect(() => {
    if (!item || item.kind !== "payment") return;
    if (!paymentContext) return;
    if (approveAmountEditedRef.current) return;
    // По умолчанию: предлагаем максимум, который можно одобрить (<= requested и <= available).
    const next = moneyRound2(paymentContext.limits.maxApprove);
    setApproveAmount(next);
    setApproveAmountInput(next > 0 ? String(next) : "");
  }, [
    item?.kind,
    item?.kind === "payment" ? item.paymentId : undefined,
    paymentContext?.limits?.maxApprove,
    paymentContext?.payment?.requestedAmount,
  ]);

  async function runPaymentAction(apiAction: string) {
    if (!item || item.kind !== "payment") return;
    if (apiAction === "owner_reject" && !comment.trim()) {
      dialogs?.toast.error("Укажите комментарий, чтобы отклонить заявку");
      return;
    }
    setBusyAction(apiAction);
    try {
      const ok =
        apiAction === "owner_reject" || apiAction === "investor_dispute"
          ? await (dialogs?.confirm({
              title: apiAction === "owner_reject" ? "Отклонить заявку?" : "Оспорить выплату?",
              description:
                apiAction === "owner_reject"
                  ? "Комментарий в форме ниже будет сохранён в заявке. Продолжить?"
                  : "Действие зафиксируется в истории. Можно добавить короткий комментарий.",
              confirmLabel: apiAction === "owner_reject" ? "Отклонить" : "Оспорить",
              cancelLabel: "Отмена",
              tone: "danger",
            }) ?? Promise.resolve(true))
          : true;

      if (!ok) return;

      /** Сумма одобрения: всегда из поля ввода (цифры), чтобы не расходилось со state после правок */
      const digitsOnly = approveAmountInput.replace(/\D/g, "");
      const parsedFromInput =
        digitsOnly.length > 0 ? moneyRound2(Number(digitsOnly)) : undefined;
      const approvePayload =
        apiAction === "owner_approve" &&
        parsedFromInput != null &&
        Number.isFinite(parsedFromInput) &&
        parsedFromInput > 0
          ? parsedFromInput
          : undefined;

      await apiClient.post("/api/payments", {
        action: apiAction,
        paymentId: item.paymentId,
        ...(approvePayload != null ? { amount: approvePayload } : {}),
        comment: comment.trim() ? comment.trim() : undefined,
      });

      dialogs?.toast.success("Готово");

      // Не ждём refetch: иначе при «залипшем» запросе спиннер в модалке не снимется (finally выполнится только после await).
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investors", "operations-history"] }),
        queryClient.invalidateQueries({ queryKey: ["investors", "operations-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["investors"] }),
        queryClient.invalidateQueries({ queryKey: ["payments", "context"] }),
      ]);

      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      dialogs?.toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  function openSaAmountEditor() {
    if (!item || item.kind !== "payment") return;
    if (!saCorrectionEditable) {
      if (user?.role === "SUPER_ADMIN" && pendingCorrectionForPayment) {
        toast.info("Уже есть активный запрос правки");
      }
      return;
    }
    setSaSheet({ kind: "amount" });
    setAmtDraftStr((prev) => prev ?? String(Math.round(item.amount)));
  }

  function openSaDateEditor(field: PaymentDateField, referenceIso: string, label: string) {
    if (!item || item.kind !== "payment") return;
    if (!saCorrectionEditable) {
      if (user?.role === "SUPER_ADMIN" && pendingCorrectionForPayment) {
        toast.info("Уже есть активный запрос правки");
      }
      return;
    }
    setSaSheet({ kind: "date", field, referenceIso, label });
  }

  async function confirmDeletePayment() {
    if (!item || item.kind !== "payment") return;
    if (pendingCorrectionForPayment) {
      toast.info("Сначала дождитесь решения по запросу правки");
      return;
    }
    if (item.status === "completed" && item.type === "close") return;

    let description =
      "Запись заявки будет удалена из истории. По позиции остатки не меняются (заявка не была завершена проводкой).";
    if (item.status === "completed" && item.type === "interest") {
      description =
        "Запись исчезнет из истории; сумма вернётся в начисленные проценты по позиции (откат проводки по этой выплате).";
    } else if (item.status === "completed" && item.type === "body") {
      description = "Запись исчезнет из истории; сумма вернётся в тело позиции (откат проводки по этой выплате).";
    }

    const ok =
      (await dialogs?.confirm({
        title: "Удалить операцию?",
        description,
        confirmLabel: "Удалить",
        cancelLabel: "Отмена",
        tone: "danger",
      })) ?? false;
    if (!ok) return;
    deletePaymentMut.mutate(item.paymentId);
  }

  function submitSaInlineCorrection() {
    if (!item || item.kind !== "payment") return;
    if (pendingCorrectionForPayment) return;

    const patchDates: Record<string, string> = {};
    for (const f of ["createdAt", "approvedAt", "acceptedAt"] as const) {
      const draft = draftDates[f];
      if (draft === undefined) continue;
      const base = baselinePaymentIso(item, f);
      if (normIsoKey(draft) !== normIsoKey(base)) patchDates[f] = draft;
    }

    let patchAmount: number | undefined;
    if (amtDraftStr != null) {
      const n = moneyRound2(Number(amtDraftStr || 0));
      if (n !== moneyRound2(item.amount)) patchAmount = n;
    }

    if (Object.keys(patchDates).length === 0 && patchAmount === undefined) return;

    if (patchAmount !== undefined && item.status === "completed") {
      toast.error("Сумму завершённой заявки здесь изменить нельзя");
      return;
    }

    const bits: string[] = [];
    if (Object.keys(patchDates).length > 0) bits.push("даты");
    if (patchAmount !== undefined) bits.push("сумма");
    const note = `Правка заявки #${item.paymentId}: ${bits.join(", ")}`;

    createCorrectionMut.mutate({
      paymentId: item.paymentId,
      mode: "dates_only",
      datesAssigneeRole: "OWNER",
      adminNote: note,
      mergeComment: note,
      ...(Object.keys(patchDates).length > 0 ? { patchDates } : {}),
      ...(patchAmount !== undefined ? { patchAmount } : {}),
    });
  }

  if (!isOpen || !item) return null;

  let title = "Операция";
  if (item.kind === "week_accrual") title = "Начисление за неделю";
  if (item.kind === "payment") title = `${paymentTypeRu(item.type)} · ${item.positionName}`;
  if (item.kind === "topup") title = item.initialFromCreation ? "Тело при создании позиции" : `Пополнение · ${item.positionName}`;

  const paymentStatusCaption = (() => {
    if (item.kind !== "payment") return null;
    const role = user?.role ?? "";
    if (item.status === "requested" && (role === "OWNER" || role === "SUPER_ADMIN")) {
      return "Требует вашего решения";
    }
    if (item.status === "approved_waiting_accept" && (role === "INVESTOR" || role === "SUPER_ADMIN")) {
      return "Требует вашего подтверждения";
    }
    return paymentStatusRu(item.status);
  })();

  const paymentStatusIsActionHighlight =
    item.kind === "payment" &&
    ((item.status === "requested" && (user?.role === "OWNER" || user?.role === "SUPER_ADMIN")) ||
      (item.status === "approved_waiting_accept" && (user?.role === "INVESTOR" || user?.role === "SUPER_ADMIN")));

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={cn(
        "mx-auto max-h-[min(92dvh,680px)] w-[min(100%,calc(100vw-1.25rem))] max-w-[26rem] overflow-hidden sm:mx-4 sm:max-w-[28rem]",
        "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25"
      )}
      backdropClassName="bg-black/70 [@supports(backdrop-filter:blur(1px))]:bg-black/55"
    >
      <div
        className={cn(
          "thai-glass flex max-h-[inherit] flex-col overflow-hidden rounded-2xl border shadow-[0_24px_70px_-44px_rgba(0,0,0,0.85)]",
          "ring-1 ring-white/5 dark:ring-white/7"
        )}
        style={premiumChromeStyle()}
      >
        <div className="relative shrink-0 border-b border-border/15 px-3 pb-2 pt-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(85% 65% at 20% 0%, rgba(250, 204, 21, 0.05), transparent 58%), radial-gradient(75% 55% at 100% 0%, rgba(148, 163, 184, 0.07), transparent 55%)",
            }}
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 pr-1">
              <Text className="text-[14px] font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere] sm:line-clamp-4">
                {title}
              </Text>
              <Text className="mt-0.5 text-[10px] leading-snug text-muted-foreground">Карточка операции</Text>
            </div>
            <button
              type="button"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/35 bg-background/15 text-muted-foreground",
                "transition hover:bg-muted/25 hover:text-foreground active:bg-muted/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2">
          {item.kind === "week_accrual" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                Проценты за торговую неделю по ставке сети · суммы ниже по этой неделе.
              </p>
              <div className="flex items-center justify-between rounded-lg border border-violet-400/25 bg-violet-500/10 px-2 py-1">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-200/80">Неделя</span>
                <span className="text-[11px] font-semibold tabular-nums text-violet-100">
                  {formatDateShort(item.weekStart)} — {formatDateShort(item.weekEnd)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/12 px-2 py-1.5">
                  <div className="text-[9px] font-semibold uppercase text-emerald-200/85">Начислено</div>
                  <div className="text-[14px] font-bold tabular-nums leading-none text-emerald-300">{formatCurrency(item.accrued)}</div>
                </div>
                <div className="rounded-lg border border-sky-400/30 bg-sky-500/12 px-2 py-1.5">
                  <div className="text-[9px] font-semibold uppercase text-sky-200/85">Выплачено</div>
                  <div className="text-[14px] font-bold tabular-nums leading-none text-sky-200">{formatCurrency(item.paidTotal)}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <MetricMini
                  label="Из %"
                  value={formatCurrency(item.paidInterest)}
                  className="border-amber-400/28 bg-amber-500/12 text-amber-100"
                />
                <MetricMini
                  label="Тело"
                  value={formatCurrency(item.paidBody)}
                  className="border-orange-400/28 bg-orange-500/12 text-orange-100"
                />
                <MetricMini
                  label="Закр."
                  value={formatCurrency(item.paidClose)}
                  className="border-rose-400/28 bg-rose-500/12 text-rose-100"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/15 pt-1.5 text-[9px] text-muted-foreground">
                {item.networkRatePercent != null ? (
                  <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 font-medium tabular-nums text-fuchsia-200">
                    Сеть {item.networkRatePercent.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}% / нед
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium",
                    item.syntheticOpen ? "bg-cyan-500/15 text-cyan-200" : "bg-zinc-500/15 text-zinc-300"
                  )}
                >
                  {item.syntheticOpen ? "Открытая неделя" : "Закрытая неделя"}
                </span>
                <span className="tabular-nums">{formatDateTime(item.sortAt)}</span>
              </div>
            </div>
          ) : null}

          {item.kind === "payment" ? (
            <div className="flex flex-col gap-3">
              {user?.role === "SUPER_ADMIN" && pendingCorrectionForPayment ? (
                <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-900 dark:text-amber-200">
                  По этой заявке уже есть активный запрос правки. Редактирование недоступно до решения адресата.
                </p>
              ) : null}
              {paymentContextQuery.isPending && !amountStoryView ? (
                <div className="space-y-1.5 border-b border-border/20 pb-2">
                  <div className="h-2 w-24 animate-pulse rounded bg-muted/25" />
                  <div className="h-3.5 w-full max-w-[17rem] animate-pulse rounded bg-muted/15" />
                  <div className="h-6 w-32 animate-pulse rounded bg-muted/18" />
                </div>
              ) : amountStoryView ? (
                <div className="space-y-2 border-b border-border/20 pb-2.5">
                  <dl className="space-y-1.5 text-[11px] leading-snug tabular-nums">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Подача
                      </dt>
                      <dd className="min-w-0 text-right font-semibold text-foreground">
                        {user?.role === "SUPER_ADMIN" ? (
                          <button
                            type="button"
                            disabled={!saCorrectionEditable}
                            onClick={openSaAmountEditor}
                            className={cn(
                              "text-right font-semibold text-foreground",
                              saCorrectionEditable &&
                                "cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/55 underline-offset-2 hover:bg-muted/15",
                              !saCorrectionEditable && "opacity-80"
                            )}
                          >
                            {formatCurrency(amountStoryView.originalRequested ?? amountStoryView.finalRecorded)}
                          </button>
                        ) : (
                          formatCurrency(amountStoryView.originalRequested ?? amountStoryView.finalRecorded)
                        )}
                      </dd>
                    </div>
                    {amountStoryView.ownerApprovedAmount != null ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="min-w-0 shrink text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Одобр.
                          {amountStoryView.ownerApproverUsername ? ` ${amountStoryView.ownerApproverUsername}` : ""}
                        </dt>
                        <dd
                          className={cn(
                            "shrink-0 text-right font-semibold tabular-nums",
                            amountStoryView.originalRequested != null &&
                              amountStoryView.ownerApprovedAmount !== amountStoryView.originalRequested
                              ? "text-amber-800 dark:text-amber-400"
                              : "text-blue-800 dark:text-blue-200"
                          )}
                        >
                          {user?.role === "SUPER_ADMIN" ? (
                            <button
                              type="button"
                              disabled={!saCorrectionEditable}
                              onClick={openSaAmountEditor}
                              className={cn(
                                "text-right font-semibold tabular-nums",
                                amountStoryView.originalRequested != null &&
                                  amountStoryView.ownerApprovedAmount !== amountStoryView.originalRequested
                                  ? "text-amber-800 dark:text-amber-400"
                                  : "text-blue-800 dark:text-blue-200",
                                saCorrectionEditable &&
                                  "cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/55 underline-offset-2 hover:bg-muted/15",
                                !saCorrectionEditable && "opacity-80"
                              )}
                            >
                              {formatCurrency(amountStoryView.ownerApprovedAmount)}
                            </button>
                          ) : (
                            formatCurrency(amountStoryView.ownerApprovedAmount)
                          )}
                          {amountStoryView.originalRequested != null &&
                          amountStoryView.ownerApprovedAmount !== amountStoryView.originalRequested ? (
                            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground tabular-nums">
                              ← {formatCurrency(amountStoryView.originalRequested)}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {amountStoryView.investorConfirmedAmount != null ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Принято
                        </dt>
                        <dd className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {user?.role === "SUPER_ADMIN" ? (
                            <button
                              type="button"
                              disabled={!saCorrectionEditable}
                              onClick={openSaAmountEditor}
                              className={cn(
                                "text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400",
                                saCorrectionEditable &&
                                  "cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/55 underline-offset-2 hover:bg-muted/15",
                                !saCorrectionEditable && "opacity-80"
                              )}
                            >
                              {formatCurrency(amountStoryView.investorConfirmedAmount)}
                            </button>
                          ) : (
                            formatCurrency(amountStoryView.investorConfirmedAmount)
                          )}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-0 border-t border-border/15 pt-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Итог · {paymentTypeRu(item.type)}
                    </span>
                    {user?.role === "SUPER_ADMIN" ? (
                      <button
                        type="button"
                        disabled={!saCorrectionEditable}
                        onClick={openSaAmountEditor}
                        className={cn(
                          "text-[1.3rem] font-bold tabular-nums leading-none tracking-tight sm:text-[1.4rem]",
                          item.status === "completed"
                            ? "text-[color:var(--thai-color-paid)]"
                            : "thai-dashboard-premium-gold-amount",
                          saCorrectionEditable &&
                            "cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/55 underline-offset-4 hover:bg-muted/15",
                          !saCorrectionEditable && "opacity-80"
                        )}
                      >
                        {formatCurrency(
                          amtDraftStr != null ? moneyRound2(Number(amtDraftStr || 0)) : amountStoryView.finalRecorded
                        )}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "text-[1.3rem] font-bold tabular-nums leading-none tracking-tight sm:text-[1.4rem]",
                          item.status === "completed"
                            ? "text-[color:var(--thai-color-paid)]"
                            : "thai-dashboard-premium-gold-amount"
                        )}
                      >
                        {formatCurrency(amountStoryView.finalRecorded)}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 border-b border-border/20 pb-2.5">
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide">
                  <span className="font-semibold text-muted-foreground">Этапы</span>
                  <span
                    className={cn(
                      "max-w-[70%] text-right normal-case tracking-normal",
                      paymentStatusCaptionClass(item.status, paymentStatusIsActionHighlight)
                    )}
                  >
                    {paymentStatusCaption ?? paymentStatusRu(item.status)}
                  </span>
                </div>

                {paymentTimelineSkeleton ? (
                  <div className="space-y-2 pt-0.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="border-l-2 border-border/25 pl-2.5">
                        <div className="h-3 w-full max-w-[16rem] animate-pulse rounded bg-muted/18" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1.5 pt-0.5">
                    {paymentTimeline.map((step, idx) => {
                      const dateField = timelineKindToPaymentDateField(step.kind);
                      const stepIso =
                        dateField != null && draftDates[dateField] !== undefined ? draftDates[dateField]! : step.at;
                      return (
                        <li key={`${step.at}-${step.kind}-${idx}`}>
                          <div
                            className={cn(
                              paymentStepAccentBorder(step.kind),
                              "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] tabular-nums leading-snug"
                            )}
                          >
                            <span className="w-[1.25rem] shrink-0 text-center font-mono text-[10px] font-medium text-muted-foreground">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className={cn("shrink-0 font-semibold tracking-tight", paymentStepTitleClass(step.kind))}>
                              {step.title}
                            </span>
                            <span className="text-muted-foreground/80">·</span>
                            <span className="min-w-0 truncate font-medium text-foreground">{step.actorUsername}</span>
                            <span className="text-muted-foreground/80">·</span>
                            {user?.role === "SUPER_ADMIN" && dateField != null ? (
                              <button
                                type="button"
                                disabled={!saCorrectionEditable}
                                onClick={() =>
                                  openSaDateEditor(dateField, step.at, `${step.title} · дата и время`)
                                }
                                className={cn(
                                  "shrink-0 whitespace-nowrap text-[10px] text-muted-foreground",
                                  saCorrectionEditable &&
                                    "cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 hover:bg-muted/15 hover:text-foreground",
                                  !saCorrectionEditable && "opacity-80"
                                )}
                              >
                                <time dateTime={stepIso}>{formatDateTime(stepIso)}</time>
                              </button>
                            ) : (
                              <time
                                className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground"
                                dateTime={stepIso}
                              >
                                {formatDateTime(stepIso)}
                              </time>
                            )}
                            {step.stepAmount != null ? (
                              <>
                                <span className="text-muted-foreground/80">·</span>
                                {user?.role === "SUPER_ADMIN" ? (
                                  <button
                                    type="button"
                                    disabled={!saCorrectionEditable || item.status === "completed"}
                                    onClick={openSaAmountEditor}
                                    title={
                                      item.status === "completed"
                                        ? "Сумму завершённой заявки здесь изменить нельзя"
                                        : undefined
                                    }
                                    className={cn(
                                      "shrink-0 bg-transparent p-0 font-[inherit]",
                                      paymentStepAmountClass(step.kind),
                                      saCorrectionEditable &&
                                        item.status !== "completed" &&
                                        "cursor-pointer rounded-sm underline decoration-dotted decoration-muted-foreground/55 underline-offset-2 hover:bg-muted/15",
                                      (!saCorrectionEditable || item.status === "completed") && "opacity-80"
                                    )}
                                  >
                                    {formatCurrency(step.stepAmount)}
                                  </button>
                                ) : (
                                  <span className={cn("shrink-0", paymentStepAmountClass(step.kind))}>
                                    {formatCurrency(step.stepAmount)}
                                  </span>
                                )}
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {paymentContext ? (
                <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-b border-border/15 pb-3 text-center text-[11px] leading-snug">
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums text-sky-800 dark:text-sky-400">
                      {formatCurrency(paymentContext.limits.availableNow)}
                    </div>
                    <div className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Доступно
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(paymentContext.payment.requestedAmount)}
                    </div>
                    <div className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      В заявке сейчас
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium tabular-nums text-muted-foreground">
                      {formatCurrency(paymentContext.position.body + paymentContext.position.accrued)}
                    </div>
                    <div className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Всего по позиции
                    </div>
                  </div>
                </div>
              ) : item.status === "requested" || item.status === "approved_waiting_accept" ? (
                <div className="grid grid-cols-3 gap-x-2 border-b border-border/15 pb-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="h-4 w-[4.5rem] max-w-full animate-pulse rounded bg-muted/18" />
                      <div className="h-2 w-12 animate-pulse rounded bg-muted/12" />
                    </div>
                  ))}
                </div>
              ) : null}

              {user?.role === "SUPER_ADMIN" && saSheet?.kind === "date" ? (
                <div className="space-y-2 rounded-xl border border-primary/28 bg-background/25 px-2 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-medium leading-snug text-muted-foreground">{saSheet.label}</p>
                    <button
                      type="button"
                      onClick={() => setSaSheet(null)}
                      className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      Скрыть
                    </button>
                  </div>
                  <DatePicker
                    value={isoToYmdUtc(draftDates[saSheet.field] ?? saSheet.referenceIso)}
                    onChange={(ymd) => {
                      if (!ymd.trim()) {
                        setDraftDates((prev) => {
                          const next = { ...prev };
                          delete next[saSheet.field];
                          return next;
                        });
                        return;
                      }
                      const baseIso = draftDates[saSheet.field] ?? saSheet.referenceIso;
                      setDraftDates((prev) => ({
                        ...prev,
                        [saSheet.field]: mergeYmdIntoUtcIsoPreservingTime(ymd, baseIso),
                      }));
                    }}
                    placeholder="Дата"
                  />
                  <p className="text-[9px] leading-snug text-muted-foreground">
                    Время суток сохраняется от исходной отметки; меняется только календарная дата (как в остальных формах).
                  </p>
                </div>
              ) : null}

              {user?.role === "SUPER_ADMIN" && saSheet?.kind === "amount" ? (
                <div className="space-y-2 rounded-xl border border-primary/28 bg-background/25 px-2 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-medium text-muted-foreground">Сумма в записи заявки</p>
                    <button
                      type="button"
                      onClick={() => setSaSheet(null)}
                      className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                      Скрыть
                    </button>
                  </div>
                  <label className="sr-only" htmlFor="finance-sa-amt-draft">
                    Сумма заявки
                  </label>
                  <input
                    id="finance-sa-amt-draft"
                    value={amtDraftStr ?? ""}
                    onChange={(e) => setAmtDraftStr(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    disabled={item.status === "completed"}
                    placeholder="Сумма"
                    className={cn(
                      "h-9 w-full rounded-xl border border-border/45 bg-transparent px-3",
                      "text-[12px] font-semibold tabular-nums text-foreground outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  />
                  {item.status === "completed" ? (
                    <p className="text-[9px] text-rose-700 dark:text-rose-400">
                      Сумму завершённой заявки здесь не меняем. Если запись лишняя — удалите операцию кнопкой ниже (для
                      процентов и тела проводка откатится).
                    </p>
                  ) : null}
                </div>
              ) : null}

              {user?.role === "SUPER_ADMIN" && saCorrectionDirty && saCorrectionEditable ? (
                <div className="flex items-center justify-end gap-2 border-b border-border/15 pb-2.5 pt-0.5">
                  <button
                    type="button"
                    disabled={createCorrectionMut.isPending}
                    onClick={() => void submitSaInlineCorrection()}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-primary/15 text-primary transition",
                      "hover:bg-primary/25 disabled:pointer-events-none disabled:opacity-35",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                    aria-label="Отправить правку на согласование"
                    title="Отправить правку на согласование"
                  >
                    {createCorrectionMut.isPending ? (
                      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-primary/35 border-t-transparent" />
                    ) : (
                      <Check className="h-5 w-5" strokeWidth={2.4} aria-hidden />
                    )}
                  </button>
                </div>
              ) : null}

              {user?.role === "SUPER_ADMIN" ? (
                <div className="space-y-1 border-b border-border/15 pb-2.5">
                  <button
                    type="button"
                    disabled={
                      pendingCorrectionForPayment ||
                      deletePaymentMut.isPending ||
                      createCorrectionMut.isPending ||
                      (item.status === "completed" && item.type === "close")
                    }
                    onClick={() => void confirmDeletePayment()}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide transition",
                      item.status === "completed" && item.type === "close"
                        ? "cursor-not-allowed text-muted-foreground/45"
                        : "text-rose-700/95 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
                    )}
                  >
                    {deletePaymentMut.isPending ? (
                      <span className="inline-flex h-3 w-3 animate-spin rounded-full border border-rose-400/40 border-t-transparent" />
                    ) : (
                      <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    )}
                    Удалить операцию
                  </button>
                  {item.status === "completed" && item.type === "close" ? (
                    <p className="text-[9px] leading-snug text-muted-foreground">
                      Завершённое закрытие позиции из базы так не удаляем — нельзя автоматически восстановить тело и проценты.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {item.comment ? (
                <div className="space-y-1.5 border-t border-border/15 pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Комментарий к заявке
                  </p>
                  <p className="text-[11px] leading-relaxed text-foreground [overflow-wrap:anywhere]">{item.comment}</p>
                </div>
              ) : null}

              {paymentActions.length > 0 ? (
                <div className="space-y-2 border-t border-border/15 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Требует действия</span>
                    <span className="text-[9px] text-muted-foreground">1 шаг</span>
                  </div>

                  {paymentContext && item.status === "requested" && (user?.role === "OWNER" || user?.role === "SUPER_ADMIN") ? (
                    <div className="mt-2">
                      <label className="sr-only" htmlFor="finance-op-approve-amt">
                        Сумма одобрения
                      </label>
                      <input
                        id="finance-op-approve-amt"
                        value={approveAmountInput}
                        onChange={(e) => {
                          approveAmountEditedRef.current = true;
                          const v = e.target.value.replace(/\D/g, "");
                          setApproveAmountInput(v);
                          const n = Number(v);
                          if (!v) {
                            setApproveAmount(null);
                            return;
                          }
                          if (!Number.isFinite(n)) return;
                          setApproveAmount(moneyRound2(n));
                        }}
                        inputMode="numeric"
                        placeholder={
                          paymentContext.limits.maxApprove > 0
                            ? `До ${formatCurrency(paymentContext.limits.maxApprove)}`
                            : "Сумма"
                        }
                        className={cn(
                          "h-9 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--thai-color-due)_35%,transparent)] bg-transparent px-3",
                          "text-[11px] font-semibold tabular-nums text-foreground placeholder:text-muted-foreground/70",
                          "outline-none transition",
                          "focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_45%,transparent)]"
                        )}
                      />
                    </div>
                  ) : null}

                  <div className="mt-2">
                    <label className="sr-only" htmlFor="finance-op-comment">
                      Комментарий
                    </label>
                    <textarea
                      id="finance-op-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={
                        paymentActions.some((a) => a.apiAction === "owner_reject")
                          ? "При отклонении заявки комментарий обязателен"
                          : "Комментарий (необязательно)"
                      }
                      rows={2}
                      className={cn(
                        "min-h-[2.75rem] w-full resize-y rounded-xl border border-[color:color-mix(in_srgb,var(--thai-color-card-border)_100%,transparent)] bg-transparent px-3 py-2",
                        "text-[10px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 [overflow-wrap:anywhere]",
                        "outline-none transition",
                        "focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--thai-color-accrued)_45%,transparent)]"
                      )}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {paymentActions.map((a) => {
                      const danger = a.tone === "danger";
                      const isApprove = a.apiAction === "owner_approve" || a.apiAction === "investor_accept";
                      const rejectBlocked = a.apiAction === "owner_reject" && !comment.trim();
                      const disabled = busyAction != null || rejectBlocked;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => void runPaymentAction(a.apiAction)}
                          className={cn(
                            "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                            "bg-transparent text-muted-foreground",
                            danger
                              ? "hover:bg-[color-mix(in_srgb,var(--thai-color-rejected-bg)_160%,transparent)] hover:text-[color:var(--thai-color-rejected)]"
                              : "hover:bg-white/[0.06] hover:text-[color:var(--thai-color-accrued)]",
                            "active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            busyAction === a.apiAction && "opacity-60",
                            disabled && "pointer-events-none opacity-35 hover:bg-transparent hover:text-muted-foreground"
                          )}
                          aria-label={a.label}
                          title={rejectBlocked ? "Сначала укажите комментарий" : a.label}
                        >
                          {busyAction === a.apiAction ? (
                            <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/35 border-t-transparent" />
                          ) : isApprove ? (
                            <Check className="h-4 w-4" strokeWidth={2.3} aria-hidden />
                          ) : (
                            <ShieldX className="h-4 w-4" strokeWidth={2.3} aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {item.kind === "topup" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                {item.initialFromCreation ? "Тело при создании позиции." : "Пополнение тела по заявке."}
              </p>
              <div className="rounded-lg border border-teal-400/30 bg-teal-500/12 px-2 py-1.5">
                <div className="text-[9px] font-semibold uppercase text-muted-foreground">Сумма</div>
                <div className="text-[15px] font-bold tabular-nums leading-none text-teal-200">{formatCurrency(item.amount)}</div>
              </div>
              <div className="grid grid-cols-1 gap-0.5 rounded-lg border border-border/20 bg-background/10 px-2 py-1.5">
                <Kv label="Позиция" valueClassName="text-violet-200">
                  {item.positionName}
                </Kv>
                <Kv label="Статус" valueClassName="text-cyan-200">
                  {topUpStatusRu(item.status)}
                </Kv>
                {item.comment ? (
                  <Kv label="Комментарий" valueClassName="line-clamp-3 text-[10px] font-normal">
                    {item.comment}
                  </Kv>
                ) : null}
                {item.entryDate ? <Kv label="Вход">{formatDateShort(item.entryDate)}</Kv> : null}
                {item.activationDate ? <Kv label="Активация">{formatDateShort(item.activationDate)}</Kv> : null}
                <Kv label="Создано">{formatDateTime(item.createdAt)}</Kv>
                {item.decidedAt ? <Kv label="Решение">{formatDateTime(item.decidedAt)}</Kv> : null}
              </div>
              <div className="flex flex-wrap gap-x-2 text-[9px] tabular-nums text-muted-foreground">
                <span className="rounded bg-zinc-500/15 px-1 py-0.5">Поз. #{item.investorId}</span>
                <span className="rounded bg-zinc-500/15 px-1 py-0.5">Заявка #{item.requestId}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
