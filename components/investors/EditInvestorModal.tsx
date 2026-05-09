"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { DatePicker } from "@/components/ui/DatePicker";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { Investor } from "@/types/investor";

type EditInvestorModalProps = {
  open: boolean;
  onClose: () => void;
  investor: Investor;
};

export function EditInvestorModal({ open, onClose, investor }: EditInvestorModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: investor.name,
    body: investor.body.toString(),
    accrued: investor.accrued.toString(),
    rate: investor.rate.toString(),
    entryDate: investor.entryDate ? investor.entryDate.split("T")[0] : new Date().toISOString().split("T")[0],
    activationDate: investor.activationDate ? investor.activationDate.split("T")[0] : new Date().toISOString().split("T")[0],
  });

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
      toast.success("Investor updated successfully");
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

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Edit Investor</h2>
          <Text className="text-slate-400">
            Editing: <span className="text-white font-semibold">{investor.name}</span>
          </Text>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Body (Deposit)</Label>
                <Input
                  type="number"
                  value={formData.body}
                  onChange={(e) => handleInputChange("body", e.target.value)}
                  className="bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500"
                  step="0.01"
                  min="0"
                  required
                />
                <Text className="text-xs mt-1" style={{ color: "#fbbf24" }}>
                  Warning: Changing body will recalculate accruals
                </Text>
              </div>

              <div>
                <Label className="text-slate-300">{isCommonNetwork ? "Rate (network at entry)" : "Rate (%)"}</Label>
                {isCommonNetwork ? (
                  <>
                    <Input
                      disabled
                      value={
                        rateAtEntryPending
                          ? "Checking…"
                          : rateAtEntryRes?.current
                            ? `${rateAtEntryRes.current.rate}%`
                            : "—"
                      }
                      className="bg-slate-800/50 border-slate-700/50 text-white opacity-90 cursor-not-allowed"
                    />
                    <Text className="text-xs mt-1 text-slate-400">
                      Common network: card rate follows business rate on entry date (set on save).
                    </Text>
                  </>
                ) : (
                  <Input
                    type="number"
                    value={formData.rate}
                    onChange={(e) => handleInputChange("rate", e.target.value)}
                    className="bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500"
                    step="0.01"
                    min="0"
                    max="100"
                    required
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {user?.role === "SUPER_ADMIN" ? (
                <div>
                  <Label className="text-slate-300">Accrued</Label>
                  <Input
                    type="number"
                    value={formData.accrued}
                    onChange={(e) => handleInputChange("accrued", e.target.value)}
                    className="bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500"
                    step="0.01"
                    min="0"
                  />
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Entry Date</Label>
                <DatePicker value={formData.entryDate} onChange={(value) => handleInputChange("entryDate", value)} />
                <Text className="text-xs mt-1" style={{ color: "#fbbf24" }}>
                  Warning: Changing entry date will recalculate accruals
                </Text>
              </div>

              <div>
                <Label className="text-slate-300">Activation Date</Label>
                <DatePicker
                  value={formData.activationDate}
                  onChange={(value) => handleInputChange("activationDate", value)}
                  highlightedDates={dateHighlights}
                />
              </div>
            </div>

          </div>

          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-300 mb-3">Current Values</Text>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Body:</span>
                <span style={{ color: "#ffffff" }}>{investor.body.toLocaleString("ru-RU")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Accrued:</span>
                <span style={{ color: "#60a5fa" }}>{investor.accrued.toLocaleString("ru-RU")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Paid:</span>
                <span style={{ color: "#4ade80" }}>{(investor.paid || 0).toLocaleString("ru-RU")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Due:</span>
                <span style={{ color: "#fbbf24" }}>{investor.due.toLocaleString("ru-RU")}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={
                updateMutation.isPending || (isCommonNetwork && (rateAtEntryPending || !rateAtEntryRes?.current))
              }
              className={cn("bg-blue-600 hover:bg-blue-700 border-blue-500/30")}
            >
              {updateMutation.isPending ? "Updating..." : "Update Investor"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
