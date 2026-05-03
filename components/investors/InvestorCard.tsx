"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DatePicker } from "@/components/ui/DatePicker";
import { UserAvatar } from "@/components/user/UserAvatar";
import { StatusBadge } from "@/components/investors/InvestorsTable";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";

type Investor = {
  id: number;
  name: string;
  owner: { id: number; username: string; role: string };
  body: number;
  rate: number;
  accrued: number;
  entryDate?: string | null;
  activationDate?: string | null;
  status: string;
  investorUser?: { id: number; username: string } | null;
  investorUserId?: number | null;
};

type InvestorCardProps = {
  investor: Investor;
  variant?: "view" | "manage";
  className?: string;
};

export function InvestorCard({ investor, variant = "view", className }: InvestorCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: investor?.name || "",
    body: investor?.body?.toString() || "0",
    rate: investor?.rate?.toString() || "0",
    entryDate: investor?.entryDate || "",
    activationDate: investor?.activationDate || "",
  });

  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const canEdit = isOwner || investor?.investorUserId === user?.id;

  const updateMutation = useMutation({
    mutationFn: (data: typeof editForm) => apiClient.put(`/api/investors/${investor?.id}`, data),
    onSuccess: () => {
      toast.success("Данные инвестора обновлены");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investor", String(investor?.id)] });
      queryClient.invalidateQueries({ queryKey: ["investor-detail", investor?.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (!investor) {
    return (
      <div className={cn("thai-glass rounded-2xl p-4", className)}>
        <Text>Инвестор не найден</Text>
      </div>
    );
  }

  return (
    <div className={cn("thai-glass rounded-2xl p-4 md:p-5", className)}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar name={investor.name} size={48} />
            <div className="min-w-0">
              <Text className="text-base font-semibold text-foreground md:text-lg">{investor.name}</Text>
              <Text className="text-xs text-muted-foreground">
                {investor.investorUser?.username || "Нет пользователя"}
              </Text>
            </div>
          </div>
          {canEdit && variant === "manage" ? (
            <div className="flex shrink-0 items-start">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
                {isEditing ? "Отмена" : "Редактировать"}
              </Button>
            </div>
          ) : null}
        </div>

        {isEditing && canEdit ? (
          <div className="space-y-4 rounded-xl border border-border/50 bg-muted/15 p-4 backdrop-blur-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Имя</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <Label>Ставка (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editForm.rate}
                  onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                  placeholder="10"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Дата входа</Label>
              <DatePicker
                value={editForm.entryDate}
                onChange={(v) => setEditForm({ ...editForm, entryDate: v || "" })}
              />
            </div>

            <div className="space-y-3">
              <Label>Дата активации</Label>
              <DatePicker
                value={editForm.activationDate}
                onChange={(v) => setEditForm({ ...editForm, activationDate: v || "" })}
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Тело</Text>
            <Text className="text-base font-bold tabular-nums text-foreground md:text-lg">
              {formatCurrency(investor.body)}
            </Text>
          </div>
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ставка</Text>
            <Text className="text-base font-bold tabular-nums thai-text-metric-info md:text-lg">{investor.rate}%</Text>
          </div>
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Начислено</Text>
            <Text className="text-base font-bold tabular-nums thai-text-metric-ok md:text-lg">
              {formatCurrency(investor.accrued)}
            </Text>
          </div>
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Статус</Text>
            <div className="mt-1 flex justify-center">
              <StatusBadge status={investor.status} />
            </div>
          </div>
        </div>

        {isEditing && canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Отмена
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
