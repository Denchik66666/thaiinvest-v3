"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  KeyRound,
  MonitorSmartphone,
  Shield,
  ShieldCheck,
} from "lucide-react";

import type { AuthUser } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { initialsTwoLetters, cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import PasswordInput from "@/components/ui/PasswordInput";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import ThemeToggle from "@/components/ThemeToggle";
import { UserAvatar } from "@/components/user/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { SuperAdminDatabaseResetSection } from "@/components/profile/SuperAdminDatabaseResetSection";
import { toast } from "@/lib/notify";
import {
  type NotificationPollingMode,
  type NotificationPreferences,
  readNotificationPreferences,
  persistNotificationPreferences,
  subscribeNotificationPreferences,
} from "@/lib/notification-preferences";
import { NOTIFICATION_PRESETS, matchNotificationPresetId } from "@/lib/notification-presets";

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

const TAB_LABELS = ["Данные", "Настройки", "Безопасность"] as const;
type ActiveTab = (typeof TAB_LABELS)[number];

type SettingKey = "sound" | "vibration" | "polling";

function passwordChangedStorageKey(userId: number) {
  return `thaiinvest_password_changed_${userId}`;
}

function profileTabSessionKey(userId: number) {
  return `thaiinvest_profile_tab_${userId}`;
}

function mirrorNotifyLs(p: { soundEnabled: boolean; vibrationEnabled: boolean; pollingMode: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem("notif_sound", p.soundEnabled ? "1" : "0");
  localStorage.setItem("notif_vibration", p.vibrationEnabled ? "1" : "0");
  localStorage.setItem("notif_polling", p.pollingMode);
}

function formatLastVisit(raw: string | null): string {
  if (!raw) return "Неизвестно";
  try {
    return new Date(raw).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Неизвестно";
  }
}

function formatMemberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function pollingCaption(mode: NotificationPollingMode): string {
  switch (mode) {
    case "fast":
      return "Частый опрос — заметнее, выше расход батареи";
    case "standard":
      return "Средняя частота опроса";
    case "economy":
      return "Редко — экономия трафика и батареи";
  }
}

function rolePresentation(role: string): { title: string; badgeClass: string; ringClass: string; avatarTint: string } {
  if (role === "SUPER_ADMIN") {
    return {
      title: "Супер-администратор",
      badgeClass: "border-violet-500/25 bg-violet-500/[0.08] text-violet-700 dark:text-violet-200/95",
      ringClass: "ring-violet-500/35",
      avatarTint: "bg-gradient-to-br from-violet-500 to-violet-950",
    };
  }
  if (role === "OWNER") {
    return {
      title: "Владелец сети",
      badgeClass: "border-sky-500/25 bg-sky-500/[0.08] text-sky-800 dark:text-sky-200/95",
      ringClass: "ring-sky-500/35",
      avatarTint: "bg-gradient-to-br from-sky-500 to-sky-950",
    };
  }
  return {
    title: "Инвестор",
    badgeClass: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-800 dark:text-emerald-100/90",
    ringClass: "ring-emerald-500/30",
    avatarTint: "bg-gradient-to-br from-emerald-600/95 via-teal-800 to-[#0f2722]",
  };
}

function ProfileFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</div>
  );
}

/** Кнопки действий внутри стеклянного профиля — без «кислотного» сплошного primary */
const profileGlassActionBtn =
  "border border-primary/30 bg-white/[0.07] text-foreground backdrop-blur-md transition-all duration-200 " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] hover:bg-primary/[0.07] hover:border-primary/40 hover:brightness-100 " +
  "dark:border-primary/22 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:hover:bg-primary/[0.1]";

function SettingToggleRow({
  title,
  caption,
  enabled,
  onToggle,
  isLast,
}: {
  title: string;
  caption: string;
  enabled: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 sm:px-3",
        !isLast && "border-b border-white/10 dark:border-white/[0.06]"
      )}
    >
      <div className="min-w-0 space-y-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-[11px] leading-snug text-muted-foreground">{caption}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          enabled ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-background shadow-md transition-[left] duration-200",
            enabled ? "left-5" : "left-[2px]"
          )}
        />
      </button>
    </div>
  );
}

export function ProfileDashboard({ user, refresh }: { user: AuthUser; refresh: () => Promise<void> }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("Данные");
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [usernameDraft, setUsernameDraft] = useState(user.username);
  const [lastVisitDisplay, setLastVisitDisplay] = useState("Неизвестно");
  const [notifyPrefs, setNotifyPrefs] = useState<NotificationPreferences>(() => readNotificationPreferences());
  const [passwordChangedDisplay, setPasswordChangedDisplay] = useState<string | null>(null);
  const [tabSessionDisplay, setTabSessionDisplay] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const goHistoryBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    setUsername(user.username);
    setUsernameDraft(user.username);
    setEditing(false);
  }, [user.username, user.id]);

  useEffect(() => {
    const prev = localStorage.getItem("lastVisit");
    setLastVisitDisplay(formatLastVisit(prev));
    localStorage.setItem("lastVisit", new Date().toISOString());
  }, [user.id]);

  useEffect(() => {
    return subscribeNotificationPreferences(() => {
      setNotifyPrefs(readNotificationPreferences());
    });
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(passwordChangedStorageKey(user.id));
    setPasswordChangedDisplay(raw ? formatLastVisit(raw) : null);
  }, [user.id]);

  useEffect(() => {
    const k = profileTabSessionKey(user.id);
    let iso = sessionStorage.getItem(k);
    if (!iso) {
      iso = new Date().toISOString();
      sessionStorage.setItem(k, iso);
    }
    setTabSessionDisplay(formatLastVisit(iso));
  }, [user.id]);

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Нужен JPG или PNG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Не больше 2 МБ");
      return;
    }
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      await apiClient.postForm<{ success?: boolean; avatarUrl?: string }>("/api/auth/avatar", fd);
      await refresh();
      toast.success("Фото обновлено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setAvatarBusy(false);
    }
  }

  const persistNotify = (next: NotificationPreferences) => {
    setNotifyPrefs(next);
    persistNotificationPreferences(next);
    mirrorNotifyLs(next);
  };

  function toggleSetting(key: SettingKey) {
    if (key === "sound") {
      persistNotify({ ...notifyPrefs, soundEnabled: !notifyPrefs.soundEnabled });
      return;
    }
    if (key === "vibration") {
      persistNotify({ ...notifyPrefs, vibrationEnabled: !notifyPrefs.vibrationEnabled });
      return;
    }
    const pollingOn = notifyPrefs.pollingMode !== "economy";
    persistNotify({
      ...notifyPrefs,
      pollingMode: pollingOn ? "economy" : "fast",
    });
  }

  const usernameMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: (next: string) =>
      apiClient.patch<AccountPatchResponse>("/api/auth/account", {
        username: next.trim(),
      }),
    onSuccess: async () => {
      toast.success("Имя пользователя обновлено");
      setEditing(false);
      await refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка обновления");
    },
  });

  const passwordMutation = useMutation({
    meta: { skipErrorToast: true },
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      apiClient.patch<AccountPatchResponse>("/api/auth/account", payload),
    onSuccess: async () => {
      toast.success("Пароль изменён");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const iso = new Date().toISOString();
      localStorage.setItem(passwordChangedStorageKey(user.id), iso);
      setPasswordChangedDisplay(formatLastVisit(iso));
      await refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка смены пароля");
    },
  });

  const role = user.role;
  const rp = rolePresentation(role);
  const hasAvatarPhoto = Boolean(user.avatarUrl?.trim());

  const SETTINGS_ROWS: { key: SettingKey; title: string; caption: string; enabled: boolean }[] = [
    { key: "sound", title: "Звук уведомлений", caption: "Звук при новом начислении и событиях", enabled: notifyPrefs.soundEnabled },
    { key: "vibration", title: "Вибрация", caption: "Тактильный отклик на мобильном", enabled: notifyPrefs.vibrationEnabled },
    {
      key: "polling",
      title: "Фоновый опрос",
      caption: pollingCaption(notifyPrefs.pollingMode),
      enabled: notifyPrefs.pollingMode !== "economy",
    },
  ];

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen pb-24 pt-2 md:pb-28 md:pt-3">
        <div
          className={cn(
            "-mx-0.5 overflow-hidden rounded-2xl border border-white/[0.12]",
            "bg-white/[0.06] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/[0.04]",
            "shadow-[0_20px_60px_-36px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.09)]",
            "dark:border-white/[0.07] dark:bg-[#0a0a12]/50 dark:supports-[backdrop-filter]:bg-[#0a0a12]/32",
            "dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
          )}
        >
          <div
            className={cn(
              "sticky top-2 z-30 border-b border-white/10 px-2 py-2 backdrop-blur-xl dark:border-white/[0.06]",
              "bg-background/[0.35] dark:bg-[#0d0d14]/65"
            )}
          >
            <div className="grid grid-cols-[minmax(2.5rem,auto)_1fr_minmax(2.5rem,auto)] items-center gap-1">
              <button
                type="button"
                onClick={goHistoryBack}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground outline-none sm:h-9 sm:w-9",
                  "transition hover:bg-white/10 active:bg-white/15 dark:hover:bg-white/[0.06]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                aria-label="Назад к кабинету"
              >
                <ArrowLeft className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.25} aria-hidden />
              </button>
              <h1 className="truncate px-1 text-center text-[15px] font-semibold tracking-tight text-foreground">
                Профиль
              </h1>
              <div className="flex justify-end">
                <NotificationBell />
              </div>
            </div>
            <nav className="mt-2 flex gap-0.5 rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.04]" aria-label="Разделы профиля">
              {TAB_LABELS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "min-w-0 flex-1 rounded-md py-1.5 text-center text-[12px] font-medium transition-all duration-200",
                    activeTab === tab
                      ? "bg-background/90 text-foreground shadow-sm ring-1 ring-black/[0.06] dark:bg-white/[0.08] dark:ring-white/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={handleAvatarChange}
          />

          <div className="flex items-center gap-3 px-3 py-2.5">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
              title="JPG или PNG, до 2 МБ"
              aria-label={avatarBusy ? "Загрузка фото" : "Сменить фото профиля"}
              className={cn(
                "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition sm:h-12 sm:w-12",
                "ring-2 ring-offset-2 ring-offset-transparent",
                rp.ringClass,
                "shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                avatarBusy && "cursor-wait opacity-70"
              )}
            >
              <span
                className={cn(
                  "flex h-full w-full items-center justify-center overflow-hidden rounded-full ring-1 ring-inset ring-white/10",
                  !hasAvatarPhoto && rp.avatarTint
                )}
              >
                {hasAvatarPhoto ? (
                    <UserAvatar name={username} src={user.avatarUrl} size={44} className="!ring-0 [&_img]:object-cover" />
                ) : (
                  <span className="text-sm font-semibold tracking-tight text-white drop-shadow-sm sm:text-base">
                    {initialsTwoLetters(username)}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md"
              >
                <Camera className="h-2.5 w-2.5" strokeWidth={2.25} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-[15px] font-semibold leading-tight sm:text-base",
                  role === "INVESTOR" ? "thai-dashboard-nick-matte-gold" : "text-foreground"
                )}
              >
                {username}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge className={cn("border px-1.5 py-0 text-[10px] font-medium", rp.badgeClass)}>{rp.title}</Badge>
                {user.isSystemOwner ? (
                  <Badge className="border border-amber-500/25 bg-amber-500/[0.06] px-1.5 py-0 text-[10px] font-medium text-amber-900 dark:text-amber-100/95">
                    <Shield className="mr-0.5 inline h-2.5 w-2.5 opacity-80" aria-hidden />
                    Системный владелец
                  </Badge>
                ) : null}
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  онлайн
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-white/10 px-3 py-2 text-[11px] dark:border-white/[0.05]">
            <span className="text-muted-foreground">ID</span>
            <span className="font-mono font-semibold text-foreground">{user.id}</span>
            <span className="text-white/25 dark:text-white/15">·</span>
            <span className="text-muted-foreground">Вход</span>
            <span className="max-w-[11rem] truncate font-medium text-foreground sm:max-w-none">{lastVisitDisplay}</span>
            {user.createdAt ? (
              <>
                <span className="text-white/25 dark:text-white/15">·</span>
                <span className="text-muted-foreground">С</span>
                <span className="font-medium text-foreground">{formatMemberSince(user.createdAt)}</span>
              </>
            ) : null}
          </div>

          <div className="border-t border-white/10 px-3 py-2.5 dark:border-white/[0.05]">
            {activeTab === "Данные" ? (
              <div className="animate-in fade-in duration-200 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <ProfileFieldLabel>Логин</ProfileFieldLabel>
                    {editing ? (
                      <Input
                        value={usernameDraft}
                        onChange={(e) => setUsernameDraft(e.target.value)}
                        className="h-9 rounded-lg border-white/15 bg-white/[0.06] text-sm backdrop-blur-sm dark:bg-white/[0.04]"
                        autoComplete="username"
                      />
                    ) : (
                      <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-sm font-medium text-foreground backdrop-blur-sm dark:bg-white/[0.03]">
                        {username}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={usernameMutation.isPending}
                    className={cn(
                      "shrink-0 rounded-lg focus-visible:ring-primary/30",
                      editing
                        ? profileGlassActionBtn
                        : "border-transparent text-primary hover:bg-white/[0.06] dark:hover:bg-white/[0.05]"
                    )}
                    onClick={() => {
                      if (!editing) {
                        setUsernameDraft(username);
                        setEditing(true);
                        return;
                      }
                      if (!usernameDraft.trim() || usernameDraft.trim() === username) {
                        setEditing(false);
                        setUsernameDraft(username);
                        return;
                      }
                      usernameMutation.mutate(usernameDraft);
                    }}
                  >
                    {editing ? "Сохранить" : "Изменить"}
                  </Button>
                </div>
                <div className="flex items-start justify-between gap-2 text-[13px]">
                  <div>
                    <ProfileFieldLabel>Роль</ProfileFieldLabel>
                    <p className="mt-0.5 font-medium text-foreground">{rp.title}</p>
                  </div>
                  <span className="mt-4 shrink-0 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                    системная
                  </span>
                </div>
                <p className="flex items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[10px] leading-snug text-muted-foreground backdrop-blur-sm dark:bg-white/[0.02]">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
                  Пароль — «Безопасность», тема и уведомления — «Настройки».
                </p>
              </div>
            ) : null}

            {activeTab === "Настройки" ? (
              <div className="animate-in fade-in duration-200 space-y-3">
                <p className="text-[11px] font-medium text-foreground">Уведомления · это устройство</p>
                <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {NOTIFICATION_PRESETS.map((preset) => {
                    const active = matchNotificationPresetId(notifyPrefs) === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => persistNotify(preset.prefs)}
                        className={cn(
                          "min-w-[5.5rem] shrink-0 rounded-lg border px-2 py-1.5 text-left backdrop-blur-sm transition sm:min-w-[6.25rem]",
                          active
                            ? "border-primary/40 bg-primary/[0.12] ring-1 ring-primary/20"
                            : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07] dark:border-white/[0.08]"
                        )}
                      >
                        <span className="block text-[11px] font-semibold text-foreground">{preset.label}</span>
                        <span className="block text-[9px] leading-tight text-muted-foreground">{preset.hint}</span>
                      </button>
                    );
                  })}
                </div>
                {SETTINGS_ROWS.map((row, i) => (
                  <SettingToggleRow
                    key={row.key}
                    title={row.title}
                    caption={row.caption}
                    enabled={row.enabled}
                    onToggle={() => toggleSetting(row.key)}
                    isLast={i === SETTINGS_ROWS.length - 1}
                  />
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 dark:border-white/[0.06]">
                  <span className="text-[12px] font-medium text-foreground">Тема</span>
                  <ThemeToggle />
                </div>
              </div>
            ) : null}

            {activeTab === "Безопасность" ? (
              <div className="animate-in fade-in duration-200 space-y-3">
                <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <div className="flex gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 backdrop-blur-sm dark:bg-white/[0.025]">
                    <MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Вкладка</p>
                      <p className="truncate font-medium text-foreground">{tabSessionDisplay ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 backdrop-blur-sm dark:bg-white/[0.025]">
                    <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Пароль</p>
                      <p className="truncate font-medium text-foreground">
                        {passwordChangedDisplay ?? "Нет записи"}
                      </p>
                      <p className="text-[9px] text-muted-foreground">локально</p>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1 text-[10px] leading-snug text-muted-foreground">
                  <li className="flex gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500/90" aria-hidden />
                    Не передавайте пароль третьим лицам.
                  </li>
                  <li className="flex gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500/90" aria-hidden />
                    Отдельный пароль для кабинета.
                  </li>
                </ul>
                <div className="space-y-2 border-t border-white/10 pt-3 dark:border-white/[0.06]">
                  <ProfileFieldLabel>Смена пароля</ProfileFieldLabel>
                  {(
                    [
                      { id: "current", label: "Текущий", value: currentPassword, set: setCurrentPassword },
                      { id: "new", label: "Новый", value: newPassword, set: setNewPassword },
                      { id: "confirm", label: "Повтор", value: confirmPassword, set: setConfirmPassword },
                    ] as const
                  ).map((field) => (
                    <div key={field.id} className="space-y-1">
                      <label className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </label>
                      <PasswordInput
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        className="h-9 rounded-lg border-white/12 bg-white/[0.05] text-sm backdrop-blur-sm dark:bg-white/[0.04]"
                        autoComplete={field.id === "current" ? "current-password" : "new-password"}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("mt-1 w-full rounded-lg sm:w-auto focus-visible:ring-primary/30", profileGlassActionBtn)}
                    disabled={passwordMutation.isPending}
                    onClick={() => {
                      if (!currentPassword) {
                        toast.error("Введите текущий пароль");
                        return;
                      }
                      if (!newPassword || newPassword.length < 6) {
                        toast.error("Новый пароль — минимум 6 символов");
                        return;
                      }
                      if (newPassword !== confirmPassword) {
                        toast.error("Повтор пароля не совпадает");
                        return;
                      }
                      passwordMutation.mutate({ currentPassword, newPassword });
                    }}
                  >
                    Обновить пароль
                  </Button>
                </div>
                {role === "SUPER_ADMIN" ? (
                  <div className="thai-danger-shimmer rounded-lg border border-destructive/30 bg-destructive/[0.05] p-2.5 backdrop-blur-sm">
                    <div className="flex gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                      <div className="min-w-0 space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide">Опасная зона</p>
                        <SuperAdminDatabaseResetSection embedMode />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <MobileBottomNav />
      </div>
    </Container>
  );
}
