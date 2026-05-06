"use client";

import { cn, initialsTwoLetters } from "@/lib/utils";

type Props = {
  name: string;
  /** Без фото: две буквы из этого текста (ник/handle и т.п.); иначе из `name`. */
  initialsFrom?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
};

function sourceForInitials(name: string, initialsFrom?: string | null): string {
  const nick = initialsFrom?.trim().replace(/^@+/, "") ?? "";
  if (nick.length > 0) return nick;
  return String(name ?? "").trim() || "?";
}

/** Круглый аватар: фото или две буквы; фон нейтральный, без «плашки». */
export function UserAvatar({ name, initialsFrom, src, size = 36, className }: Props) {
  const initials = initialsTwoLetters(sourceForInitials(name, initialsFrom));
  const photoSrc = src?.trim() ? src : undefined;
  const initialsFontPx = Math.max(8, Math.round(size * 0.34));

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-transparent ring-1 ring-border/35",
        className
      )}
      style={{ width: size, height: size }}
    >
      {photoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoSrc} alt="" className="h-full w-full object-cover object-center" loading="lazy" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center bg-muted/25 font-semibold leading-none tracking-tight text-foreground/90"
          style={{ fontSize: initialsFontPx }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
