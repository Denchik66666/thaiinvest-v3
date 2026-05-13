"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  isSystemOwner: boolean;
  avatarUrl?: string | null;
  /** ISO 8601, дата регистрации учётной записи */
  createdAt?: string;
}

export const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

/** Общий fetch для `useQuery` и гидрации кеша после логина (без лишнего «пустого» кадра на дашборде). */
export async function fetchAuthMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: AuthUser };
  return data.user ?? null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchAuthMe,
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
  }, [queryClient]);

  /**
   * Полноэкранная «загрузка» только до первого завершённого запроса (ещё нет `data` в кеше).
   * После ответа (в т.ч. `user: null` или гидрация после логина) фоновый refetch не гасит интерфейс.
   */
  const loading = query.data === undefined && query.isPending;

  return {
    user: query.data ?? null,
    loading,
    refresh,
  };
}
