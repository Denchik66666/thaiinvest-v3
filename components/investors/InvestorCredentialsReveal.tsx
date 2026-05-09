"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { toast } from "@/lib/notify";

export type InvestorCredentials = {
  username: string;
  password: string;
};

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} скопирован`);
  } catch {
    toast.error("Не удалось скопировать");
  }
}

export function InvestorCredentialsReveal({
  open,
  credentials,
  onDismiss,
}: {
  open: boolean;
  credentials: InvestorCredentials | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!open || !credentials) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, credentials, onDismiss]);

  if (!open || !credentials) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="investor-credentials-title"
    >
      <Card className="w-full max-w-md space-y-4 border border-border bg-card p-5 shadow-2xl">
        <div className="space-y-1">
          <h2 id="investor-credentials-title" className="text-lg font-bold text-foreground">
            Инвестор создан
          </h2>
          <Text className="text-[11px] leading-snug text-muted-foreground">
            Сохраните доступ сейчас — после закрытия окна пароль здесь не повторяется.
          </Text>
        </div>

        <div className="space-y-2 rounded-lg border border-violet-500/28 bg-violet-500/[0.06] px-3 py-2.5 dark:border-violet-400/22 dark:bg-violet-950/35">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] font-semibold text-foreground">
              Логин: {credentials.username}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => copyText("Логин", credentials.username)}
            >
              Копировать
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-all font-mono text-[11px] font-semibold text-foreground">
              Пароль: {credentials.password}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-[11px]"
              onClick={() => copyText("Пароль", credentials.password)}
            >
              Копировать
            </Button>
          </div>
        </div>

        <Button type="button" className="w-full" onClick={onDismiss}>
          Готово
        </Button>
      </Card>
    </div>
  );
}
