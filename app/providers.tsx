"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

function shouldSuppressNextDevDynamicApiNoise(args: unknown[]): boolean {
  const s = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : String(a))).join(" ");
  return (
    s.includes("sync-dynamic-apis") ||
    (s.includes("searchParams") && s.includes("Promise") && s.includes("React.use()")) ||
    (s.includes("params") && s.includes("Promise") && s.includes("React.use()"))
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const origErr = console.error;
    const origWarn = console.warn;
    console.error = (...args: unknown[]) => {
      if (shouldSuppressNextDevDynamicApiNoise(args)) return;
      origErr.apply(console, args as []);
    };
    console.warn = (...args: unknown[]) => {
      if (shouldSuppressNextDevDynamicApiNoise(args)) return;
      origWarn.apply(console, args as []);
    };
    return () => {
      console.error = origErr;
      console.warn = origWarn;
    };
  }, []);

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
