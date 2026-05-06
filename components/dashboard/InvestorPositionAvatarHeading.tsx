"use client";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user/UserAvatar";

export type InvestorPositionAvatarHeadingProps = {
  name: string;
  /** Значение `status` из API позиции — «активное» кольцо только для `active`. */
  status: string;
  avatarSize?: number;
  className?: string;
  /** Ник как явная ссылка при отдельной кнопке профиля (OWNER‑список и т.п.). */
  nickInteractiveHint?: boolean;
};

/** Единый ряд аватар+ник для списков позиций (как эталон топбара инвестора). */
export function InvestorPositionAvatarHeading({
  name,
  status,
  avatarSize = 42,
  className,
  nickInteractiveHint,
}: InvestorPositionAvatarHeadingProps) {
  const positionsActive = status === "active";
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        className={cn(
          "thai-dashboard-avatar-ring relative shrink-0 rounded-full p-[2px]",
          "transition-[box-shadow] duration-300 ease-out"
        )}
        data-has-positions={positionsActive ? "true" : "false"}
      >
        <UserAvatar name={name} size={avatarSize} className="!ring-0 bg-transparent [&_img]:object-cover" />
      </span>
      <span
        className={cn(
          "thai-dashboard-nick-matte-gold min-w-0 truncate text-sm font-semibold tracking-tight",
          nickInteractiveHint && "underline-offset-[3px] decoration-primary/55 hover:underline"
        )}
      >
        {name}
      </span>
    </div>
  );
}
