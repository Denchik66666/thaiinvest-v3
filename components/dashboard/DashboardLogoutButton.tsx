"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/notify";

/** Компактная кнопка выхода для шапок дашборда (рядом с колоколом). */
export function DashboardLogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.post("/api/auth/logout", {});
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
      toast.error("Не удалось выйти. Повторите.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onLogout()}
      disabled={busy}
      className={cn(
        "shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        "transition hover:bg-white/10 hover:text-foreground active:bg-white/15",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      aria-label="Выйти из аккаунта"
    >
      Выйти
    </button>
  );
}
