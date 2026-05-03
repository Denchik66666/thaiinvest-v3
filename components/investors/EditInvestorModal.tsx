"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Investor } from "@/types/investor";

type EditInvestorModalProps = {
  open: boolean;
  onClose: () => void;
  investor: Investor;
};

export function EditInvestorModal({ open, onClose, investor }: EditInvestorModalProps) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: investor.name,
    body: investor.body.toString(),
    accrued: investor.accrued.toString(),
    rate: investor.rate.toString(),
    status: investor.status,
    entryDate: investor.entryDate ? investor.entryDate.split('T')[0] : new Date().toISOString().split('T')[0],
    activationDate: investor.activationDate ? investor.activationDate.split('T')[0] : new Date().toISOString().split('T')[0],
    comment: "",
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiClient.patch(`/api/investors/${investor.id}`, {
        name: data.name,
        body: parseFloat(data.body) || 0,
        accrued: parseFloat(data.accrued) || 0,
        rate: parseFloat(data.rate) || 0,
        status: data.status,
        entryDate: data.entryDate,
        activationDate: data.activationDate,
        comment: data.comment,
      }),
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
    updateMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
          {/* Basic Info */}
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
                <Label className="text-slate-300">Rate (%)</Label>
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
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

              <div>
                <Label className="text-slate-300">Status</Label>
                <Select value={formData.status} onValueChange={(value: string) => handleInputChange("status", value)}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700/50 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="active" className="text-white hover:bg-slate-700">Active</SelectItem>
                    <SelectItem value="paused" className="text-white hover:bg-slate-700">Paused</SelectItem>
                    <SelectItem value="closed" className="text-white hover:bg-slate-700">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Entry Date</Label>
                <DatePicker
                  value={formData.entryDate}
                  onChange={(value) => handleInputChange("entryDate", value)}
                />
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

            <div>
              <Label className="text-slate-300">Internal Comment</Label>
              <Input
                value={formData.comment}
                onChange={(e) => handleInputChange("comment", e.target.value)}
                placeholder="Internal notes (optional)"
                className="bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* Current Values Display */}
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <Text className="text-sm font-semibold text-slate-300 mb-3">Current Values</Text>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Body:</span>
                <span style={{ color: "#ffffff" }}>{investor.body.toLocaleString('ru-RU')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Accrued:</span>
                <span style={{ color: "#60a5fa" }}>{investor.accrued.toLocaleString('ru-RU')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Paid:</span>
                <span style={{ color: "#4ade80" }}>{(investor.paid || 0).toLocaleString('ru-RU')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Due:</span>
                <span style={{ color: "#fbbf24" }}>{investor.due.toLocaleString('ru-RU')}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 border-blue-500/30"
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
