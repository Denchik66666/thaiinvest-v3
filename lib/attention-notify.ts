import { toast } from "@/lib/notify";
import type { NotificationPreferences } from "@/lib/notification-preferences";

type AttentionKind = "success" | "error";

export function notifyWithAttention(
  kind: AttentionKind,
  message: string,
  prefs: NotificationPreferences
) {
  if (kind === "error") toast.error(message);
  else toast.success(message);

  if (typeof window === "undefined") return;

  try {
    if (prefs.vibrationEnabled && "vibrate" in navigator) {
      navigator.vibrate(kind === "error" ? [100, 80, 100] : [70]);
    }
  } catch {}

  if (!prefs.soundEnabled) return;

  try {
    const Ctx = (
      window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      }
    ).AudioContext ??
      (
        window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = kind === "error" ? "square" : "sine";
    o.frequency.value = kind === "error" ? 360 : 660;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);

    const t = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t);
    o.stop(t + 0.13);
    window.setTimeout(() => void ctx.close(), 180);
  } catch {}
}
