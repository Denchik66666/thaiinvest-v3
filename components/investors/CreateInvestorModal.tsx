"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { FormGroup } from "@/components/ui/FormGroup";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn, formatCurrency } from "@/lib/utils";
import { glassAccentSurface } from "@/lib/dashboard-glass-accent";
import type { PrivateInvestorCreateContext } from "@/lib/private-investor-create-context";
import { apiClient } from "@/lib/api-client";

export interface InvestorForm {
  name: string;
  handle: string;
  phone: string;
  body: string;
  rate: string;
  entryDate: string;
  isPrivate: boolean;
}

type BusinessRateHint = {
  rate: number;
  effectiveDate: string;
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  formData: InvestorForm;
  setFormData: (data: InvestorForm) => void;
  userRole?: string;
  loading?: boolean;
  error?: string;
  /** SUPER_ADMIN + личная сеть: лимит и ставки с сервера */
  privateContext?: PrivateInvestorCreateContext | null;
  privateContextLoading?: boolean;
  /** Справочно: бизнес-ставка (недельные начисления) */
  businessCurrent?: BusinessRateHint | null;
  /** Запланированная смена бизнес-ставки */
  businessNext?: BusinessRateHint | null;
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

export function CreateInvestorModal({
  open,
  onClose,
  onSubmit,
  formData,
  setFormData,
  userRole,
  loading,
  error,
  privateContext,
  privateContextLoading,
  businessCurrent,
  businessNext,
}: ModalProps) {
  const parseAmountInput = (value: string) => Number(value.replace(/[^\d]/g, ""));
  const formatAmountInput = (value: string) => {
    const amount = parseAmountInput(value);
    if (!amount) return "";
    return `${amount.toLocaleString("ru-RU")} ฿`;
  };

  const entryDateHighlights = useMemo(() => {
    const s = new Set<string>();
    if (formData.entryDate) s.add(formData.entryDate);
    if (businessCurrent?.effectiveDate) s.add(businessCurrent.effectiveDate.split("T")[0]);
    if (businessNext?.effectiveDate) s.add(businessNext.effectiveDate.split("T")[0]);
    return Array.from(s);
  }, [formData.entryDate, businessCurrent, businessNext]);

  /** Общая сеть: процент карточки всегда = бизнес-ставка на дату входа (без ручного ввода). */
  const commonNetworkAutoRate =
    !formData.isPrivate && (userRole === "OWNER" || userRole === "SUPER_ADMIN");

  const { data: rateAtEntryRes, isPending: rateAtEntryPending } = useQuery({
    queryKey: ["business-rate-at-entry", formData.entryDate, userRole],
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number; effectiveDate: string } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(formData.entryDate)}`
      ),
    enabled: open && commonNetworkAutoRate && Boolean(formData.entryDate),
    staleTime: 30_000,
  });

  if (!open) return null;

  const showNetworkSwitcher = userRole === "SUPER_ADMIN";
  const showScheduleHints =
    userRole === "SUPER_ADMIN" && formData.isPrivate && (businessCurrent || businessNext);

  const typedBody = parseAmountInput(formData.body);
  const privateOver =
    privateContext?.ok === true && typedBody > 0 && typedBody > privateContext.remainingForPrivate;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-card border border-border p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
        <h2 className="text-xl font-bold text-foreground">Создать инвестора</h2>

        {showNetworkSwitcher && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Сеть</Label>

            <div
              className="flex justify-center gap-1 rounded-xl border border-border/20 py-1.5 dark:border-white/[0.06]"
              role="group"
              aria-label="Тип сети позиции"
            >
              <button
                type="button"
                disabled={loading}
                onClick={() => setFormData({ ...formData, isPrivate: false })}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide outline-none transition",
                  "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  !formData.isPrivate
                    ? "bg-primary/[0.14] text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-muted/30 active:bg-muted/40 disabled:opacity-50"
                )}
              >
                Общая
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setFormData({ ...formData, isPrivate: true })}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide outline-none transition",
                  "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  formData.isPrivate
                    ? "bg-primary/[0.14] text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-muted/30 active:bg-muted/40 disabled:opacity-50"
                )}
              >
                Личная
              </button>
            </div>

            <Text className="text-xs text-muted-foreground">
              {!formData.isPrivate
                ? "Инвестор виден Семёну (общая сеть)"
                : "Инвестор скрыт. Видишь только ты (личная сеть)"}
            </Text>
          </div>
        )}

        {formData.isPrivate && showNetworkSwitcher ? (
          <div className="rounded-lg border border-border/60 bg-muted/25 p-3 space-y-2">
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">Личная сеть — лимит и ставка</Text>
            {privateContextLoading ? (
              <Text className="text-xs text-muted-foreground">Загрузка данных…</Text>
            ) : privateContext && !privateContext.ok ? (
              <Text className="text-xs" style={{ color: "#fbbf24" }}>
                {privateContext.message}
              </Text>
            ) : privateContext?.ok ? (
              <>
                <Text className="text-xs leading-relaxed text-foreground">
                  Общая позиция «{privateContext.commonInvestorName}»: тело{" "}
                  <span className="font-semibold" style={{ color: "#ffffff" }}>
                    {formatCurrency(privateContext.commonBody)}
                  </span>
                  , ставка{" "}
                  <span className="font-semibold">{privateContext.commonRatePercent}%</span> в месяц (в карточке).
                </Text>
                <Text className="text-xs leading-relaxed text-foreground">
                  Уже в личной сети (сумма тел):{" "}
                  <span className="font-semibold" style={{ color: "#ffffff" }}>
                    {formatCurrency(privateContext.privateBodiesTotal)}
                  </span>
                  . Свободно под новые личные позиции:{" "}
                  <span className="font-semibold" style={{ color: "#fbbf24" }}>
                    {formatCurrency(privateContext.remainingForPrivate)}
                  </span>
                  .
                </Text>
                <Text className="text-xs leading-relaxed text-muted-foreground">
                  В личной карточке ставка будет{" "}
                  <span className="font-semibold text-foreground">{privateContext.privateAppliedRatePercent}%</span> в
                  месяц — это половина от ставки общей позиции ({privateContext.commonRatePercent}% ÷ 2).
                </Text>
                {privateOver ? (
                  <Text className="text-xs font-medium text-red-500">
                    Сумма «Тело» превышает доступный остаток (
                    <span style={{ color: "#fbbf24" }}>{formatCurrency(privateContext.remainingForPrivate)}</span>).
                  </Text>
                ) : null}
              </>
            ) : (
              <Text className="text-xs text-muted-foreground">Нет данных контекста.</Text>
            )}
          </div>
        ) : null}

        {commonNetworkAutoRate ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/25 p-3">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ставка карточки = ставка сети на дату входа
            </Text>
            <Text className="text-xs leading-relaxed text-muted-foreground">
              Какая действующая <strong className="text-foreground">бизнес-ставка</strong> на выбранную дату входа — такой и процент у
              позиции в общей сети. Вручную процент не задаётся.
            </Text>
            {rateAtEntryPending ? (
              <Text className="text-xs text-muted-foreground">Проверяем ставку на выбранную дату…</Text>
            ) : rateAtEntryRes?.current ? (
              <Text className="text-xs leading-relaxed text-foreground">
                На эту дату:{" "}
                <span className="font-semibold">{rateAtEntryRes.current.rate}%</span> (с{" "}
                {formatRateDate(rateAtEntryRes.current.effectiveDate)}).
              </Text>
            ) : (
              <Text className="text-xs font-medium leading-snug text-amber-700 dark:text-amber-400">
                На выбранную дату бизнес-ставки ещё не было. Владелец задаёт её в «Управлении» с датой начала не позже входа, либо
                смените дату входа.
              </Text>
            )}
          </div>
        ) : null}

        {showScheduleHints ? (
          <div className="rounded-lg border border-border/60 bg-muted/25 p-3 space-y-1.5">
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Бизнес-ставка (недельный контур начислений)
            </Text>
            {businessCurrent ? (
              <Text className="text-xs text-foreground">
                Сейчас действует: <span className="font-semibold">{businessCurrent.rate}%</span> с{" "}
                {formatRateDate(businessCurrent.effectiveDate)}.
              </Text>
            ) : (
              <Text className="text-xs text-muted-foreground">Текущая бизнес-ставка в системе не задана.</Text>
            )}
            {businessNext ? (
              <Text className="text-xs text-foreground">
                Далее запланировано: <span className="font-semibold">{businessNext.rate}%</span> с{" "}
                {formatRateDate(businessNext.effectiveDate)}.
              </Text>
            ) : businessCurrent ? (
              <Text className="text-xs text-muted-foreground">Запланированных смен ставки нет.</Text>
            ) : null}
            <Text className="text-xs text-muted-foreground">
              Ставка личной карточки считается автоматически (½ от ставки общей позиции на дату входа).
            </Text>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <FormGroup>
            <Label>Имя *</Label>
            <Input
              required
              disabled={loading}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Имя инвестора"
            />
          </FormGroup>

          <div className="grid grid-cols-2 gap-4">
            <FormGroup>
              <Label>Telegram</Label>
              <Input
                disabled={loading}
                value={formData.handle}
                onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                placeholder="@username"
              />
            </FormGroup>

            <FormGroup>
              <Label>Телефон</Label>
              <Input
                disabled={loading}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+66..."
              />
            </FormGroup>
          </div>

          <FormGroup>
            <Label>Дата входа *</Label>
            <DatePicker
              value={formData.entryDate}
              onChange={(v) => setFormData({ ...formData, entryDate: v })}
              highlightedDates={entryDateHighlights}
            />
          </FormGroup>

          {commonNetworkAutoRate ? (
            <>
              <FormGroup>
                <Label>Тело (бат) *</Label>
                <Input
                  type="text"
                  required
                  disabled={loading}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: formatAmountInput(e.target.value) })}
                  placeholder="100 000 ฿"
                />
              </FormGroup>
              <FormGroup>
                <Label>Ставка карточки</Label>
                <Input
                  disabled
                  value={
                    rateAtEntryPending
                      ? "Проверка…"
                      : rateAtEntryRes?.current
                        ? `Авто: ${rateAtEntryRes.current.rate}% (ставка сети на дату входа)`
                        : "Нет ставки на эту дату — см. подсказку выше"
                  }
                  className="cursor-not-allowed bg-muted text-xs opacity-90"
                />
              </FormGroup>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <FormGroup>
                <Label>Тело (бат) *</Label>
                <Input
                  type="text"
                  required
                  disabled={loading}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: formatAmountInput(e.target.value) })}
                  placeholder="100 000 ฿"
                />
              </FormGroup>

              <FormGroup>
                <Label>Ставка карточки</Label>
                <Input
                  disabled
                  value={
                    privateContext?.ok
                      ? `Авто: ${privateContext.privateAppliedRatePercent}% (½ от ${privateContext.commonRatePercent}%)`
                      : "Авто (после выбора личной сети)"
                  }
                  className="cursor-not-allowed bg-muted text-xs opacity-90"
                />
              </FormGroup>
            </div>
          )}

          {error && (
            <div className="p-3 text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/20 rounded-md animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={loading} className="flex-1">
              Отмена
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={
                loading ||
                privateOver ||
                (commonNetworkAutoRate && (rateAtEntryPending || !rateAtEntryRes?.current))
              }
              className={cn("flex-1", glassAccentSurface)}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Создание...
                </span>
              ) : (
                "Создать"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
