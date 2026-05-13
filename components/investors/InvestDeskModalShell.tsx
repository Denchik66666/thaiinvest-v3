"use client";

import { useId, type ReactNode } from "react";

import { Modal } from "@/components/ui/Modal";
import { investDeskModalTitleClass } from "@/lib/dashboard-glass-accent";
import { cn } from "@/lib/utils";

type InvestDeskModalShellProps = {
  open: boolean;
  onClose: () => void;
  /** Если не передан — строка над заголовком скрыта (минималистичный режим). */
  eyebrow?: string | null;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  /** Узкая колонка под деловые формы */
  maxWidthClass?: string;
  /** Явный id заголовка (a11y); иначе стабильный `useId` */
  titleId?: string;
  /** Минималистичная шапка: без бордера у summary. */
  minimal?: boolean;
  /** Справа от заголовка в одной строке (например «Ставка 5%»). */
  titleRight?: ReactNode;
  /** Доп. классы к карточке / шапке / телу (тонкие темы экрана). */
  cardClassName?: string;
  headerClassName?: string;
  summaryWrapClassName?: string;
  bodyClassName?: string;
  /** Строка заголовка + titleRight (например выравнивание по центру). */
  titleRowClassName?: string;
  /** Обёртка блока справа от заголовка. */
  titleRightWrapClassName?: string;
};

/**
 * Единая оболочка модалок «рабочего стола»: светлая подложка, чёткая шапка, без визуальной каши.
 */
export function InvestDeskModalShell({
  open,
  onClose,
  eyebrow,
  title,
  summary,
  children,
  maxWidthClass = "max-w-[min(100vw-2rem,24rem)]",
  titleId: titleIdProp,
  minimal = false,
  titleRight,
  cardClassName,
  headerClassName,
  summaryWrapClassName,
  bodyClassName,
  titleRowClassName,
  titleRightWrapClassName,
}: InvestDeskModalShellProps) {
  const autoTitleId = useId();
  const titleId = titleIdProp ?? autoTitleId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/40 backdrop-blur-[5px]"
      className={cn("mx-4", maxWidthClass)}
    >
      <div
        className={cn(
          "max-h-[88vh] overflow-hidden rounded-2xl text-foreground",
          cardClassName
            ? cardClassName
            : cn(
                "border border-border/55 bg-card shadow-xl",
                "dark:border-white/[0.07] dark:bg-[#14141c]"
              )
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header
          className={cn(
            "border-b border-border/45 px-4 dark:border-white/[0.06]",
            minimal ? "pb-2 pt-2.5" : "pb-2.5 pt-3.5",
            headerClassName
          )}
        >
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
          ) : null}
          <div
            className={cn(
              "flex items-start justify-between gap-3",
              eyebrow ? "mt-0.5" : "",
              titleRowClassName
            )}
          >
            <h2
              id={titleId}
              className={cn("min-w-0 flex-1 text-base leading-tight tracking-tight sm:text-[17px]", investDeskModalTitleClass)}
            >
              {title}
            </h2>
            {titleRight ? (
              <div
                className={cn(
                  "max-w-[48%] shrink-0 pt-px text-right text-[13px] leading-tight",
                  titleRightWrapClassName
                )}
              >
                {titleRight}
              </div>
            ) : null}
          </div>
          {summary ? (
            <div
              className={cn(
                "mt-2 text-[11px] leading-snug text-muted-foreground",
                minimal ? "" : "border-l-2 border-primary/35 pl-2.5",
                summaryWrapClassName
              )}
            >
              {summary}
            </div>
          ) : null}
        </header>
        <div
          className={cn(
            "max-h-[88vh] overflow-y-auto overscroll-contain px-4 py-3",
            minimal ? "max-h-[calc(88vh-4.25rem)]" : "max-h-[calc(88vh-5.5rem)]",
            bodyClassName
          )}
        >
          {children}
        </div>
      </div>
    </Modal>
  );
}
