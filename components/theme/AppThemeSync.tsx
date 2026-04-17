"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

import {
  applyAppThemeToDocument,
  getThemeServerSnapshot,
  parseThemeSnapshot,
  readThemeSnapshot,
  subscribeAppTheme,
} from "@/lib/app-theme";

export default function AppThemeSync() {
  const snap = useSyncExternalStore(subscribeAppTheme, readThemeSnapshot, getThemeServerSnapshot);
  const { theme, dark } = parseThemeSnapshot(snap);

  useLayoutEffect(() => {
    applyAppThemeToDocument(theme, dark);
  }, [theme, dark]);

  return null;
}
