"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { Text } from "@/components/ui/Text";

/** Совместимость со старыми ссылками и закладками: переносим на раздел «Финансы». */
function LegacyReportsRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/dashboard/finance?${q}` : "/dashboard/finance");
  }, [router, searchParams]);

  return (
    <Container>
      <div className="flex min-h-[30vh] items-center justify-center py-12">
        <Text className="text-sm text-muted-foreground">Переход в «Финансы»…</Text>
      </div>
    </Container>
  );
}

export default function LegacyReportsRedirectPage() {
  return (
    <Suspense
      fallback={
        <Container>
          <div className="flex min-h-[30vh] items-center justify-center py-12">
            <Text className="text-sm text-muted-foreground">Переход в «Финансы»…</Text>
          </div>
        </Container>
      }
    >
      <LegacyReportsRedirectInner />
    </Suspense>
  );
}
