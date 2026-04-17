import { apiClient } from "@/lib/api-client";
import type { NotificationPollingMode } from "@/lib/notification-preferences";

/** Единый ключ кэша для `/api/chat/context` — иначе колокольчик и тосты живут разными данными. */
export const CHAT_CONTEXT_QUERY_KEY = ["chat-context"] as const;

export type ChatContextPartner = {
  id: number;
  username: string;
  unreadCount: number;
  lastAt: string | null;
};

export type ChatContextLastUnread = {
  id: number;
  senderId: number;
  senderUsername: string;
  bodyPreview: string;
  createdAt: string;
};

export type ChatContextPayload = {
  success: boolean;
  defaultPeer: { id: number; username: string } | null;
  unreadTotal: number;
  /** Самое свежее непрочитанное входящее (для превью в тосте и логики «открыт этот диалог»). */
  lastUnread: ChatContextLastUnread | null;
  partners: ChatContextPartner[];
};

export function fetchChatContext() {
  return apiClient.get<ChatContextPayload>("/api/chat/context");
}

export function chatContextPollMs(pollingMode: NotificationPollingMode, pageVisible: boolean) {
  if (pollingMode === "fast") return pageVisible ? 4_000 : 10_000;
  if (pollingMode === "standard") return pageVisible ? 10_000 : 18_000;
  return pageVisible ? 18_000 : 30_000;
}
