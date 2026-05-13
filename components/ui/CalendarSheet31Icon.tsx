import { cn } from "@/lib/utils";

const GLOW = "#9333ea";
const GLOW_MID = "#c084fc";
const CORE = "#faf5ff";
const CORE_SOFT = "#f5d0fe";

/**
 * «Лист календаря» с числом 31 — фиолетовый, матовое мягкое свечение (без привязки к `currentColor`).
 */
export function CalendarSheet31Icon({ className }: { className?: string }) {
  const layers = (
    <>
      {/* Мягкая подложка контура */}
      <rect x="4" y="7" width="16" height="14" rx="2" stroke={GLOW} strokeWidth="2.8" opacity={0.22} />
      <path d="M4 11h16" stroke={GLOW} strokeWidth="2.8" strokeLinecap="round" opacity={0.2} />
      <path d="M7.5 4.5v2.5M12 4.5v2.5M16.5 4.5v2.5" stroke={GLOW} strokeWidth="2.5" strokeLinecap="round" opacity={0.22} />
      <circle cx="7.5" cy="4.5" r="1.35" stroke={GLOW} strokeWidth="2" opacity={0.22} />
      <circle cx="12" cy="4.5" r="1.35" stroke={GLOW} strokeWidth="2" opacity={0.22} />
      <circle cx="16.5" cy="4.5" r="1.35" stroke={GLOW} strokeWidth="2" opacity={0.22} />
      {/* Яркий контур */}
      <rect x="4" y="7" width="16" height="14" rx="2" stroke={CORE_SOFT} strokeWidth="1.35" />
      <path d="M4 11h16" stroke={CORE_SOFT} strokeWidth="1.35" strokeLinecap="round" />
      <path d="M7.5 4.5v2.5M12 4.5v2.5M16.5 4.5v2.5" stroke={CORE_SOFT} strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="7.5" cy="4.5" r="1" stroke={CORE_SOFT} strokeWidth="1.35" />
      <circle cx="12" cy="4.5" r="1" stroke={CORE_SOFT} strokeWidth="1.35" />
      <circle cx="16.5" cy="4.5" r="1" stroke={CORE_SOFT} strokeWidth="1.35" />
      <rect x="4" y="7" width="16" height="14" rx="2" stroke={CORE} strokeWidth="0.85" />
      <path d="M4 11h16" stroke={CORE} strokeWidth="0.85" strokeLinecap="round" />
      <path d="M7.5 4.5v2.5M12 4.5v2.5M16.5 4.5v2.5" stroke={CORE} strokeWidth="0.85" strokeLinecap="round" />
      <circle cx="7.5" cy="4.5" r="1" stroke={CORE} strokeWidth="0.85" />
      <circle cx="12" cy="4.5" r="1" stroke={CORE} strokeWidth="0.85" />
      <circle cx="16.5" cy="4.5" r="1" stroke={CORE} strokeWidth="0.85" />
      <text
        x="12"
        y="18.5"
        textAnchor="middle"
        fill={CORE}
        stroke={GLOW_MID}
        strokeWidth="0.35"
        paintOrder="stroke fill"
        fontSize="9.5"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        style={{ filter: "drop-shadow(0 0 2px rgba(192, 132, 252, 0.35))" }}
      >
        31
      </text>
    </>
  );

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "shrink-0",
        "[filter:drop-shadow(0_0_1px_rgba(250,232,255,0.55))_drop-shadow(0_0_3px_rgba(192,132,252,0.22))_drop-shadow(0_0_7px_rgba(147,51,234,0.12))]",
        className
      )}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {layers}
    </svg>
  );
}
