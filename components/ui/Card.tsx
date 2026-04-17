import { cn } from "@/lib/utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card/95 border border-border/70 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-6 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}