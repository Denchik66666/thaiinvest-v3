"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user/UserAvatar";

export type InvestorPositionAvatarHeadingProps = {
  name: string;
  /** Две буквы на аватаре без фото — из ника/handle; если пусто — из `name`. */
  avatarInitialsSource?: string | null;
  /** Значение `status` из API позиции — «активное» кольцо только для `active`. */
  status: string;
  avatarSize?: number;
  className?: string;
  /** Ник как явная ссылка при отдельной кнопке профиля (OWNER‑список и т.п.). */
  nickInteractiveHint?: boolean;
  /** Справа от ника в том же ряду (шеврон аккордеона и т.п.). */
  nickTrailing?: ReactNode;
  /** Под ником: бейджи, подпись `@handle` и т.д. */
  metaBelowNick?: ReactNode;
};

/** Единый ряд аватар+ник для списков позиций (как эталон топбара инвестора). */
export function InvestorPositionAvatarHeading({
  name,
  avatarInitialsSource,
  status,
  avatarSize = 42,
  className,
  nickInteractiveHint,
  nickTrailing,
  metaBelowNick,
}: InvestorPositionAvatarHeadingProps) {
  const positionsActive = status === "active";
  const alignTop = Boolean(metaBelowNick);
  return (
    <div className={cn("flex min-w-0 gap-2", alignTop ? "items-start" : "items-center", className)}>
      <span
        className={cn(
          "thai-dashboard-avatar-ring relative shrink-0 rounded-full p-[2px]",
          "transition-[box-shadow] duration-300 ease-out"
        )}
        data-has-positions={positionsActive ? "true" : "false"}
      >
        <UserAvatar
          name={name}
          initialsFrom={avatarInitialsSource}
          size={avatarSize}
          className="!ring-0 bg-transparent [&_img]:object-cover"
        />
      </span>
      <div className={cn("min-w-0 flex-1", metaBelowNick ? "flex flex-col gap-0.5" : undefined)}>
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "thai-dashboard-nick-matte-gold min-w-0 truncate text-sm font-semibold tracking-tight",
              nickInteractiveHint && "underline-offset-[3px] decoration-primary/55 hover:underline"
            )}
          >
            {name}
          </span>
          {nickTrailing}
        </div>
        {metaBelowNick}
      </div>
    </div>
  );
}
