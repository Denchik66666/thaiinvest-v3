"use client";

import { type Dispatch, type ReactNode, type SetStateAction } from "react";
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
const deskFieldInputClass =
  "w-full bg-transparent text-[15px] leading-snug outline-none text-slate-800 placeholder:text-slate-500/75 dark:text-slate-100 dark:placeholder:text-slate-500/50";

function formatIsoDateShortRu(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** ДД.ММ.ГГ из локальной даты */
function formatLocalDdMmYy(d: Date) {
  const day = d.getDate().toString().padStart(2, "0");
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const y = String(d.getFullYear()).slice(-2);
  return `${day}.${mo}.${y}`;
}

/**
 * Понедельник–воскресенье текущей начисляемой недели (выплата по ней — следующий понедельник, как в реестре).
 */
function getCurrentAccrualWeekRangeDdMmYy() {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${formatLocalDdMmYy(monday)} — ${formatLocalDdMmYy(sunday)}`;
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

function entryAndEffectiveHighlights(entryYmd: string, effectiveIso?: string | null) {
  const out = new Set<string>();
  if (entryYmd) out.add(entryYmd);
  if (effectiveIso) {
    const y = effectiveIso.split("T")[0];
    if (y) out.add(y);
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

function DeskInlineField({
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
  body: string;
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

function LinkSelfContent(p: LinkSelfModeProps) {
  const { form, setForm, onSubmit, onClose, loading, systemReady, submitDisabled, error } = p;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1" title="Аккаунт">
          <User className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span className={cn("max-w-[12rem] truncate font-medium", investDeskModalEmphasisClass)}>
            @{p.actorUsername.replace(/^@/, "")}
          </span>
        </span>
        {p.ownerUsername ? (
          <span className="inline-flex items-center gap-1 opacity-80" title="Книга">
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            <span className={cn("max-w-[10rem] truncate", investDeskModalEmphasisClass)}>{p.ownerUsername}</span>
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        <DeskInlineField icon={User}>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Имя и Отчество"
            disabled={loading}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/45"
          />
        </DeskInlineField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DeskInlineField icon={Banknote}>
            <input
              required
              type="text"
              inputMode="numeric"
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: formatAmountInput(e.target.value) }))}
              placeholder="Тело · ฿"
              disabled={loading}
              className="w-full bg-transparent text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/45"
            />
          </DeskInlineField>
          <DeskInlineField icon={Percent}>
            <input
              required
              type="number"
              min={0.01}
              step={0.01}
              value={form.rate}
              onChange={(e) => setForm((prev) => ({ ...prev, rate: e.target.value }))}
              placeholder="% / мес"
              disabled={loading}
              className="w-full bg-transparent text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/45"
            />
          </DeskInlineField>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] text-muted-foreground">Дата входа</p>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <DatePicker
              value={form.entryDate}
              onChange={(v) => setForm((prev) => ({ ...prev, entryDate: v }))}
              variant="default"
              allowClear={false}
              disabled={loading}
              placeholder="Дата входа"
              className="w-full"
            />
          </div>
          <button
            type="button"
            title={form.allowMultiple ? "Разрешена вторая карточка" : "Одна карточка на владельца"}
            aria-label={form.allowMultiple ? "Выключить вторую карточку" : "Разрешить вторую карточку"}
            aria-pressed={form.allowMultiple}
            disabled={loading}
            onClick={() => setForm((prev) => ({ ...prev, allowMultiple: !prev.allowMultiple }))}
            className={cn(deskGhostRound, form.allowMultiple && "text-primary")}
          >
            <Layers className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
          </button>
        </div>
      </div>

      {!systemReady ? (
        <div className="flex justify-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>Система не готова</span>
        </div>
      ) : null}
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
          title="Создать"
          aria-label="Создать"
          disabled={loading || submitDisabled}
            className={cn(deskGhostRound, !(loading || submitDisabled) && "text-primary hover:text-primary")}
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

  const { data: rateHdr, isPending: rateHdrPending } = useQuery({
    queryKey: ["business-rate-at-entry", props.formData.entryDate, props.userRole],
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number; effectiveDate: string } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(props.formData.entryDate)}`
      ),
    enabled: props.open && commonHdr && Boolean(props.formData.entryDate),
    staleTime: 30_000,
  });

  const bodyNum = parseAmountInput(props.formData.body);
  const weeklyEst =
    commonHdr && rateHdr?.current && bodyNum > 0
      ? estimateWeeklyInterestThb(bodyNum, rateHdr.current.rate)
      : null;

  const datePickerCommon = (
    <DatePicker
      inline
      financeFeedToolbar
      value={props.formData.entryDate}
      onChange={(v) => props.setFormData({ ...props.formData, entryDate: v })}
      variant="default"
      allowClear={false}
      disabled={props.loading}
      placeholder="Вход"
      className="shrink-0"
      highlightedDates={entryAndEffectiveHighlights(
        props.formData.entryDate,
        rateHdr?.current?.effectiveDate
      )}
    />
  );

  const headerDateSlot = commonHdr ? (
    <span className="inline-flex items-center gap-2">
      {datePickerCommon}
      {rateHdrPending ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary opacity-80" aria-hidden />
      ) : null}
    </span>
  ) : null;

  const summary = commonHdr ? (
    rateHdrPending ? (
      <p className="text-xs text-muted-foreground">Проверяем ставку на дату входа…</p>
    ) : rateHdr?.current ? (
      <div className="space-y-1.5">
        <div
          className={cn(
            "rounded-lg border px-2.5 py-2",
            "border-violet-200/50 bg-gradient-to-r from-violet-100/70 via-sky-100/50 to-amber-100/60",
            "dark:border-violet-500/20 dark:from-violet-500/[0.14] dark:via-sky-500/[0.08] dark:to-amber-500/[0.11]"
          )}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <div className="shrink-0" title={`Ставка сети ${rateHdr.current.rate}% в месяц по дате входа`}>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300/80">
                Сеть
              </span>
              <span className="inline-flex items-baseline gap-0.5 tabular-nums">
                <span className="text-2xl font-bold leading-none text-violet-800 dark:text-violet-100">
                  {rateHdr.current.rate}
                </span>
                <span className="text-sm font-semibold text-violet-600 dark:text-violet-300/85">%</span>
              </span>
            </div>
            <div
              className="min-w-0 flex-[1_1_9rem] text-center"
              title="Текущая начисляемая неделя (пн–вс), выплата — в следующий понедельник"
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-800 dark:text-sky-300/75">
                Неделя
              </span>
              <span className="text-sm font-semibold tabular-nums text-sky-950 dark:text-sky-50/95">
                {getCurrentAccrualWeekRangeDdMmYy()}
              </span>
            </div>
            <div className="shrink-0 text-right" title="Оценка за неделю по телу ниже (¼ месячной ставки)">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300/70">
                Оценка
              </span>
              <span
                className={cn(
                  "text-base font-semibold tabular-nums",
                  weeklyEst != null && weeklyEst > 0 ? investDeskModalFigureClass : "text-slate-500 dark:text-slate-500"
                )}
              >
                {weeklyEst != null && weeklyEst > 0 ? formatCurrency(Math.round(weeklyEst)) : "…"}
              </span>
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
          Действует с {formatIsoDateShortRu(rateHdr.current.effectiveDate)} · сумма после ввода тела
        </p>
      </div>
    ) : (
      <p className="text-xs leading-snug text-amber-900 dark:text-amber-200/90">
        На эту дату ставки нет — задайте в «Управлении» или смените дату.
      </p>
    )
  ) : null;

  return (
    <InvestDeskModalShell
      open={props.open}
      onClose={props.onClose}
      minimal
      title="Новая карточка"
      titleRight={headerDateSlot}
      titleRowClassName="items-center gap-2"
      titleRightWrapClassName="max-w-[min(54%,15rem)] shrink-0 pt-0 flex items-center justify-end"
      summary={summary}
      cardClassName={cn(
        "border-violet-200/45 bg-gradient-to-b from-violet-50/30 via-card to-card shadow-xl",
        "dark:border-violet-500/[0.14] dark:from-[#1c1c2e] dark:via-[#15151f] dark:to-[#111118] dark:shadow-[0_28px_56px_-28px_rgba(0,0,0,0.75)]"
      )}
      headerClassName="border-b border-violet-200/35 pb-2 pt-3 dark:border-violet-500/[0.1]"
      summaryWrapClassName="mt-2 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200/95"
      bodyClassName="px-4 py-2.5"
    >
      <CreateInvestorContent {...props} />
    </InvestDeskModalShell>
  );
}

export function ManagePositionDeskModal(props: ManagePositionDeskModalProps) {
  if (!props.open) return null;

  if (props.mode === "create_investor") {
    return <CreateInvestorDeskWithShell {...props} />;
  }

  if (props.mode === "link_self") {
    return (
      <InvestDeskModalShell
        open={props.open}
        onClose={props.onClose}
        minimal
        title="Привязка"
      >
        <LinkSelfContent {...props} />
      </InvestDeskModalShell>
    );
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
