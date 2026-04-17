import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full px-3 py-2 rounded-md bg-input text-foreground border border-border focus:ring-2 focus:ring-primary transition outline-none",
        className
      )}
      {...props}
    />
  );
}