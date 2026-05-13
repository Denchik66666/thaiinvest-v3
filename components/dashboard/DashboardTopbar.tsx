"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { UserAvatar } from "@/components/user/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { DashboardLogoutButton } from "@/components/dashboard/DashboardLogoutButton";

export type DashboardTopbarProps = {
  barScrolled: boolean;
  username: string;
  avatarUrl?: string | null;
  /** Единое правило для всех ролей: есть ли активные позиции в кабинете (кольцо аватара как у эталона инвестора). */
  dashboardPositionsActive: boolean;
};

export function DashboardTopbar({
  barScrolled,
  username,
  avatarUrl,
  dashboardPositionsActive,
}: DashboardTopbarProps) {
  const router = useRouter();

  return (
    <div className={cn(DASHBOARD_STICKY_BAR_CLASS, barScrolled && "thai-bar-scrolled")}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex shrink-0 items-center gap-2 px-1 py-1">
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className="relative shrink-0 rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Профиль — аватар"
          >
            <UserAvatar
              name={username}
              src={avatarUrl}
              variant="plain"
              hasPositions={dashboardPositionsActive}
              size={42}
              className="thai-dashboard-avatar-ring transition-[box-shadow] duration-300 ease-out !ring-0 bg-transparent shadow-none [&_img]:object-cover"
            />
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className={cn(
              "group inline-flex min-w-0 max-w-[min(72vw,12.5rem)] items-center gap-1 bg-transparent px-0 py-0 outline-none transition sm:max-w-[14rem]",
              "hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
            aria-label={`Профиль — ${username}`}
          >
            <span className="thai-dashboard-nick-matte-gold truncate text-sm font-semibold tracking-tight">
              {username}
            </span>
            <span className="shrink-0 text-muted-foreground" aria-hidden>
              ›
            </span>
          </button>
        </div>
        <span className="min-h-px min-w-0 flex-1 select-none" aria-hidden />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell />
        <DashboardLogoutButton />
      </div>
    </div>
  );
}
