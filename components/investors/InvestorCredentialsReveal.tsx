"use client";

import { InvestDeskModalShell } from "@/components/investors/InvestDeskModalShell";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
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

function loginPasswordBlock(c: InvestorCredentials): string {
  return `Доступ в личный кабинет:\nЛогин: ${c.username}\nПароль: ${c.password}`;
}

async function copyLoginAndPassword(c: InvestorCredentials) {
  try {
    await navigator.clipboard.writeText(loginPasswordBlock(c));
    toast.success("Логин и пароль скопированы — можно вставить в Telegram");
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
  if (!open || !credentials) return null;

  return (
    <InvestDeskModalShell
      open={open}
      onClose={onDismiss}
      eyebrow="Одноразово"
      title="Инвестор создан"
      titleId="investor-credentials-title"
      minimal
      summary={
        <Text className="text-[11px] leading-snug text-muted-foreground">
          Сохраните доступ сейчас — после закрытия окна пароль здесь не повторяется.
        </Text>
      }
      bodyClassName="pb-4"
    >
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
        <div className="mt-2 border-t border-violet-500/20 pt-2 dark:border-violet-400/15">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full text-[11px] font-medium"
            title="Одним текстом — для вставки в Telegram, почту и т.п."
            onClick={() => void copyLoginAndPassword(credentials)}
          >
            Копировать логин и пароль
          </Button>
        </div>
      </div>

      <Button type="button" className="mt-4 w-full" onClick={onDismiss}>
        Готово
      </Button>
    </InvestDeskModalShell>
  );
}
