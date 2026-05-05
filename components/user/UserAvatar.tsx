"use client";

import { cn, initialsTwoLetters } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
};

/** Круглый аватар: фото или две буквы; фон нейтральный, без «плашки». */
export function UserAvatar({ name, src, size = 36, className }: Props) {
  const initials = initialsTwoLetters(name || "?");
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
