"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import PasswordInput from "@/components/ui/PasswordInput";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { UserAvatar } from "@/components/user/UserAvatar";
import ThemeToggle from "@/components/ThemeToggle";
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

  return (
    <Container>
      <div className="min-h-screen space-y-4 py-4 pb-28 md:py-8 md:pb-28">
        <div className="flex flex-col items-center pt-2">
          <div className="relative">
            <button
              type="button"
              className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Фото профиля"
            >
              <UserAvatar name={user.username} src={user.avatarUrl} size={96} />
            </button>
          </div>
          <Text className="mt-3 text-lg font-semibold">{user.username}</Text>
          <Text className="text-xs text-muted-foreground">{user.role}</Text>
        </div>

        <div className="flex border-b border-border/60">
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
              className={
                tab === key
                  ? "flex-1 border-b-2 border-foreground py-2.5 text-center text-sm font-semibold text-foreground"
                  : "flex-1 py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "data" ? (
          <Card className="space-y-3 p-4">
            <Text className="text-xs font-semibold text-muted-foreground">Профиль</Text>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-border/60 bg-card/70 p-2.5">
                <Text className="text-xs font-medium text-muted-foreground">Роль</Text>
                <Text className="mt-0.5 text-sm font-semibold">{user.role}</Text>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/70 p-2.5">
                <Text className="text-xs font-medium text-muted-foreground">ID</Text>
                <Text className="mt-0.5 text-sm font-semibold">{String(user.id)}</Text>
              </div>
            </div>
            <Text className="text-xs text-muted-foreground">Загрузка аватара временно отключена.</Text>
          </Card>
        ) : null}

        {tab === "settings" ? (
          <Card className="space-y-4 p-4">
            <Text className="text-xs font-semibold text-muted-foreground">Оформление</Text>
            <div className="flex flex-col gap-1.5">
              <Text className="text-xs font-medium text-muted-foreground">Тема</Text>
              <ThemeToggle />
            </div>
            <div className="h-px bg-border/60" />
            <Text className="text-xs font-semibold text-muted-foreground">Уведомления</Text>
            <div className="space-y-2">
              <label className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-2.5">
                <span className="text-sm">Звуковой сигнал</span>
                <input
                  type="checkbox"
                  checked={notifySound}
                  onChange={(e) => saveNotifyPrefs({ soundEnabled: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-2.5">
                <span className="text-sm">Вибрация</span>
                <input
                  type="checkbox"
                  checked={notifyVibration}
                  onChange={(e) => saveNotifyPrefs({ vibrationEnabled: e.target.checked })}
                />
              </label>
              <div className="rounded-xl border border-border/60 bg-card/70 p-2.5">
                <Text className="mb-1 text-xs font-medium text-muted-foreground">Частота автообновления</Text>
                <select
                  className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
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
          </Card>
        ) : null}

        {tab === "security" ? (
          <Card className="space-y-4 p-4">
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
          </Card>
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
