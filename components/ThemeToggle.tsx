"use client";

import { useSyncExternalStore } from "react";

import {
  getThemeServerSnapshot,
  parseThemeSnapshot,
  persistAppTheme,
  readThemeSnapshot,
  subscribeAppTheme,
} from "@/lib/app-theme";
import { cn } from "@/lib/utils";

export type ThemeToggleProps = {
  /** «Иконка в круге» для шапки логина; полная кнопка — на дашборде */
  variant?: "default" | "compact";
  className?: string;
};

function IconSunMoon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-foreground"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export default function ThemeToggle({ variant = "default", className }: ThemeToggleProps) {
  const themeSnap = useSyncExternalStore(subscribeAppTheme, readThemeSnapshot, getThemeServerSnapshot);
  const { theme: currentTheme, dark } = parseThemeSnapshot(themeSnap);

  const toggleDark = () => {
    persistAppTheme(currentTheme, !dark);
  };

  const isCompact = variant === "compact";

  return (
    <div className={cn("flex items-center", className)}>
      <button
        type="button"
        onClick={toggleDark}
        className={cn(
          "thai-glass transition duration-200 ease-out touch-manipulation [-webkit-tap-highlight-color:transparent]",
          isCompact
            ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border p-0 hover:brightness-[1.03] active:scale-[0.97] dark:hover:brightness-110"
            : "flex h-10 items-center gap-2 rounded-xl px-3 hover:brightness-[1.03] active:scale-[0.97] dark:hover:brightness-110"
        )}
        title="Светлая/тёмная тема"
        aria-label={dark ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
      >
        <IconSunMoon />
        {!isCompact ? (
          <span className="text-xs font-medium hidden sm:inline">{dark ? "Тёмная" : "Светлая"}</span>
        ) : null}
      </button>
    </div>
  );
}
