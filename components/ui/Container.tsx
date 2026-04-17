import { cn } from "@/lib/utils";

export type ContainerProps = React.HTMLAttributes<HTMLDivElement>;

export function Container({ className, ...props }: ContainerProps) {
  return (
    <div
      className={cn("container-standalone mx-auto px-4 w-full", className)}
      {...props}
    />
  );
}