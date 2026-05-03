"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export type BottomNavKey = "home" | "finance" | "reports" | "investors" | "manage" | "chat" | "profile";

type Tab = {
  key: BottomNavKey;
  label: string;
  path: string;
};

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={active ? "text-foreground" : "text-muted-foreground"}>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" strokeLinejoin="round" />
    </svg>
  );
}

function IconFinance({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={active ? "text-foreground" : "text-muted-foreground"}>
      <path d="M7 7h10v10H7z" />
      <path d="M9 12h6M12 9v6" />
    </svg>
  );
}

function IconReports({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={active ? "text-foreground" : "text-muted-foreground"}>
      <path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconInvestors({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={active ? "text-foreground" : "text-muted-foreground"}>
      <path d="M7.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M3.5 19c.5-2.6 2.4-4 4-4s3.5 1.4 4 4M12.5 19c.5-2.6 2.4-4 4-4s3.5 1.4 4 4" strokeLinecap="round" />
    </svg>
  );
}

function IconManage({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={active ? "text-foreground" : "text-muted-foreground"}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
      <path d="M4 12h2m12 0h2M6.4 6.4l1.4 1.4m8.4 8.4l1.4 1.4m0-11.2-1.4 1.4M7.8 16.2l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function MobileBottomNav({ active }: { active?: BottomNavKey }) {
  const router = useRouter();
  const { user } = useAuth();

  const tabs: Tab[] =
    user?.role === "INVESTOR"
      ? [
          { key: "home", label: "Главная", path: "/dashboard" },
          { key: "finance", label: "Финансы", path: "/dashboard/finance" },
          { key: "reports", label: "Отчёты", path: "/dashboard/reports" },
        ]
      : [
          { key: "home", label: "Главная", path: "/dashboard" },
          { key: "investors", label: "Инвесторы", path: "/dashboard/investors" },
          { key: "manage", label: "Управление", path: "/dashboard/manage" },
          { key: "reports", label: "Отчёты", path: "/dashboard/reports" },
        ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 pt-2 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        className={cn(
          "thai-glass pointer-events-auto flex w-full max-w-md items-stretch justify-between gap-0.5 rounded-[22px] px-0.5 py-0.5",
          "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]"
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const iconProps = { active: isActive };
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => router.push(tab.path)}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[18px] px-1 py-2 text-[11px] font-medium transition",
                isActive
                  ? "bg-primary/12 text-foreground shadow-sm"
                  : "text-muted-foreground/90 hover:bg-muted/20 hover:text-foreground"
              )}
            >
              <span className="relative flex h-7 w-7 items-center justify-center">
                {tab.key === "home" ? <IconHome {...iconProps} /> : null}
                {tab.key === "finance" ? <IconFinance {...iconProps} /> : null}
                {tab.key === "reports" ? <IconReports {...iconProps} /> : null}
                {tab.key === "investors" ? <IconInvestors {...iconProps} /> : null}
                {tab.key === "manage" ? <IconManage {...iconProps} /> : null}
              </span>
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
