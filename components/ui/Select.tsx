"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const VIEWPORT_PAD = 8;
const GAP = 2;
const MIN_PANEL_H = 96;
const MAX_PANEL_H = 220;

export type SelectPanelGeometry = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  side: "top" | "bottom";
};

/** Размещение панели: места снизу / сверху, кламп в viewport (как у Floating UI). */
export function computeSelectPanelGeometry(rect: DOMRect, viewportW: number, viewportH: number): SelectPanelGeometry {
  const below = viewportH - rect.bottom - VIEWPORT_PAD - GAP;
  const above = rect.top - VIEWPORT_PAD - GAP;
  const preferBelow = below >= MIN_PANEL_H || below >= above;

  let maxHeight: number;
  let top: number;
  let side: "top" | "bottom";

  if (preferBelow) {
    side = "bottom";
    maxHeight = Math.min(MAX_PANEL_H, Math.max(MIN_PANEL_H, below));
    top = rect.bottom + GAP;
    if (top + maxHeight > viewportH - VIEWPORT_PAD) {
      maxHeight = Math.max(MIN_PANEL_H, viewportH - VIEWPORT_PAD - top);
    }
  } else {
    side = "top";
    maxHeight = Math.min(MAX_PANEL_H, Math.max(MIN_PANEL_H, above));
    top = rect.top - GAP - maxHeight;
    if (top < VIEWPORT_PAD) {
      const shift = VIEWPORT_PAD - top;
      top = VIEWPORT_PAD;
      maxHeight = Math.max(MIN_PANEL_H, maxHeight - shift);
    }
  }

  const width = Math.min(rect.width, viewportW - 2 * VIEWPORT_PAD);
  let left = rect.left;
  if (left + width > viewportW - VIEWPORT_PAD) left = viewportW - VIEWPORT_PAD - width;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  return { top, left, width, maxHeight, side };
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  /** Связь с видимой подписью поля (a11y). */
  ariaLabelledBy?: string;
}

interface SelectTriggerProps {
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

interface SelectValueProps {
  placeholder?: string;
}

interface SelectContentProps {
  className?: string;
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

type SelectCtx = {
  value: string | undefined;
  onValueChange?: (value: string) => void;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRect: DOMRect | null;
  setTriggerRect: (r: DOMRect | null) => void;
  triggerButtonRef: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  listboxId: string;
  ariaLabelledBy?: string;
};

const SelectContext = createContext<SelectCtx | null>(null);

function useSelectContext(part: string) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error(`${part} must be used within <Select>`);
  return ctx;
}

function getOptionButtons(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll('button[role="option"]')) as HTMLButtonElement[];
}

function optionSearchText(el: HTMLButtonElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function Select({ value, onValueChange, children, className, ariaLabelledBy }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  const close = useCallback(() => {
    setIsOpen(false);
    setTriggerRect(null);
    requestAnimationFrame(() => triggerButtonRef.current?.focus());
  }, []);

  const syncTriggerRect = useCallback(() => {
    const el = triggerButtonRef.current;
    if (el) setTriggerRect(el.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-select-content]")) return;
      if (rootRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    syncTriggerRect();
    window.addEventListener("scroll", syncTriggerRect, true);
    window.addEventListener("resize", syncTriggerRect);
    const el = triggerButtonRef.current;
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => syncTriggerRect());
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("scroll", syncTriggerRect, true);
      window.removeEventListener("resize", syncTriggerRect);
      ro?.disconnect();
    };
  }, [isOpen, syncTriggerRect]);

  const ctx = useMemo(
    () => ({
      value,
      onValueChange,
      isOpen,
      setIsOpen,
      triggerRect,
      setTriggerRect,
      triggerButtonRef,
      close,
      listboxId,
      ariaLabelledBy,
    }),
    [value, onValueChange, isOpen, triggerRect, close, listboxId, ariaLabelledBy]
  );

  return (
    <SelectContext.Provider value={ctx}>
      <div ref={rootRef} className={cn("relative", className)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children, disabled }: SelectTriggerProps) {
  const { isOpen, setIsOpen, setTriggerRect, triggerButtonRef, close, listboxId, ariaLabelledBy } =
    useSelectContext("SelectTrigger");

  return (
    <button
      ref={triggerButtonRef}
      type="button"
      disabled={disabled}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-controls={isOpen ? listboxId : undefined}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "flex h-8 w-full min-h-8 items-center justify-between gap-1.5 px-0.5 pb-1 pt-0.5 text-left",
        "rounded-none border-0 border-b border-violet-500/30 bg-transparent shadow-none outline-none ring-0",
        "text-[12px] leading-tight text-slate-800 transition-colors duration-100 dark:border-violet-400/22 dark:text-slate-200",
        "hover:border-violet-500/45 dark:hover:border-violet-400/35",
        "focus-visible:border-violet-500/60 focus-visible:ring-0 dark:focus-visible:border-violet-400/45",
        isOpen && "border-violet-500/55 dark:border-violet-400/45",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      onClick={() => {
        if (disabled) return;
        if (isOpen) {
          close();
          return;
        }
        if (triggerButtonRef.current) setTriggerRect(triggerButtonRef.current.getBoundingClientRect());
        setIsOpen(true);
      }}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const { value } = useSelectContext("SelectValue");
  return (
    <span className="min-w-0 flex-1 truncate">
      {value ? (
        value
      ) : (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
    </span>
  );
}

export function SelectContent({ className, children }: SelectContentProps) {
  const { isOpen, triggerRect, value, listboxId, close } = useSelectContext("SelectContent");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef<{ buf: string; t: ReturnType<typeof setTimeout> | null }>({ buf: "", t: null });

  const panelGeom = useMemo(() => {
    if (!triggerRect || typeof window === "undefined") return null;
    return computeSelectPanelGeometry(triggerRect, window.innerWidth, window.innerHeight);
  }, [triggerRect]);

  useEffect(
    () => () => {
      if (typeaheadRef.current.t) clearTimeout(typeaheadRef.current.t);
    },
    []
  );

  useLayoutEffect(() => {
    if (!isOpen || !triggerRect) return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const root = contentRef.current;
        if (!root) return;
        const opts = getOptionButtons(root);
        if (opts.length === 0) return;
        const selected = opts.find((b) => b.getAttribute("data-value") === value);
        const target = selected ?? opts[0];
        target?.focus();
        target?.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isOpen, triggerRect, value]);

  const clearTypeahead = () => {
    if (typeaheadRef.current.t) clearTimeout(typeaheadRef.current.t);
    typeaheadRef.current.buf = "";
    typeaheadRef.current.t = null;
  };

  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      clearTypeahead();
      close();
    }
  };

  const focusOption = (el: HTMLButtonElement | undefined) => {
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = contentRef.current;
    const opts = getOptionButtons(root);
    if (opts.length === 0) return;

    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    const cur = i >= 0 ? i : 0;
    const page = Math.max(1, Math.min(8, Math.floor(opts.length / 5) || 5));

    if (e.key === "ArrowDown") {
      e.preventDefault();
      clearTypeahead();
      focusOption(opts[Math.min(cur + 1, opts.length - 1)]);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      clearTypeahead();
      focusOption(opts[Math.max(cur - 1, 0)]);
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      clearTypeahead();
      focusOption(opts[Math.min(cur + page, opts.length - 1)]);
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      clearTypeahead();
      focusOption(opts[Math.max(cur - page, 0)]);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      clearTypeahead();
      focusOption(opts[0]);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      clearTypeahead();
      focusOption(opts[opts.length - 1]);
      return;
    }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (!/[a-zA-Zа-яА-ЯёЁ0-9]/.test(e.key)) return;
      e.preventDefault();
      const buf = (typeaheadRef.current.buf + e.key).toLowerCase();
      typeaheadRef.current.buf = buf;
      if (typeaheadRef.current.t) clearTimeout(typeaheadRef.current.t);
      typeaheadRef.current.t = setTimeout(() => {
        typeaheadRef.current.buf = "";
        typeaheadRef.current.t = null;
      }, 650);
      const match = opts.find((b) => optionSearchText(b).startsWith(buf));
      if (match) focusOption(match);
    }
  };

  if (!isOpen || !triggerRect || !panelGeom || typeof document === "undefined") return null;

  const { top, left, width, maxHeight } = panelGeom;

  return createPortal(
    <div
      ref={contentRef}
      id={listboxId}
      data-select-content
      tabIndex={-1}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      className={cn(
        /** Выше `Modal` (z-50) и липких блоков; ниже `AppDialogsProvider` (~10000) и календаря финансов (z-[20000]). */
        "z-[2500] overflow-y-auto overscroll-contain rounded-md border border-violet-500/25 bg-card/98 py-0.5 shadow-xl outline-none backdrop-blur-md",
        "dark:border-violet-400/20 dark:bg-[#14141c]/98",
        "animate-in fade-in duration-100",
        "divide-y divide-violet-500/[0.14] dark:divide-violet-400/[0.12]",
        className
      )}
      style={{
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
      }}
      role="listbox"
    >
      {children}
    </div>,
    document.body
  );
}

export function SelectItem({ value, className, children }: SelectItemProps) {
  const { value: selected, onValueChange, close } = useSelectContext("SelectItem");
  const selectedItem = selected === value;

  return (
    <button
      type="button"
      role="option"
      data-value={value}
      aria-selected={selectedItem}
      tabIndex={-1}
      className={cn(
        "w-full rounded-none border-l-2 border-transparent py-1.5 pl-2 pr-1 text-left text-[11px] leading-snug outline-none transition-colors duration-75",
        "text-slate-800 dark:text-slate-200",
        "hover:border-violet-500/50 focus:border-violet-500/50 dark:hover:border-violet-400/45 dark:focus:border-violet-400/45",
        "focus-visible:ring-0",
        selectedItem && "border-violet-600 text-violet-900 dark:border-violet-400 dark:text-violet-200/90",
        className
      )}
      onClick={() => {
        onValueChange?.(value);
        close();
      }}
    >
      {children}
    </button>
  );
}
