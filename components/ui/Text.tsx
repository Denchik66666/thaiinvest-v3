import { cn } from "@/lib/utils";

export type TextProps = React.HTMLAttributes<HTMLParagraphElement>;

export function Text({ className, ...props }: TextProps) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}