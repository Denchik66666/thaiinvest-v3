"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, UserRound } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { CHAT_CONTEXT_QUERY_KEY } from "@/lib/chat-context-query";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UserAvatar } from "@/components/user/UserAvatar";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import NotificationBell from "@/components/notifications/NotificationBell";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";

type ChatContext = {
  success: boolean;
  defaultPeer: { id: number; username: string } | null;
  unreadTotal: number;
  lastUnread: {
    id: number;
    senderId: number;
    senderUsername: string;
    bodyPreview: string;
    createdAt: string;
  } | null;
  partners: Array<{ id: number; username: string; unreadCount: number; lastAt: string | null }>;
};

type ChatMsg = {
  id: number;
  body: string;
  createdAt: string;
  senderId: number;
  senderUsername: string;
};

type DirectoryUser = { id: number; username: string; role: string };

function ChatPageInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const peerFromUrl = Number(searchParams.get("peer"));
  const [draftPeer, setDraftPeer] = useState<number | null>(null);
  const [text, setText] = useState("");

  const {
    data: ctx,
    isPending: ctxPending,
    isError: ctxError,
    error: ctxQueryError,
  } = useQuery({
    queryKey: CHAT_CONTEXT_QUERY_KEY,
    queryFn: () => apiClient.get<ChatContext>("/api/chat/context"),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: directory } = useQuery({
    queryKey: ["chat-directory"],
    queryFn: () => apiClient.get<{ success: boolean; users: DirectoryUser[] }>("/api/chat/directory"),
    enabled: !!user && (user.role === "SUPER_ADMIN" || user.role === "OWNER"),
  });

  const resolvedPeer = useMemo(() => {
    if (Number.isFinite(peerFromUrl) && peerFromUrl > 0) return peerFromUrl;
    if (draftPeer) return draftPeer;
    return ctx?.defaultPeer?.id ?? null;
  }, [peerFromUrl, draftPeer, ctx?.defaultPeer?.id]);

  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages", resolvedPeer],
    queryFn: () =>
      apiClient.get<{ success: boolean; messages: ChatMsg[] }>(
        `/api/chat/messages?peerId=${resolvedPeer}`
      ),
    enabled: !!user && !!resolvedPeer,
  });

  const markRead = useCallback(async () => {
    if (!resolvedPeer) return;
    try {
      await apiClient.patch("/api/chat/read", { peerId: resolvedPeer });
      queryClient.invalidateQueries({ queryKey: CHAT_CONTEXT_QUERY_KEY });
    } catch {
      // Не роняем страницу из‑за «прочитано»; контекст чата обновится при следующем опросе
    }
  }, [resolvedPeer, queryClient]);

  const partners = ctx?.partners;
  const allContacts = useMemo(() => {
    const map = new Map<number, DirectoryUser>();
    for (const p of partners ?? []) {
      map.set(p.id, { id: p.id, username: p.username, role: "" });
    }
    for (const u of directory?.users ?? []) {
      if (!map.has(u.id)) map.set(u.id, u);
    }
    return [...map.values()].sort((a, b) => a.username.localeCompare(b.username, "ru"));
  }, [partners, directory?.users]);

  useEffect(() => {
    if (!resolvedPeer) return;
    void markRead();
  }, [resolvedPeer, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages?.length]);

  const sendMutation = useMutation({
    mutationFn: () => {
      if (!resolvedPeer || !text.trim()) throw new Error("Нет текста");
      return apiClient.post("/api/chat/messages", { recipientId: resolvedPeer, body: text.trim() });
    },
    onSuccess: () => {
      setText("");
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: CHAT_CONTEXT_QUERY_KEY });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <Container>
        <div className="thai-dashboard-root flex min-h-screen items-center justify-center py-16">
          <div className="thai-glass flex flex-col items-center gap-3 rounded-2xl px-8 py-6">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <Text className="text-foreground">Загрузка…</Text>
          </div>
        </div>
      </Container>
    );
  }

  const showPicker = user.role === "SUPER_ADMIN" || user.role === "OWNER";

  return (
    <Container>
      <div className="thai-dashboard-root min-h-screen space-y-3 py-4 pb-28 md:space-y-4 md:py-8 md:pb-28">
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
            <button
              type="button"
              onClick={() => router.push("/dashboard/profile")}
              className="thai-glass flex h-10 w-10 items-center justify-center rounded-xl transition hover:brightness-[1.03] dark:hover:brightness-110"
              aria-label="Профиль"
              title="Профиль"
            >
              <UserRound className="h-4 w-4 opacity-80" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-0.5">
          <UserAvatar name={user.username} src={user.avatarUrl} size={36} />
          <div className="min-w-0">
            <Text className="truncate text-sm font-semibold text-foreground">{user.username}</Text>
            <Text className="text-xs text-muted-foreground">Внутренний чат</Text>
          </div>
        </div>

        {showPicker ? (
          <Card className="space-y-2 p-3 md:p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Собеседник</label>
            <select
              className="mt-1 w-full rounded-xl border border-border/50 bg-background/80 px-3 py-2.5 text-sm outline-none backdrop-blur-sm transition focus:border-primary/45 focus:ring-2 focus:ring-primary/25"
              value={resolvedPeer ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!v) {
                  setDraftPeer(null);
                  router.push("/dashboard/chat");
                  return;
                }
                setDraftPeer(v);
                router.push(`/dashboard/chat?peer=${v}`);
              }}
            >
              <option value="">Выберите пользователя</option>
              {(user.role === "SUPER_ADMIN" ? allContacts : directory?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} {u.role ? `(${u.role})` : ""}
                </option>
              ))}
            </select>
            {user.role === "SUPER_ADMIN" && (partners?.length ?? 0) > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(partners ?? []).slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setDraftPeer(p.id);
                      router.push(`/dashboard/chat?peer=${p.id}`);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-muted/10 px-2 py-0.5 text-xs transition hover:bg-muted/25"
                  >
                    <UserAvatar name={p.username} size={22} />
                    {p.username}
                    {p.unreadCount > 0 ? (
                      <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                        {p.unreadCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </Card>
        ) : null}

        {user.role === "INVESTOR" && ctxPending && !resolvedPeer ? (
          <Card className="p-4 text-sm text-muted-foreground">Загрузка чата…</Card>
        ) : null}
        {user.role === "INVESTOR" && ctxError && !resolvedPeer ? (
          <Card className="p-4 text-sm text-red-400">
            {ctxQueryError instanceof Error ? ctxQueryError.message : "Не удалось загрузить чат"}
          </Card>
        ) : null}
        {!resolvedPeer && user.role === "INVESTOR" && !ctxPending && !ctxError && ctx?.defaultPeer == null ? (
          <Card className="p-4 text-sm text-muted-foreground">
            В системе нет активного владельца сети (OWNER) или не настроена связь инвестора с сетью. Обратитесь к
            администратору.
          </Card>
        ) : null}

        {resolvedPeer ? (
          <Card className="flex min-h-[45vh] flex-col overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border/45 bg-muted/5 px-3 py-2.5">
              <UserAvatar
                name={(partners ?? []).find((p) => p.id === resolvedPeer)?.username ?? "?"}
                size={32}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {(partners ?? []).find((p) => p.id === resolvedPeer)?.username ??
                    directory?.users?.find((u) => u.id === resolvedPeer)?.username ??
                    `ID ${resolvedPeer}`}
                </div>
                <div className="text-xs text-muted-foreground">Переписка</div>
              </div>
            </div>
            <div className="max-h-[50vh] flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {(messagesData?.messages ?? []).length === 0 ? (
                <Text className="text-sm text-muted-foreground">Пока нет сообщений — напишите первым.</Text>
              ) : (
                (messagesData?.messages ?? []).map((m) => {
                  const mine = m.senderId === user.id;
                  return (
                    <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                          mine
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "thai-glass rounded-bl-sm"
                        )}
                      >
                        {!mine ? (
                          <div className="text-xs font-medium text-muted-foreground mb-0.5">{m.senderUsername}</div>
                        ) : null}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className="mt-1 text-xs opacity-70">
                          {new Date(m.createdAt).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
            <form
              className="flex gap-2 border-t border-border/45 bg-muted/5 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendMutation.mutate();
              }}
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сообщение..."
                className="flex-1"
              />
              <Button type="submit" disabled={sendMutation.isPending || !text.trim()}>
                {sendMutation.isPending ? "..." : "Отпр."}
              </Button>
            </form>
          </Card>
        ) : user.role !== "INVESTOR" ? (
          <Card className="p-4 text-sm text-muted-foreground">Выберите собеседника выше.</Card>
        ) : null}

        {sendMutation.error instanceof Error ? (
          <Text className="text-xs text-red-400 px-1">{sendMutation.error.message}</Text>
        ) : null}
        <MobileBottomNav active="home" />
      </div>
    </Container>
  );
}

export default function ChatPage() {
  return (
    <Container>
      <div className="thai-dashboard-root flex min-h-screen flex-col items-center justify-center gap-3 pb-28 text-center">
        <div className="thai-panel-muted max-w-md space-y-3">
          <Text className="text-base font-semibold text-foreground">Чат временно отключён</Text>
          <Text className="text-sm text-muted-foreground">
            Раздел остановлен на время стабилизации базы данных.
          </Text>
          <Button onClick={() => window.location.assign("/dashboard")} className="w-full">
            На главную
          </Button>
        </div>
        <MobileBottomNav active="home" />
      </div>
    </Container>
  );
}
