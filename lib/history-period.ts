import { getNextMonday, getWeekStartMonday, startOfDay } from "@/lib/weekly";

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

/**
 * Понедельник 00:00 Asia/Bangkok той торговой недели, в которую по календарю Bangkok попадает момент `instant`.
 * Нужен для сетки леджера на сервере в UTC: `setHours(0,0,0,0)` и «локальный» понедельник давали воскресенье в Bangkok.
 */
export function bangkokWeekStartMondayContaining(instant: Date): Date {
  const ymd = sortAtBangkokCalendarYmd(instant.toISOString());
  if (!ymd) return getWeekStartMonday(startOfDay(instant));
  let t = new Date(`${ymd}T12:00:00+07:00`);
  if (!Number.isFinite(t.getTime())) return getWeekStartMonday(startOfDay(instant));
  for (let i = 0; i < 7; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BANGKOK_TZ,
      weekday: "short",
    }).formatToParts(t);
    const wd = parts.find((p) => p.type === "weekday")?.value;
    if (wd === "Mon") break;
    t = new Date(t.getTime() - 86400000);
  }
  const monYmd = sortAtBangkokCalendarYmd(t.toISOString());
  if (!monYmd) return t;
  const mon0 = new Date(`${monYmd}T00:00:00+07:00`);
  return Number.isFinite(mon0.getTime()) ? mon0 : t;
}

/**
 * Аналог `getNextMonday` (`lib/weekly.ts`), но календарный день события — Asia/Bangkok
 * (вступление пополнения тела в базу недели).
 */
export function getNextMondayBangkok(date: Date): Date {
  const weekStart = bangkokWeekStartMondayContaining(date);
  const monYmd = sortAtBangkokCalendarYmd(weekStart.toISOString());
  const dateYmd = sortAtBangkokCalendarYmd(date.toISOString());
  if (!monYmd || !dateYmd) return getNextMonday(startOfDay(date));
  if (dateYmd === monYmd) return weekStart;
  return new Date(weekStart.getTime() + 7 * 86400000);
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

/**
 * Отображение YYYY-MM-DD в подписи ленты.
 * Строка `ymd` — календарный день в **Asia/Bangkok**; форматирование тоже в Bangkok (не в локальной TZ браузера).
 */
export function formatHistoryYmdRuDisplay(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const y = m[1];
  const mo = m[2];
  const d = m[3];
  const inst = new Date(`${y}-${mo}-${d}T12:00:00+07:00`);
  if (!Number.isFinite(inst.getTime())) return `${d}.${mo}`;
  return inst.toLocaleDateString("ru-RU", {
    timeZone: BANGKOK_TZ,
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Торговая неделя в леджере: `[weekStart, weekEnd)` — `weekStart` = понедельник цикла, `weekEnd` = **следующий** понедельник (не входит).
 * Для подписи «всегда с пн»: левая граница — календарный понедельник Bangkok у `weekStart`,
 * правая — **воскресенье** (последний день, входящий в интервал), Bangkok YMD = день `weekStart + 6 суток` по таймлайну леджера.
 */
export function weekLedgerBangkokInclusiveRangeYmd(
  weekStartIso: string,
  _weekEndExclusiveIso: string
): { fromYmd: string | null; inclusiveEndYmd: string | null } {
  const fromYmd = sortAtBangkokCalendarYmd(weekStartIso);
  const t0 = new Date(weekStartIso).getTime();
  if (!Number.isFinite(t0)) return { fromYmd, inclusiveEndYmd: null };
  const inclusiveEndYmd = sortAtBangkokCalendarYmd(new Date(t0 + 6 * 86400000).toISOString());
  return { fromYmd, inclusiveEndYmd };
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
  /** Последний календарный день недели (вс) в Bangkok позже «сегодня» — неделя ещё не закрылась по календарю. */
  extendsBeyondBangkokToday: boolean;
} {
  const { fromYmd: ws, inclusiveEndYmd: weIncl } = weekLedgerBangkokInclusiveRangeYmd(weekStartIso, weekEndIso);
  const today = bangkokCalendarTodayYmd();
  if (!ws || !weIncl) {
    const weFallback = sortAtBangkokCalendarYmd(weekEndIso);
    return {
      captionFrom: ws ? formatHistoryYmdRuDisplay(ws) : "",
      captionTo: weIncl ? formatHistoryYmdRuDisplay(weIncl) : weFallback ? formatHistoryYmdRuDisplay(weFallback) : "",
      clippedByPeriodEnd: false,
      extendsBeyondBangkokToday: false,
    };
  }

  let captionFrom = ws;
  let captionTo = weIncl;
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

  const extendsBeyondBangkokToday = Boolean(today && captionTo > today);

  return {
    captionFrom: formatHistoryYmdRuDisplay(captionFrom),
    captionTo: formatHistoryYmdRuDisplay(captionTo),
    clippedByPeriodEnd,
    extendsBeyondBangkokToday,
  };
}
