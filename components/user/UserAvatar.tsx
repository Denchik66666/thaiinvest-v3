"use client";

import { cn, initialsTwoLetters } from "@/lib/utils";

type Props = {
  name: string;
  /** Без фото: две буквы из этого текста (ник/handle и т.п.); иначе из `name`. */
  initialsFrom?: string | null;
  src?: string | null;
  size?: number;
  /** `glass` — встроенный “стеклянный” фон, `plain` — полностью прозрачный (для topbar). */
  variant?: "glass" | "plain";
  /**
   * Неоновый контур статуса на самом аватаре (единое целое).
   * Использует CSS по `[data-has-positions]` (в UI: emerald/ruby).
   */
  hasPositions?: boolean;
  className?: string;
};

function sourceForInitials(name: string, initialsFrom?: string | null): string {
  const nick = initialsFrom?.trim().replace(/^@+/, "") ?? "";
  if (nick.length > 0) return nick;
  return String(name ?? "").trim() || "?";
}

/** Круглый аватар: фото или две буквы; фон нейтральный, без «плашки». */
export function UserAvatar({ name, initialsFrom, src, size = 36, variant = "glass", hasPositions, className }: Props) {
  const initials = initialsTwoLetters(sourceForInitials(name, initialsFrom));
  const photoSrc = src?.trim() ? src : undefined;
  const initialsFontPx = Math.max(8, Math.round(size * 0.34));

  const isPlain = variant === "plain";

  return (
    <span
      className={cn(
        // Внешняя обёртка: НЕ клипает glow (контур/неон рисуется на этом уровне)
        "relative isolate inline-flex shrink-0 rounded-full",
        className
      )}
      data-has-positions={typeof hasPositions === "boolean" ? (hasPositions ? "true" : "false") : undefined}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          // Внутренний круг: клипает только контент (фото/буквы)
          "relative z-[1] flex h-full w-full items-center justify-center overflow-hidden rounded-full",
          !isPlain && [
            // «встроенный» вид: стекло без контура/кольца
            "bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-transparent dark:from-white/[0.06] dark:via-white/[0.02] dark:to-transparent",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_30px_-22px_rgba(0,0,0,0.62)]",
            "before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/[0.10] before:via-transparent before:to-transparent before:opacity-50",
          ],
          isPlain && ["bg-transparent shadow-none", "before:hidden"]
        )}
      >
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt="" className="h-full w-full object-cover object-center" loading="lazy" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center bg-transparent font-semibold leading-none tracking-tight text-foreground/90"
            style={{ fontSize: initialsFontPx }}
          >
            {initials}
          </span>
        )}
      </span>
    </span>
  );
}
