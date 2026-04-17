"use client";

import { cn } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
};

/** Круглый аватар: фото или буква; фон нейтральный, без «плашки». */
export function UserAvatar({ name, src, size = 36, className }: Props) {
  const initial = (name || "?").slice(0, 1).toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-transparent ring-1 ring-border/35",
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-muted/25 text-[0.55em] font-semibold text-foreground/90">
          {initial}
        </span>
      )}
    </span>
  );
}
