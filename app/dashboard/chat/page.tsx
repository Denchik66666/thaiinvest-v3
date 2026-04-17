"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UserAvatar } from "@/components/user/UserAvatar";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import { DASHBOARD_STICKY_BAR_CLASS } from "@/lib/dashboard-sticky-bar";

type ChatContext = {
  success: boolean;
  defaultPeer: { id: number; username: string } | null;
  unreadTotal: number;
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

  const { data: ctx } = useQuery({
    queryKey: ["chat-context"],
    queryFn: () => apiClient.get<ChatContext>("/api/chat/context"),
    enabled: !!user,
    refetchInterval: 45_000,
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
    await apiClient.patch("/api/chat/read", { peerId: resolvedPeer });
    queryClient.invalidateQueries({ queryKey: ["chat-context"] });
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
      queryClient.invalidateQueries({ queryKey: ["chat-context"] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <Container>
        <div className="flex min-h-screen items-center justify-center">
          <Text>Загрузка...</Text>
        </div>
      </Container>
    );
  }

  const showPicker = user.role === "SUPER_ADMIN" || user.role === "OWNER";

  return (
    <Container>
      <div className="min-h-screen py-4 pb-28 md:py-8 md:pb-28 space-y-3">
        <div className={DASHBOARD_STICKY_BAR_CLASS}>
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile")}
            className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted/50 transition"
          >
            <UserAvatar name={user.username} src={user.avatarUrl} size={34} />
            <span className="truncate text-sm font-medium">{user.username}</span>
          </button>
        </div>

        <Text className="text-xs text-muted-foreground px-0.5">Внутренний чат</Text>

        {showPicker ? (
          <Card className="p-3">
            <label className="text-xs font-medium text-muted-foreground">Собеседник</label>
            <select
              className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
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
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs hover:bg-muted/30"
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

        {!resolvedPeer && user.role === "INVESTOR" ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Не найден владелец сети для переписки. Обратитесь к администратору.
          </Card>
        ) : null}

        {resolvedPeer ? (
          <Card className="flex flex-col p-0 overflow-hidden min-h-[45vh]">
            <div className="border-b border-border/60 px-3 py-2 flex items-center gap-2">
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
            <div className="flex-1 max-h-[50vh] overflow-y-auto px-3 py-3 space-y-2">
              {(messagesData?.messages ?? []).length === 0 ? (
                <Text className="text-sm text-muted-foreground">Пока нет сообщений — напишите первым.</Text>
              ) : (
                (messagesData?.messages ?? []).map((m) => {
                  const mine = m.senderId === user.id;
                  return (
                    <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={
                          mine
                            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary/90 px-3 py-2 text-sm text-primary-foreground"
                            : "max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-card/80 px-3 py-2 text-sm"
                        }
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
              className="border-t border-border/60 p-2 flex gap-2"
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
        <MobileBottomNav active="chat" />
      </div>
    </Container>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <Container>
          <div className="flex min-h-screen items-center justify-center pb-28">
            <Text>Загрузка...</Text>
          </div>
        </Container>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
