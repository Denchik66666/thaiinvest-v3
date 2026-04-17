/**
 * Единая точка: localStorage + классы на <html> + событие для useSyncExternalStore
 * (логин, профиль / ThemeToggle, другие вкладки).
 */

export const APP_THEME_EVENT = "thaiinvest-theme-storage";

const LS_THEME = "app-theme";
const LS_DARK = "app-dark-mode";

export const THEME_PRESETS = ["theme-linear", "theme-vercel", "theme-shadcn"] as const;
export type AppThemePreset = (typeof THEME_PRESETS)[number];
export const SINGLE_THEME_PRESET: AppThemePreset = "theme-linear";

export function applyAppThemeToDocument(theme: string, dark: boolean) {
  document.documentElement.classList.remove("theme-linear", "theme-vercel", "theme-shadcn");
  const stableTheme = SINGLE_THEME_PRESET;
  document.documentElement.classList.add(stableTheme);
  document.documentElement.classList.toggle("dark", dark);
}

export function persistAppTheme(theme: string, dark: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_THEME, SINGLE_THEME_PRESET);
  localStorage.setItem(LS_DARK, String(dark));
  applyAppThemeToDocument(SINGLE_THEME_PRESET, dark);
  window.dispatchEvent(new Event(APP_THEME_EVENT));
}

export function readThemeSnapshot(): string {
  if (typeof window === "undefined") return "theme-linear|1";
  const theme = SINGLE_THEME_PRESET;
  const storedDark = localStorage.getItem(LS_DARK);
  const dark = storedDark === null ? true : storedDark === "true";
  return `${theme}|${dark ? "1" : "0"}`;
}

export function getThemeServerSnapshot() {
  return "theme-linear|1";
}

export function subscribeAppTheme(onStoreChange: () => void) {
  const handler = () => onStoreChange();
  window.addEventListener(APP_THEME_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(APP_THEME_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function parseThemeSnapshot(snap: string): { theme: string; dark: boolean } {
  const pipe = snap.lastIndexOf("|");
  if (pipe === -1) return { theme: SINGLE_THEME_PRESET, dark: true };
  return {
    theme: SINGLE_THEME_PRESET,
    dark: snap.slice(pipe + 1) === "1",
  };
}

export function nextThemePreset(current: string): AppThemePreset {
  return SINGLE_THEME_PRESET;
}
