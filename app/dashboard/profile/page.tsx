"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import ThemeToggle from "@/components/ThemeToggle";
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

const TAB_LABELS = ["Данные", "Настройки", "Безопасность"] as const;
type ActiveTab = (typeof TAB_LABELS)[number];

type SettingKey = "sound" | "vibration" | "polling";

type SettingValues = {
  sound: boolean;
  vibration: boolean;
  polling: boolean;
};

function mirrorNotifyLs(p: { soundEnabled: boolean; vibrationEnabled: boolean; pollingMode: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem("notif_sound", p.soundEnabled ? "1" : "0");
  localStorage.setItem("notif_vibration", p.vibrationEnabled ? "1" : "0");
  localStorage.setItem("notif_polling", p.pollingMode);
}

function initialsTwoLetters(username: string) {
  const u = String(username).trim();
  if (u.length === 0) return "??";
  if (u.length === 1) return u.toUpperCase() + u.toUpperCase();
  return u.slice(0, 2).toUpperCase();
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

function ProfileBody({ user, refresh }: { user: AuthUser; refresh: () => Promise<void> }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("Данные");
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [usernameDraft, setUsernameDraft] = useState(user.username);
  const [lastVisitDisplay, setLastVisitDisplay] = useState("Неизвестно");
  const [settingValues, setSettingValues] = useState<SettingValues>({
    sound: DEFAULT_NOTIFY_PREFS.soundEnabled,
    vibration: DEFAULT_NOTIFY_PREFS.vibrationEnabled,
    polling: DEFAULT_NOTIFY_PREFS.pollingMode !== "economy",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    const p = readNotificationPreferences();
    setSettingValues({
      sound: p.soundEnabled,
      vibration: p.vibrationEnabled,
      polling: p.pollingMode !== "economy",
    });
  }, []);

  const persistSettings = (next: SettingValues) => {
    setSettingValues(next);
    const pollingMode: NotificationPollingMode = next.polling ? "fast" : "economy";
    const payload = {
      soundEnabled: next.sound,
      vibrationEnabled: next.vibration,
      pollingMode,
    };
    persistNotificationPreferences(payload);
    mirrorNotifyLs(payload);
  };

  function toggleSetting(key: SettingKey) {
    const next = { ...settingValues, [key]: !settingValues[key] };
    persistSettings(next);
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
      await refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Ошибка смены пароля");
    },
  });

  const role = user.role;
  const initials = initialsTwoLetters(username);

  const passwordFieldStyle: CSSProperties = {
    height: 48,
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
    fontSize: 15,
    padding: "0 14px",
    outline: "none",
    transition: "border 0.15s",
    width: "100%",
    boxSizing: "border-box",
  };

  const passwordLabelStyle: CSSProperties = {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  const cardEnter = (delayMs: string): CSSProperties => ({
    animation: "thai-fade-in-up 0.4s ease forwards",
    animationDelay: delayMs,
  });

  return (
    <Container>
      <div style={{ minHeight: "100vh", background: "#0d0d14", paddingBottom: 96 }}>
        <div
          style={{
            background: "linear-gradient(180deg, #1a0533 0%, #0d0d14 100%)",
            padding: "48px 24px 32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                width: 140,
                height: 140,
                borderRadius: "50%",
                background:
                  role === "SUPER_ADMIN"
                    ? "radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)"
                    : role === "OWNER"
                      ? "radial-gradient(circle, rgba(37,99,235,0.4) 0%, transparent 70%)"
                      : "radial-gradient(circle, rgba(5,150,105,0.4) 0%, transparent 70%)",
                filter: "blur(8px)",
                animation: "thai-pulse-glow 3s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: role === "SUPER_ADMIN" ? "#7c3aed" : role === "OWNER" ? "#2563eb" : "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 700,
                color: "#fff",
                boxShadow: "0 0 0 4px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              {initials}
            </div>
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}
          >
            {username}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {role === "SUPER_ADMIN" ? "Супер-администратор" : role === "OWNER" ? "Владелец сети" : "Инвестор"}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#4ade80",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 6px #4ade80",
              }}
            />
            Аккаунт активен
          </div>
        </div>

        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          {TAB_LABELS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "14px 0",
                fontSize: 14,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "#a78bfa" : "rgba(255,255,255,0.4)",
                background: "transparent",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid #a78bfa" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {activeTab === "Данные" ? (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                ...cardEnter("0ms"),
              }}
            >
              <div
                style={{
                  padding: "16px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Имя пользователя
                  </div>
                  {editing ? (
                    <input
                      className="thai-input-glow"
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      style={{
                        fontSize: 16,
                        color: "#fff",
                        fontWeight: 500,
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid #a78bfa",
                        outline: "none",
                        padding: "2px 0",
                        width: "100%",
                      }}
                      autoComplete="username"
                    />
                  ) : (
                    <div style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>{username}</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={usernameMutation.isPending}
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
                  style={{
                    fontSize: 13,
                    color: "#a78bfa",
                    fontWeight: 500,
                    background: "rgba(167,139,250,0.1)",
                    border: "none",
                    cursor: usernameMutation.isPending ? "wait" : "pointer",
                    padding: "6px 12px",
                    borderRadius: 8,
                    flexShrink: 0,
                    marginLeft: 8,
                    opacity: usernameMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {editing ? "Сохранить" : "Изменить"}
                </button>
              </div>

              <div
                style={{
                  padding: "16px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Роль
                  </div>
                  <div style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>
                    {role === "SUPER_ADMIN" ? "Супер-администратор" : role === "OWNER" ? "Владелец сети" : "Инвестор"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Нельзя изменить</div>
              </div>

              <div style={{ padding: "16px" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  Последний вход
                </div>
                <div style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>{lastVisitDisplay}</div>
              </div>
            </div>
          ) : null}

          {activeTab === "Настройки" ? (
            <>
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  ...cardEnter("0ms"),
                }}
              >
                {(
                  [
                    {
                      key: "sound" as const,
                      title: "Звук уведомлений",
                      caption: "Звук при новом начислении",
                    },
                    {
                      key: "vibration" as const,
                      title: "Вибрация",
                      caption: "Вибрация на мобильном",
                    },
                    {
                      key: "polling" as const,
                      title: "Режим опроса",
                      caption: "Проверять обновления в фоне",
                    },
                  ] as const
                ).map((row, i, arr) => {
                  const enabled = settingValues[row.key];
                  return (
                    <div
                      key={row.key}
                      style={{
                        padding: "16px",
                        borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>{row.title}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{row.caption}</div>
                      </div>
                      <div
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => toggleSetting(row.key)}
                        style={{
                          width: 44,
                          height: 26,
                          borderRadius: 13,
                          background: enabled ? "#7c3aed" : "rgba(255,255,255,0.1)",
                          position: "relative",
                          cursor: "pointer",
                          transition: "background 0.2s",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 3,
                            left: enabled ? 21 : 3,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#fff",
                            transition: "left 0.2s",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  ...cardEnter("80ms"),
                }}
              >
                <div style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>Тема оформления</div>
                  <ThemeToggle />
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "Безопасность" ? (
            <>
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: "20px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  ...cardEnter("0ms"),
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}
                >
                  Смена пароля
                </div>

                {(
                  [
                    { id: "current", label: "Текущий пароль", value: currentPassword, set: setCurrentPassword },
                    { id: "new", label: "Новый пароль", value: newPassword, set: setNewPassword },
                    { id: "confirm", label: "Повтор пароля", value: confirmPassword, set: setConfirmPassword },
                  ] as const
                ).map((field) => (
                  <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={passwordLabelStyle}>{field.label}</label>
                    <input
                      className="thai-input-glow"
                      type="password"
                      value={field.value}
                      onChange={(e) => field.set(e.target.value)}
                      style={passwordFieldStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.border = "1px solid #7c3aed";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)";
                      }}
                      autoComplete={field.id === "current" ? "current-password" : "new-password"}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  className="thai-btn-primary"
                  disabled={passwordMutation.isPending}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    background: "#7c3aed",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    border: "none",
                    cursor: passwordMutation.isPending ? "wait" : "pointer",
                    marginTop: 4,
                    transition: "opacity 0.15s",
                    opacity: passwordMutation.isPending ? 0.7 : 1,
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.opacity = "0.85";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.opacity = passwordMutation.isPending ? "0.7" : "1";
                  }}
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
                  Сменить пароль
                </button>
              </div>

              {role === "SUPER_ADMIN" ? (
                <div
                  className="thai-danger-shimmer"
                  style={{
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 16,
                    padding: "20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    ...cardEnter("80ms"),
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#ef4444",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    ⚠ Опасная зона
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                    Действия необратимы. Требуется подтверждение паролем.
                  </div>
                  <SuperAdminDatabaseResetSection embedMode />
                </div>
              ) : null}
            </>
          ) : null}
        </div>

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
