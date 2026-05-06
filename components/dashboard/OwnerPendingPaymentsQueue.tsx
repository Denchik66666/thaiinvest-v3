"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";

export type OwnerPendingPaymentRow = {
  id: number;
  investorId: number;
  investorName: string;
  type: "interest" | "body" | "close";
  amount: number;
  comment?: string | null;
  createdAt: string;
};

export function ownerPendingPaymentTypeRu(t: OwnerPendingPaymentRow["type"]) {
  if (t === "interest") return "Проценты";
  if (t === "body") return "Тело";
  if (t === "close") return "Закрытие";
  return t;
}

export function formatOwnerPendingPaymentShortWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function useOwnerPendingPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      paymentId,
      action,
      comment,
    }: {
      paymentId: number;
      action: "owner_approve" | "owner_reject";
      /** Дописывается к комментарию заявки (owner_approve / owner_reject) */
      comment?: string;
    }) =>
      apiClient.post("/api/payments", {
        action,
        paymentId,
        ...(comment ? { comment } : {}),
      }),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["reports-investors"] });
      toast.success(v.action === "owner_approve" ? "Одобрено — инвестор получит уведомление" : "Заявка отклонена");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось выполнить действие");
    },
  });
}
