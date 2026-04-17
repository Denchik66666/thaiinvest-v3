"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppDialogsProvider } from "@/components/feedback/AppDialogsProvider";
import AppThemeSync from "@/components/theme/AppThemeSync";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Не показывать глобальный toast об ошибке (своя обработка в UI) */
      skipErrorToast?: boolean;
    };
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.meta?.skipErrorToast) return;
            const msg = error instanceof Error ? error.message : "Что-то пошло не так";
            toast.error(msg);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeSync />
      <AppDialogsProvider>{children}</AppDialogsProvider>
    </QueryClientProvider>
  );
}
