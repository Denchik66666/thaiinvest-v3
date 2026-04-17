"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { notifyWithAttention } from "@/lib/attention-notify";
import {
  readNotificationPreferences,
  subscribeNotificationPreferences,
} from "@/lib/notification-preferences";

type ChatContextResponse = {
  success: boolean;
  unreadTotal: number;
};

function getPollInterval(mode: "fast" | "standard" | "economy", visible: boolean) {
  if (mode === "fast") return visible ? 5_000 : 12_000;
  if (mode === "standard") return visible ? 12_000 : 20_000;
  return visible ? 20_000 : 35_000;
}

export default function GlobalLiveNotifier() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [pageVisible, setPageVisible] = useState(true);
  const prefs = useSyncExternalStore(
    subscribeNotificationPreferences,
    readNotificationPreferences,
    readNotificationPreferences
  );

  const isChatPage = pathname?.startsWith("/dashboard/chat") ?? false;
  const prevUnreadRef = useRef<number | null>(null);
  const isInitialRef = useRef(true);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const pollMs = useMemo(
    () => getPollInterval(prefs.pollingMode, pageVisible),
    [prefs.pollingMode, pageVisible]
  );

  const { data } = useQuery({
    queryKey: ["global-live-chat-context"],
    queryFn: () => apiClient.get<ChatContextResponse>("/api/chat/context"),
    enabled: !!user,
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user) {
      prevUnreadRef.current = null;
      isInitialRef.current = true;
      return;
    }

    const currentUnread = data?.unreadTotal;
    if (typeof currentUnread !== "number") return;

    const prev = prevUnreadRef.current;
    prevUnreadRef.current = currentUnread;

    if (isInitialRef.current) {
      isInitialRef.current = false;
      return;
    }
    if (prev == null || currentUnread <= prev) return;

    const newCount = currentUnread - prev;
    if (!isChatPage) {
      notifyWithAttention(
        "success",
        newCount === 1 ? "Новое сообщение в чате" : `Новых сообщений в чате: +${newCount}`,
        prefs
      );
    }
  }, [data?.unreadTotal, isChatPage, prefs, user]);

  return null;
}
