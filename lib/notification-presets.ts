import type { NotificationPreferences } from "@/lib/notification-preferences";

export type NotificationPresetId = "balanced" | "quiet" | "minimal";

export const NOTIFICATION_PRESETS: ReadonlyArray<{
  id: NotificationPresetId;
  label: string;
  hint: string;
  prefs: NotificationPreferences;
}> = [
  {
    id: "balanced",
    label: "Полный",
    hint: "Звук и вибрация, быстрый опрос",
    prefs: { soundEnabled: true, vibrationEnabled: true, pollingMode: "fast" },
  },
  {
    id: "quiet",
    label: "Тихий",
    hint: "Без звука, умеренный опрос",
    prefs: { soundEnabled: false, vibrationEnabled: true, pollingMode: "standard" },
  },
  {
    id: "minimal",
    label: "Экономный",
    hint: "Без звука и вибрации, реже запросы",
    prefs: { soundEnabled: false, vibrationEnabled: false, pollingMode: "economy" },
  },
];

export function notificationPrefsEqual(a: NotificationPreferences, b: NotificationPreferences): boolean {
  return (
    a.soundEnabled === b.soundEnabled &&
    a.vibrationEnabled === b.vibrationEnabled &&
    a.pollingMode === b.pollingMode
  );
}

export function matchNotificationPresetId(current: NotificationPreferences): NotificationPresetId | null {
  for (const p of NOTIFICATION_PRESETS) {
    if (notificationPrefsEqual(p.prefs, current)) return p.id;
  }
  return null;
}
