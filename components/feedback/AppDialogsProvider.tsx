"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Toaster, toast as sonnerToast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cn } from "@/lib/utils";

export type AppConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger — красная кнопка подтверждения */
  tone?: "danger" | "neutral";
};

type AppDialogsContextValue = {
  /** Модальное подтверждение (вместо `window.confirm`) */
  confirm: (opts: AppConfirmOptions) => Promise<boolean>;
  /** Тосты Sonner */
  toast: typeof sonnerToast;
};

const AppDialogsContext = createContext<AppDialogsContextValue | null>(null);

export function useAppDialogs() {
  const ctx = useContext(AppDialogsContext);
  if (!ctx) {
    throw new Error("useAppDialogs: оберните приложение в <AppDialogsProvider>.");
  }
  return ctx;
}

/**
 * Хук без throw — если провайдер ещё не смонтирован, confirm вернёт `false`.
 * Удобно для редких граничных случаев SSR.
 */
export function useAppDialogsSafe(): AppDialogsContextValue | null {
  return useContext(AppDialogsContext);
}

export function AppDialogsProvider({ children }: { children: React.ReactNode }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOpts, setConfirmOpts] = useState<AppConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: AppConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setConfirmOpts(opts);
      setConfirmOpen(true);
    });
  }, []);

  const finishConfirm = useCallback((ok: boolean) => {
    setConfirmOpen(false);
    setConfirmOpts(null);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.(ok);
  }, []);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, finishConfirm]);

  const value = useMemo<AppDialogsContextValue>(
    () => ({
      confirm,
      toast: sonnerToast,
    }),
    [confirm]
  );

  const tone = confirmOpts?.tone ?? "neutral";
  const confirmLabel = confirmOpts?.confirmLabel ?? "Подтвердить";
  const cancelLabel = confirmOpts?.cancelLabel ?? "Отмена";

  const portal =
    confirmOpen && confirmOpts && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => finishConfirm(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-confirm-title"
              className={cn(
                "relative z-[10001] w-full max-w-md overflow-hidden rounded-2xl border border-border/70",
                "bg-card/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
              )}
            >
              <div
                className={cn(
                  "mb-4 flex h-11 w-11 items-center justify-center rounded-xl border",
                  tone === "danger"
                    ? "border-red-500/35 bg-red-500/10 text-red-400"
                    : "border-primary/30 bg-primary/10 text-primary"
                )}
              >
                {tone === "danger" ? (
                  <span className="text-lg font-semibold leading-none">!</span>
                ) : (
                  <span className="text-lg leading-none">?</span>
                )}
              </div>
              <Text id="app-confirm-title" className="text-lg font-semibold tracking-tight text-foreground">
                {confirmOpts.title}
              </Text>
              {confirmOpts.description ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{confirmOpts.description}</p>
              ) : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => finishConfirm(false)}>
                  {cancelLabel}
                </Button>
                <Button
                  type="button"
                  className={cn(
                    "w-full sm:w-auto",
                    tone === "danger" &&
                      "border border-red-500/40 bg-gradient-to-b from-red-600 to-red-700 text-white shadow-sm hover:brightness-110"
                  )}
                  variant={tone === "danger" ? "outline" : "primary"}
                  onClick={() => finishConfirm(true)}
                >
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <AppDialogsContext.Provider value={value}>
      {children}
      <Toaster
        theme="dark"
        richColors
        closeButton
        position="top-center"
        expand={false}
        duration={4000}
        toastOptions={{
          classNames: {
            toast:
              "group rounded-xl border border-border/60 bg-card/95 text-foreground shadow-lg backdrop-blur-md",
            title: "text-sm font-medium text-foreground",
            description: "text-xs text-muted-foreground",
            actionButton: "rounded-lg",
            cancelButton: "rounded-lg",
            closeButton:
              "rounded-lg border-0 bg-muted/50 text-foreground hover:bg-muted group-[.toast]:bg-transparent",
          },
        }}
      />
      {portal}
    </AppDialogsContext.Provider>
  );
}
