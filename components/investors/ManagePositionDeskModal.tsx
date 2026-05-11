"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  AtSign,
  Banknote,
  CalendarClock,
  Check,
  ChevronDown,
  Coins,
  Globe2,
  Info,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  Percent,
  Phone,
  User,
  Wallet,
  X,
} from "lucide-react";

import { InvestDeskModalShell } from "@/components/investors/InvestDeskModalShell";
import { DatePicker } from "@/components/ui/DatePicker";
import { Text } from "@/components/ui/Text";
import { apiClient } from "@/lib/api-client";
import { investDeskModalEmphasisClass, investDeskModalFigureClass } from "@/lib/dashboard-glass-accent";
import type { PrivateInvestorCreateContext } from "@/lib/private-investor-create-context";
import { getNextMonday, startOfDay } from "@/lib/weekly";
import { cn, formatCurrency } from "@/lib/utils";

export type InvestorForm = {
  name: string;
  handle: string;
  phone: string;
  body: string;
  rate: string;
  entryDate: string;
  isPrivate: boolean;
};

type BusinessRateHint = {
  rate: number;
  effectiveDate: string;
};

/** Иконки без фона и обводки — только смена цвета при наведении. */
const deskGhostRound =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground outline-none transition " +
  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-35";

const deskGhostRoundDanger = "hover:text-red-400";

/** Поля модалки: крупнее и без «клинического» белого. */
export const deskFieldInputClass =
  "w-full bg-transparent text-[15px] leading-snug outline-none text-slate-800 placeholder:text-slate-500/75 dark:text-slate-100 dark:placeholder:text-slate-500/50";

export const investorDeskCardShellClass = cn(
  "border-violet-200/45 bg-gradient-to-b from-violet-50/30 via-card to-card shadow-xl",
  "dark:border-violet-500/[0.14] dark:from-[#1c1c2e] dark:via-[#15151f] dark:to-[#111118] dark:shadow-[0_28px_56px_-28px_rgba(0,0,0,0.75)]"
);

/** ДД.ММ.ГГ из локальной даты */
function formatLocalDdMmYy(d: Date) {
  const day = d.getDate().toString().padStart(2, "0");
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const y = String(d.getFullYear()).slice(-2);
  return `${day}.${mo}.${y}`;
}

/** YYYY-MM-DD → локальная полночь или null */
function parseYmdLocal(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return startOfDay(dt);
}

/**
 * Пн активации карточки (как в API создания). Неделя 30.03–05.04 при входе 24.03 — первая «учётная» после входа.
 */
function activationMondayLocal(entryYmd: string): Date | null {
  const entry = parseYmdLocal(entryYmd);
  if (!entry) return null;
  return getNextMonday(entry);
}

/**
 * Пн первой недели в сводке деска: **следующий** пн после недели активации (активация + 7 дн.).
 * Показывает период уже под ставкой, действующей с пн активации (напр. 5% с 30.03 → первая строка 06.04–12.04).
 * Леджер в БД по-прежнему может вестись с пн активации — здесь только превью формы.
 */
function deskFirstShownWeekMonday(entryYmd: string): Date | null {
  const activationMon = activationMondayLocal(entryYmd);
  if (!activationMon) return null;
  const d = new Date(activationMon);
  d.setDate(activationMon.getDate() + 7);
  return d;
}

function getDeskFirstShownWeekRangeDdMmYy(entryYmd: string) {
  const monday = deskFirstShownWeekMonday(entryYmd);
  if (!monday) return "…";
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${formatLocalDdMmYy(monday)} — ${formatLocalDdMmYy(sunday)}`;
}

/** Выплата % за эту показанную неделю — пн после её воскресенья. */
function firstPayoutMondayAfterDeskShownWeek(entryYmd: string): Date | null {
  const start = deskFirstShownWeekMonday(entryYmd);
  if (!start) return null;
  const payout = new Date(start);
  payout.setDate(start.getDate() + 7);
  return payout;
}

/** Оценка процентов за неделю: месячная ставка сети / 4, как в `buildWeeklyLedgerRows` для общей сети */
function estimateWeeklyInterestThb(body: number, businessRatePercentPerMonth: number) {
  if (body <= 0 || businessRatePercentPerMonth <= 0) return 0;
  const weeklyPercent = businessRatePercentPerMonth / 4;
  return (body * weeklyPercent) / 100;
}

function formatRateDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** «·» в календаре: вход; пн/вс недели активации; пн/вс недели из сводки; выплата %; строка ставки в журнале. */
function commonNetworkDeskCalendarHighlights(entryYmd: string, effectiveIso?: string | null) {
  const out = new Set<string>();
  if (entryYmd) out.add(entryYmd);
  if (effectiveIso) {
    const y = effectiveIso.split("T")[0];
    if (y) out.add(y);
  }
  const entry = parseYmdLocal(entryYmd);
  if (entry) {
    const actMon = getNextMonday(entry);
    const actSun = new Date(actMon);
    actSun.setDate(actMon.getDate() + 6);
    out.add(toYmdLocal(actMon));
    out.add(toYmdLocal(actSun));

    const shownMon = deskFirstShownWeekMonday(entryYmd);
    if (shownMon) {
      const shownSun = new Date(shownMon);
      shownSun.setDate(shownMon.getDate() + 6);
      out.add(toYmdLocal(shownMon));
      out.add(toYmdLocal(shownSun));
    }
    const pay = firstPayoutMondayAfterDeskShownWeek(entryYmd);
    if (pay) out.add(toYmdLocal(pay));
  }
  return [...out];
}

function parseAmountInput(value: string) {
  return Number(value.replace(/[^\d]/g, ""));
}

function formatAmountInput(value: string) {
  const amount = parseAmountInput(value);
  if (!amount) return "";
  return `${amount.toLocaleString("ru-RU")} ฿`;
}

type DeskFieldTone = "neutral" | "violet" | "sky" | "amber";

export function DeskInlineField({
  icon: Icon,
  children,
  className,
  tone = "neutral",
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  tone?: DeskFieldTone;
}) {
  const toneBorder = {
    neutral:
      "border-border/30 focus-within:border-primary/45 dark:border-white/[0.08]",
    violet:
      "border-violet-500/25 focus-within:border-violet-400/55 dark:border-violet-400/20",
    sky: "border-sky-500/25 focus-within:border-sky-400/50 dark:border-sky-400/18",
    amber:
      "border-amber-500/30 focus-within:border-amber-400/55 dark:border-amber-400/22",
  }[tone];
  const toneIcon = {
    neutral: "text-muted-foreground opacity-[0.72]",
    violet: "text-violet-500/90 dark:text-violet-300/85",
    sky: "text-sky-600/90 dark:text-sky-300/80",
    amber: "text-amber-600/95 dark:text-amber-400/88",
  }[tone];

  return (
    <label
      className={cn(
        "flex min-h-[2.35rem] cursor-text items-center gap-2.5 border-b pb-1 pt-0.5 transition-colors",
        toneBorder,
        className
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", toneIcon)} strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function DeskIconSeg({
  pressed,
  onClick,
  disabled,
  title,
  children,
  "aria-label": ariaLabel,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        deskGhostRound,
        "h-9 w-9",
        pressed && "text-violet-600 dark:text-emerald-400"
      )}
    >
      {children}
    </button>
  );
}

type CreateModeProps = {
  mode: "create_investor";
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  formData: InvestorForm;
  setFormData: (data: InvestorForm) => void;
  userRole?: string;
  loading?: boolean;
  error?: string;
  privateContext?: PrivateInvestorCreateContext | null;
  privateContextLoading?: boolean;
  businessCurrent?: BusinessRateHint | null;
  businessNext?: BusinessRateHint | null;
};

export type LinkSelfFormState = {
  name: string;
  handle: string;
  phone: string;
  body: string;
  /** Подставляется из ставки сети на дату входа (как в «Новой карточке»). */
  rate: string;
  entryDate: string;
  allowMultiple: boolean;
};

type LinkSelfModeProps = {
  mode: "link_self";
  open: boolean;
  onClose: () => void;
  actorUsername: string;
  ownerUsername: string | null;
  form: LinkSelfFormState;
  setForm: Dispatch<SetStateAction<LinkSelfFormState>>;
  onSubmit: () => void;
  loading: boolean;
  systemReady: boolean;
  submitDisabled?: boolean;
  error?: string;
  /** Роль для ключа запроса ставки (`GET /api/system/business-rate`). */
  userRole?: string;
};

type BodyTopUpModeProps = {
  mode: "body_topup";
  open: boolean;
  onClose: () => void;
  positionLabel: string;
  currentBody: number;
  amount: string;
  setAmount: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
};

export type ManagePositionDeskModalProps = CreateModeProps | LinkSelfModeProps | BodyTopUpModeProps;

function CreateInvestorContent(p: CreateModeProps) {
  const {
    formData,
    setFormData,
    userRole,
    loading,
    error,
    privateContext,
    privateContextLoading,
    businessCurrent,
    businessNext,
    onSubmit,
    onClose,
  } = p;

  const typedBody = parseAmountInput(formData.body);
  const privateOver =
    privateContext?.ok === true && typedBody > 0 && typedBody > privateContext.remainingForPrivate;

  const commonNetworkAutoRate = !formData.isPrivate && (userRole === "OWNER" || userRole === "SUPER_ADMIN");

  const { data: rateAtEntryRes, isPending: rateAtEntryPending } = useQuery({
    queryKey: ["business-rate-at-entry", formData.entryDate, userRole],
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number; effectiveDate: string } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(formData.entryDate)}`
      ),
    enabled: p.open && commonNetworkAutoRate && Boolean(formData.entryDate),
    staleTime: 30_000,
  });

  const showNetworkSwitcher = userRole === "SUPER_ADMIN";
  const showScheduleHints = userRole === "SUPER_ADMIN" && formData.isPrivate && (businessCurrent || businessNext);

  const submitBlocked =
    loading ||
    privateOver ||
    (commonNetworkAutoRate && (rateAtEntryPending || !rateAtEntryRes?.current));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {showNetworkSwitcher ? (
        <div className="flex items-center justify-center gap-0.5" role="group" aria-label="Тип сети">
          <DeskIconSeg
            pressed={!formData.isPrivate}
            disabled={loading}
            title="Общая сеть — видна владельцу учёта"
            aria-label="Общая сеть"
            onClick={() => setFormData({ ...formData, isPrivate: false })}
          >
            <Globe2 className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
          </DeskIconSeg>
          <DeskIconSeg
            pressed={formData.isPrivate}
            disabled={loading}
            title="Личная сеть — только в вашем реестре"
            aria-label="Личная сеть"
            onClick={() => setFormData({ ...formData, isPrivate: true })}
          >
            <Lock className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
          </DeskIconSeg>
        </div>
      ) : null}

      {formData.isPrivate && showNetworkSwitcher ? (
        <div className="space-y-1.5">
          {privateContextLoading ? (
            <div className="flex justify-center py-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground opacity-70" aria-hidden />
            </div>
          ) : privateContext && !privateContext.ok ? (
            <div className="flex items-center justify-center gap-1.5 text-center text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>{privateContext.message}</span>
            </div>
          ) : privateContext?.ok ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span
                  className="inline-flex items-center gap-1 tabular-nums"
                  title={`Опора · ${privateContext.commonInvestorName}`}
                >
                  <Coins className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <span className={investDeskModalFigureClass}>{formatCurrency(privateContext.commonBody)}</span>
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums" title="Доступно для личной сети">
                  <Wallet className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <span
                    className={cn(
                      investDeskModalFigureClass,
                      privateOver && "text-red-400 dark:text-red-400/90"
                    )}
                  >
                    {formatCurrency(privateContext.remainingForPrivate)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums" title="Ставка новой карточки / мес">
                  <Percent className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <span className={investDeskModalFigureClass}>{privateContext.privateAppliedRatePercent}%</span>
                </span>
              </div>
              {privateOver ? (
                <div className="flex justify-center" title="Превышен лимит">
                  <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden />
                </div>
              ) : null}
              <details className="group text-[10px] text-muted-foreground">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-1 py-0.5 marker:content-none [&::-webkit-details-marker]:hidden">
                  <Info className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <ChevronDown className="h-3 w-3 opacity-50 transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-1.5 space-y-1 border-t border-border/25 pt-2 text-center leading-snug dark:border-white/[0.06]">
                  <p>
                    Опора «{privateContext.commonInvestorName}» · ставка общей позиции{" "}
                    <span className={cn("tabular-nums", investDeskModalFigureClass)}>{privateContext.commonRatePercent}%</span>
                  </p>
                  <p>
                    Уже в личной сети:{" "}
                    <span className={cn("tabular-nums", investDeskModalFigureClass)}>
                      {formatCurrency(privateContext.privateBodiesTotal)}
                    </span>
                  </p>
                </div>
              </details>
            </>
          ) : (
            <Text className="text-center text-[10px] text-muted-foreground">Нет данных лимита.</Text>
          )}
        </div>
      ) : null}

      {showScheduleHints ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none justify-center marker:content-none [&::-webkit-details-marker]:hidden">
            <span
              className={cn(deskGhostRound, "h-8 w-8")}
              title="График бизнес-ставки"
              aria-hidden
            >
              <CalendarClock className="h-4 w-4" strokeWidth={2} />
            </span>
          </summary>
          <div className="mt-2 space-y-1.5 border-t border-border/25 pt-2 text-[10px] leading-snug text-muted-foreground dark:border-white/[0.06]">
            {businessCurrent ? (
              <p className="text-center">
                Сейчас <span className={cn("tabular-nums", investDeskModalFigureClass)}>{businessCurrent.rate}%</span> ·{" "}
                {formatRateDate(businessCurrent.effectiveDate)}
              </p>
            ) : (
              <p className="text-center">Текущая ставка не задана.</p>
            )}
            {businessNext ? (
              <p className="text-center">
                Далее <span className={cn("tabular-nums", investDeskModalFigureClass)}>{businessNext.rate}%</span> ·{" "}
                {formatRateDate(businessNext.effectiveDate)}
              </p>
            ) : null}
            <p className="text-center opacity-80">Личная карточка: ½ от ставки общей позиции на дату входа.</p>
          </div>
        </details>
      ) : null}

      <div className="space-y-2.5 pt-0.5">
        <DeskInlineField icon={User} tone="violet">
          <input
            required
            disabled={loading}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Имя и Отчество"
            autoComplete="name"
            className={deskFieldInputClass}
          />
        </DeskInlineField>
        <div className="grid grid-cols-2 gap-2.5">
          <DeskInlineField icon={AtSign} tone="sky">
            <input
              disabled={loading}
              value={formData.handle}
              onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
              placeholder="Telegram"
              autoComplete="nickname"
              className={deskFieldInputClass}
            />
          </DeskInlineField>
          <DeskInlineField icon={Phone} tone="sky">
            <input
              disabled={loading}
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Телефон"
              autoComplete="tel"
              className={deskFieldInputClass}
            />
          </DeskInlineField>
        </div>

        {commonNetworkAutoRate ? (
          <DeskInlineField icon={Banknote} tone="amber">
            <input
              type="text"
              required
              disabled={loading}
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: formatAmountInput(e.target.value) })}
              placeholder="Тело · ฿"
              inputMode="numeric"
              className={cn(deskFieldInputClass, "font-medium tabular-nums", investDeskModalFigureClass)}
            />
          </DeskInlineField>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <DeskInlineField icon={Banknote} tone="amber">
              <input
                type="text"
                required
                disabled={loading}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: formatAmountInput(e.target.value) })}
                placeholder="Тело · ฿"
                inputMode="numeric"
                className={cn(deskFieldInputClass, "font-medium tabular-nums", investDeskModalFigureClass)}
              />
            </DeskInlineField>
            <DeskInlineField icon={Percent} tone="violet">
              <input
                disabled
                readOnly
                value={
                  privateContext?.ok
                    ? `${privateContext.privateAppliedRatePercent}% (½ ${privateContext.commonRatePercent}%)`
                    : "Авто"
                }
                className="w-full cursor-not-allowed bg-transparent text-[13px] tabular-nums text-violet-700/85 outline-none dark:text-violet-200/75"
              />
            </DeskInlineField>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-start justify-center gap-2 rounded-lg border border-red-400/25 bg-red-500/[0.08] px-2.5 py-2 text-center text-xs leading-snug text-red-700 dark:border-red-500/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-violet-200/40 pt-2.5 dark:border-violet-500/[0.12]">
        <button
          type="button"
          title="Закрыть"
          aria-label="Отмена"
          disabled={loading}
          onClick={onClose}
          className={cn(deskGhostRound, deskGhostRoundDanger)}
        >
          <X className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
        <button
          type="submit"
          title="Создать карточку"
          aria-label="Создать"
          disabled={submitBlocked}
          className={cn(
            deskGhostRound,
            !submitBlocked && "text-violet-600 hover:text-violet-500 dark:text-emerald-400 dark:hover:text-emerald-300"
          )}
        >
          {loading ? (
            <Loader2 className="h-[1.125rem] w-[1.125rem] animate-spin" strokeWidth={2.25} />
          ) : (
            <Check className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          )}
        </button>
      </div>
    </form>
  );
}

/** Общая сеть: шапка с датой входа, сводка «Сеть / Неделя / Оценка» — одна разметка для «Новая карточка», «Привязка», «Пополнение тела». */
export function CommonNetworkInvestorDeskShell({
  open,
  onClose,
  title,
  entryDate,
  onEntryDateChange,
  bodyForEstimate,
  loading,
  rateQueryRole,
  titleRightExtra,
  onBusinessRateCurrent,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  entryDate: string;
  onEntryDateChange: (ymd: string) => void;
  bodyForEstimate: string;
  loading: boolean;
  rateQueryRole: string | undefined;
  titleRightExtra?: ReactNode;
  onBusinessRateCurrent?: (current: BusinessRateHint | null) => void;
  children: ReactNode;
}) {
  const businessRateAtYmd = useMemo(() => {
    const m = deskFirstShownWeekMonday(entryDate);
    return m ? toYmdLocal(m) : entryDate;
  }, [entryDate]);

  const { data: rateHdr, isPending: rateHdrPending } = useQuery({
    queryKey: ["business-rate-at-desk-shown-week", businessRateAtYmd, rateQueryRole],
    queryFn: () =>
      apiClient.get<{ success: boolean; current: BusinessRateHint | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(businessRateAtYmd)}`
      ),
    enabled: open && Boolean(entryDate) && Boolean(businessRateAtYmd),
    staleTime: 30_000,
  });

  const rateCallbackRef = useRef(onBusinessRateCurrent);
  rateCallbackRef.current = onBusinessRateCurrent;

  useEffect(() => {
    if (!open) return;
    rateCallbackRef.current?.(rateHdr?.current ?? null);
  }, [open, rateHdr?.current]);

  const bodyNum = parseAmountInput(bodyForEstimate);
  const weeklyEst =
    rateHdr?.current && bodyNum > 0
      ? estimateWeeklyInterestThb(bodyNum, rateHdr.current.rate)
      : null;

  const firstWeekRangeLabel = getDeskFirstShownWeekRangeDdMmYy(entryDate);
  const rateAnchorDay = parseYmdLocal(businessRateAtYmd);
  const rateAnchorShortRu = rateAnchorDay ? formatLocalDdMmYy(rateAnchorDay) : businessRateAtYmd;

  const datePickerCommon = (
    <DatePicker
      inline
      financeFeedToolbar
      value={entryDate}
      onChange={onEntryDateChange}
      variant="default"
      allowClear={false}
      disabled={loading}
      placeholder="Вход"
      className="shrink-0"
      highlightedDates={commonNetworkDeskCalendarHighlights(entryDate, rateHdr?.current?.effectiveDate)}
      triggerTitle="Дата входа в позицию"
    />
  );

  const headerDateSlot = (
    <span className="inline-flex items-center gap-1">
      {datePickerCommon}
      {titleRightExtra}
      {rateHdrPending ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary opacity-80" aria-hidden />
      ) : null}
    </span>
  );

  const summary = rateHdrPending ? (
    <p className="text-sm text-muted-foreground/90">Проверяем ставку на понедельник 1-й недели…</p>
  ) : rateHdr?.current ? (
    <dl className="space-y-1.5">
      <div className="space-y-0">
        <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/75">
          Ставка сети
        </dt>
        <dd className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 tabular-nums">
          <span className="text-[17px] font-bold leading-tight text-violet-600 dark:text-violet-400">
            {rateHdr.current.rate}%
          </span>
          <span className="text-sm font-medium text-foreground/65 dark:text-foreground/60">
            (на {rateAnchorShortRu})
          </span>
        </dd>
      </div>
      <div className="space-y-0">
        <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/75">
          Первая неделя
        </dt>
        <dd className="text-sm font-semibold leading-tight text-sky-800/90 tabular-nums dark:text-sky-300/95 sm:text-[15px]">
          {firstWeekRangeLabel}
        </dd>
      </div>
      <div className="space-y-0">
        <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/75">
          Оценка дохода за неделю
        </dt>
        <dd
          className={cn(
            "text-[17px] font-bold leading-tight tabular-nums",
            weeklyEst != null && weeklyEst > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground/80"
          )}
        >
          {weeklyEst != null && weeklyEst > 0
            ? `+${formatCurrency(Math.round(weeklyEst))}`
            : "—"}
        </dd>
      </div>
    </dl>
  ) : (
    <p className="text-xs leading-snug text-amber-900 dark:text-amber-200/90">
      На эту дату ставки нет — задайте в «Управлении» или смените дату.
    </p>
  );

  return (
    <InvestDeskModalShell
      open={open}
      onClose={onClose}
      minimal
      title={title}
      titleRight={headerDateSlot}
      titleRowClassName="items-center gap-2"
      titleRightWrapClassName="max-w-[min(58%,17rem)] shrink-0 pt-0 flex items-center justify-end"
      summary={summary}
      cardClassName={investorDeskCardShellClass}
      headerClassName="border-b border-violet-200/35 pb-2 pt-3 dark:border-violet-500/[0.1]"
      summaryWrapClassName="mt-1.5 text-foreground/90"
      bodyClassName="px-4 py-2.5"
    >
      {children}
    </InvestDeskModalShell>
  );
}

function LinkSelfDeskWithShell(props: LinkSelfModeProps) {
  const { form, setForm, loading } = props;
  return (
    <CommonNetworkInvestorDeskShell
      open={props.open}
      onClose={props.onClose}
      title="Привязка"
      entryDate={form.entryDate}
      onEntryDateChange={(v) => setForm((p) => ({ ...p, entryDate: v }))}
      bodyForEstimate={form.body}
      loading={loading}
      rateQueryRole={props.userRole}
      titleRightExtra={
        <button
          type="button"
          title={form.allowMultiple ? "Разрешена вторая карточка" : "Одна карточка на владельца"}
          aria-label={form.allowMultiple ? "Выключить вторую карточку" : "Разрешить вторую карточку"}
          aria-pressed={form.allowMultiple}
          disabled={loading}
          onClick={() => setForm((p) => ({ ...p, allowMultiple: !p.allowMultiple }))}
          className={cn(deskGhostRound, form.allowMultiple && "text-primary")}
        >
          <Layers className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
        </button>
      }
      onBusinessRateCurrent={(cur) => {
        setForm((p) => ({ ...p, rate: cur ? String(cur.rate) : "" }));
      }}
    >
      <LinkSelfContent {...props} />
    </CommonNetworkInvestorDeskShell>
  );
}

function LinkSelfContent(p: LinkSelfModeProps) {
  const { form, setForm, onSubmit, onClose, loading, systemReady, submitDisabled, error } = p;

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[10px]">
        <span
          className="rounded border border-violet-500/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400"
          title="Текущий аккаунт"
        >
          Аккаунт
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground" title="Логин">
          <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="max-w-[12rem] truncate font-medium text-violet-800 dark:text-violet-300">
            @{p.actorUsername.replace(/^@/, "")}
          </span>
        </span>
        {p.ownerUsername ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground" title="Книга владельца">
            <Globe2 className="h-3.5 w-3.5 shrink-0 opacity-80 text-[hsl(var(--thai-metric-info))]" aria-hidden />
            <span className="max-w-[10rem] truncate font-medium text-[hsl(var(--thai-metric-info))]">
              {p.ownerUsername}
            </span>
          </span>
        ) : null}
      </div>

      <div className="space-y-2.5 pt-0.5">
        <DeskInlineField icon={User} tone="violet">
          <input
            required
            disabled={loading}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Имя и Отчество"
            autoComplete="name"
            className={deskFieldInputClass}
          />
        </DeskInlineField>
        <div className="grid grid-cols-2 gap-2.5">
          <DeskInlineField icon={AtSign} tone="sky">
            <input
              disabled={loading}
              value={form.handle}
              onChange={(e) => setForm((prev) => ({ ...prev, handle: e.target.value }))}
              placeholder="Telegram"
              autoComplete="nickname"
              className={deskFieldInputClass}
            />
          </DeskInlineField>
          <DeskInlineField icon={Phone} tone="sky">
            <input
              disabled={loading}
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Телефон"
              autoComplete="tel"
              className={deskFieldInputClass}
            />
          </DeskInlineField>
        </div>
        <DeskInlineField icon={Banknote} tone="amber">
          <input
            type="text"
            required
            disabled={loading}
            value={form.body}
            onChange={(e) => setForm((prev) => ({ ...prev, body: formatAmountInput(e.target.value) }))}
            placeholder="Тело · ฿"
            inputMode="numeric"
            className={cn(deskFieldInputClass, "font-medium tabular-nums", investDeskModalFigureClass)}
          />
        </DeskInlineField>
      </div>

      {!systemReady ? (
        <div className="flex justify-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>Система не готова</span>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start justify-center gap-2 rounded-lg border border-red-400/25 bg-red-500/[0.08] px-2.5 py-2 text-center text-xs leading-snug text-red-700 dark:border-red-500/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-violet-200/40 pt-2.5 dark:border-violet-500/[0.12]">
        <button
          type="button"
          title="Закрыть"
          aria-label="Отмена"
          disabled={loading}
          onClick={onClose}
          className={cn(deskGhostRound, deskGhostRoundDanger)}
        >
          <X className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
        <button
          type="submit"
          title="Создать карточку"
          aria-label="Создать"
          disabled={loading || submitDisabled}
          className={cn(
            deskGhostRound,
            !(loading || submitDisabled) &&
              "text-violet-600 hover:text-violet-500 dark:text-emerald-400 dark:hover:text-emerald-300"
          )}
        >
          {loading ? (
            <Loader2 className="h-[1.125rem] w-[1.125rem] animate-spin" strokeWidth={2.25} />
          ) : (
            <Check className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          )}
        </button>
      </div>
    </form>
  );
}

function BodyTopUpContent(p: BodyTopUpModeProps) {
  const { amount, setAmount, comment, setComment, onSubmit, onClose, loading, error } = p;
  const parsed = parseAmountInput(amount);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex justify-center" title="Инвестор подтверждает в «Финансах»">
        <Info className="h-5 w-5 text-muted-foreground opacity-70" aria-hidden />
      </div>

      <DeskInlineField icon={Banknote}>
        <input
          required
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(formatAmountInput(e.target.value))}
          placeholder="Сумма · ฿"
          disabled={loading}
          className="w-full bg-transparent text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/45"
        />
      </DeskInlineField>

      <DeskInlineField icon={MessageSquare}>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий · необязательно"
          disabled={loading}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
        />
      </DeskInlineField>

      {error ? (
        <div className="flex items-start justify-center gap-2 text-center text-[10px] text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border/35 pt-3 dark:border-white/[0.06]">
        <button
          type="button"
          title="Закрыть"
          aria-label="Отмена"
          disabled={loading}
          onClick={onClose}
          className={cn(deskGhostRound, deskGhostRoundDanger)}
        >
          <X className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
        <button
          type="submit"
          title="Запросить пополнение"
          aria-label="Запросить"
          disabled={loading || parsed <= 0}
            className={cn(deskGhostRound, !(loading || parsed <= 0) && "text-primary hover:text-primary")}
        >
          {loading ? (
            <Loader2 className="h-[1.125rem] w-[1.125rem] animate-spin" strokeWidth={2.25} />
          ) : (
            <Check className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          )}
        </button>
      </div>
    </form>
  );
}

function CreateInvestorDeskWithShell(props: CreateModeProps) {
  const commonHdr =
    !props.formData.isPrivate && (props.userRole === "OWNER" || props.userRole === "SUPER_ADMIN");

  if (!commonHdr) {
    return (
      <InvestDeskModalShell
        open={props.open}
        onClose={props.onClose}
        minimal
        title="Новая карточка"
        cardClassName={investorDeskCardShellClass}
        headerClassName="border-b border-violet-200/35 pb-2 pt-3 dark:border-violet-500/[0.1]"
        bodyClassName="px-4 py-2.5"
      >
        <CreateInvestorContent {...props} />
      </InvestDeskModalShell>
    );
  }

  return (
    <CommonNetworkInvestorDeskShell
      open={props.open}
      onClose={props.onClose}
      title="Новая карточка"
      entryDate={props.formData.entryDate}
      onEntryDateChange={(v) => props.setFormData({ ...props.formData, entryDate: v })}
      bodyForEstimate={props.formData.body}
      loading={props.loading ?? false}
      rateQueryRole={props.userRole}
    >
      <CreateInvestorContent {...props} />
    </CommonNetworkInvestorDeskShell>
  );
}

export function ManagePositionDeskModal(props: ManagePositionDeskModalProps) {
  if (!props.open) return null;

  if (props.mode === "create_investor") {
    return <CreateInvestorDeskWithShell {...props} />;
  }

  if (props.mode === "link_self") {
    return <LinkSelfDeskWithShell {...props} />;
  }

  return (
    <InvestDeskModalShell
      open={props.open}
      onClose={props.onClose}
      minimal
      title="Пополнение"
      summary={
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span className={investDeskModalEmphasisClass}>{props.positionLabel}</span>
          <span className="inline-flex items-center gap-1 tabular-nums opacity-90" title="Текущее тело">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className={investDeskModalFigureClass}>{props.currentBody.toLocaleString("ru-RU")} ฿</span>
          </span>
        </span>
      }
    >
      <BodyTopUpContent {...props} />
    </InvestDeskModalShell>
  );
}
