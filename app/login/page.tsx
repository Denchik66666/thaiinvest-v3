"use client";

import { useLayoutEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { LoginThailandThemeToggle } from "@/components/LoginThailandThemeToggle";
import {
  applyAppThemeToDocument,
  getThemeServerSnapshot,
  parseThemeSnapshot,
  persistAppTheme,
  readThemeSnapshot,
  subscribeAppTheme,
} from "@/lib/app-theme";

type Palette = {
  shell: CSSProperties;
  bloom: [string, string, string];
  card: CSSProperties;
  title: CSSProperties;
  dividerTrack: CSSProperties;
  label: CSSProperties;
  input: CSSProperties;
  eye: CSSProperties;
  error: CSSProperties;
  btn: CSSProperties;
  flagBtn: CSSProperties;
  placeholderFocusCss: string;
  /** Hover for #login-theme-flag (inline styles cannot do :hover cleanly). */
  flagHoverCss: string;
};

function getPalette(dark: boolean): Palette {
  if (dark) {
    return {
      shell: {
        position: "relative",
        boxSizing: "border-box",
        minHeight: "100dvh",
        width: "100%",
        overflow: "hidden",
        padding: "2rem 1rem",
        backgroundColor: "#07090f",
        color: "#fafafa",
        fontFamily:
          'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        transition: "background-color 0.25s ease, color 0.25s ease",
      },
      bloom: [
        "rgba(139, 92, 246, 0.22)",
        "rgba(59, 130, 246, 0.18)",
        "rgba(217, 70, 239, 0.16)",
      ],
      card: {
        width: "100%",
        borderRadius: "1rem",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        background: "rgba(255, 255, 255, 0.08)",
        padding: "1.5rem 1.75rem",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        transition: "background 0.25s ease, border-color 0.25s ease",
      },
      title: {
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "rgba(255, 255, 255, 0.78)",
      },
      dividerTrack: { background: "rgba(255, 255, 255, 0.1)" },
      label: {
        fontSize: "0.875rem",
        fontWeight: 500,
        color: "rgba(255, 255, 255, 0.9)",
      },
      input: {
        boxSizing: "border-box",
        width: "100%",
        borderRadius: "0.375rem",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        background: "rgba(255, 255, 255, 0.08)",
        padding: "0.5rem 0.75rem",
        fontSize: "1rem",
        color: "#fff",
        outline: "none",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      },
      eye: { color: "rgba(255, 255, 255, 0.55)" },
      error: {
        borderRadius: "0.5rem",
        border: "1px solid rgba(248, 113, 113, 0.35)",
        background: "rgba(239, 68, 68, 0.12)",
        padding: "0.5rem 0.75rem",
        fontSize: "0.875rem",
        color: "#fecaca",
      },
      btn: {
        height: "2.75rem",
        width: "100%",
        border: "none",
        borderRadius: "0.5rem",
        fontSize: "1rem",
        fontWeight: 600,
        cursor: "pointer",
        color: "#fff",
        background: "linear-gradient(180deg, hsl(242, 75%, 58%), hsl(242, 75%, 48%))",
      },
      flagBtn: {
        border: "1px solid rgba(255, 255, 255, 0.2)",
        background: "rgba(255, 255, 255, 0.1)",
        boxShadow: "none",
      },
      flagHoverCss: `
        #login-theme-flag { transition: background-color 0.15s ease, border-color 0.15s ease; }
        #login-theme-flag:hover { background: rgba(255, 255, 255, 0.2); border-color: rgba(255, 255, 255, 0.28); }
      `,
      placeholderFocusCss: `
        #login-username::placeholder, #login-password::placeholder { color: rgba(255,255,255,0.45); }
        #login-username:focus, #login-password:focus { box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.45); border-color: rgba(255,255,255,0.35); }
      `,
    };
  }

  return {
    shell: {
      position: "relative",
      boxSizing: "border-box",
      minHeight: "100dvh",
      width: "100%",
      overflow: "hidden",
      padding: "2rem 1rem",
      backgroundColor: "#e8edf5",
      color: "#0f172a",
      fontFamily:
        'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      transition: "background-color 0.25s ease, color 0.25s ease",
    },
    bloom: [
      "rgba(139, 92, 246, 0.12)",
      "rgba(59, 130, 246, 0.1)",
      "rgba(217, 70, 239, 0.08)",
    ],
    card: {
      width: "100%",
      borderRadius: "1rem",
      border: "1px solid rgba(15, 23, 42, 0.1)",
      background: "rgba(255, 255, 255, 0.92)",
      padding: "1.5rem 1.75rem",
      boxShadow: "0 18px 50px rgba(15, 23, 42, 0.12)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      transition: "background 0.25s ease, border-color 0.25s ease",
    },
    title: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      color: "rgba(15, 23, 42, 0.72)",
    },
    dividerTrack: { background: "rgba(15, 23, 42, 0.08)" },
    label: {
      fontSize: "0.875rem",
      fontWeight: 500,
      color: "rgba(15, 23, 42, 0.88)",
    },
    input: {
      boxSizing: "border-box",
      width: "100%",
      borderRadius: "0.375rem",
      border: "1px solid rgba(15, 23, 42, 0.15)",
      background: "#fff",
      padding: "0.5rem 0.75rem",
      fontSize: "1rem",
      color: "#0f172a",
      outline: "none",
      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    },
    eye: { color: "rgba(15, 23, 42, 0.45)" },
    error: {
      borderRadius: "0.5rem",
      border: "1px solid rgba(220, 38, 38, 0.35)",
      background: "rgba(254, 226, 226, 0.85)",
      padding: "0.5rem 0.75rem",
      fontSize: "0.875rem",
      color: "#991b1b",
    },
    btn: {
      height: "2.75rem",
      width: "100%",
      border: "none",
      borderRadius: "0.5rem",
      fontSize: "1rem",
      fontWeight: 600,
      cursor: "pointer",
      color: "#fff",
      background: "linear-gradient(180deg, hsl(242, 75%, 54%), hsl(242, 75%, 44%))",
    },
    flagBtn: {
      border: "1px solid rgb(203, 213, 225)",
      background: "#ffffff",
      boxShadow: "none",
    },
    flagHoverCss: `
        #login-theme-flag { transition: background-color 0.15s ease, border-color 0.15s ease; }
        #login-theme-flag:hover { background: rgb(241, 245, 249); border-color: rgb(148, 163, 184); }
      `,
    placeholderFocusCss: `
        #login-username::placeholder, #login-password::placeholder { color: rgba(15, 23, 42, 0.4); }
        #login-username:focus, #login-password:focus { box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.35); border-color: rgba(139, 92, 246, 0.55); }
      `,
  };
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const themeSnap = useSyncExternalStore(subscribeAppTheme, readThemeSnapshot, getThemeServerSnapshot);
  const { theme: themeName, dark: darkMode } = parseThemeSnapshot(themeSnap);

  const router = useRouter();
  const p = getPalette(darkMode);

  useLayoutEffect(() => {
    applyAppThemeToDocument(themeName, darkMode);
  }, [themeName, darkMode]);

  function toggleDark() {
    persistAppTheme(themeName, !darkMode);
  }

  function onFlagClick() {
    toggleDark();
  }

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

      router.replace("/dashboard");
      window.setTimeout(() => {
        if (window.location.pathname !== "/dashboard") {
          window.location.href = "/dashboard";
        }
      }, 120);
    } catch {
      setError("Ошибка подключения к серверу");
      setLoading(false);
    }
  }

  const pwInput: CSSProperties = { ...p.input, paddingRight: "2.5rem" };

  return (
    <div style={p.shell} suppressHydrationWarning>
      <style
        dangerouslySetInnerHTML={{
          __html: `${p.placeholderFocusCss}\n${p.flagHoverCss}`,
        }}
      />
      <div aria-hidden style={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            top: "-7rem",
            left: "50%",
            height: "18rem",
            width: "18rem",
            transform: "translateX(-50%)",
            borderRadius: "9999px",
            background: p.bloom[0],
            filter: "blur(48px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "33%",
            left: "-5rem",
            height: "16rem",
            width: "16rem",
            borderRadius: "9999px",
            background: p.bloom[1],
            filter: "blur(48px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            height: "14rem",
            width: "14rem",
            borderRadius: "9999px",
            background: p.bloom[2],
            filter: "blur(48px)",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          margin: "0 auto",
          display: "flex",
          minHeight: "calc(100dvh - 4rem)",
          width: "100%",
          maxWidth: "24rem",
          alignItems: "center",
        }}
      >
        <div style={p.card}>
          <div
            style={{
              position: "relative",
              marginBottom: "1.25rem",
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LoginThailandThemeToggle
              flagBtnStyle={p.flagBtn}
              onClick={onFlagClick}
            />
            <div
              style={{
                ...p.title,
                paddingLeft: 44,
                paddingRight: 44,
                textAlign: "center",
              }}
            >
              THAIINVEST
            </div>
          </div>

          <div
            style={{
              position: "relative",
              marginBottom: "1.25rem",
              height: 4,
              width: "100%",
              overflow: "hidden",
              borderRadius: 9999,
              ...p.dividerTrack,
            }}
          >
            <div
              style={{
                height: "100%",
                width: "100%",
                background:
                  "linear-gradient(90deg, rgba(201, 168, 106, 0.75), rgb(243, 229, 200), rgba(184, 138, 68, 0.75))",
              }}
            />
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label style={p.label} htmlFor="login-username">
                Логин
              </label>
              <input
                id="login-username"
                style={p.input}
                placeholder="Введите логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label style={p.label} htmlFor="login-password">
                Пароль
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  style={pwInput}
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
                  style={{
                    position: "absolute",
                    right: "0.65rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: "0.25rem",
                    ...p.eye,
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error ? <div style={p.error}>{error}</div> : null}

            <button
              type="submit"
              style={{
                ...p.btn,
                opacity: loading ? 0.65 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
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
