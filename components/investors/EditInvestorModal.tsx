"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { InvestDeskModalShell } from "@/components/investors/InvestDeskModalShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DatePicker } from "@/components/ui/DatePicker";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";
import { cn, formatCurrency } from "@/lib/utils";
import { glassAccentSurface } from "@/lib/dashboard-glass-accent";
import { useAuth } from "@/hooks/useAuth";
import type { Investor } from "@/types/investor";

type EditInvestorModalProps = {
  open: boolean;
  onClose: () => void;
  investor: Investor;
};

function investorToForm(inv: Investor) {
  return {
    name: inv.name,
    body: inv.body.toString(),
    accrued: inv.accrued.toString(),
    rate: inv.rate.toString(),
    entryDate: inv.entryDate ? inv.entryDate.split("T")[0] : new Date().toISOString().split("T")[0],
    activationDate: inv.activationDate
      ? inv.activationDate.split("T")[0]
      : new Date().toISOString().split("T")[0],
  };
}

export function EditInvestorModal({ open, onClose, investor }: EditInvestorModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [formData, setFormData] = useState(() => investorToForm(investor));

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setFormData(investorToForm(investor)));
  }, [open, investor]);

  const isCommonNetwork = investor.isPrivate !== true;

  const { data: rateAtEntryRes, isPending: rateAtEntryPending } = useQuery({
    queryKey: ["business-rate-at-entry-edit-modal", investor.id, formData.entryDate],
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number; effectiveDate: string } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(formData.entryDate)}`
      ),
    enabled: open && isCommonNetwork && Boolean(formData.entryDate),
    staleTime: 20_000,
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        body: parseFloat(data.body) || 0,
        entryDate: data.entryDate,
        activationDate: data.activationDate,
      };
      if (user?.role === "SUPER_ADMIN") {
        payload.accrued = parseFloat(data.accrued) || 0;
      }
      if (!isCommonNetwork) {
        payload.rate = parseFloat(data.rate) || 0;
      }
      return apiClient.put(`/api/investors/${investor.id}`, payload);
    },
    onSuccess: () => {
      toast.success("Карточка сохранена");
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investor", investor.id.toString()] });
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCommonNetwork && (rateAtEntryPending || !rateAtEntryRes?.current)) {
      toast.error("Нет бизнес-ставки на выбранную дату входа");
      return;
    }
    updateMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const dateHighlights = useMemo(() => {
    const s = new Set<string>();
    if (formData.entryDate) s.add(formData.entryDate);
    if (formData.activationDate) s.add(formData.activationDate);
    return Array.from(s);
  }, [formData.entryDate, formData.activationDate]);

  const networkLine = isCommonNetwork ? "Общая сеть · ставка с сервера на дату входа" : "Личная сеть · ставка вручную";

  if (!open) return null;

  return (
    <InvestDeskModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-[min(100vw-2rem,40rem)]"
      eyebrow="Реестр · карточка"
      title="Редактирование позиции"
      summary={
        <span>
          <strong className="font-medium text-foreground">{investor.name}</strong>
          <span className="text-muted-foreground"> · </span>
          <span>{networkLine}</span>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Имя и Отчество</Label>
          <Input
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="Имя и Отчество"
            required
            className="h-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Тело, ฿</Label>
            <Input
              type="number"
              value={formData.body}
              onChange={(e) => handleInputChange("body", e.target.value)}
              step="0.01"
              min="0"
              required
              className="h-9 text-sm tabular-nums"
            />
            <p className="text-[10px] text-amber-600 dark:text-amber-400">Смена тела пересчитает начисления.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">
              {isCommonNetwork ? "Ставка (сеть на дату входа)" : "Ставка, %"}
            </Label>
            {isCommonNetwork ? (
              <>
                <Input
                  disabled
                  value={
                    rateAtEntryPending ? "…" : rateAtEntryRes?.current ? `${rateAtEntryRes.current.rate}%` : "—"
                  }
                  className="h-9 cursor-not-allowed bg-muted/40 text-sm tabular-nums opacity-90"
                />
                <p className="text-[10px] text-muted-foreground">Сохранится вместе с датой входа.</p>
              </>
            ) : (
              <Input
                type="number"
                value={formData.rate}
                onChange={(e) => handleInputChange("rate", e.target.value)}
                step="0.01"
                min="0"
                max="100"
                required
                className="h-9 text-sm tabular-nums"
              />
            )}
          </div>
        </div>

        {user?.role === "SUPER_ADMIN" ? (
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Начислено (ручная правка)</Label>
            <Input
              type="number"
              value={formData.accrued}
              onChange={(e) => handleInputChange("accrued", e.target.value)}
              step="0.01"
              min="0"
              className="h-9 max-w-xs text-sm tabular-nums"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Дата входа</Label>
            <DatePicker value={formData.entryDate} onChange={(value) => handleInputChange("entryDate", value)} />
            <p className="text-[10px] text-amber-600 dark:text-amber-400">Смена даты входа пересчитает начисления.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Дата активации</Label>
            <DatePicker
              value={formData.activationDate}
              onChange={(value) => handleInputChange("activationDate", value)}
              highlightedDates={dateHighlights}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border/45 bg-muted/10 px-2.5 py-2 dark:border-white/[0.06]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Сейчас в системе</p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Тело</span>
              <span className="font-medium text-foreground">{formatCurrency(investor.body)}</span>
            </div>
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Начислено</span>
              <span className="font-medium text-foreground">{formatCurrency(investor.accrued)}</span>
            </div>
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Выплачено</span>
              <span className="font-medium text-foreground">{formatCurrency(investor.paid || 0)}</span>
            </div>
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">К выплате</span>
              <span className="font-medium text-foreground">{formatCurrency(investor.due)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3 dark:border-white/[0.06]">
          <Button
            type="button"
            variant="outline"
            className="h-9 flex-1 text-sm sm:flex-none"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={updateMutation.isPending || (isCommonNetwork && (rateAtEntryPending || !rateAtEntryRes?.current))}
            className={cn("h-9 flex-1 text-sm sm:min-w-[9rem]", glassAccentSurface)}
          >
            {updateMutation.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </InvestDeskModalShell>
  );
}
