"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useLayoutEffect, useRef } from "react";

export function parseDeskAmountDigits(value: string): number {
  return Number(value.replace(/[^\d]/g, ""));
}

/** Отображение суммы в поле ввода: группы цифр + суффикс ฿ (как в деск-модалках). */
export function formatDeskAmountThb(value: string): string {
  const amount = parseDeskAmountDigits(value);
  if (!amount) return "";
  return `${amount.toLocaleString("ru-RU")} ฿`;
}

/**
 * Позиция курсора в отформатированной строке после правки: столько же цифр слева от курсора,
 * что и в «сыром» значении из события (до применения `formatDeskAmountThb`).
 */
export function deskAmountCursorAfterFormat(formatted: string, digitsLeftOfCursor: number): number {
  if (digitsLeftOfCursor <= 0) return 0;
  let d = 0;
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i];
    if (ch >= "0" && ch <= "9") {
      d++;
      if (d === digitsLeftOfCursor) return i + 1;
    }
  }
  return formatted.length;
}

function lastDigitCharIndex(formatted: string): number {
  for (let i = formatted.length - 1; i >= 0; i--) {
    const ch = formatted[i];
    if (ch >= "0" && ch <= "9") return i;
  }
  return -1;
}

/**
 * Backspace, когда каретка в «хвосте» после последней цифры (пробелы тысяч перед ฿, «฿», позиция после строки):
 * стираем последнюю цифру суммы, а не залипаем на суффиксе.
 */
export function deskAmountBackspaceInSuffix(
  e: KeyboardEvent<HTMLInputElement>,
  formatted: string
): { nextFormatted: string; cursor: number } | null {
  if (e.key !== "Backspace" || formatted.length === 0) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.nativeEvent.isComposing) return null;

  const el = e.currentTarget;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  if (start !== end) return null;

  const ld = lastDigitCharIndex(formatted);
  if (ld < 0 || start <= ld) return null;

  e.preventDefault();
  const digits = formatted.replace(/[^\d]/g, "");
  if (digits.length === 0) return { nextFormatted: "", cursor: 0 };
  const nextDigits = digits.slice(0, -1);
  const nextFormatted = nextDigits ? formatDeskAmountThb(nextDigits) : "";
  const cursor = nextFormatted
    ? deskAmountCursorAfterFormat(nextFormatted, nextDigits.length)
    : 0;
  return { nextFormatted, cursor };
}

/**
 * Controlled-поле с `formatDeskAmountThb`: после `setState` восстанавливает курсор в `useLayoutEffect`.
 */
export function useDeskAmountCursorRestore(displayValue: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCursor.current == null || !inputRef.current) return;
    const p = Math.min(Math.max(0, pendingCursor.current), inputRef.current.value.length);
    pendingCursor.current = null;
    inputRef.current.setSelectionRange(p, p);
  }, [displayValue]);

  function armCursor(pos: number) {
    pendingCursor.current = pos;
  }

  function captureFromChangeEvent(e: ChangeEvent<HTMLInputElement>): string {
    const raw = e.target.value;
    const sel = e.target.selectionStart ?? raw.length;
    const digitsLeft = raw.slice(0, sel).replace(/[^\d]/g, "").length;
    const next = formatDeskAmountThb(raw);
    pendingCursor.current = deskAmountCursorAfterFormat(next, digitsLeft);
    return next;
  }

  return { inputRef, captureFromChangeEvent, armCursor };
}
