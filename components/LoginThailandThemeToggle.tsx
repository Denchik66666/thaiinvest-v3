"use client";

import type { CSSProperties, MouseEvent } from "react";

const TH_FLAG_EMOJI = String.fromCodePoint(0x1f1f9, 0x1f1ed);

type Props = {
  /** Стили круга (рамка, фон) из палитры логина */
  flagBtnStyle: CSSProperties;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
};

/** Кнопка с эмодзи флага 🇹🇭: тема (клик), пресет (долгое нажатие / Shift+клик). */
export function LoginThailandThemeToggle({
  flagBtnStyle,
  onClick,
}: Props) {
  return (
    <button
      id="login-theme-flag"
      type="button"
      onClick={onClick}
      aria-label="Тема: переключить светлую или тёмную"
      title="Светлая/тёмная тема"
      style={{
        position: "absolute",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        padding: 0,
        borderRadius: "9999px",
        cursor: "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        fontFamily:
          '"Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "Apple Color Emoji", sans-serif',
        ...flagBtnStyle,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: "1.35rem",
          lineHeight: 1,
          fontVariantEmoji: "emoji",
          position: "relative",
          top: 1,
        }}
      >
        {TH_FLAG_EMOJI}
      </span>
    </button>
  );
}
