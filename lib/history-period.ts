/**
 * Период фильтра ленты/сводки финансов — общая логика для клиента и API.
 * Диапазон по календарным YYYY-MM-DD считается в часовом поясе Asia/Bangkok (основной рынок продукта),
 * чтобы сервер (часто UTC) и браузер пользователя давали одинаковый отбор по датам.
 */
export type PeriodPreset = "7d" | "30d" | "90d" | "365d" | "all";

export type HistoryPeriodValue =
  | { kind: "preset"; preset: PeriodPreset }
  | { kind: "range"; fromYmd: string; toYmd: string };

export function periodStartMs(p: PeriodPreset): number | null {
  if (p === "all") return null;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 365;
  return Date.now() - days * 86400000;
}

const BANGKOK_TZ = "Asia/Bangkok";

/** Календарный день события в Asia/Bangkok как YYYY-MM-DD (лексикографически сравним с fromYmd/toYmd). */
export function sortAtBangkokCalendarYmd(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

/** Попадает ли `sortAt` ISO в выбранный период (те же правила, что у ленты на клиенте). */
export function sortAtInHistoryPeriod(sortAtIso: string, period: HistoryPeriodValue): boolean {
  const t = new Date(sortAtIso).getTime();
  if (!Number.isFinite(t)) return false;
  if (period.kind === "preset") {
    const start = periodStartMs(period.preset);
    if (start == null) return true;
    return t >= start;
  }
  const from = period.fromYmd.trim();
  const to = period.toYmd.trim();
  const opYmd = sortAtBangkokCalendarYmd(sortAtIso);
  if (!opYmd) return false;
  return opYmd >= from && opYmd <= to;
}

/** Для фильтра периода: у `week_accrual` — начало недели (`weekStart`), хотя в API `sortAt` = `weekEnd` для порядка строк в ленте. */
export function operationPeriodAnchorIso(item: { kind: string; sortAt: string; weekStart?: string }): string {
  if (item.kind === "week_accrual" && item.weekStart) return item.weekStart;
  return item.sortAt;
}

/** Сегодняшний календарный день в Asia/Bangkok (как у фильтра периода). */
export function bangkokCalendarTodayYmd(): string | null {
  return sortAtBangkokCalendarYmd(new Date().toISOString());
}

/** Отображение YYYY-MM-DD в подписи ленты (день как календарная дата, без сдвига TZ). */
export function formatHistoryYmdRuDisplay(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return ymd;
  return new Date(y, mo - 1, d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/**
 * Подпись интервала для строки «Начисление» с учётом выбранного периода.
 *
 * Отбор по периоду смотрит на **начало недели** в Bangkok (`operationPeriodAnchorIso`), поэтому неделя
 * с понедельником внутри [from, to] попадает в список целиком, даже если календарный конец недели позже `to`.
 * Здесь правая граница подписи обрезается до `to`, чтобы не казалось, что фильтр «до 04.03» показывает дни после 04.03.
 */
export function weekAccrualPeriodRowUi(
  weekStartIso: string,
  weekEndIso: string,
  period: HistoryPeriodValue | undefined
): {
  captionFrom: string;
  captionTo: string;
  clippedByPeriodEnd: boolean;
  /** Правая граница недели (как в леджере) в Bangkok позже сегодня — неделя ещё не закончилась. */
  extendsBeyondBangkokToday: boolean;
} {
  const ws = sortAtBangkokCalendarYmd(weekStartIso);
  const we = sortAtBangkokCalendarYmd(weekEndIso);
  const today = bangkokCalendarTodayYmd();
  if (!ws || !we) {
    return {
      captionFrom: ws ? formatHistoryYmdRuDisplay(ws) : "",
      captionTo: we ? formatHistoryYmdRuDisplay(we) : "",
      clippedByPeriodEnd: false,
      extendsBeyondBangkokToday: false,
    };
  }

  let captionFrom = ws;
  let captionTo = we;
  let clippedByPeriodEnd = false;

  if (period?.kind === "range") {
    const from = period.fromYmd.trim();
    const to = period.toYmd.trim();
    if (captionFrom < from) captionFrom = from;
    if (captionTo > to) {
      captionTo = to;
      clippedByPeriodEnd = true;
    }
  }

  const extendsBeyondBangkokToday = Boolean(today && we > today);

  return {
    captionFrom: formatHistoryYmdRuDisplay(captionFrom),
    captionTo: formatHistoryYmdRuDisplay(captionTo),
    clippedByPeriodEnd,
    extendsBeyondBangkokToday,
  };
}
