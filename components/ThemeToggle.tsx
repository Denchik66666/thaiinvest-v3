"use client";

import { useSyncExternalStore } from "react";

import {
  getThemeServerSnapshot,
  parseThemeSnapshot,
  persistAppTheme,
  readThemeSnapshot,
  subscribeAppTheme,
} from "@/lib/app-theme";

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

export default function ThemeToggle() {
  const themeSnap = useSyncExternalStore(subscribeAppTheme, readThemeSnapshot, getThemeServerSnapshot);
  const { theme: currentTheme, dark } = parseThemeSnapshot(themeSnap);

  const toggleDark = () => {
    persistAppTheme(currentTheme, !dark);
  };

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={toggleDark}
        className="
          h-9 px-3 rounded-xl border border-border/70
          hover:bg-secondary/70 transition
          flex items-center gap-2
        "
        title="Светлая/темная тема"
      >
        <IconSunMoon />
        <span className="text-xs font-medium hidden sm:inline">{dark ? "Тёмная" : "Светлая"}</span>
      </button>
    </div>
  );
}
