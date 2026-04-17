"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";

export type BottomNavKey = "home" | "finance" | "reports" | "chat" | "profile";

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

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={active ? "text-foreground" : "text-muted-foreground"}>
      <path d="M21 12a7 7 0 01-7 7H8l-4 3v-3.5A7 7 0 1114 5" strokeLinecap="round" />
      <path d="M9.5 9.5h.01M12 9.5h.01M14.5 9.5h.01" strokeLinecap="round" />
    </svg>
  );
}

export default function MobileBottomNav({ active }: { active?: BottomNavKey }) {
  const router = useRouter();
  const { user } = useAuth();

  const { data: chatCtx } = useQuery({
    queryKey: ["chat-context"],
    queryFn: () => apiClient.get<{ unreadTotal: number }>("/api/chat/context"),
    enabled: !!user,
    refetchInterval: 45_000,
  });
  const unread = chatCtx?.unreadTotal ?? 0;

  const financePath = "/dashboard/finance";

  const tabs: Tab[] = [
    { key: "home", label: "Главная", path: "/dashboard" },
    { key: "finance", label: "Финансы", path: financePath },
    { key: "reports", label: "Отчёты", path: "/dashboard/reports" },
    { key: "chat", label: "Чат", path: "/dashboard/chat" },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 pt-2 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-stretch justify-between gap-0.5 rounded-[22px]",
          "border border-border/70 bg-background/90 shadow-[0_8px_32px_rgba(0,0,0,0.25)] backdrop-blur-xl dark:border-border/45 dark:bg-background/72",
          "supports-[backdrop-filter]:bg-background/85 dark:supports-[backdrop-filter]:bg-background/55"
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
                isActive ? "text-foreground" : "text-muted-foreground/90 hover:text-foreground"
              )}
            >
              <span className="relative flex h-7 w-7 items-center justify-center">
                {tab.key === "home" ? <IconHome {...iconProps} /> : null}
                {tab.key === "finance" ? <IconFinance {...iconProps} /> : null}
                {tab.key === "reports" ? <IconReports {...iconProps} /> : null}
                {tab.key === "chat" ? <IconChat {...iconProps} /> : null}
                {tab.key === "chat" && unread > 0 ? (
                  <span className="absolute -right-1 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </span>
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
