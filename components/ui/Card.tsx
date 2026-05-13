import { cn } from "@/lib/utils";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "thai-glass rounded-2xl p-6 text-foreground",
        className
      )}
      {...props}
    />
  );
}