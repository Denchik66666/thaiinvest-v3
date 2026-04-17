"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
  className,
  contentClassName,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/40 overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/20 transition"
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</div>
          {subtitle ? <div className="mt-0.5 text-[13px] leading-tight text-muted-foreground/95 md:text-xs truncate">{subtitle}</div> : null}
        </div>
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition",
            open && "text-foreground"
          )}
          aria-hidden
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn("transition-transform", open ? "-rotate-180" : "rotate-0")}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? <div className={cn("border-t border-border/50 px-3 py-3", contentClassName)}>{children}</div> : null}
    </div>
  );
}
