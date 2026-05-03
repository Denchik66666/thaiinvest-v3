"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { AUTH_ME_QUERY_KEY, useAuth, type AuthUser } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";
import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import PasswordInput from "@/components/ui/PasswordInput";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { UserAvatar } from "@/components/user/UserAvatar";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/notifications/NotificationBell";
import { SuperAdminDatabaseResetSection } from "@/components/profile/SuperAdminDatabaseResetSection";
import { toast } from "@/lib/notify";
import {
  type NotificationPollingMode,
  DEFAULT_NOTIFY_PREFS,
  readNotificationPreferences,
  persistNotificationPreferences,
} from "@/lib/notification-preferences";

type AccountPatchResponse = {
  success: boolean;
  user: {
    id: number;
    username: string;
    role: string;
    isSystemOwner: boolean;
    avatarUrl?: string | null;
  };
};

type TabKey = "data" | "settings" | "security";

function ProfileBody({ user, refresh }: { user: AuthUser; refresh: () => Promise<void> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialNotifyPrefs = readNotificationPreferences();
  const [tab, setTab] = useState<TabKey>("data");
  const [username, setUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notifySound, setNotifySound] = useState(initialNotifyPrefs.soundEnabled ?? DEFAULT_NOTIFY_PREFS.soundEnabled);
  const [notifyVibration, setNotifyVibration] = useState(
    initialNotifyPrefs.vibrationEnabled ?? DEFAULT_NOTIFY_PREFS.vibrationEnabled
  );
  const [notifyPolling, setNotifyPolling] = useState<NotificationPollingMode>(
    initialNotifyPrefs.pollingMode ?? DEFAULT_NOTIFY_PREFS.pollingMode
  );

  const saveNotifyPrefs = (next: {
    soundEnabled?: boolean;
    vibrationEnabled?: boolean;
    pollingMode?: NotificationPollingMode;
  }) => {
    const updated = {
      soundEnabled: next.soundEnabled ?? notifySound,
      vibrationEnabled: next.vibrationEnabled ?? notifyVibration,
      pollingMode: next.pollingMode ?? notifyPolling,
    };
    setNotifySound(updated.soundEnabled);
    setNotifyVibration(updated.vibrationEnabled);
    setNotifyPolling(updated.pollingMode);
    persistNotificationPreferences(updated);
  };
  const saveMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: () =>
      apiClient.patch<AccountPatchResponse>("/api/auth/account", {
        username,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      }),
    onSuccess: async () => {
      toast.success("Данные профиля обновлены");
      setCurrentPassword("");
      setNewPassword("");
      setUsername((prev) => prev.trim());
      await refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка обновления");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.post("/api/auth/logout", {}),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
      toast.success("Вы вышли из аккаунта");
      router.push("/login");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка выхода");
    },
  });

  const panelClass = "thai-glass space-y-3 rounded-2xl p-3 md:p-5";
  const insetCell =
    "rounded-xl border border-border/50 bg-muted/10 p-2.5 backdrop-blur-sm transition-colors hover:bg-muted/15";
  const insetRow = cn(insetCell, "flex items-center justify-between");

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-3 pb-24 md:space-y-5 md:py-8 md:pb-28">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="thai-glass flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium transition hover:brightness-[1.03] dark:hover:brightness-110"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">Главная</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <div className="thai-glass flex flex-col items-center rounded-2xl px-3 py-4 text-center md:flex-row md:items-center md:gap-4 md:px-4 md:py-5 md:text-left">
          <UserAvatar name={user.username} src={user.avatarUrl} size={72} />
          <div className="mt-3 min-w-0 space-y-1 md:mt-0">
            <Text className="text-base font-semibold tracking-tight md:text-lg">{user.username}</Text>
            <Text className="text-xs text-muted-foreground">{user.role}</Text>
            <div className="flex flex-wrap items-center justify-center gap-1.5 md:justify-start">
              <span className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">
                ID: {user.id}
              </span>
              <span className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">
                Аккаунт активен
              </span>
            </div>
          </div>
        </div>

        <div className="thai-glass flex gap-1 rounded-2xl p-1">
          {(
            [
              ["data", "Данные"],
              ["settings", "Настройки"],
              ["security", "Безопасность"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "thai-tab-pill flex-1 rounded-xl py-2 text-center text-sm",
                tab === key
                  ? "bg-primary/15 font-semibold text-foreground shadow-sm"
                  : "font-medium text-muted-foreground hover:bg-muted/35"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "data" ? (
          <div className={panelClass}>
            <Text className="text-xs font-semibold text-muted-foreground">Профиль</Text>
            <div className="grid grid-cols-2 gap-1.5 text-sm md:gap-2">
              <div className={insetCell}>
                <Text className="text-xs font-medium text-muted-foreground">Роль</Text>
                <Text className="mt-0.5 text-sm font-semibold">{user.role}</Text>
              </div>
              <div className={insetCell}>
                <Text className="text-xs font-medium text-muted-foreground">ID</Text>
                <Text className="mt-0.5 text-sm font-semibold tabular-nums">{String(user.id)}</Text>
              </div>
            </div>
            <Text className="text-xs text-muted-foreground">Загрузка аватара временно отключена.</Text>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className={panelClass}>
            <Text className="text-xs font-semibold text-muted-foreground">Оформление</Text>
            <div className="flex flex-col gap-1.5">
              <Text className="text-xs font-medium text-muted-foreground">Тема</Text>
              <ThemeToggle />
            </div>
            <div className="h-px bg-border/50" />
            <Text className="text-xs font-semibold text-muted-foreground">Уведомления</Text>
            <div className="space-y-2">
              <label className={insetRow}>
                <span className="text-sm">Звуковой сигнал</span>
                <input
                  type="checkbox"
                  checked={notifySound}
                  onChange={(e) => saveNotifyPrefs({ soundEnabled: e.target.checked })}
                />
              </label>
              <label className={insetRow}>
                <span className="text-sm">Вибрация</span>
                <input
                  type="checkbox"
                  checked={notifyVibration}
                  onChange={(e) => saveNotifyPrefs({ vibrationEnabled: e.target.checked })}
                />
              </label>
              <div className={cn(insetCell, "space-y-2")}>
                <Text className="text-xs font-medium text-muted-foreground">Частота автообновления</Text>
                <select
                  className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/40"
                  value={notifyPolling}
                  onChange={(e) => saveNotifyPrefs({ pollingMode: e.target.value as NotificationPollingMode })}
                >
                  <option value="fast">Быстро (8 сек)</option>
                  <option value="standard">Стандарт (15 сек)</option>
                  <option value="economy">Эконом (30 сек)</option>
                </select>
              </div>
            </div>
            <Text className="text-xs text-muted-foreground">
              Интерфейс только на русском. Тема и параметры уведомлений сохраняются на этом устройстве.
            </Text>
          </div>
        ) : null}

        {tab === "security" ? (
          <div className={panelClass}>
            <Text className="text-xs font-semibold text-muted-foreground">Аккаунт</Text>
            <div className="space-y-2">
              <Label>Имя пользователя</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Текущий пароль</Label>
              <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Новый пароль</Label>
              <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Сохраняем..." : "Сохранить"}
            </Button>
            <div className="thai-panel-muted rounded-xl p-2.5 md:p-3">
              <Text className="text-xs font-medium text-muted-foreground">Быстрые переходы</Text>
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="thai-row-interactive rounded-lg px-2.5 py-2 text-left text-xs font-medium"
                >
                  Главная панель
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/investors")}
                  className="thai-row-interactive rounded-lg px-2.5 py-2 text-left text-xs font-medium"
                >
                  Реестр инвесторов
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/manage")}
                  className="thai-row-interactive rounded-lg px-2.5 py-2 text-left text-xs font-medium"
                >
                  Управление
                </button>
              </div>
            </div>
            <div className="h-px bg-border/50" />
            <Button
              variant="outline"
              className="w-full border-red-500/40 text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? "Выход..." : "Выйти из аккаунта"}
            </Button>
            {user.role === "SUPER_ADMIN" ? <SuperAdminDatabaseResetSection /> : null}
          </div>
        ) : null}

        <MobileBottomNav active="profile" />
      </div>
    </Container>
  );
}

export default function DashboardProfilePage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Text>Загрузка...</Text>
      </div>
    );
  }

  return <ProfileBody key={`${user.id}-${user.username}`} user={user} refresh={refresh} />;
}
