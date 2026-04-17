"use client";

import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  isSystemOwner: boolean;
  avatarUrl?: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = await res.json();
    setUser(data.user);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("UNAUTHORIZED");
        }

        const data = await res.json();
        if (!isMounted) return;
        setUser(data.user);
        setLoading(false);
      } catch {
        if (!isMounted) return;
        setUser(null);
        setLoading(false);
      }
    };

    run();

    return () => {
      isMounted = false;
    };
  }, []);

  return { user, loading, refresh };
}
