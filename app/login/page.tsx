"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { AUTH_ME_QUERY_KEY, type AuthUser } from "@/hooks/useAuth";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/notify";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("db_cleared") !== "1") return;
    toast.success("База очищена");
    params.delete("db_cleared");
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, "", next);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        let msg = data.error || "Ошибка входа";
        if (msg === "Unauthorized") msg = "Неверный логин или пароль";
        if (msg === "Server error") msg = "Ошибка сервера, попробуйте позже";
        setError(msg);
        setLoading(false);
        return;
      }

      const u = data.user as AuthUser | undefined;
      if (u) {
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, u);
        void queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
      } else {
        await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
      }
      router.replace("/dashboard");
    } catch {
      setError("Ошибка подключения к серверу");
      setLoading(false);
    }
  }

  const inputClass = cn(
    "w-full rounded-lg border border-border/80 bg-background/80 px-3 py-2 text-base text-foreground shadow-sm backdrop-blur-sm",
    "transition-[border-color,box-shadow] duration-200 ease-out",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:border-primary/55 focus:ring-2 focus:ring-[hsl(var(--thai-ring-glow))]"
  );

  return (
    <div
      className="thai-login-shell bg-background px-4 py-8 text-foreground transition-[background-color,color] duration-300 ease-out"
      suppressHydrationWarning
    >
      <div className="relative z-[1] mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-sm items-center">
        <div className="thai-glass w-full rounded-2xl p-6 shadow-2xl transition-[box-shadow,backdrop-filter] duration-300 md:p-7">
          <div className="relative mb-5 flex min-h-10 items-center justify-center">
            <ThemeToggle variant="compact" className="absolute right-0 top-1/2 -translate-y-1/2" />
            <div className="px-12 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              THAIINVEST
            </div>
          </div>

          <div className="relative mb-5 h-1 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full w-full bg-gradient-to-r from-amber-700/80 via-amber-100 to-amber-800/75 opacity-90 dark:from-amber-500/50 dark:via-amber-200/40 dark:to-amber-600/45"
              aria-hidden
            />
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="login-username">
                Логин
              </label>
              <input
                id="login-username"
                className={inputClass}
                placeholder="Введите логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="login-password">
                Пароль
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  className={cn(inputClass, "pr-10")}
                  type={showPw ? "text" : "password"}
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error ? (
              <div
                className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className={cn(
                "h-11 w-full rounded-lg bg-gradient-to-b from-primary to-primary/85 text-base font-semibold text-primary-foreground shadow-md",
                "transition-[opacity,transform,filter] duration-200 ease-out",
                "enabled:hover:brightness-[1.06] enabled:active:scale-[0.992]",
                loading && "cursor-not-allowed opacity-65"
              )}
              disabled={loading}
            >
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
