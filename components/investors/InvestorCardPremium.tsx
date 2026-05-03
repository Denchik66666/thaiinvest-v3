"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/notify";
import { useAppDialogs } from "@/components/feedback/AppDialogsProvider";

import { EditInvestorModal } from "./EditInvestorModal";
import { Investor } from "@/types/investor";

type InvestorCardPremiumProps = {
  investor: Investor;
  weekInfo?: {
    currentWeek: number;
    weekStart: string;
    weekEnd: string;
    nextPayout: string;
  };
  compact?: boolean;
};

export function InvestorCardPremium({ investor, weekInfo, compact = false }: InvestorCardPremiumProps) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm } = useAppDialogs();
  
  const [showEditModal, setShowEditModal] = useState(false);

  // Calculate available for withdrawal
  const availableForWithdrawal = useMemo(() => {
    return Math.max(investor.accrued - (investor.paid || 0), 0);
  }, [investor.accrued, investor.paid]);

  // Role-based permissions
  const canEdit = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const canPause = user?.role === "SUPER_ADMIN";
  const canApproveWithdraw = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const isOwnInvestment = user?.role === "INVESTOR" && investor.investorUserId === user.id;
  const isPrivateNetwork = investor.isPrivate;

  // Status badge colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-[#4ade80]/15 text-[#4ade80] border-[#4ade80]/35";
      case "paused":
        return "bg-[#fbbf24]/15 text-[#fbbf24] border-[#fbbf24]/35";
      case "closed":
        return "bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/35";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "paused":
        return "Paused";
      case "closed":
        return "Closed";
      default:
        return status;
    }
  };

  // Calculate days until next payout
  const getDaysUntilPayout = () => {
    if (!weekInfo) return null;
    const today = new Date();
    const nextPayoutDate = new Date(weekInfo.nextPayout);
    const diffTime = nextPayoutDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntilPayout = getDaysUntilPayout();

  // Mutations
  const pauseMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/investors/${investor.id}`, { status: "paused" }),
    onSuccess: () => {
      toast.success("Investor paused");
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investor", investor.id.toString()] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/investors/${investor.id}`, { status: "closed" }),
    onSuccess: () => {
      toast.success("Investor closed");
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investor", investor.id.toString()] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handlePause = async () => {
    const ok = await confirm({
      title: "Pause Investor?",
      description: `Are you sure you want to pause ${investor.name}?`,
      confirmLabel: "Pause",
      cancelLabel: "Cancel",
      tone: "neutral",
    });
    if (ok) pauseMutation.mutate();
  };

  const handleClose = async () => {
    const ok = await confirm({
      title: "Close Investor?",
      description: `Are you sure you want to close ${investor.name}? This action cannot be undone.`,
      confirmLabel: "Close",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (ok) closeMutation.mutate();
  };

  const handleWithdraw = () => {
    if (isOwnInvestment) {
      // Investor creates withdrawal request
      router.push(`/dashboard/investors/${investor.id}`);
    } else if (canApproveWithdraw) {
      // Admin approves withdrawal
      router.push(`/dashboard/investors/${investor.id}`);
    }
  };

  const handlePositions = () => {
    router.push(`/dashboard/investors/${investor.id}`);
  };

  if (compact) {
    // Compact version for list view
    return (
      <div className="group relative">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="relative bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-white">{investor.name}</h3>
                <Badge className={cn("text-xs", getStatusColor(investor.status))}>
                  {getStatusText(investor.status)}
                </Badge>
                {isPrivateNetwork && (
                  <Badge className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                    Private
                  </Badge>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <Text className="text-slate-400 text-xs">Body</Text>
                  <Text className="font-semibold" style={{ color: "#ffffff" }}>
                    {" "}
                    {investor.body.toLocaleString("ru-RU")}
                  </Text>
                </div>
                <div>
                  <Text className="text-slate-400 text-xs">Accrued</Text>
                  <Text className="font-semibold" style={{ color: "#60a5fa" }}>
                    {" "}
                    {investor.accrued.toLocaleString("ru-RU")}
                  </Text>
                </div>
                <div>
                  <Text className="text-slate-400 text-xs">To Pay</Text>
                  <Text className="font-bold" style={{ color: "#fbbf24" }}>
                    {" "}
                    {availableForWithdrawal.toLocaleString("ru-RU")}
                  </Text>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                <span>Rate: {investor.rate}%</span>
                {weekInfo && <span>Week #{weekInfo.currentWeek}</span>}
                <span>Owner: {investor.owner.username}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => setShowEditModal(true)}
                  className="bg-[#60a5fa] text-[#0f172a] hover:brightness-110 border-[#60a5fa]/40"
                >
                  Edit
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleWithdraw}
                className={
                  isOwnInvestment
                    ? "bg-[#ef4444] hover:brightness-110 text-white border-[#ef4444]/40"
                    : "border-white/25 text-white hover:bg-white/10"
                }
              >
                {isOwnInvestment ? "Withdraw" : "Manage"}
              </Button>
              <Button size="sm" variant="outline" onClick={handlePositions}>
                Positions
              </Button>
            </div>
          </div>
        </div>

        <EditInvestorModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          investor={investor}
        />
      </div>
    );
  }

  // Full premium card version
  return (
    <div className="group relative">
      {/* Background glow effects */}
      <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-purple-500/20 rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      {/* Main card */}
      <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden hover:border-white/20 transition-all duration-500">
        {/* Header gradient */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-purple-500"></div>
        
        <div className="p-6">
          {/* Top section: Name and Status */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-white">{investor.name}</h2>
                <Badge className={cn("text-sm px-3 py-1", getStatusColor(investor.status))}>
                  {getStatusText(investor.status)}
                </Badge>
                {isPrivateNetwork && (
                  <Badge className="text-sm bg-purple-500/20 text-purple-300 border-purple-500/30 px-3 py-1">
                    Private Network
                  </Badge>
                )}
              </div>
              
              <div className="text-sm text-slate-400">
                Owner: <span className="text-slate-300">{investor.owner.username}</span>
                {investor.investorUser && (
                  <span className="ml-3">
                    Investor: <span className="text-slate-300">{investor.investorUser.username}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => setShowEditModal(true)}
                  className="bg-[#60a5fa] text-[#0f172a] hover:brightness-110 border-[#60a5fa]/40"
                >
                  Edit
                </Button>
              )}
              {canPause && investor.status === "active" && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handlePause}
                  className="border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10"
                  disabled={pauseMutation.isPending}
                >
                  {pauseMutation.isPending ? "Pausing..." : "Pause"}
                </Button>
              )}
              {canPause && investor.status === "paused" && (
                <Button 
                  size="sm" 
                  onClick={() => apiClient.patch(`/api/investors/${investor.id}`, { status: "active" })}
                  className="bg-[#4ade80] text-[#0f172a] hover:brightness-110 border-[#4ade80]/40"
                >
                  Resume
                </Button>
              )}
              {canPause && investor.status !== "closed" && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleClose}
                  className="border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10"
                  disabled={closeMutation.isPending}
                >
                  {closeMutation.isPending ? "Closing..." : "Close"}
                </Button>
              )}
            </div>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <Text className="text-slate-400 text-sm mb-1">Body</Text>
              <Text className="text-xl font-bold" style={{ color: "#ffffff" }}>
                {" "}
                {investor.body.toLocaleString("ru-RU")}
              </Text>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <Text className="text-slate-400 text-sm mb-1">Accrued</Text>
              <Text className="text-xl font-bold" style={{ color: "#60a5fa" }}>
                {" "}
                {investor.accrued.toLocaleString("ru-RU")}
              </Text>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <Text className="text-slate-400 text-sm mb-1">To Pay</Text>
              <Text className="text-xl font-bold" style={{ color: "#fbbf24" }}>
                {" "}
                {availableForWithdrawal.toLocaleString("ru-RU")}
              </Text>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <Text className="text-slate-400 text-sm mb-1">Rate</Text>
              <Text className="text-white text-xl font-bold">{investor.rate}%</Text>
            </div>
          </div>

          {/* Week and payout info */}
          {weekInfo && (
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <Text className="text-slate-400 text-sm">Current Week</Text>
                  <Text className="text-white font-semibold">
                    #{weekInfo.currentWeek} ({weekInfo.weekStart} - {weekInfo.weekEnd})
                  </Text>
                </div>
                <div className="text-right">
                  <Text className="text-slate-400 text-sm">Next Payout</Text>
                  <Text className="font-semibold" style={{ color: "#fbbf24" }}>
                    {weekInfo.nextPayout}
                    {daysUntilPayout !== null && (
                      <span className="text-sm text-slate-400 ml-2">
                        ({daysUntilPayout > 0 ? `in ${daysUntilPayout} days` : daysUntilPayout === 0 ? 'today' : 'overdue'})
                      </span>
                    )}
                  </Text>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons row */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleWithdraw}
              className={
                isOwnInvestment
                  ? "bg-[#ef4444] hover:brightness-110 text-white border-[#ef4444]/40 shadow-lg shadow-[#ef4444]/25"
                  : canApproveWithdraw
                    ? "bg-[#fbbf24] text-[#0f172a] hover:brightness-110 border-[#fbbf24]/40 shadow-lg shadow-[#fbbf24]/20"
                    : "border-white/25 text-white hover:bg-white/10"
              }
            >
              {isOwnInvestment ? "Request Withdrawal" : canApproveWithdraw ? "Manage Withdrawals" : "View Details"}
            </Button>
            <Button 
              variant="outline" 
              onClick={handlePositions}
              className="border-[#60a5fa]/40 text-[#60a5fa] hover:bg-[#60a5fa]/10"
            >
              View Positions
            </Button>
          </div>
        </div>
      </div>

      <EditInvestorModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        investor={investor}
      />
    </div>
  );
}
