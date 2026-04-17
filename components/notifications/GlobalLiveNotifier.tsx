"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  CHAT_CONTEXT_QUERY_KEY,
  chatContextPollMs,
  fetchChatContext,
  type ChatContextPayload,
} from "@/lib/chat-context-query";
import { notifyWithAttention } from "@/lib/attention-notify";
import {
  readNotificationPreferences,
  subscribeNotificationPreferences,
} from "@/lib/notification-preferences";

function buildChatToastMessage(unreadDelta: number, last: ChatContextPayload["lastUnread"]) {
  if (last && unreadDelta >= 1) {
    const head = unreadDelta === 1 ? "Новое сообщение" : `Новых сообщений: +${unreadDelta}`;
    return `${head} от ${last.senderUsername}: ${last.bodyPreview}`;
  }
  if (unreadDelta === 1) return "Новое сообщение в чате";
  return `Новых сообщений в чате: +${unreadDelta}`;
}

function GlobalLiveNotifierInner() {
  const { user } = useAuth();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  const [pageVisible, setPageVisible] = useState(true);
  const prefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    readNotificationPreferences,
    readNotificationPreferences
  );

  const pollMs = useMemo(
    () => chatContextPollMs(prefs.pollingMode, pageVisible),
    [prefs.pollingMode, pageVisible]
  );

  const { data } = useQuery({
    queryKey: CHAT_CONTEXT_QUERY_KEY,
    queryFn: fetchChatContext,
    enabled: !!user,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });

  const isChatRoute = pathname.startsWith("/dashboard/chat");
  const peerFromUrl = Number(searchParams.get("peer"));
  const effectiveChatPeer = useMemo(() => {
    if (!isChatRoute) return null;
    if (Number.isFinite(peerFromUrl) && peerFromUrl > 0) return peerFromUrl;
    return data?.defaultPeer?.id ?? null;
  }, [isChatRoute, peerFromUrl, data?.defaultPeer?.id]);

  const prevUnreadRef = useRef<number | null>(null);
  const isInitialRef = useRef(true);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!user) {
      prevUnreadRef.current = null;
      isInitialRef.current = true;
      return;
    }

    const currentUnread = data?.unreadTotal;
    if (typeof currentUnread !== "number") return;

    if (isInitialRef.current) {
      prevUnreadRef.current = currentUnread;
      isInitialRef.current = false;
      return;
    }

    const prev = prevUnreadRef.current;
    if (prev == null || currentUnread <= prev) {
      prevUnreadRef.current = currentUnread;
      return;
    }

    prevUnreadRef.current = currentUnread;

    const delta = currentUnread - prev;
    const last = data?.lastUnread;

    const shouldSuppressForOpenThread =
      isChatRoute &&
      !!last &&
      effectiveChatPeer != null &&
      last.senderId === effectiveChatPeer;

    if (shouldSuppressForOpenThread) return;

    notifyWithAttention("success", buildChatToastMessage(delta, last ?? null), prefs);
  }, [user, data?.unreadTotal, data?.lastUnread, isChatRoute, effectiveChatPeer, prefs]);

  return null;
}

export default function GlobalLiveNotifier() {
  return (
    <Suspense fallback={null}>
      <GlobalLiveNotifierInner />
    </Suspense>
  );
}
