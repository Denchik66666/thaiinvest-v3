"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import PasswordInput from "@/components/ui/PasswordInput";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { AUTH_ME_QUERY_KEY } from "@/hooks/useAuth";
import { toast } from "@/lib/notify";

type StatusResponse = {
  configured: boolean;
  locked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
};

export function SuperAdminDatabaseResetSection({ embedMode = false }: { embedMode?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newResetPassword, setNewResetPassword] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [execPassword, setExecPassword] = useState("");
  const [execPhrase, setExecPhrase] = useState("");

  const { data: status, refetch } = useQuery({
    queryKey: ["database-reset-status"],
    queryFn: () => apiClient.get<StatusResponse>("/api/admin/database-reset/status"),
    retry: 1,
  });

  const savePasswordMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: (password: string) => apiClient.post("/api/admin/database-reset/password", { password }),
    onSuccess: async () => {
      toast.success("Пароль сброса сохранён");
      setNewResetPassword("");
      await refetch();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
    },
  });

  const executeMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: () =>
      apiClient.post("/api/admin/database-reset/execute", {
        password: execPassword,
        confirmPhrase: execPhrase,
      }),
    onSuccess: async () => {
      setModalOpen(false);
      setExecPassword("");
      setExecPhrase("");
      await apiClient.post("/api/auth/logout", {});
      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      router.push("/login?db_cleared=1");
    },
    onError: (e: unknown) => {
      void refetch();
      toast.error(e instanceof Error ? e.message : "Ошибка сброса");
    },
  });

  const configured = status?.configured ?? false;
  const locked = status?.locked ?? false;
  const lockUntil = status?.lockedUntil ? new Date(status.lockedUntil) : null;
  const statusUnavailable = !status;

  return (
    <>
      {!embedMode ? <div className="h-px bg-border/50" /> : null}
      <div className={cn("space-y-3", !embedMode && "thai-panel-admin")}>
        {!embedMode ? (
          <>
        <Text className="text-sm font-semibold text-foreground">Полный сброс базы данных</Text>
        <Text className="text-xs text-muted-foreground leading-relaxed">
          Удаляются все инвесторы, платежи, чат и прочие данные. Остаются только учётные записи{" "}
          <span className="font-medium text-foreground">OWNER</span> и{" "}
          <span className="font-medium text-foreground">SUPER_ADMIN</span>. Действие необратимо.
        </Text>
          </>
        ) : (
          <Text className="text-xs text-muted-foreground leading-relaxed">
            Удаляются инвесторы, платежи, чат и прочие данные. Остаются учётные записи OWNER и SUPER_ADMIN. Необратимо.
          </Text>
        )}

        <div className="space-y-2 rounded-xl border border-border/50 bg-background/40 p-3">
          <Text className="text-xs font-semibold text-muted-foreground">Пароль для сброса</Text>
          <Text className="text-[11px] text-muted-foreground">
            Задайте отдельный пароль (не менее 8 символов). Без него кнопка сброса недоступна.
          </Text>
          <Label className="text-xs">Новый пароль сброса</Label>
          <PasswordInput
            value={newResetPassword}
            onChange={(e) => setNewResetPassword(e.target.value)}
            placeholder="Минимум 8 символов"
            autoComplete="new-password"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={savePasswordMutation.isPending || newResetPassword.length < 8}
            onClick={() => savePasswordMutation.mutate(newResetPassword)}
          >
            {savePasswordMutation.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {statusUnavailable ? (
            <Text className="text-[11px] text-amber-700 dark:text-amber-300">
              Статус БД временно недоступен. Если вы уже сохраняли пароль, попробуйте действие повторно через несколько секунд.
            </Text>
          ) : configured ? (
            <Text className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Пароль задан</Text>
          ) : (
            <Text className="text-[11px] text-amber-700 dark:text-amber-400">Пароль ещё не сохранён</Text>
          )}
        </div>

        {locked && lockUntil ? (
          <Text className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Ввод пароля заблокирован до{" "}
            {lockUntil.toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        ) : null}

        <Button
          variant="outline"
          className={cn(
            "min-h-12 w-full",
            embedMode
              ? cn(
                  "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/55 dark:border-border/50 dark:bg-muted/25",
                  (!configured || locked) && "pointer-events-none opacity-50"
                )
              : cn(
                  "border-red-500/45 text-red-700 transition hover:bg-red-500/10 dark:text-red-400",
                  (!configured || locked) && "pointer-events-none opacity-45"
                )
          )}
          disabled={!configured || locked}
          onClick={() => {
            setExecPassword("");
            setExecPhrase("");
            setModalOpen(true);
          }}
        >
          Сброс базы данных
        </Button>
      </div>

      {modalOpen ? (
        <div className="thai-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="thai-glass max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl p-5 shadow-2xl"
            role="dialog"
            aria-modal
            aria-labelledby="db-reset-title"
          >
            <Text id="db-reset-title" className="text-base font-semibold text-foreground">
              Подтверждение сброса
            </Text>
            <Text className="text-xs text-muted-foreground">
              Введите пароль сброса и фразу <span className="font-mono font-semibold text-foreground">УДАЛИТЬ</span>{" "}
              (заглавными, как показано).
            </Text>
            <div className="space-y-2">
              <Label>Пароль сброса</Label>
              <PasswordInput value={execPassword} onChange={(e) => setExecPassword(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>Подтверждение</Label>
              <Input
                value={execPhrase}
                onChange={(e) => setExecPhrase(e.target.value)}
                placeholder="УДАЛИТЬ"
                autoComplete="off"
                className="font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setModalOpen(false)}
                disabled={executeMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                className="flex-1 border-red-500/40 bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                disabled={
                  executeMutation.isPending || !execPassword || execPhrase.trim() !== "УДАЛИТЬ"
                }
                onClick={() => executeMutation.mutate()}
              >
                {executeMutation.isPending ? "Выполняется…" : "Сбросить базу"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
