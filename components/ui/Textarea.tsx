import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full px-3 py-2 rounded-md bg-input text-foreground border border-border focus:ring-2 focus:ring-primary transition outline-none",
        className
      )}
      {...props}
    />
  );
}

