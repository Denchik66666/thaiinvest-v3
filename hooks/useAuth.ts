"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  isSystemOwner: boolean;
  avatarUrl?: string | null;
}

export const AUTH_ME_QUERY_KEY = ["auth", "me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: async (): Promise<AuthUser | null> => {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { user: AuthUser };
      return data.user ?? null;
    },
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
  }, [queryClient]);

  return {
    user: query.data ?? null,
    loading: query.isPending,
    refresh,
  };
}
