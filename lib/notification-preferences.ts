export type NotificationPollingMode = "fast" | "standard" | "economy";

export type NotificationPreferences = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  pollingMode: NotificationPollingMode;
};

export const NOTIFY_PREFS_EVENT = "thaiinvest-notify-prefs-storage";
const LS_NOTIFY_PREFS = "notify-preferences";

export const DEFAULT_NOTIFY_PREFS: NotificationPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
  pollingMode: "fast",
};

let lastSnapshot: NotificationPreferences = DEFAULT_NOTIFY_PREFS;
let lastRaw = "";

function normalizePreferences(raw: string | null): NotificationPreferences {
  if (!raw) return DEFAULT_NOTIFY_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_NOTIFY_PREFS.soundEnabled,
      vibrationEnabled:
        typeof parsed.vibrationEnabled === "boolean" ? parsed.vibrationEnabled : DEFAULT_NOTIFY_PREFS.vibrationEnabled,
      pollingMode:
        parsed.pollingMode === "fast" || parsed.pollingMode === "standard" || parsed.pollingMode === "economy"
          ? parsed.pollingMode
          : DEFAULT_NOTIFY_PREFS.pollingMode,
    };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function readNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_NOTIFY_PREFS;
  try {
    const raw = localStorage.getItem(LS_NOTIFY_PREFS);
    if (raw === lastRaw) return lastSnapshot;
    const next = normalizePreferences(raw);
    lastRaw = raw ?? "";
    lastSnapshot = next;
    return next;
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function persistNotificationPreferences(next: NotificationPreferences) {
  if (typeof window === "undefined") return;
  const normalized = normalizePreferences(JSON.stringify(next));
  const serialized = JSON.stringify(normalized);
  lastRaw = serialized;
  lastSnapshot = normalized;
  localStorage.setItem(LS_NOTIFY_PREFS, serialized);
  window.dispatchEvent(new Event(NOTIFY_PREFS_EVENT));
}

export function subscribeNotificationPreferences(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(NOTIFY_PREFS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(NOTIFY_PREFS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

