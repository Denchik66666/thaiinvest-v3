import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Утилита для объединения классов Tailwind с поддержкой условий и разрешения конфликтов
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Форматирование чисел как валюты (THB)
 */
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + " ฿";
}

/**
 * Форматирование даты
 */
export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

/** Две буквы для «пустого» аватара (логин / имя пользователя). */
export function initialsTwoLetters(username: string) {
  const u = String(username).trim();
  if (u.length === 0) return "??";
  if (u.length === 1) return u.toUpperCase() + u.toUpperCase();
  return u.slice(0, 2).toUpperCase();
}
