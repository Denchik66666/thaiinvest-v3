"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DatePicker } from "@/components/ui/DatePicker";
import { UserAvatar } from "@/components/user/UserAvatar";
import { StatusBadge } from "@/components/investors/InvestorsTable";
import { cn, formatCurrency } from "@/lib/utils";
import { moneyRound2 } from "@/lib/money-round";
import { investorDisplayHandle } from "@/lib/investor-display-handle";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";

type Investor = {
  id: number;
  name: string;
  handle?: string | null;
  linkedUser?: { id: number; username: string } | null;
  owner: { id: number; username: string; role: string };
  body: number;
  rate: number;
  accrued: number;
  paid?: number;
  entryDate?: string | null;
  activationDate?: string | null;
  status: string;
  investorUser?: { id: number; username: string } | null;
  investorUserId?: number | null;
  /** Общая сеть: ставка карточки = бизнес-ставка на дату входа (редактирование процента с формы не отправляется). */
  isPrivate?: boolean;
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
  /** SUPER_ADMIN: отправляем accrued/paid на сервер только если правили эти поля (иначе авто‑пересчёт по датам/телу сохраняется). */
  const [balancesTouched, setBalancesTouched] = useState(false);
  const [editForm, setEditForm] = useState({
    name: investor?.name || "",
    body: investor?.body?.toString() || "0",
    rate: investor?.rate?.toString() || "0",
    accrued: investor?.accrued?.toString() ?? "0",
    paid: investor?.paid != null ? String(investor.paid) : "0",
    entryDate: investor?.entryDate ? investor.entryDate.split("T")[0] : "",
    activationDate: investor?.activationDate ? investor.activationDate.split("T")[0] : "",
  });

  useEffect(() => {
    setEditForm({
      name: investor.name,
      body: String(investor.body),
      rate: String(investor.rate),
      accrued: String(investor.accrued),
      paid: investor.paid != null ? String(investor.paid) : "0",
      entryDate: investor.entryDate ? investor.entryDate.split("T")[0] : "",
      activationDate: investor.activationDate ? investor.activationDate.split("T")[0] : "",
    });
  }, [
    investor.id,
    investor.name,
    investor.body,
    investor.rate,
    investor.accrued,
    investor.paid,
    investor.entryDate,
    investor.activationDate,
  ]);

  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canEdit = isOwner || investor?.investorUserId === user?.id;

  const dateHighlights = useMemo(() => {
    if (!investor) return [];
    const s = new Set<string>();
    const y = (iso: string) => (iso ? iso.split("T")[0] : "");
    if (investor.entryDate) s.add(y(investor.entryDate));
    if (investor.activationDate) s.add(y(investor.activationDate));
    return Array.from(s);
  }, [investor]);

  const isCommonNetwork = investor.isPrivate !== true;
  const entryYmdForRatePreview =
    editForm.entryDate.trim() || (investor.entryDate ? investor.entryDate.split("T")[0] : "");

  const { data: rateAtEntryRes, isPending: rateAtEntryPending } = useQuery({
    queryKey: ["business-rate-at-entry-edit", investor.id, entryYmdForRatePreview],
    queryFn: () =>
      apiClient.get<{ success: boolean; current: { rate: number; effectiveDate: string } | null }>(
        `/api/system/business-rate?at=${encodeURIComponent(entryYmdForRatePreview)}`
      ),
    enabled: isEditing && isCommonNetwork && Boolean(entryYmdForRatePreview),
    staleTime: 20_000,
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof editForm) => {
      const bodyNum = moneyRound2(Number(String(data.body).replace(/\s/g, "").replace(",", ".")));
      const payload: Record<string, unknown> = {
        name: data.name.trim(),
        body: bodyNum,
      };
      if (!isCommonNetwork) {
        const rateNum = Number(String(data.rate).replace(",", "."));
        if (!Number.isFinite(rateNum) || rateNum < 0) throw new Error("Некорректная ставка");
        payload.rate = rateNum;
      }
      if (user?.role === "SUPER_ADMIN" && balancesTouched) {
        payload.accrued = moneyRound2(Number(String(data.accrued).replace(/\s/g, "").replace(",", ".")));
        payload.paid = moneyRound2(Number(String(data.paid).replace(/\s/g, "").replace(",", ".")));
      }
      if (data.entryDate.trim()) payload.entryDate = data.entryDate.trim();
      if (data.activationDate.trim()) payload.activationDate = data.activationDate.trim();
      return apiClient.put(`/api/investors/${investor.id}`, payload);
    },
    onSuccess: () => {
      toast.success("Данные инвестора обновлены");
      setIsEditing(false);
      setBalancesTouched(false);
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
            <UserAvatar
              name={investor.name}
              initialsFrom={investorDisplayHandle(investor) ?? undefined}
              size={48}
            />
            <div className="min-w-0">
              <Text className="text-base font-semibold text-foreground md:text-lg">{investor.name}</Text>
              <Text className="text-xs text-muted-foreground">
                {investor.investorUser?.username || "Нет пользователя"}
              </Text>
            </div>
          </div>
          {canEdit && variant === "manage" ? (
            <div className="flex shrink-0 items-start">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(!isEditing);
                  if (isEditing) setBalancesTouched(false);
                }}
              >
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
                <Label>{isCommonNetwork ? "Ставка (сеть на дату входа)" : "Ставка (%)"}</Label>
                {isCommonNetwork ? (
                  <>
                    <Input
                      disabled
                      value={
                        rateAtEntryPending
                          ? "Проверка…"
                          : rateAtEntryRes?.current
                            ? `${rateAtEntryRes.current.rate}%`
                            : "—"
                      }
                      className="cursor-not-allowed opacity-90"
                    />
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      В общей сети процент карточки совпадает с бизнес-ставкой на дату входа; при сохранении подставится автоматически.
                    </p>
                  </>
                ) : (
                  <Input
                    type="number"
                    step="0.1"
                    value={editForm.rate}
                    onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                    placeholder="10"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Тело позиции</Label>
                <Input
                  inputMode="decimal"
                  value={editForm.body}
                  onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                  placeholder="0"
                />
              </div>
              {isSuperAdmin ? (
                <>
                  <div>
                    <Label>Начислено (ручная правка)</Label>
                    <Input
                      inputMode="decimal"
                      value={editForm.accrued}
                      onChange={(e) => {
                        setBalancesTouched(true);
                        setEditForm({ ...editForm, accrued: e.target.value });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Выплачено (ручная правка)</Label>
                    <Input
                      inputMode="decimal"
                      value={editForm.paid}
                      onChange={(e) => {
                        setBalancesTouched(true);
                        setEditForm({ ...editForm, paid: e.target.value });
                      }}
                      placeholder="0"
                    />
                  </div>
                </>
              ) : null}
            </div>

            {isSuperAdmin ? (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Даты и тело можно править отдельно: начисленное пересчитается по правилам недель, если вы не меняли поля «начислено» / «выплачено» в этой форме. Чтобы зафиксировать суммы вручную — измените их и сохраните.
              </p>
            ) : (
              <p className="text-[10px] leading-snug text-muted-foreground">
                При смене даты входа дата активации пересчитывается автоматически (правило понедельника).
              </p>
            )}

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
                highlightedDates={dateHighlights}
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Тело</Text>
            <Text className="text-base font-bold tabular-nums md:text-lg" style={{ color: "#ffffff" }}>
              {formatCurrency(investor.body)}
            </Text>
          </div>
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ставка</Text>
            <Text className="text-base font-bold tabular-nums text-foreground md:text-lg">{investor.rate}%</Text>
          </div>
          <div className="thai-stat-tile thai-glass border border-border/30 text-center">
            <Text className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Начислено</Text>
            <Text className="text-base font-bold tabular-nums md:text-lg" style={{ color: "#60a5fa" }}>
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
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setBalancesTouched(false);
              }}
            >
              Отмена
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
