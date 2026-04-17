"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { FormGroup } from "@/components/ui/FormGroup";
import { cn, formatCurrency } from "@/lib/utils";
import type { PrivateInvestorCreateContext } from "@/lib/private-investor-create-context";

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

  if (!open) return null;

  const showNetworkSwitcher = userRole === "SUPER_ADMIN";
  const showBusinessHints =
    !formData.isPrivate && (userRole === "OWNER" || userRole === "SUPER_ADMIN") && (businessCurrent || businessNext);

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

            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <button
                type="button"
                disabled={loading}
                onClick={() => setFormData({ ...formData, isPrivate: false })}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all",
                  !formData.isPrivate
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground disabled:opacity-50"
                )}
              >
                Общая сеть
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setFormData({ ...formData, isPrivate: true })}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all",
                  formData.isPrivate
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground disabled:opacity-50"
                )}
              >
                Личная сеть
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
              <Text className="text-xs text-amber-700 dark:text-amber-300">{privateContext.message}</Text>
            ) : privateContext?.ok ? (
              <>
                <Text className="text-xs leading-relaxed text-foreground">
                  Общая позиция «{privateContext.commonInvestorName}»: тело{" "}
                  <span className="font-semibold">{formatCurrency(privateContext.commonBody)}</span>, ставка{" "}
                  <span className="font-semibold">{privateContext.commonRatePercent}%</span> в месяц (в карточке).
                </Text>
                <Text className="text-xs leading-relaxed text-foreground">
                  Уже в личной сети (сумма тел):{" "}
                  <span className="font-semibold">{formatCurrency(privateContext.privateBodiesTotal)}</span>. Свободно
                  под новые личные позиции:{" "}
                  <span className="font-semibold text-primary">{formatCurrency(privateContext.remainingForPrivate)}</span>
                  .
                </Text>
                <Text className="text-xs leading-relaxed text-muted-foreground">
                  В личной карточке ставка будет{" "}
                  <span className="font-semibold text-foreground">{privateContext.privateAppliedRatePercent}%</span> в
                  месяц — это половина от ставки общей позиции ({privateContext.commonRatePercent}% ÷ 2).
                </Text>
                {privateOver ? (
                  <Text className="text-xs font-medium text-red-500">
                    Сумма «Тело» превышает доступный остаток ({formatCurrency(privateContext.remainingForPrivate)}).
                  </Text>
                ) : null}
              </>
            ) : (
              <Text className="text-xs text-muted-foreground">Нет данных контекста.</Text>
            )}
          </div>
        ) : null}

        {showBusinessHints ? (
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
              Поле «Ставка (%)» ниже — договорная ставка именно этой карточки инвестора (как в договоре).
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
              <Label>Ставка (%) *</Label>
              {formData.isPrivate ? (
                <Input
                  disabled
                  value={
                    privateContext?.ok
                      ? `Авто: ${privateContext.privateAppliedRatePercent}% (½ от ${privateContext.commonRatePercent}%)`
                      : "Авто (после выбора личной сети)"
                  }
                  className="opacity-90 cursor-not-allowed bg-muted text-xs"
                />
              ) : (
                <Input
                  type="number"
                  required
                  disabled={loading}
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  placeholder="10"
                />
              )}
            </FormGroup>
          </div>

          <FormGroup>
            <Label>Дата входа *</Label>
            <Input
              type="date"
              required
              disabled={loading}
              value={formData.entryDate}
              onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
            />
          </FormGroup>

          {error && (
            <div className="p-3 text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/20 rounded-md animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={loading} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={loading || privateOver} className="flex-1">
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
